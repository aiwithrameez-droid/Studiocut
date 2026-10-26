"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor } from "../editor/use-editor";
import { useEditorAdapters } from "../EditorProvider";
import { useFileUpload } from "./use-file-upload";
import { processMediaAssets } from "./processing";
import { showMediaUploadToast } from "./upload-toast";
import { useAssetsPanelStore } from "../panels/assets/assets-panel-store";

export const IMPORT_MEDIA_EVENT = "signalcut:import-media";

// Request the workspace import picker from anywhere in the editor. Must be
// called synchronously inside a user gesture so the file dialog may open.
export function requestImportMedia() {
  window.dispatchEvent(new Event(IMPORT_MEDIA_EVENT));
}

// Same pipeline as the Media library: processMediaAssets -> addMediaAsset,
// wrapped by the upload toast.
export function useImportMedia() {
  const editor = useEditor();
  const { toast, mediaSource } = useEditorAdapters();
  const activeProject = useEditor((e) => e.project.getActive());
  const [isImporting, setIsImporting] = useState(false);

  const importFiles = async (files: File[]) => {
    if (files.length === 0) return;
    if (!activeProject) {
      toast.error("No active project");
      return;
    }
    setIsImporting(true);
    try {
      await showMediaUploadToast({
        filesCount: files.length,
        toast,
        promise: async () => {
          const processed = await processMediaAssets({ files, toast, mediaSource });
          for (const asset of processed) {
            await editor.media.addMediaAsset({
              projectId: activeProject.metadata.id,
              asset,
            });
          }
          if (processed.length > 0) {
            useAssetsPanelStore.getState().setActiveTab("media");
          }
          return {
            uploadedCount: processed.length,
            assetNames: processed.map((a) => a.name),
          };
        },
      });
    } catch (error) {
      console.error("Error importing files:", error);
    } finally {
      setIsImporting(false);
    }
  };

  const { openFilePicker, fileInputProps } = useFileUpload({
    accept: "image/*,video/*,audio/*",
    multiple: true,
    onFilesSelected: (files) => void importFiles(files),
  });

  const openRef = useRef(openFilePicker);
  openRef.current = openFilePicker;
  useEffect(() => {
    const handler = () => openRef.current();
    window.addEventListener(IMPORT_MEDIA_EVENT, handler);
    return () => window.removeEventListener(IMPORT_MEDIA_EVENT, handler);
  }, []);

  return { openFilePicker, fileInputProps, isImporting };
}
