import {
  Command,
  createElementSelectionResult,
  type CommandResult,
} from "../../base-command";
import { EditorCore } from "../../../core";
import { buildDefaultElementParams } from "../../../timeline/element-utils";
import { buildDefaultScene } from "../../../timeline/scenes";
import { generateUUID } from "../../../utils/id";
import type {
  SceneTracks,
  TScene,
  TimelineElement,
  TimelineTrack,
  VideoElement,
} from "../../../timeline/types";
import type { ElementRef, MediaTime } from "../../../timeline/types";

export class CreateCompoundClipCommand extends Command {
  private savedTracks: SceneTracks | null = null;
  private savedScenes: TScene[] | null = null;
  private savedSelection: ElementRef[] = [];
  private parentSceneId: string | null = null;

  execute(): CommandResult | undefined {
    const editor = EditorCore.getInstance();
    const parentScene = editor.scenes.getActiveScene();
    const selectedRefs = editor.selection.getSelectedElements();
    const selected = editor.timeline.getElementsWithTracks({
      elements: selectedRefs,
    });

    if (selected.length < 2) return undefined;

    this.parentSceneId = parentScene.id;
    this.savedTracks = parentScene.tracks;
    this.savedScenes = [...editor.scenes.getScenes()];
    this.savedSelection = [...selectedRefs];

    const sourceStart = Math.min(
      ...selected.map(({ element }) => element.startTime),
    );
    const sourceEnd = Math.max(
      ...selected.map(({ element }) => element.startTime + element.duration),
    );
    const duration = Math.max(1, sourceEnd - sourceStart);
    const nestedScene = buildNestedScene({
      parentScene,
      tracks: parentScene.tracks,
      selectedRefs,
      sourceStart,
      compoundName: `Compound ${this.savedScenes.length}`,
    });

    const compoundElement: VideoElement = {
      type: "video",
      id: generateUUID(),
      name: "Compound clip",
      mediaId: "",
      compoundSceneId: nestedScene.id,
      isSourceAudioEnabled: false,
      duration,
      startTime: sourceStart,
      trimStart: 0 as MediaTime,
      trimEnd: 0 as MediaTime,
      sourceDuration: duration as MediaTime,
      params: buildDefaultElementParams({ type: "video" }),
      hidden: false,
    };

    const selectedIds = new Set(
      selectedRefs.map((ref) => `${ref.trackId}\u0000${ref.elementId}`),
    );
    const removeSelected = <T extends TimelineTrack>(track: T): T => ({
      ...track,
      elements: track.elements.filter(
        (element) => !selectedIds.has(`${track.id}\u0000${element.id}`),
      ),
    });
    const nextTracks: SceneTracks = {
      overlay: parentScene.tracks.overlay.map(removeSelected),
      main: {
        ...removeSelected(parentScene.tracks.main),
        elements: [
          ...removeSelected(parentScene.tracks.main).elements,
          compoundElement,
        ].sort((first, second) => first.startTime - second.startTime),
      },
      audio: parentScene.tracks.audio.map(removeSelected),
    };

    editor.scenes.setScenes({
      scenes: [...this.savedScenes, nestedScene],
      activeSceneId: parentScene.id,
    });
    editor.timeline.updateTracks(nextTracks);

    return createElementSelectionResult([
      { trackId: nextTracks.main.id, elementId: compoundElement.id },
    ]);
  }

  undo(): void {
    if (!this.savedTracks || !this.savedScenes || !this.parentSceneId) return;

    const editor = EditorCore.getInstance();
    editor.scenes.setScenes({
      scenes: this.savedScenes,
      activeSceneId: this.parentSceneId,
    });
    editor.timeline.updateTracks(this.savedTracks);
    editor.selection.setSelectedElements({ elements: this.savedSelection });
  }
}

function buildNestedScene({
  parentScene,
  tracks,
  selectedRefs,
  sourceStart,
  compoundName,
}: {
  parentScene: TScene;
  tracks: SceneTracks;
  selectedRefs: ElementRef[];
  sourceStart: MediaTime;
  compoundName: string;
}): TScene {
  const selectedIds = new Set(
    selectedRefs.map((ref) => `${ref.trackId}\u0000${ref.elementId}`),
  );
  const nestedScene = buildDefaultScene({
    name: compoundName,
    isMain: false,
  });
  const copySelected = (track: TimelineTrack) =>
    track.elements
      .filter((element) =>
        selectedIds.has(`${track.id}\u0000${element.id}`),
      )
      .map((element) => ({
        ...element,
        startTime: (element.startTime - sourceStart) as MediaTime,
      }));
  const copyTrack = <T extends TimelineTrack>(track: T) =>
    ({
      ...track,
      id: generateUUID(),
      elements: copySelected(track),
    }) as T;

  return {
    ...nestedScene,
    parentSceneId: parentScene.id,
    tracks: {
      overlay: tracks.overlay
        .filter((track) => track.elements.some((element) =>
          selectedIds.has(`${track.id}\u0000${element.id}`),
        ))
        .map(copyTrack),
      main: {
        ...nestedScene.tracks.main,
        elements: copySelected(tracks.main),
      },
      audio: tracks.audio
        .filter((track) => track.elements.some((element) =>
          selectedIds.has(`${track.id}\u0000${element.id}`),
        ))
        .map(copyTrack),
    },
  };
}
