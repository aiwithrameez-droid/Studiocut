import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Label } from "../../components/ui/label";
import { Input } from "../../components/ui/input";

export function DeleteProjectDialog({
  isOpen,
  onOpenChange,
  onConfirm,
  projectNames,
  isDeleting = false,
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  projectNames: string[];
  isDeleting?: boolean;
}) {
  const [confirmation, setConfirmation] = useState("");
  const count = projectNames.length;
  const isSingle = count === 1;
  const singleName = isSingle ? projectNames[0] : null;

  useEffect(() => {
    if (isOpen) setConfirmation("");
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {singleName ? (
              <>
                {"Delete '"}
                <span className="inline-block max-w-[300px] truncate align-bottom">
                  {singleName}
                </span>
                {"'?"}
              </>
            ) : (
              `Delete ${count} projects?`
            )}
          </DialogTitle>
        </DialogHeader>
        <DialogBody>
          <Alert variant="destructive">
            <AlertTitle>Warning</AlertTitle>
            <AlertDescription>
              This will permanently delete{" "}
              {singleName ? `"${singleName}"` : `${count} projects`} and all
              associated files.
            </AlertDescription>
          </Alert>
          <div className="flex flex-col gap-3">
            <Label
              htmlFor="confirm-project-delete"
              className="text-xs font-semibold text-muted-foreground"
            >
              Type DELETE to confirm
            </Label>
            <Input
              id="confirm-project-delete"
              type="text"
              placeholder="DELETE"
              size="lg"
              variant="destructive"
              value={confirmation}
              onChange={(event) => setConfirmation(event.currentTarget.value)}
              autoComplete="off"
              data-testid="input-confirm-project-delete"
            />
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onConfirm}
            disabled={confirmation !== "DELETE" || isDeleting}
            data-testid="button-confirm-project-delete"
          >
            {isDeleting ? "Deleting…" : "Delete project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
