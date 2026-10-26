"use client";

import { useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  MoreHorizontal,
  Pencil,
  Redo2,
  Trash2,
  Undo2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { useNavigate } from "react-router-dom";
import { ExportButton } from "./export-button";
import { useEditorAdapters } from "../../EditorProvider";
import { useEditor } from "../../editor/use-editor";
import { CommandIcon, Logout05Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { ShortcutsDialog } from "../../actions/shortcuts-dialog";
import { RenameProjectDialog } from "../../project/components/rename-project-dialog";
import { DeleteProjectDialog } from "../../project/components/delete-project-dialog";
import { cn } from "../../utils/ui";
import { invokeAction } from "../../actions";
import { Button } from "../ui/button";
import { useAuthUser } from "./use-auth-user";
import {
  clearProjectEditTime,
  ProjectEditTimer,
} from "./project-edit-timer";

export interface EditorHeaderProps {
  // Optional host chrome rendered to the right of the export button (e.g.
  // the webapp's pricing/credits/task queue/profile cluster when the
  // global topbar is hidden).
  endSlot?: ReactNode;
  // Host route to navigate to when the user exits or deletes the open
  // project (the host owns routing; the editor shell has no routes).
  exitTo?: string;
}

export function EditorHeader({ endSlot, exitTo = "/projects" }: EditorHeaderProps) {
  return (
    <header className="bg-background flex h-[3.4rem] items-center justify-between px-3 pt-0.5">
      <div className="flex items-center gap-1">
        <div aria-label="Signal Cut" className="mr-2 flex items-center gap-2 border-r border-border py-1 pr-3">
          <img src={`${import.meta.env.BASE_URL}logo.svg`} alt="" className="size-7 rounded-md" />
          <span className="hidden text-sm font-semibold tracking-tight sm:block">Signal Cut</span>
        </div>
        <ProjectDropdown exitTo={exitTo} />
        <EditableProjectName />
        <HistoryButtons />
      </div>
      <nav className="flex items-center gap-2">
        <CurrentUserBadge />
        <ProjectEditTimer />
        <ExportButton />
        {endSlot}
      </nav>
    </header>
  );
}

function HistoryButtons() {
  const canUndo = useEditor((e) => e.command.canUndo());
  const canRedo = useEditor((e) => e.command.canRedo());
  return (
    <div className="ml-1 hidden items-center gap-0.5 border-l border-border pl-2 md:flex" role="group" aria-label="History">
      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-sm"
        aria-label="Undo (Ctrl+Z)"
        title="Undo (Ctrl+Z)"
        disabled={!canUndo}
        data-testid="button-header-undo"
        onClick={() => invokeAction("undo")}
      >
        <Undo2 className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-8 rounded-sm"
        aria-label="Redo (Ctrl+Shift+Z)"
        title="Redo (Ctrl+Shift+Z)"
        disabled={!canRedo}
        data-testid="button-header-redo"
        onClick={() => invokeAction("redo")}
      >
        <Redo2 className="size-4" />
      </Button>
    </div>
  );
}

function CurrentUserBadge() {
  const { authUser } = useEditorAdapters();
  const user = useAuthUser(authUser);
  if (!user) return null;
  return (
    // <span
    //   className="text-muted-foreground hidden truncate text-xs sm:inline-block"
    //   title={user.displayName}
    // >
    //   {user.displayName}
    // </span>
    null
  );
}

function ProjectDropdown({ exitTo }: { exitTo: string }) {
  const [openDialog, setOpenDialog] = useState<
    "delete" | "rename" | "shortcuts" | null
  >(null);
  const [isExiting, setIsExiting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const navigate = useNavigate();
  const editor = useEditor();
  const activeProject = useEditor((e) => e.project.getActive());
  const { toast } = useEditorAdapters();

  const handleExit = async () => {
    if (isExiting) return;
    setIsExiting(true);

    try {
      await editor.project.prepareExit();
      editor.project.closeProject();
      navigate(exitTo);
    } catch (error) {
      toast.error("Couldn't safely exit this project", {
        description:
          error instanceof Error
            ? error.message
            : "Your edits may not have finished saving. Please try again.",
      });
    } finally {
      setIsExiting(false);
    }
  };

  const handleSaveProjectName = async (newName: string) => {
    if (
      activeProject &&
      newName.trim() &&
      newName !== activeProject.metadata.name
    ) {
      try {
        await editor.project.renameProject({
          id: activeProject.metadata.id,
          name: newName.trim(),
        });
      } catch (error) {
        toast.error("Failed to rename project", {
          description:
            error instanceof Error ? error.message : "Please try again",
        });
      } finally {
        setOpenDialog(null);
      }
    }
  };

  const handleDeleteProject = async () => {
    if (!activeProject || isDeleting) return;
    setIsDeleting(true);
    try {
      await editor.project.deleteProjects({
        ids: [activeProject.metadata.id],
      });
      clearProjectEditTime(activeProject.metadata.id);
      setOpenDialog(null);
      navigate(exitTo);
    } catch (error) {
      toast.error("Failed to delete project", {
        description:
          error instanceof Error ? error.message : "Please try again",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const openQuickStart = () => {
    window.dispatchEvent(new Event("studiocut:show-onboarding"));
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Project actions"
            title="Project actions"
            data-testid="button-project-actions"
            className="rounded-sm size-8"
          >
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="z-100 w-52">
          <DropdownMenuItem
            onClick={() => setOpenDialog("rename")}
            disabled={!activeProject}
            icon={<Pencil />}
            data-testid="menu-rename-project"
          >
            Rename project
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setOpenDialog("delete")}
            disabled={!activeProject || isDeleting}
            variant="destructive"
            icon={<Trash2 />}
            data-testid="menu-delete-project"
          >
            Delete project
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={openQuickStart}
            icon={<BookOpen />}
            data-testid="menu-open-quickstart"
          >
            Quick start guide
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setOpenDialog("shortcuts")}
            icon={<HugeiconsIcon icon={CommandIcon} />}
            data-testid="menu-open-shortcuts"
          >
            Keyboard shortcuts
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => void handleExit()}
            disabled={isExiting}
            icon={<HugeiconsIcon icon={Logout05Icon} />}
            data-testid="menu-exit-project"
          >
            {isExiting ? "Saving and exiting…" : "Exit to projects"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <RenameProjectDialog
        isOpen={openDialog === "rename"}
        onOpenChange={(isOpen) => setOpenDialog(isOpen ? "rename" : null)}
        onConfirm={(newName) => handleSaveProjectName(newName)}
        projectName={activeProject?.metadata.name || ""}
      />
      <DeleteProjectDialog
        isOpen={openDialog === "delete"}
        onOpenChange={(isOpen) => setOpenDialog(isOpen ? "delete" : null)}
        onConfirm={handleDeleteProject}
        projectNames={[activeProject?.metadata.name || ""]}
        isDeleting={isDeleting}
      />
      <ShortcutsDialog
        isOpen={openDialog === "shortcuts"}
        onOpenChange={(isOpen) => setOpenDialog(isOpen ? "shortcuts" : null)}
      />
    </>
  );
}

function EditableProjectName() {
  const editor = useEditor();
  const activeProject = useEditor((e) => e.project.getActive());
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const originalNameRef = useRef("");
  const { toast } = useEditorAdapters();

  const projectName = activeProject?.metadata.name || "";

  const startEditing = () => {
    if (isEditing) return;
    originalNameRef.current = projectName;
    setIsEditing(true);

    requestAnimationFrame(() => {
      inputRef.current?.select();
    });
  };

  const saveEdit = async () => {
    if (!inputRef.current || !activeProject) return;
    const newName = inputRef.current.value.trim();
    setIsEditing(false);

    if (!newName) {
      inputRef.current.value = originalNameRef.current;
      return;
    }

    if (newName !== originalNameRef.current) {
      try {
        await editor.project.renameProject({
          id: activeProject.metadata.id,
          name: newName,
        });
      } catch (error) {
        toast.error("Failed to rename project", {
          description:
            error instanceof Error ? error.message : "Please try again",
        });
      }
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Enter") {
      event.preventDefault();
      inputRef.current?.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      if (inputRef.current) {
        inputRef.current.value = originalNameRef.current;
        inputRef.current.setSelectionRange(0, 0);
      }
      setIsEditing(false);
      inputRef.current?.blur();
    }
  };

  return (
    <input
      ref={inputRef}
      type="text"
      defaultValue={projectName}
      readOnly={!isEditing}
      onClick={startEditing}
      onBlur={saveEdit}
      onKeyDown={handleKeyDown}
      style={{ fieldSizing: "content" } as React.CSSProperties}
      className={cn(
        "text-[0.9rem] h-8 px-2 py-1 rounded-sm bg-transparent outline-none cursor-pointer hover:bg-accent hover:text-accent-foreground",
        isEditing && "ring-1 ring-ring cursor-text hover:bg-transparent",
      )}
    />
  );
}
