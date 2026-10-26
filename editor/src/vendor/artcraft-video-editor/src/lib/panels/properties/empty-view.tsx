import { HugeiconsIcon } from "@hugeicons/react";
import { Settings05Icon } from "@hugeicons/core-free-icons";
import { useAssetsPanelStore } from "../assets/assets-panel-store";
import { useEditor } from "../../editor/use-editor";
import { requestImportMedia } from "../../media/use-import-media";

export function EmptyView() {
  const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);
  const mediaCount = useEditor((e) => e.media.getAssets().length);
  const steps = [
    { label: "Import your clips", done: mediaCount > 0 },
    { label: "Drag one onto the timeline", done: false },
    { label: "Click the clip to edit it here", done: false },
  ];
  return (
    <div className="bg-background flex h-full w-full flex-col justify-center gap-4 p-5">
      <div className="flex items-center gap-2">
        <HugeiconsIcon icon={Settings05Icon} className="text-primary size-5" strokeWidth={1.5} />
        <p className="text-sm font-semibold">Properties</p>
      </div>
      <p className="text-muted-foreground text-xs leading-5">
        Nothing selected. Select a clip, text or sticker on the timeline to adjust
        its position, timing, speed and look.
      </p>
      <ol className="flex flex-col gap-2" aria-label="Getting started">
        {steps.map((step, i) => (
          <li key={step.label} className="flex items-center gap-2.5 text-xs">
            <span
              className={
                step.done
                  ? "bg-primary text-primary-foreground grid size-5 place-items-center rounded-full text-[10px] font-bold"
                  : "border-border text-muted-foreground grid size-5 place-items-center rounded-full border text-[10px] font-semibold"
              }
            >
              {i + 1}
            </span>
            <span className={step.done ? "text-muted-foreground line-through" : ""}>{step.label}</span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        data-testid="button-properties-open-media"
        onClick={() => {
          setActiveTab("media");
          requestImportMedia();
        }}
        className="bg-primary text-primary-foreground self-start rounded-md px-3 py-1.5 text-xs font-semibold hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Import media
      </button>
      {mediaCount > 0 && (
        <button
          type="button"
          data-testid="button-properties-show-library"
          onClick={() => setActiveTab("media")}
          className="text-muted-foreground -mt-2 self-start text-xs underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Show media library ({mediaCount})
        </button>
      )}
    </div>
  );
}
