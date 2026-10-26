import type { LocalSoundDetails, SoundsAdapter } from '../vendor/artcraft-video-editor/src/lib/adapters/sounds';
import type { SoundEffect } from '../vendor/artcraft-video-editor/src/lib/sounds/types';

interface LocalSoundRow {
  id: number;
  file: File;
  details: LocalSoundDetails;
  duration: number;
  created: string;
  saved: boolean;
}

async function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('studiocut-sound-collection', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('sounds', { keyPath: 'id', autoIncrement: true });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open the local sound collection.'));
  });
}

async function request<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('sounds', mode);
    const req = run(tx.objectStore('sounds'));
    let result: T;
    req.onsuccess = () => { result = req.result; };
    tx.oncomplete = () => { db.close(); resolve(result); };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(tx.error ?? req.error ?? new Error('Could not save the sound collection. Check browser storage space.'));
    };
  });
}

function normalize(details: LocalSoundDetails): LocalSoundDetails {
  const name = details.name.trim();
  if (!name) throw new Error('Give the sound a name.');
  return {
    name,
    creator: details.creator.trim() || 'Unknown creator',
    license: details.license.trim() || 'Rights not specified — verify before use',
    source: details.source.trim(),
    tags: details.tags.map(tag => tag.trim()).filter(Boolean),
  };
}

export function createLocalSoundsAdapter(): SoundsAdapter {
  const urls = new Map<number, string>();
  const rows = () => request<LocalSoundRow[]>('readonly', store => store.getAll());
  const row = async (id: number) => {
    const found = await request<LocalSoundRow | undefined>('readonly', store => store.get(id));
    if (!found) throw new Error('This sound is no longer in the local collection.');
    return found;
  };
  const urlFor = (sound: LocalSoundRow) => {
    let url = urls.get(sound.id);
    if (!url) { url = URL.createObjectURL(sound.file); urls.set(sound.id, url); }
    return url;
  };
  const effect = (sound: LocalSoundRow): SoundEffect => ({
    id: sound.id, name: sound.details.name, description: sound.details.source,
    url: sound.details.source, previewUrl: urlFor(sound),
    duration: sound.duration, filesize: sound.file.size, type: sound.file.type,
    channels: 0, bitrate: 0, bitdepth: 0, samplerate: 0,
    username: sound.details.creator, tags: sound.details.tags, license: sound.details.license,
    created: sound.created, downloads: 0, rating: 0, ratingCount: 0,
  });
  return {
    localCollection: {
      async importFile(file, details) {
        const normalized = normalize(details);
        // File pickers sometimes supply no MIME type. The editor's media pipeline
        // classifies by MIME, so store a normalized audio File, never an untyped Blob.
        const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
        const mimeByExtension: Record<string, string> = {
          wav: 'audio/wav', mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg',
          m4a: 'audio/mp4', flac: 'audio/flac', aac: 'audio/aac', opus: 'audio/ogg',
        };
        const mime = file.type.startsWith('audio/') ? file.type : mimeByExtension[extension];
        if (!mime) throw new Error('Choose a supported audio file such as WAV, MP3, OGG, or M4A.');
        const audioFile = new File([file], file.name, { type: mime, lastModified: file.lastModified });
        // Decode before committing so invalid/unsupported files never appear as playable results.
        const context = new AudioContext();
        let duration: number;
        try {
          const buffer = await context.decodeAudioData(await audioFile.arrayBuffer());
          duration = buffer.duration;
          if (!Number.isFinite(duration) || duration <= 0) throw new Error('The audio file has no playable duration.');
        } catch {
          throw new Error('Could not decode this audio file. Try a supported WAV, MP3, OGG, or M4A file.');
        } finally {
          await context.close();
        }
        await request('readwrite', store => store.add({
          file: audioFile, details: normalized, duration, created: new Date().toISOString(), saved: false,
        }));
      },
      async update(id, details) {
        const sound = await row(id);
        await request('readwrite', store => store.put({ ...sound, details: normalize(details) }));
      },
      async remove(id) {
        await request('readwrite', store => store.delete(id));
        const url = urls.get(id);
        if (url) URL.revokeObjectURL(url);
        urls.delete(id);
      },
      async getFile(id) { return (await row(id)).file; },
      releasePreviews() {
        urls.forEach(url => URL.revokeObjectURL(url));
        urls.clear();
      },
    },
    async searchSounds({ query, page }) {
      const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
      const results = (await rows()).filter(sound => {
        const text = Object.values(sound.details).flat().join(' ').toLocaleLowerCase();
        return terms.every(term => text.includes(term));
      }).reverse();
      const start = (Math.max(1, page) - 1) * 40;
      return { results: results.slice(start, start + 40).map(effect), hasNextPage: start + 40 < results.length, totalCount: results.length };
    },
    async getTopSounds() { return (await rows()).reverse().map(effect); },
    async resolveAudioUrl({ soundId }) { return urlFor(await row(soundId)); },
    async loadSavedSounds() {
      return (await rows()).filter(sound => sound.saved).map(sound => ({ ...effect(sound), savedAt: sound.created }));
    },
    async saveSound({ sound }) {
      const found = await row(sound.id);
      await request('readwrite', store => store.put({ ...found, saved: true }));
    },
    async unsaveSound({ soundId }) {
      const found = await row(soundId);
      await request('readwrite', store => store.put({ ...found, saved: false }));
    },
    async clearSavedSounds() {
      const db = await openDatabase();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction('sounds', 'readwrite');
          const store = tx.objectStore('sounds');
          const cursor = store.openCursor();
          cursor.onsuccess = () => {
            const item = cursor.result;
            if (item) { item.update({ ...item.value, saved: false }); item.continue(); }
          };
          tx.oncomplete = () => resolve();
          tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Could not clear saved sounds.'));
        });
      } finally { db.close(); }
    },
  };
}
