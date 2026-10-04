"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { MAX_TITLE_LENGTH, type ActionTarget } from "./use-history-actions";

// Confirmation and rename dialogs shared by History and Snapshot detail.
// Each shows a failure inline and stays open so the person can retry.

interface RenameDialogProps {
  target: ActionTarget | null;
  onClose: () => void;
  onRename: (target: ActionTarget, title: string) => Promise<string | null>;
}

export function RenameDialog({ target, onClose, onRename }: RenameDialogProps) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>{target && <RenameForm key={target.kind === "draft" ? target.analysisId : target.snapshotId} target={target} onClose={onClose} onRename={onRename} />}</DialogContent>
    </Dialog>
  );
}

function RenameForm({ target, onClose, onRename }: { target: ActionTarget; onClose: () => void; onRename: RenameDialogProps["onRename"] }) {
  const id = useId();
  const [value, setValue] = useState(target.title);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const failure = await onRename(target, value);
    setBusy(false);
    if (failure) setError(failure);
    else onClose();
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <DialogHeader>
        <DialogTitle>Rename analysis</DialogTitle>
        <DialogDescription>
          {target.kind === "snapshot" ? "Only the name changes. The saved facts and estimate stay exactly as they were." : "Only the name changes."}
        </DialogDescription>
      </DialogHeader>
      <Field data-invalid={Boolean(error)}>
        <FieldLabel htmlFor={id}>Name</FieldLabel>
        <Input id={id} value={value} onChange={(e) => setValue(e.target.value)} maxLength={MAX_TITLE_LENGTH + 20} aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} autoFocus />
        {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <Spinner />}
          {busy ? "Saving name" : "Save name"}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  busyLabel: string;
  /** Lead-in for the inline failure message, e.g. "Couldn't delete it." */
  failureLead: string;
  onClose: () => void;
  /** Resolves to an error message, or null when the change was acknowledged. */
  onConfirm: () => Promise<string | null>;
}

/** Destructive confirmation that stays open, with the error shown inline, until the action succeeds. */
export function ConfirmDialog({ open, title, description, confirmLabel, busyLabel, failureLead, onClose, onConfirm }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function close() {
    setError(null);
    onClose();
  }

  async function confirm(event: React.MouseEvent) {
    // Keep the dialog open until the action is acknowledged.
    event.preventDefault();
    setBusy(true);
    setError(null);
    const message = await onConfirm();
    setBusy(false);
    if (message) setError(message);
    else close();
  }

  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && !busy && close()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {failureLead} {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={confirm} disabled={busy}>
            {busy && <Spinner />}
            {busy ? busyLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface DeleteDialogProps {
  target: ActionTarget | null;
  onClose: () => void;
  onDelete: (target: ActionTarget) => Promise<string | null>;
}

export function DeleteDialog({ target, onClose, onDelete }: DeleteDialogProps) {
  return (
    <ConfirmDialog
      open={target !== null}
      title={`Delete “${target?.title ?? ""}”?`}
      description={
        target?.kind === "snapshot"
          ? "This removes the saved estimate and its history entry. You can't undo this."
          : "This removes the draft and everything gathered for it. You can't undo this."
      }
      confirmLabel="Delete analysis"
      busyLabel="Deleting"
      failureLead="Couldn't delete it. Nothing was removed."
      onClose={onClose}
      onConfirm={() => (target ? onDelete(target) : Promise.resolve(null))}
    />
  );
}

interface RemoveAttachmentDialogProps {
  open: boolean;
  fileName: string;
  analysisTitle: string;
  onClose: () => void;
  onConfirm: () => void;
}

export function RemoveAttachmentDialog({ open, fileName, analysisTitle, onClose, onConfirm }: RemoveAttachmentDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {fileName}?</AlertDialogTitle>
          <AlertDialogDescription>
            This takes the report out of “{analysisTitle}” and removes values that only the report supplied. Anything you typed or confirmed stays, and the draft needs review again. The analysis itself isn&apos;t deleted.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep report</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            Remove report
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
