"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/** Shown when someone follows a link away from an active conversation. Stay keeps listening state untouched. */
export function LeaveConversationDialog({ open, onStay, onLeave }: { open: boolean; onStay(): void; onLeave(): void }) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onStay()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>End the conversation and leave?</AlertDialogTitle>
          <AlertDialogDescription>
            Leaving turns the microphone off and ends the conversation. Details gathered so far stay in your draft as proposed values to review.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Stay</AlertDialogCancel>
          <AlertDialogAction onClick={onLeave}>End conversation and leave</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
