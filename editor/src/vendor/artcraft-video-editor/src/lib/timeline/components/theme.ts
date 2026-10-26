import type { TrackType } from "../types";

export const TIMELINE_AUDIO_WAVEFORM_COLOR = "rgba(255, 255, 255, 0.7)";

export const TIMELINE_TRACK_THEME: Record<
  TrackType,
  {
    elementClassName: string;
    waveformColor?: string;
  }
> = {
  video: { elementClassName: "transparent" },
  text: { elementClassName: "bg-[#2D7D68]" },
  audio: {
    elementClassName: "bg-[#72469B]",
    waveformColor: TIMELINE_AUDIO_WAVEFORM_COLOR,
  },
  graphic: { elementClassName: "bg-[#A94667]" },
  effect: { elementClassName: "bg-[#36749B]" },
} as const;

export const SELECTED_TRACK_ROW_CLASS = "bg-accent/50";
export const DEFAULT_TIMELINE_BOOKMARK_COLOR = "#009dff";

export function getTimelineElementClassName({
  type,
}: {
  type: TrackType;
}): string {
  return TIMELINE_TRACK_THEME[type].elementClassName.trim();
}
