import type { MediaSourceAdapter } from '../vendor/artcraft-video-editor/src/lib/adapters/media-source';
import { kindFromMime } from '../vendor/artcraft-video-editor/src/lib/adapters/kind-from-mime';
import type { MediaHandle, ResolvedMedia } from '../vendor/artcraft-video-editor/src/lib/adapters/types';

const DATABASE_NAME = 'studiocut-artcraft-media';
const DATABASE_VERSION = 1;
const MEDIA_STORE = 'media';

export type StoredMedia = {
  id: string;
  blob: Blob;
};

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(MEDIA_STORE)) {
        request.result.createObjectStore(MEDIA_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local media storage.'));
  });
}

function mediaRequest<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDatabase().then((database) => new Promise<T>((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE, mode);
    const request = run(transaction.objectStore(MEDIA_STORE));
    let result: T;

    request.onsuccess = () => { result = request.result; };
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error('Could not access local media storage.'));
    };
    transaction.oncomplete = () => {
      database.close();
      resolve(result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Local media storage transaction failed.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error ?? new Error('Local media storage transaction was cancelled.'));
    };
  }));
}

function createMediaId(): string {
  return `sc_${crypto.randomUUID?.() ?? `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`;
}

export async function readStoredMedia(id: string): Promise<Blob> {
  const stored = await mediaRequest<StoredMedia | undefined>('readonly', (store) => store.get(id));
  if (!stored?.blob) throw new Error(`Source media ${id} is missing. Backup stopped; re-import the original file first.`);
  return stored.blob;
}

// One transaction: a quota error cannot leave a partially imported media set.
export async function writeArchiveMedia(rows: StoredMedia[], remove = false): Promise<void> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(MEDIA_STORE, 'readwrite');
    const store = transaction.objectStore(MEDIA_STORE);
    for (const row of rows) {
      if (remove) store.delete(row.id);
      else store.add(row);
    }
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onabort = transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Could not store restored media. Check available browser storage.'));
    };
  });
}

/**
 * Keeps source files in IndexedDB and recreates blob URLs on demand.
 * Projects store media handles, not blob URLs, so clips remain usable
 * after a browser refresh or closing and reopening the editor.
 */
export function createIndexedDBMediaSource(): MediaSourceAdapter {
  const resolvedById = new Map<string, ResolvedMedia>();

  return {
    async uploadLocalFile(file) {
      const id = createMediaId();
      await mediaRequest<IDBValidKey>('readwrite', (store) => store.put({ id, blob: file } satisfies StoredMedia));
      return { id, kind: kindFromMime(file.type) };
    },

    async resolveMedia(handle: MediaHandle) {
      const cached = resolvedById.get(handle.id);
      if (cached) return cached;

      const stored = await mediaRequest<StoredMedia | undefined>('readonly', (store) => (
        store.get(handle.id) as IDBRequest<StoredMedia | undefined>
      ));
      if (!stored) {
        throw new Error(`The local media file for ${handle.id} is missing. Re-import the source file to continue editing.`);
      }

      const resolved: ResolvedMedia = {
        url: URL.createObjectURL(stored.blob),
        mime: stored.blob.type || 'application/octet-stream',
      };
      resolvedById.set(handle.id, resolved);
      return resolved;
    },

    releaseResolved(resolved) {
      for (const [id, item] of resolvedById) {
        if (item.url === resolved.url) {
          resolvedById.delete(id);
          URL.revokeObjectURL(item.url);
          return;
        }
      }
    },

    async deleteHandle(handle) {
      const resolved = resolvedById.get(handle.id);
      if (resolved) {
        URL.revokeObjectURL(resolved.url);
        resolvedById.delete(handle.id);
      }
      await mediaRequest<undefined>('readwrite', (store) => store.delete(handle.id));
    },
  };
}
