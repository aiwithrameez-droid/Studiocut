declare module 'studiocut-artcraft-runtime' {
  export type VideoEditorAdapters = import('../vendor/artcraft-video-editor/src/lib/adapters').VideoEditorAdapters;
  export type ProjectMeta = import('../vendor/artcraft-video-editor/src/lib/adapters/types').ProjectMeta;
  export type TProject = import('../vendor/artcraft-video-editor/src/lib/project/types').TProject;
  export type TScene = import('../vendor/artcraft-video-editor/src/lib/timeline/types').TScene;
  export type MediaTime = import('../vendor/artcraft-video-editor/src/lib/wasm').MediaTime;

  export const ZERO_MEDIA_TIME: MediaTime;
  export function buildDefaultScene(args: { name: string; isMain: boolean }): TScene;
  export function createDefaultAdapters(): VideoEditorAdapters;

  export const VideoEditor: import('react').ComponentType<{
    adapters?: Partial<VideoEditorAdapters> | null;
    exitTo?: string;
    projectId?: string;
    headerEndSlot?: import('react').ReactNode;
  }>;

  export class EditorCore {
    static initialize(args: { adapters: VideoEditorAdapters }): EditorCore;
    static getInstance(): EditorCore;
    readonly adapters: VideoEditorAdapters;
    readonly project: {
      getActiveOrNull(): TProject | null;
      listProjects(): Promise<ProjectMeta[]>;
      openProject(args: { id: string }): Promise<TProject | null>;
      setActiveProject(args: { project: TProject }): void;
      saveCurrentProject(): Promise<void>;
    };
    readonly scenes: {
      initializeScenes(args: { scenes: TScene[]; currentSceneId?: string }): void;
    };
    readonly save: {
      start(): void;
    };
  }
}
