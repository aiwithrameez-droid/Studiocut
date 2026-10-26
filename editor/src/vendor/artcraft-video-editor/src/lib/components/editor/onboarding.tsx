"use client";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  Film,
  MousePointer2,
  Play,
  Upload,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/button";
import { Dialog, DialogBody, DialogContent, DialogTitle } from "../ui/dialog";

// Local-storage hook mirroring opencut-classic's services/storage/use-local-storage.
// Inlined here so the editor lib doesn't drag in a host-only services tree.
function useLocalStorage<T>({
  key,
  defaultValue,
}: {
  key: string;
  defaultValue: T;
}): [
  T,
  ({ value }: { value: T | ((previousValue: T) => T) }) => void,
  boolean,
  boolean,
] {
  const [value, setValue] = useState<T>(defaultValue);
  const [isReady, setIsReady] = useState(false);
  const [isStorageAvailable, setIsStorageAvailable] = useState(false);
  const valueRef = useRef(defaultValue);

  // avoid hydration mismatch by reading after mount
  useEffect(() => {
    let storageAvailable = false;
    try {
      const storedValue = localStorage.getItem(key);
      storageAvailable = true;
      if (storedValue !== null) {
        const parsedValue = JSON.parse(storedValue) as T;
        valueRef.current = parsedValue;
        setValue(parsedValue);
      }
    } catch {
      // localstorage might be unavailable
    }
    setIsStorageAvailable(storageAvailable);
    setIsReady(true);
  }, [key]);

  // sync to localstorage after hydration
  useEffect(() => {
    if (!isReady) return;

    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localstorage might be full or disabled
    }
  }, [key, value, isReady]);

  const setValueWithCallback = useCallback(
    ({ value: nextValue }: { value: T | ((previousValue: T) => T) }) => {
      const resolvedValue =
        typeof nextValue === "function"
          ? (nextValue as (previousValue: T) => T)(valueRef.current)
          : nextValue;

      valueRef.current = resolvedValue;
      setValue(resolvedValue);
    },
    [],
  );

  return [value, setValueWithCallback, isReady, isStorageAvailable];
}

export function Onboarding() {
  const [step, setStep] = useState(0);
  const [
    hasSeenOnboarding,
    setHasSeenOnboarding,
    isReady,
    isStorageAvailable,
  ] = useLocalStorage({
    key: "hasSeenOnboarding",
    defaultValue: false,
  });
  const [isManuallyOpen, setIsManuallyOpen] = useState(false);

  const isOpen =
    isReady &&
    (isManuallyOpen || (isStorageAvailable && !hasSeenOnboarding));

  const handleNext = () =>
    setStep((currentStep) => Math.min(currentStep + 1, guideSteps.length - 1));

  const handleBack = () =>
    setStep((currentStep) => Math.max(currentStep - 1, 0));

  const handleClose = () => {
    setHasSeenOnboarding({ value: true });
    setIsManuallyOpen(false);
  };

  useEffect(() => {
    const showOnboarding = () => {
      setStep(0);
      setIsManuallyOpen(true);
      setHasSeenOnboarding({ value: false });
    };
    window.addEventListener("studiocut:show-onboarding", showOnboarding);
    return () =>
      window.removeEventListener("studiocut:show-onboarding", showOnboarding);
  }, [setHasSeenOnboarding]);

  const currentStep = guideSteps[step];
  const StepIcon = currentStep.icon;
  const isLastStep = step === guideSteps.length - 1;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogTitle>
          <span className="sr-only">{currentStep.title}</span>
        </DialogTitle>
        <DialogBody>
          <div className="space-y-5">
            <div className="flex items-center gap-2 text-xs font-semibold">
              <svg viewBox="12 10 56 58" className="size-8 rounded-lg bg-[#111827] p-1" aria-hidden="true">
                <path d="M60 59H20V19.6h40V32h-4v-8.4H24V55h32v-8.8h4z" fill="#E8EEF4" />
                <path d="M38 14h4.1v50.9H38z" fill="#B4C406" />
                <path d="M56.1 33.3V45l9.3-5.9z" fill="#65C6E9" />
              </svg>
              Your first cut starts here
            </div>

            <div
              className="flex items-center gap-2"
              aria-label={`Step ${step + 1} of ${guideSteps.length}`}
            >
              <div className="flex flex-1 gap-1.5">
                {guideSteps.map((item, index) => (
                  <span
                    key={item.eyebrow}
                    className={`h-1.5 flex-1 rounded-full transition-colors ${
                      index <= step ? "bg-primary" : "bg-muted"
                    }`}
                  />
                ))}
              </div>
              <span className="font-mono text-[10px] text-muted-foreground">
                {String(step + 1).padStart(2, "0")} / {guideSteps.length}
              </span>
            </div>

            <div className="grid size-11 place-items-center rounded-xl border border-primary/20 bg-primary/10 text-primary">
              <StepIcon className="size-5" />
            </div>
            <div className="space-y-2">
              <div className="font-mono text-[10px] font-semibold tracking-[0.16em] text-primary">
                {currentStep.eyebrow}
              </div>
              <Title title={currentStep.title} />
              <Description description={currentStep.description} />
            </div>

            <div className="flex items-start gap-2 rounded-lg border border-border bg-background/60 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              <MousePointer2 className="mt-0.5 size-4 shrink-0 text-primary" />
              <span>{currentStep.tip}</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Button
                variant="ghost"
                onClick={step === 0 ? handleClose : handleBack}
                data-testid="button-onboarding-back-or-skip"
              >
                {step === 0 ? "Skip intro" : <><ArrowLeft className="size-4" /> Back</>}
              </Button>
              <NextButton
                onClick={isLastStep ? handleClose : handleNext}
                data-testid="button-onboarding-next"
              >
                {isLastStep ? "Start editing" : currentStep.action}
              </NextButton>
            </div>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

const guideSteps = [
  {
    eyebrow: "01 / IMPORT",
    title: "Bring in your footage.",
    description:
      "Open Media in the left panel and choose Import media, or drag files into the editor. Your files stay on this device.",
    icon: Upload,
    action: "Next: build your timeline",
    tip: "You can also paste media from your clipboard.",
  },
  {
    eyebrow: "02 / ARRANGE",
    title: "Shape the timeline.",
    description:
      "Add a clip with its + button or drag it onto a track. Move clips to reorder them, then pull either edge to trim.",
    icon: Film,
    action: "Next: preview and export",
    tip: "Select a clip to adjust timing and content in the Inspector.",
  },
  {
    eyebrow: "03 / FINISH",
    title: "Review, then export.",
    description:
      "Press Space to play and scrub the playhead to check a moment. StudioCut saves your project locally as you work.",
    icon: Play,
    action: "Start editing",
    tip: "You can reopen this guide any time from Project actions.",
  },
];

function Title({ title }: { title: string }) {
  return <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h2>;
}

function Description({ description }: { description: string }) {
  return (
    <div className="text-muted-foreground">
      <p className="mb-0">{description}</p>
    </div>
  );
}

function NextButton({
  children,
  onClick,
  ...props
}: {
  children: React.ReactNode;
  onClick: () => void;
  "data-testid"?: string;
}) {
  return (
    <Button onClick={onClick} variant="default" className="w-full" {...props}>
      {children}
      {children === "Start editing" ? (
        <Check className="size-4" />
      ) : (
        <ArrowRight className="size-4" />
      )}
    </Button>
  );
}
