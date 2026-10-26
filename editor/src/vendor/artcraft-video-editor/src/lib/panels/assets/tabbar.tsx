"use client";

import { Upload } from "lucide-react";
import { cn } from "../../utils/ui";
import { TAB_KEYS, tabs, useAssetsPanelStore } from "./assets-panel-store";
import { useImportMedia } from "../../media/use-import-media";

// Full-width workspace tool row. Plain toggle buttons (aria-pressed) that
// switch the real assets panel; Import opens the real file picker.
export function TabBar() {
  const { activeTab, setActiveTab } = useAssetsPanelStore();
  const { openFilePicker, fileInputProps, isImporting } = useImportMedia();

  return (
    <div className="flex shrink-0 items-center gap-3 px-3 pb-1.5">
      <button
        type="button"
        onClick={openFilePicker}
        disabled={isImporting}
        data-testid="button-import-media"
        className="bg-primary text-primary-foreground flex h-11 shrink-0 items-center gap-2 rounded-lg px-4 text-sm font-semibold shadow-sm transition-transform hover:brightness-105 active:scale-[0.98] disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:active:scale-100"
      >
        <Upload className="size-4" />
        {isImporting ? "Importing..." : "Import media"}
      </button>
      <input {...fileInputProps} data-testid="input-import-media" />
      <nav
        aria-label="Editing tools"
        className="scrollbar-hidden flex min-w-0 flex-1 items-stretch gap-1 overflow-x-auto rounded-lg border border-ui-panel-border bg-accent/40 p-1"
      >
        {TAB_KEYS.map((tabKey) => {
          const tab = tabs[tabKey];
          const isActive = activeTab === tabKey;
          const unavailable = "unavailable" in tab && !!tab.unavailable;
          return (
            <button
              key={tabKey}
              type="button"
              aria-pressed={isActive}
              aria-controls="signalcut-tool-panel"
              disabled={unavailable}
              title={unavailable ? `${tab.label}: ${tab.hint}` : tab.hint}
              data-testid={`tool-tab-${tabKey}`}
              onClick={() => setActiveTab(tabKey)}
              className={cn(
                "relative flex min-w-[4.25rem] flex-1 shrink-0 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium transition-colors motion-reduce:transition-none lg:max-w-[9rem]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                isActive
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-background/60 hover:text-foreground",
                unavailable && "cursor-not-allowed opacity-50 hover:bg-transparent",
              )}
            >
              <tab.icon className={cn("size-4 shrink-0", isActive && "text-primary")} />
              <span className="leading-none">{tab.label}</span>
              {unavailable && (
                <span className="rounded border border-border px-1 text-[9px] uppercase leading-3 tracking-wide">
                  Soon
                </span>
              )}
              {isActive && (
                <span aria-hidden className="absolute inset-x-4 bottom-0 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
