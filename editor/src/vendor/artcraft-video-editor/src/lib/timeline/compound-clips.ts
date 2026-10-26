import type { TScene, SceneTracks, TimelineElement, VideoElement } from "./types";
import { splitAnimationsAtTime } from "../animation";

/**
 * Resolve a compound clip into a time-shifted view of its nested scene.
 * The returned tracks are transient render/audio input; the saved nested
 * scene remains untouched and editable.
 */
export function getCompoundClipTracks({
  element,
  scenes,
}: {
  element: VideoElement;
  scenes: TScene[];
}): SceneTracks | null {
  if (!element.compoundSceneId) return null;

  const nestedScene = scenes.find((scene) => scene.id === element.compoundSceneId);
  if (!nestedScene) return null;

  const sourceStart = Math.max(0, element.trimStart);
  const sourceEnd = sourceStart + element.duration;
  const timelineStart = element.startTime;

  return {
    overlay: nestedScene.tracks.overlay
      .map((track) => ({
        ...track,
        elements: track.elements
          .map((child) =>
            shiftNestedElement({
              child,
              sourceStart,
              sourceEnd,
              timelineStart,
            }),
          )
          .filter((child): child is NonNullable<typeof child> => child !== null),
      }))
      .filter((track) => track.elements.length > 0),
    main: {
      ...nestedScene.tracks.main,
      elements: nestedScene.tracks.main.elements
        .map((child) =>
          shiftNestedElement({
            child,
            sourceStart,
            sourceEnd,
            timelineStart,
          }),
        )
        .filter((child): child is NonNullable<typeof child> => child !== null),
    },
    audio: nestedScene.tracks.audio
      .map((track) => ({
        ...track,
        elements: track.elements
          .map((child) =>
            shiftNestedElement({
              child,
              sourceStart,
              sourceEnd,
              timelineStart,
            }),
          )
          .filter((child): child is NonNullable<typeof child> => child !== null),
      }))
      .filter((track) => track.elements.length > 0),
  };
}

function shiftNestedElement<T extends TimelineElement>({
  child,
  sourceStart,
  sourceEnd,
  timelineStart,
}: {
  child: T;
  sourceStart: number;
  sourceEnd: number;
  timelineStart: number;
}): T | null {
  const childEnd = child.startTime + child.duration;
  const overlapStart = Math.max(child.startTime, sourceStart);
  const overlapEnd = Math.min(childEnd, sourceEnd);
  if (overlapEnd <= overlapStart) return null;

  const removedFromStart = overlapStart - child.startTime;
  const removedFromEnd = childEnd - overlapEnd;
  const sourceRate =
    child.type === "video" || child.type === "audio"
      ? (child.retime?.rate ?? 1)
      : 1;
  const trimStart = child.trimStart + removedFromStart * sourceRate;
  const trimEnd = child.trimEnd + removedFromEnd * sourceRate;
  let animations = child.animations;
  if (animations && removedFromStart > 0) {
    animations = splitAnimationsAtTime({
      animations,
      splitTime: removedFromStart,
      shouldIncludeSplitBoundary: true,
    }).rightAnimations;
  }
  if (animations && removedFromEnd > 0) {
    animations = splitAnimationsAtTime({
      animations,
      splitTime: overlapEnd - overlapStart,
      shouldIncludeSplitBoundary: true,
    }).leftAnimations;
  }

  return {
    ...child,
    startTime: timelineStart + overlapStart - sourceStart,
    duration: overlapEnd - overlapStart,
    trimStart,
    trimEnd,
    animations,
  };
}
