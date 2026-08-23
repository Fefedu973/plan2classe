"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@plan2classe-app/ui/components/alert-dialog";
import { cn } from "@plan2classe-app/ui/lib/utils";
import { LoaderCircle, TriangleAlert } from "lucide-react";
import type { ComponentProps } from "react";

type ConfirmDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  /** Extra context (counts, consequences) rendered under the description. */
  detail?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  pending?: boolean;
  tone?: "destructive" | "default";
  icon?: React.ReactNode;
};

/**
 * Replaces `window.confirm` so destructive actions stay inside the app's own
 * design system, remain themable and keep working in embedded contexts where
 * native dialogs are suppressed.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  detail,
  confirmLabel,
  cancelLabel = "Annuler",
  onConfirm,
  pending = false,
  tone = "destructive",
  icon,
}: ConfirmDialogProps) {
  const isDestructive = tone === "destructive";
  const actionVariant: ComponentProps<typeof AlertDialogAction>["variant"] = isDestructive
    ? "destructive"
    : "default";

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (pending && !next) return;
        onOpenChange(next);
      }}
    >
      <AlertDialogContent className="sm:max-w-md">
        <AlertDialogHeader>
          <AlertDialogMedia
            className={cn(isDestructive && "bg-destructive/10 text-destructive")}
          >
            {icon ?? <TriangleAlert aria-hidden="true" />}
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {detail ? (
          <div className="rounded-lg border bg-muted/40 p-3 text-xs leading-5 text-muted-foreground">
            {detail}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction variant={actionVariant} disabled={pending} onClick={onConfirm}>
            {pending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
