"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { useEditor } from "../../editor/use-editor";
import { useEditorStore } from "../../editor/editor-store";
import { dimensionToAspectRatio } from "../../utils/geometry";
import type { TCanvasSize } from "../../project/types";

function areCanvasSizesEqual({ left, right }: { left: TCanvasSize; right: TCanvasSize }) {
  return left.width === right.width && left.height === right.height;
}

function getRatioLabel({ ratio }: { ratio: string }) {
  switch (ratio) {
    case "16:9":
      return "Landscape";
    case "9:16":
      return "Portrait";
    case "1:1":
      return "Square";
    case "4:3":
      return "Classic";
    default:
      return "";
  }
}

export function CanvasRatioSelect() {
  const editor = useEditor();
  const activeProject = useEditor((e) => e.project.getActive());
  const canvasPresets = useEditorStore((state) => state.canvasPresets);
  const currentCanvasSize = activeProject.settings.canvasSize;
  const canvasSizeMode = activeProject.settings.canvasSizeMode ?? "preset";
  const currentPreset = canvasPresets.find((preset) =>
    areCanvasSizesEqual({ left: preset, right: currentCanvasSize }),
  );
  const isCustom = canvasSizeMode === "custom" || !currentPreset;

  const selectCanvasSize = (value: string) => {
    if (value === "custom") {
      const canvasSize =
        activeProject.settings.lastCustomCanvasSize ?? currentCanvasSize;
      const shouldUpdateCanvasSize = !areCanvasSizesEqual({
        left: canvasSize,
        right: currentCanvasSize,
      });
      const shouldUpdateMode = canvasSizeMode !== "custom";
      const shouldRememberSize =
        activeProject.settings.lastCustomCanvasSize == null ||
        !areCanvasSizesEqual({
          left: canvasSize,
          right: activeProject.settings.lastCustomCanvasSize,
        });

      if (!shouldUpdateCanvasSize && !shouldUpdateMode && !shouldRememberSize) {
        return;
      }

      editor.project.updateSettings({
        settings: {
          ...(shouldUpdateCanvasSize ? { canvasSize } : {}),
          ...(shouldUpdateMode ? { canvasSizeMode: "custom" as const } : {}),
          ...(shouldRememberSize ? { lastCustomCanvasSize: canvasSize } : {}),
        },
      });
      return;
    }

    const preset = canvasPresets.find(
      (item) => `${item.width}x${item.height}` === value,
    );
    if (!preset) return;

    const shouldUpdateCanvasSize = !areCanvasSizesEqual({
      left: preset,
      right: currentCanvasSize,
    });
    const shouldUpdateMode = canvasSizeMode !== "preset";
    if (!shouldUpdateCanvasSize && !shouldUpdateMode) return;

    editor.project.updateSettings({
      settings: {
        ...(shouldUpdateCanvasSize ? { canvasSize: preset } : {}),
        ...(shouldUpdateMode ? { canvasSizeMode: "preset" as const } : {}),
      },
    });
  };

  const customLabel = `Custom · ${currentCanvasSize.width} × ${currentCanvasSize.height}`;

  return (
    <Select
      value={
        isCustom
          ? "custom"
          : `${currentPreset.width}x${currentPreset.height}`
      }
      onValueChange={selectCanvasSize}
    >
      <SelectTrigger
        aria-label="Canvas aspect ratio"
        title="Canvas aspect ratio"
        data-testid="select-canvas-aspect-ratio"
        className="h-7 w-[7.5rem] border-ui-panel-border bg-transparent px-2 text-[11px]"
      >
        <SelectValue placeholder="Aspect ratio" />
      </SelectTrigger>
      <SelectContent>
        {canvasPresets.map((preset) => {
          const ratio = dimensionToAspectRatio(preset);
          const label = getRatioLabel({ ratio });
          return (
            <SelectItem
              key={`${preset.width}x${preset.height}`}
              value={`${preset.width}x${preset.height}`}
            >
              {label ? `${ratio} ${label}` : ratio}
            </SelectItem>
          );
        })}
        <SelectItem value="custom">{customLabel}</SelectItem>
      </SelectContent>
    </Select>
  );
}
