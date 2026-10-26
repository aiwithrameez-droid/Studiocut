// Sounds gallery surface. OpenCut Classic pulls sound effects from a
// Freesound-backed `/api/sounds/search` endpoint and persists saved
// sounds via its `storageService`. Artcraft has no equivalent backend
// yet, so we expose a SoundsAdapter and let hosts wire their own
// search / save / resolve pipelines.
//
// The empty default in `./default/empty-sounds-adapter.ts` returns
// shape-correct no-op results — the lib runs end-to-end but the
// sounds gallery is empty until a host injects a real impl.

import type { SoundEffect, SavedSound } from "../sounds/types";

export interface LocalSoundDetails {
  name: string;
  creator: string;
  license: string;
  source: string;
  tags: string[];
}

export interface LocalSoundCollection {
  importFile(file: File, details: LocalSoundDetails): Promise<void>;
  update(soundId: number, details: LocalSoundDetails): Promise<void>;
  remove(soundId: number): Promise<void>;
  getFile(soundId: number): Promise<File>;
  releasePreviews(): void;
}

export interface SoundsSearchResult {
  results: SoundEffect[];
  hasNextPage: boolean;
  totalCount: number;
}

export interface SoundsAdapter {
  // Optional local-first management surface. No remote provider is implied.
  localCollection?: LocalSoundCollection;
  // Returns a page of sound effects matching `query`. Hosts paginate
  // their own way; the adapter just tells the lib whether more pages
  // exist. `commercialOnly` (when supported) filters licensing.
  searchSounds(args: {
    query: string;
    page: number;
    commercialOnly?: boolean;
  }): Promise<SoundsSearchResult>;

  // Returns the curated "top sounds" list shown when the search input
  // is empty. `commercialOnly` filters licensing where supported.
  getTopSounds(args: { commercialOnly: boolean }): Promise<SoundEffect[]>;

  // Loads the user's saved-sounds collection.
  loadSavedSounds(): Promise<SavedSound[]>;

  // Persists a sound to the saved-sounds collection.
  saveSound(args: { sound: SoundEffect }): Promise<void>;

  // Removes a sound from the saved-sounds collection.
  unsaveSound(args: { soundId: number }): Promise<void>;

  // Clears the entire saved-sounds collection.
  clearSavedSounds(): Promise<void>;

  // Returns a playable audio URL for a sound. Hosts can use this to
  // attach auth tokens or proxy through a CDN; if the SoundEffect
  // already carries a usable previewUrl, the adapter can return it
  // as-is.
  resolveAudioUrl(args: { soundId: number }): Promise<string>;
}
