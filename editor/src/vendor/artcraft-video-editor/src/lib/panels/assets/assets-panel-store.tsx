import type { ElementType } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  ClosedCaptionIcon,
  Folder03Icon,
  Happy01Icon,
  HeadphonesIcon,
  MagicWand05Icon,
  TextIcon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

export const TAB_KEYS = [
  "media",
  "sounds",
  "text",
  "stickers",
  "effects",
  "captions",
  "settings",
] as const;

export type Tab = (typeof TAB_KEYS)[number];

const createHugeiconsIcon =
  ({ icon }: { icon: IconSvgElement }) =>
  ({ className }: { className?: string }) => (
    <HugeiconsIcon icon={icon} className={className} />
  );

export const tabs = {
  media: {
    icon: createHugeiconsIcon({ icon: Folder03Icon }),
    label: "Media",
    hint: "Import and arrange your clips",
  },
  sounds: {
    icon: createHugeiconsIcon({ icon: HeadphonesIcon }),
    label: "Audio",
    hint: "Music and sound effects",
  },
  text: {
    icon: createHugeiconsIcon({ icon: TextIcon }),
    label: "Text",
    hint: "Titles and lower thirds",
  },
  stickers: {
    icon: createHugeiconsIcon({ icon: Happy01Icon }),
    label: "Stickers",
    hint: "Graphic overlays",
  },
  effects: {
    icon: createHugeiconsIcon({ icon: MagicWand05Icon }),
    label: "Effects",
    hint: "Visual effects for clips",
  },
  captions: {
    icon: createHugeiconsIcon({ icon: ClosedCaptionIcon }),
    label: "Captions",
    hint: "Not available yet",
    unavailable: true,
  },
  settings: {
    icon: createHugeiconsIcon({ icon: Settings01Icon }),
    label: "Project",
    hint: "Canvas, frame rate and background",
  },
} satisfies Record<
  Tab,
  { icon: ElementType<{ className?: string }>; label: string; hint: string; unavailable?: boolean }
>;

export type MediaViewMode = "grid" | "list";
export type MediaSortKey = "name" | "type" | "duration" | "size";
export type MediaSortOrder = "asc" | "desc";

interface AssetsPanelStore {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  highlightMediaId: string | null;
  requestRevealMedia: (mediaId: string) => void;
  clearHighlight: () => void;

  /* Media */
  mediaViewMode: MediaViewMode;
  setMediaViewMode: (mode: MediaViewMode) => void;
  mediaSortBy: MediaSortKey;
  mediaSortOrder: MediaSortOrder;
  setMediaSort: (args: { key: MediaSortKey; order: MediaSortOrder }) => void;
}

export const useAssetsPanelStore = create<AssetsPanelStore>()(
  persist(
    (set) => ({
      activeTab: "media",
      setActiveTab: (tab) => set({ activeTab: tab }),
      highlightMediaId: null,
      requestRevealMedia: (mediaId) =>
        set({ activeTab: "media", highlightMediaId: mediaId }),
      clearHighlight: () => set({ highlightMediaId: null }),
      mediaViewMode: "grid",
      setMediaViewMode: (mode) => set({ mediaViewMode: mode }),
      mediaSortBy: "name",
      mediaSortOrder: "asc",
      setMediaSort: ({ key, order }) =>
        set({ mediaSortBy: key, mediaSortOrder: order }),
    }),
    {
      name: "assets-panel",
      partialize: (state) => ({
        mediaViewMode: state.mediaViewMode,
        mediaSortBy: state.mediaSortBy,
        mediaSortOrder: state.mediaSortOrder,
      }),
    },
  ),
);
