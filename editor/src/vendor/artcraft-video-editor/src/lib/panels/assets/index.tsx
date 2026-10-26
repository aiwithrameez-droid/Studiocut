"use client";

import { type Tab, tabs, useAssetsPanelStore } from "./assets-panel-store";
import { MediaView } from "./views/assets";
import { SettingsView } from "./views/settings";
import { SoundsView } from "../../sounds/components/assets-view";
import { StickersView } from "../../stickers/components/assets-view";
import { TextView } from "../../text/components/assets-view";
import { EffectsView } from "../../effects/components/assets-view";

// Captions depends on the transcription subsystem, which is not part of
// this build. Shown honestly as unavailable rather than as a working tool.
function CaptionsUnavailable() {
  const setActiveTab = useAssetsPanelStore((s) => s.setActiveTab);
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-sm font-medium">Captions are not available yet</p>
      <p className="text-muted-foreground max-w-[16rem] text-xs leading-5">
        Add on-screen words with the Text tool for now.
      </p>
      <button
        type="button"
        onClick={() => setActiveTab("text")}
        className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Open Text tool
      </button>
    </div>
  );
}

export function AssetsPanel() {
  const { activeTab } = useAssetsPanelStore();

  const viewMap: Record<Tab, React.ReactNode> = {
    media: <MediaView />,
    sounds: <SoundsView />,
    text: <TextView />,
    stickers: <StickersView />,
    effects: <EffectsView />,
    captions: <CaptionsUnavailable />,
    settings: <SettingsView />,
  };
  const current = tabs[activeTab];

  return (
    <div className="panel bg-background flex h-full flex-col overflow-hidden rounded-lg border border-ui-panel-border">
      <div className="flex shrink-0 items-baseline gap-2 px-3 pt-2.5 pb-1">
        <h2 className="text-sm font-semibold tracking-tight" data-testid="text-active-tool">
          {current.label}
        </h2>
        <span className="text-muted-foreground truncate text-[11px]">{current.hint}</span>
      </div>
      <div id="signalcut-tool-panel" className="min-h-0 flex-1 overflow-hidden">{viewMap[activeTab]}</div>
    </div>
  );
}
