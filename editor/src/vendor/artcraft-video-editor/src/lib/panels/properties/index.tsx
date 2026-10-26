"use client";

import { ScrollArea } from "../../components/ui/scroll-area";
import { Button } from "../../components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../../components/ui/tooltip";
import { useEditor } from "../../editor/use-editor";
import { useElementSelection } from "../../timeline/hooks/element/use-element-selection";
import { usePropertiesStore } from "./stores/properties-store";
import { getPropertiesConfig } from "./registry";
import { cn } from "../../utils/ui";
import { EmptyView } from "./empty-view";

export function PropertiesPanel() {
  const editor = useEditor();
  useEditor((e) => e.scenes.getActiveSceneOrNull());
  useEditor((e) => e.media.getAssets());
  const { selectedElements } = useElementSelection();
  const { activeTabPerType, setActiveTab } = usePropertiesStore();

  if (selectedElements.length === 0) {
    return (
      <div className="panel bg-background flex h-full flex-col items-center justify-center overflow-hidden rounded-lg border border-ui-panel-border">
        <EmptyView />
      </div>
    );
  }

  if (selectedElements.length > 1) {
    return (
      <div className="panel bg-background flex h-full flex-col items-center justify-center overflow-hidden rounded-lg border border-ui-panel-border">
        <div className="flex flex-col items-center gap-2 p-5 text-center">
          <p className="text-sm font-semibold" data-testid="text-multi-selection">
            {selectedElements.length} items selected
          </p>
          <p className="text-muted-foreground max-w-[15rem] text-xs leading-5">
            Move, copy or delete them together on the timeline. Select a single
            item to edit its properties.
          </p>
        </div>
      </div>
    );
  }

  const mediaAssets = editor.media.getAssets();

  const elementsWithTracks = editor.timeline.getElementsWithTracks({
    elements: selectedElements,
  });
  const elementWithTrack = elementsWithTracks[0];

  if (!elementWithTrack) return null;

  const { element, track } = elementWithTrack;
  const config = getPropertiesConfig({ element, mediaAssets });
  const visibleTabs = config.tabs;

  const storedTabId = activeTabPerType[element.type];
  const isStoredTabVisible = visibleTabs.some((t) => t.id === storedTabId);
  const activeTabId = isStoredTabVisible ? storedTabId : config.defaultTab;
  const activeTab =
    visibleTabs.find((t) => t.id === activeTabId) ?? visibleTabs[0];

  if (!activeTab) return null;

  return (
    <div className="panel bg-background flex h-full flex-col overflow-hidden rounded-lg border border-ui-panel-border">
      <div className="flex shrink-0 items-center gap-2 border-b border-ui-panel-border px-3 py-2">
        <span className="bg-primary/15 text-foreground rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
          {element.type}
        </span>
        <span className="truncate text-sm font-medium" data-testid="text-selected-element-name" title={element.name}>
          {element.name}
        </span>
        <span className="text-muted-foreground ml-auto shrink-0 text-[11px]">{activeTab.label}</span>
      </div>
      <div className="flex min-h-0 flex-1">
      <TooltipProvider delayDuration={0}>
        <div className="flex shrink-0 flex-col gap-0.5 border-r border-ui-panel-border p-1 scrollbar-hidden overflow-y-auto">
          {visibleTabs.map((tab) => (
            <Tooltip key={tab.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={tab.id === activeTab.id ? "secondary" : "ghost"}
                  size="icon"
                  onClick={() =>
                    setActiveTab({
                      elementType: element.type,
                      tabId: tab.id,
                    })
                  }
                  aria-label={tab.label}
                  className={cn(
                    "shrink-0",
                    "h-8 w-8",
                    tab.id !== activeTab.id && "text-muted-foreground",
                  )}
                >
                  {tab.icon}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{tab.label}</TooltipContent>
            </Tooltip>
          ))}
        </div>
      </TooltipProvider>
      <ScrollArea className="flex-1 scrollbar-hidden">
        {activeTab.content({ trackId: track.id })}
      </ScrollArea>
      </div>
    </div>
  );
}
