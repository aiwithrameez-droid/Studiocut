"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Timer } from "lucide-react";
import { useEditor } from "../../editor/use-editor";

const STORAGE_PREFIX = "studiocut:project-edit-time:v1:";

type SavedTimer = {
  elapsedMs: number;
  paused: boolean;
};

function readTimer(projectId: string): SavedTimer & { storageAvailable: boolean } {
  try {
    const raw = window.localStorage.getItem(`${STORAGE_PREFIX}${projectId}`);
    if (!raw) return { elapsedMs: 0, paused: false, storageAvailable: true };

    const parsed = JSON.parse(raw) as Partial<SavedTimer>;
    const elapsedMs =
      typeof parsed.elapsedMs === "number" &&
      Number.isFinite(parsed.elapsedMs) &&
      parsed.elapsedMs >= 0
        ? parsed.elapsedMs
        : 0;

    return {
      elapsedMs,
      paused: parsed.paused === true,
      storageAvailable: true,
    };
  } catch {
    return { elapsedMs: 0, paused: false, storageAvailable: false };
  }
}

export function clearProjectEditTime(projectId: string): void {
  try {
    window.localStorage.removeItem(`${STORAGE_PREFIX}${projectId}`);
  } catch {
    // The project can still be deleted when browser storage is unavailable.
  }
}

function formatElapsedTime(elapsedMs: number): string {
  const seconds = Math.floor(Math.max(0, elapsedMs) / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return [hours, minutes, remainingSeconds]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}

function ProjectTimerSession({ projectId }: { projectId: string }) {
  const [initialTimer] = useState(() => readTimer(projectId));
  const [elapsedMs, setElapsedMs] = useState(initialTimer.elapsedMs);
  const [isRunning, setIsRunning] = useState(!initialTimer.paused);
  const [storageAvailable, setStorageAvailable] = useState(
    initialTimer.storageAvailable,
  );
  const elapsedMsRef = useRef(initialTimer.elapsedMs);
  const isRunningRef = useRef(!initialTimer.paused);
  const isVisibleRef = useRef(document.visibilityState !== "hidden");
  const startedAtRef = useRef<number | null>(null);
  const storageKey = `${STORAGE_PREFIX}${projectId}`;

  const persist = useCallback(
    (elapsed: number, paused: boolean) => {
      try {
        window.localStorage.setItem(
          storageKey,
          JSON.stringify({
            elapsedMs: Math.round(elapsed),
            paused,
          } satisfies SavedTimer),
        );
        setStorageAvailable(true);
      } catch {
        setStorageAvailable(false);
      }
    },
    [storageKey],
  );

  const flush = useCallback(
    (updateDisplay = true) => {
      if (startedAtRef.current !== null) {
        elapsedMsRef.current += Math.max(
          0,
          performance.now() - startedAtRef.current,
        );
        startedAtRef.current = null;
      }
      if (updateDisplay) setElapsedMs(elapsedMsRef.current);
      persist(elapsedMsRef.current, !isRunningRef.current);
    },
    [persist],
  );

  useEffect(() => {
    if (isRunningRef.current && isVisibleRef.current) {
      startedAtRef.current = performance.now();
    }

    const tick = () => {
      if (!isRunningRef.current || document.visibilityState === "hidden") return;

      const now = performance.now();
      if (startedAtRef.current === null) startedAtRef.current = now;
      elapsedMsRef.current += Math.max(0, now - startedAtRef.current);
      startedAtRef.current = now;
      setElapsedMs(elapsedMsRef.current);
      persist(elapsedMsRef.current, false);
    };

    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState !== "hidden";
      if (isVisibleRef.current && isRunningRef.current) {
        startedAtRef.current = performance.now();
      } else {
        flush();
      }
    };

    const handlePageHide = () => {
      isVisibleRef.current = false;
      flush();
    };

    const intervalId = window.setInterval(tick, 1000);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      isVisibleRef.current = false;
      flush(false);
    };
  }, [flush, persist]);

  const toggleTimer = () => {
    if (isRunningRef.current) {
      isRunningRef.current = false;
      setIsRunning(false);
      flush();
      return;
    }

    isRunningRef.current = true;
    setIsRunning(true);
    if (document.visibilityState !== "hidden") {
      isVisibleRef.current = true;
      startedAtRef.current = performance.now();
    }
    persist(elapsedMsRef.current, false);
  };

  const timeLabel = formatElapsedTime(elapsedMs);
  const actionLabel = isRunning ? "Pause edit timer" : "Resume edit timer";

  return (
    <button
      type="button"
      onClick={toggleTimer}
      aria-label={`${actionLabel}. Total edit time ${timeLabel}.`}
      aria-pressed={isRunning}
      title={
        storageAvailable
          ? `${timeLabel} edit time · ${isRunning ? "click to pause" : "click to resume"}`
          : "Timer is running, but browser storage is unavailable. It may reset when you leave this project."
      }
      data-testid="project-edit-timer"
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border/70 px-2 text-muted-foreground transition hover:border-primary/40 hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Timer
        aria-hidden="true"
        className={`size-3.5 ${isRunning ? "text-primary" : "text-muted-foreground"}`}
      />
      <span className="font-mono text-[11px] tabular-nums text-foreground">
        {timeLabel}
      </span>
      <span className="hidden text-[9px] font-medium uppercase tracking-wide sm:inline">
        {isRunning ? "Edit time" : "Paused"}
      </span>
      {isRunning ? (
        <Pause aria-hidden="true" className="ml-0.5 size-3" />
      ) : (
        <Play aria-hidden="true" className="ml-0.5 size-3" />
      )}
      {!storageAvailable && (
        <span className="sr-only">Timer could not be saved on this device.</span>
      )}
    </button>
  );
}

export function ProjectEditTimer() {
  const projectId = useEditor((editor) => editor.project.getActive()?.metadata.id);

  if (!projectId) return null;
  return <ProjectTimerSession key={projectId} projectId={projectId} />;
}
