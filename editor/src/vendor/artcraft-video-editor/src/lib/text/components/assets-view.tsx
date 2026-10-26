import { Plus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { DraggableItem } from "../../panels/assets/draggable-item";
import { PanelView } from "../../panels/assets/views/base-panel";
import { useEditor } from "../../editor/use-editor";
import { DEFAULTS } from "../../timeline/defaults";
import { buildTextElement } from "../../timeline/element-utils";
import type { MediaTime } from "../../wasm";

export function TextView() {
  const editor = useEditor();

  const handleAddToTimeline = ({ currentTime }: { currentTime: MediaTime }) => {
    const activeScene = editor.scenes.getActiveScene();
    if (!activeScene) return;

    const existingTextIds = new Set(
      activeScene.tracks.overlay
        .filter((track) => track.type === "text")
        .flatMap((track) => track.elements.map((item) => item.id)),
    );
    const element = buildTextElement({
      raw: {
        ...DEFAULTS.text.element,
        name: "Title",
        params: {
          ...DEFAULTS.text.element.params,
          content: "Your title here",
        },
      },
      startTime: currentTime,
    });

    editor.timeline.insertElement({
      element,
      placement: { mode: "auto" },
    });

    // A newly added title should open its text and style controls immediately.
    const updatedScene = editor.scenes.getActiveScene();
    const textTrack = updatedScene?.tracks.overlay.find(
      (track) =>
        track.type === "text" &&
        track.elements.some((item) => !existingTextIds.has(item.id)),
    );
    const insertedElement = textTrack?.elements.find(
      (item) => !existingTextIds.has(item.id),
    );
    if (textTrack && insertedElement) {
      editor.selection.setSelectedElements({
        elements: [{ trackId: textTrack.id, elementId: insertedElement.id }],
      });
    }
  };

  return (
    <PanelView title="Text">
      <div className="flex flex-col gap-3 p-3">
        <div className="space-y-1">
          <p className="text-sm font-medium">Add a title</p>
          <p className="text-muted-foreground text-xs leading-5">
            Type your words and choose a font, size, color, and alignment in
            Properties.
          </p>
        </div>
        <Button
          type="button"
          className="w-full justify-start"
          onClick={() =>
            handleAddToTimeline({
              currentTime: editor.playback.getCurrentTime(),
            })
          }
        >
          <Plus aria-hidden="true" />
          Add text at playhead
        </Button>
        <p className="text-muted-foreground pt-1 text-[11px]">
          Or drag a title onto the timeline to choose where it starts.
        </p>
      <DraggableItem
        name="Your title here"
        preview={
          <div className="bg-accent flex size-full items-center justify-center rounded-lg">
            <span className="text-xs select-none">Your title here</span>
          </div>
        }
        dragData={{
          id: "temp-text-id",
          type: DEFAULTS.text.element.type,
          name: "Title",
          content: "Your title here",
        }}
        aspectRatio={1}
        onAddToTimeline={handleAddToTimeline}
        shouldShowLabel={false}
      />
      </div>
    </PanelView>
  );
}
