import { z } from 'zod';
import type { EditorProject } from '../vendor/artcraft-video-editor/src/lib/adapters/types';
import type { ProjectStorageAdapter } from '../vendor/artcraft-video-editor/src/lib/adapters/project-storage';
import { readStoredMedia, writeArchiveMedia, type StoredMedia } from '../adapters/indexeddb-media-source';

// Binary v1: 8-byte magic, uint32 LE manifest byte length, UTF-8 JSON,
// followed by original blobs in manifest order. No base64 or server calls.
const MAGIC = 'SCUT0001';
const MAX_MANIFEST = 16 * 1024 * 1024;
const MAX_ARCHIVE = 2 * 1024 ** 3;
const MAX_MEDIA = 512 * 1024 ** 2;
const id = z.string().min(1).max(512);
const finite = z.number().finite();
const date = z.string().refine((value) => Number.isFinite(Date.parse(value)));
const element = z.object({
  id, type: z.enum(['video', 'image', 'audio', 'text', 'sticker', 'graphic', 'effect']),
  name: z.string(), duration: finite.nonnegative(), startTime: finite.nonnegative(),
  trimStart: finite.nonnegative(), trimEnd: finite.nonnegative(),
  params: z.record(z.string(), z.unknown()), mediaId: id.optional(),
}).passthrough();
const track = z.object({
  id, name: z.string(), type: z.enum(['video', 'text', 'audio', 'graphic', 'effect']),
  elements: z.array(element),
}).passthrough();
const documentSchema = z.object({
  version: z.literal(1),
  project: z.object({
    metadata: z.object({ id, name: z.string(), createdAt: date, updatedAt: date, duration: finite.nonnegative() }).passthrough(),
    version: z.number().int().nonnegative(),
    currentSceneId: id,
    settings: z.object({
      fps: z.object({ numerator: finite.positive(), denominator: finite.positive() }).passthrough(),
      canvasSize: z.object({ width: finite.positive(), height: finite.positive() }),
      background: z.discriminatedUnion('type', [
        z.object({ type: z.literal('color'), color: z.string() }),
        z.object({ type: z.literal('blur'), blurIntensity: finite }),
      ]),
    }).passthrough(),
    scenes: z.array(z.object({
      id, name: z.string(), isMain: z.boolean(), createdAt: date, updatedAt: date,
      bookmarks: z.array(z.unknown()),
      tracks: z.object({ main: track, overlay: z.array(track), audio: z.array(track) }).passthrough(),
    }).passthrough()).min(1),
  }).passthrough(),
  media: z.array(z.object({
    id, name: z.string(), type: z.enum(['video', 'audio', 'image']),
    size: finite.int().nonnegative(), lastModified: finite.nonnegative(),
  }).passthrough()).max(10000),
}).passthrough();
const manifestSchema = z.object({
  format: z.literal('studiocut-project'), version: z.literal(1),
  project: z.object({ id, name: z.string(), updatedAt: finite, data: documentSchema.nullable() }),
  media: z.array(z.object({
    id, size: finite.int().nonnegative().max(MAX_MEDIA),
    mime: z.string().max(256), sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })).max(10000),
});
type Manifest = z.infer<typeof manifestSchema>;
export type ArchiveProgress = (message: string, percent: number) => void;

function validateManifest(input: unknown): Manifest {
  const result = manifestSchema.safeParse(input);
  if (!result.success) throw new Error('Invalid or unsupported StudioCut archive. Its project metadata is malformed or its version is not supported.');
  const manifest = result.data;
  const doc = manifest.project.data;
  const media = doc?.media ?? [];
  const mediaIds = new Set(media.map((asset) => asset.id));
  const blobIds = new Set(manifest.media.map((asset) => asset.id));
  if (mediaIds.size !== media.length || blobIds.size !== manifest.media.length ||
      mediaIds.size !== blobIds.size || media.some((asset) => !blobIds.has(asset.id) ||
        manifest.media.find((blob) => blob.id === asset.id)?.size !== asset.size)) {
    throw new Error('Invalid archive: missing, duplicate, or mismatched media entries.');
  }
  if (doc) {
    if (doc.project.metadata.id !== manifest.project.id ||
        !doc.project.scenes.some((scene) => scene.id === doc.project.currentSceneId) ||
        new Set(doc.project.scenes.map((scene) => scene.id)).size !== doc.project.scenes.length) {
      throw new Error('Invalid archive: project or scene references do not match.');
    }
    for (const scene of doc.project.scenes) {
      for (const track of [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio]) {
        for (const clip of track.elements) {
          if ((clip.mediaId && !mediaIds.has(clip.mediaId)) ||
              (['video', 'image'].includes(clip.type) && !clip.mediaId) ||
              (clip.type === 'audio' && clip.sourceType === 'upload' && !clip.mediaId)) {
            throw new Error('Invalid archive: a timeline clip references missing media.');
          }
          // External sound-library URLs are not original local media and
          // cannot be promised as an offline, portable backup.
          if (clip.type === 'audio' && clip.sourceType === 'library') {
            throw new Error('This project uses online library audio. Replace it with an imported local audio file before making a portable backup.');
          }
        }
      }
    }
  }
  return manifest;
}

async function checksum(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function createProjectArchive(project: EditorProject, progress: ArchiveProgress): Promise<Blob> {
  progress('Reading project metadata…', 0);
  const data = project.data === null ? null : documentSchema.safeParse(project.data);
  if (data && !data.success) throw new Error('This project uses an unsupported document format and cannot be backed up safely.');
  const media = data && data.success ? data.data.media : [];
  const total = media.reduce((sum, asset) => sum + asset.size, 0);
  if (total > MAX_ARCHIVE - MAX_MANIFEST) throw new Error('This project exceeds the 2 GB archive limit.');
  const blobs: Blob[] = [];
  const entries: Manifest['media'] = [];
  for (const [index, asset] of media.entries()) {
    progress(`Backing up ${asset.name} (${index + 1}/${media.length})…`, Math.round(index / media.length * 90));
    if (asset.size > MAX_MEDIA) throw new Error('Each original media file must be at most 512 MB to back up in this browser.');
    const blob = await readStoredMedia(asset.id);
    if (blob.size !== asset.size) throw new Error(`Source file ${asset.name} does not match its saved metadata.`);
    blobs.push(blob);
    entries.push({ id: asset.id, size: blob.size, mime: blob.type, sha256: await checksum(blob) });
  }
  const manifest = validateManifest({ format: 'studiocut-project', version: 1, project, media: entries });
  const json = new TextEncoder().encode(JSON.stringify(manifest));
  if (json.length > MAX_MANIFEST) throw new Error('Project metadata exceeds the 16 MB archive limit.');
  const header = new Uint8Array(12);
  header.set(new TextEncoder().encode(MAGIC));
  new DataView(header.buffer).setUint32(8, json.length, true);
  progress('Preparing download…', 100);
  return new Blob([header, json, ...blobs], { type: 'application/octet-stream' });
}

export async function restoreProjectArchive(file: Blob, storage: ProjectStorageAdapter, progress: ArchiveProgress): Promise<EditorProject> {
  progress('Validating archive…', 0);
  if (file.size < 12 || file.size > MAX_ARCHIVE) throw new Error('Invalid archive size. StudioCut archives must be smaller than 2 GB.');
  const header = await file.slice(0, 12).arrayBuffer();
  if (new TextDecoder().decode(header.slice(0, 8)) !== MAGIC) throw new Error('Not a supported StudioCut archive. Choose a .studiocut backup file.');
  const length = new DataView(header).getUint32(8, true);
  if (!length || length > MAX_MANIFEST || 12 + length > file.size) throw new Error('The archive header is damaged or incomplete.');
  let parsed: unknown;
  try { parsed = JSON.parse(await file.slice(12, 12 + length).text()); }
  catch { throw new Error('The archive metadata is not valid JSON.'); }
  const manifest = validateManifest(parsed);
  let offset = 12 + length;
  if (offset + manifest.media.reduce((sum, asset) => sum + asset.size, 0) !== file.size) {
    throw new Error('The archive is truncated or contains unexpected data.');
  }
  const rows: StoredMedia[] = [];
  const remap = new Map<string, string>();
  for (const [index, entry] of manifest.media.entries()) {
    progress(`Checking original media (${index + 1}/${manifest.media.length})…`, Math.round(index / manifest.media.length * 75));
    const blob = file.slice(offset, offset + entry.size, entry.mime);
    offset += entry.size;
    if (await checksum(blob) !== entry.sha256) throw new Error('Media checksum failed. This backup is damaged; no project was restored.');
    const id = `sc_${crypto.randomUUID()}`;
    remap.set(entry.id, id);
    rows.push({ id, blob });
  }
  const project = manifest.project;
  project.id = `proj_${crypto.randomUUID()}`;
  project.name = `${project.name || 'Untitled project'} (restored)`;
  project.updatedAt = Date.now();
  if (project.data) {
    project.data.project.metadata.id = project.id;
    project.data.project.metadata.name = project.name;
    project.data.project.metadata.updatedAt = new Date(project.updatedAt).toISOString();
    for (const asset of project.data.media) asset.id = remap.get(asset.id)!;
    for (const scene of project.data.project.scenes) {
      for (const track of [scene.tracks.main, ...scene.tracks.overlay, ...scene.tracks.audio]) {
        for (const clip of track.elements) {
          if (clip.mediaId) clip.mediaId = remap.get(clip.mediaId)!;
        }
      }
    }
  }
  progress('Saving verified media to this browser…', 80);
  await writeArchiveMedia(rows);
  try {
    progress('Saving restored project…', 95);
    await storage.saveProject(project);
  } catch (error) {
    try { await writeArchiveMedia(rows, true); }
    catch { throw new Error('Restore failed and temporary media could not be removed. Check browser storage before trying again. Existing projects are unchanged.'); }
    throw error;
  }
  progress('Project restored. Your existing projects are unchanged.', 100);
  return project;
}
