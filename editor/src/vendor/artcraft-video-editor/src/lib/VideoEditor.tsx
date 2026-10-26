import { useEffect, useMemo, useState, type ReactNode } from "react";
import { EditorProvider } from "./EditorProvider";
import type { VideoEditorAdapters } from "./adapters";
import {
  initializeGpuRenderer,
  isGpuAvailable,
} from "./services/renderer/gpu-renderer";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "./components/ui/resizable";
import { AssetsPanel } from "./panels/assets";
import { TabBar } from "./panels/assets/tabbar";
import { PropertiesPanel } from "./panels/properties";
import { Timeline } from "./timeline/components";
import { PreviewPanel } from "./preview/components";
import { EditorHeader } from "./components/editor/editor-header";
import { EditorErrorBoundary } from "./components/editor/editor-error-boundary";
import { Onboarding } from "./components/editor/onboarding";
import { MobileGate } from "./components/editor/mobile-gate";
import { usePanelStore } from "./editor/panel-store";
import { usePasteMedia } from "./media/use-paste-media";
import { useEditor } from "./editor/use-editor";
import { useEditorActions } from "./actions/use-editor-actions";
import { useKeybindingsListener } from "./actions/use-keybindings";
import { TooltipProvider } from "./components/ui/tooltip";
import {
  createPreviewOverlayControl,
  isPreviewOverlayVisible,
  mergePreviewOverlaySources,
} from "./preview/overlays";
import { usePreviewStore } from "./preview/preview-store";
import { getGuidePreviewOverlaySource } from "./guides";
import {
  bookmarkNotesPreviewOverlay,
  getBookmarkPreviewOverlaySource,
} from "./timeline/bookmarks";

export interface VideoEditorProps {
  projectId?: string;
  // Hosts pass a partial set of adapters; the rest fall back to the
  // bundled defaults (IndexedDB project storage, blob-URL media, etc).
  adapters?: Partial<VideoEditorAdapters> | null;
  // Optional host chrome rendered in the editor header, to the right of
  // the export button. Webapp hosts that hide the global topbar inject
  // its actions (pricing/credits/task queue/profile) here.
  headerEndSlot?: ReactNode;
  // Host route the header's "Exit project" / delete actions navigate to.
  // Defaults to "/projects" for hosts that own that route.
  exitTo?: string;
}

// Public entry. Wraps the inner shell with EditorProvider so callers
// don't have to mount the provider themselves. Hosts that want to share
// one provider across multiple editor instances can mount EditorProvider
// + VideoEditorShell separately.
export function VideoEditor({
  projectId: _projectId,
  adapters,
  headerEndSlot,
  exitTo,
}: VideoEditorProps) {
  return (
    <EditorProvider adapters={adapters}>
      {/* Shell-wide Radix tooltip provider so every descendant tooltip has a
          provider ancestor regardless of which panel wraps its own. Without
          this, hosts that don't mount an app-level provider (the Tauri app)
          crash with "Tooltip must be used within TooltipProvider" the moment a
          panel renders a tooltip outside its local provider. Nested providers
          are valid in Radix. */}
      <TooltipProvider delayDuration={300}>
        <MobileGate>
          {/* Boundary contains any descendant throw — without this, an
              unhandled exception in a panel or renderer node propagates
              to the host shell and the user sees a blank app. The
              boundary's recovery button remounts the editor subtree
              (key bump); EditorCore + the host's project state stay
              alive across the recovery. */}
          <EditorErrorBoundary>
            <div className="bg-background flex h-full w-full flex-col overflow-hidden">
              <EditorHeader endSlot={headerEndSlot} exitTo={exitTo} />
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <EditorLayout />
              </div>
              <Onboarding />
            </div>
          </EditorErrorBoundary>
        </MobileGate>
      </TooltipProvider>
    </EditorProvider>
  );
}

function EditorLayout() {
  // Boot the wasm-backed GPU compositor and gate the panel render on
  // it. We need to *await* init before <PreviewCanvas> mounts —
  // child useEffects fire bottom-up, so kicking GPU off in a sibling
  // useEffect lets PreviewCanvas race ahead and panic with
  // "GPU context not initialized" the moment opencut-wasm's
  // initCompositor runs. initializeGpuRenderer is idempotent and
  // catches WebGPU failures internally. When there is no graphics
  // backend, keep the editing panels available and replace the WASM
  // preview canvas with an explicit unsupported-device state.
  //
  // The actions / keybindings / paste-media listeners live in
  // ReadyEditorLayout below so they only attach once both gates are
  // open; before then, a Space/Delete keypress or a media paste would
  // dispatch against an editor whose preview canvas hasn't mounted.
  const [gpuReady, setGpuReady] = useState(false);
  const [gpuAvailable, setGpuAvailable] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void initializeGpuRenderer().then(() => {
      if (!cancelled) {
        setGpuAvailable(isGpuAvailable());
        setGpuReady(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Also gate on the host having bootstrapped a project. Panels read
  // editor.scenes.getActiveScene() / editor.project.getActive() on
  // mount; without a project they crash with "No active scene". Hosts
  // can bootstrap via setActiveProject at any time — this gate flips
  // as soon as they do. Avoids the historical pattern of hosts having
  // to render <VideoEditor> conditionally on their own ready state.
  const hasProject = useEditor(
    (editor) => editor.project.getActive() !== null,
  );

  if (!gpuReady || !hasProject) return null;
  return (
    <>
      {!gpuAvailable && <RendererFallbackNotice />}
      <ReadyEditorLayout gpuAvailable={gpuAvailable} />
    </>
  );
}

function RendererFallbackNotice() {
  return (
    <div
      role="status"
      className="flex min-h-9 items-center justify-center border-b border-amber-300/10 bg-amber-300/[0.06] px-3 text-center text-xs text-amber-100/75"
    >
      GPU preview and export are unavailable in this browser session. Timeline editing remains available; try Chrome with hardware acceleration enabled.
    </div>
  );
}

function PreviewUnavailable() {
  return (
    <div className="panel bg-background flex size-full min-h-0 min-w-0 flex-col !rounded-lg border border-ui-panel-border">
      <div className="flex h-10 items-center border-b border-border px-4 text-xs font-medium text-muted-foreground">
        Preview
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="grid size-12 place-items-center rounded-xl border border-border bg-accent text-muted-foreground">
          <span aria-hidden className="ml-0.5 size-0 border-y-[7px] border-l-[11px] border-y-transparent border-l-current" />
        </div>
        <div>
          <h2 className="text-sm font-medium text-foreground">Preview renderer unavailable</h2>
          <p className="mx-auto mt-2 max-w-sm text-xs leading-5 text-muted-foreground">
            This browser session could not start WebGPU or WebGL. You can still arrange clips and edit the timeline; preview and video export need graphics acceleration.
          </p>
        </div>
      </div>
    </div>
  );
}

function ReadyEditorLayout({ gpuAvailable }: { gpuAvailable: boolean }) {
  useEditorActions();
  useKeybindingsListener();
  usePasteMedia();
  const { panels, setPanel } = usePanelStore();
  const activeScene = useEditor((editor) =>
    editor.scenes.getActiveSceneOrNull(),
  );
  const currentTime = useEditor((editor) => editor.playback.getCurrentTime());
  const activeGuide = usePreviewStore((state) => state.activeGuide);
  const overlays = usePreviewStore((state) => state.overlays);
  const setOverlayVisibility = usePreviewStore(
    (state) => state.setOverlayVisibility,
  );
  const showBookmarkNotes = isPreviewOverlayVisible({
    overlay: bookmarkNotesPreviewOverlay,
    overlays,
  });

  const overlaySource = useMemo(
    () =>
      mergePreviewOverlaySources({
        sources: [
          getGuidePreviewOverlaySource({
            guideId: activeGuide,
          }),
          activeScene
            ? getBookmarkPreviewOverlaySource({
                bookmarks: activeScene.bookmarks,
                time: currentTime,
                isVisible: showBookmarkNotes,
              })
            : {
                definitions: [bookmarkNotesPreviewOverlay],
                instances: [],
              },
        ],
      }),
    [activeGuide, activeScene, currentTime, showBookmarkNotes],
  );

  const overlayControls = useMemo(
    () =>
      overlaySource.definitions.map((overlay) =>
        createPreviewOverlayControl({ overlay, overlays }),
      ),
    [overlaySource.definitions, overlays],
  );

  return (
    <div className="flex size-full min-h-0 flex-col">
    <TabBar />
    <ResizablePanelGroup
      direction="vertical"
      className="size-full gap-[0.18rem]"
      onLayout={(sizes) => {
        setPanel({
          panel: "mainContent",
          size: sizes[0] ?? panels.mainContent,
        });
        setPanel({
          panel: "timeline",
          size: sizes[1] ?? panels.timeline,
        });
      }}
    >
      <ResizablePanel
        defaultSize={panels.mainContent}
        minSize={30}
        maxSize={85}
        className="min-h-0"
      >
        <ResizablePanelGroup
          direction="horizontal"
          className="size-full gap-[0.19rem] px-3"
          onLayout={(sizes) => {
            setPanel({ panel: "tools", size: sizes[0] ?? panels.tools });
            setPanel({ panel: "preview", size: sizes[1] ?? panels.preview });
            setPanel({
              panel: "properties",
              size: sizes[2] ?? panels.properties,
            });
          }}
        >
          <ResizablePanel
            defaultSize={panels.tools}
            minSize={15}
            maxSize={40}
            className="min-w-0"
          >
            <AssetsPanel />
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            defaultSize={panels.preview}
            minSize={30}
            className="min-h-0 min-w-0 flex-1"
          >
            {gpuAvailable ? (
              <PreviewPanel
                overlayControls={overlayControls}
                overlayInstances={overlaySource.instances}
                onOverlayVisibilityChange={setOverlayVisibility}
              />
            ) : (
              <PreviewUnavailable />
            )}
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel
            defaultSize={panels.properties}
            minSize={15}
            maxSize={40}
            className="min-w-0"
          >
            <PropertiesPanel />
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>

      <ResizableHandle withHandle />

      <ResizablePanel
        defaultSize={panels.timeline}
        minSize={15}
        maxSize={70}
        className="min-h-0 px-3 pb-3"
      >
        <Timeline />
      </ResizablePanel>
    </ResizablePanelGroup>
    </div>
  );
}
