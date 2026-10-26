// StudioCut's narrow runtime entry for the vendored ArtCraft editor.
// Keeping the entry focused avoids bundling unrelated host integrations.
export { VideoEditor } from './artcraft-video-editor/src/lib/VideoEditor';
export { EditorCore } from './artcraft-video-editor/src/lib/core';
export { createDefaultAdapters } from './artcraft-video-editor/src/lib/adapters/default';
export { buildDefaultScene } from './artcraft-video-editor/src/lib/timeline/scenes';
export { ZERO_MEDIA_TIME } from './artcraft-video-editor/src/lib/wasm';
