"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { useServiceAction } from "@/lib/services/hooks";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import styles from "./PortalShell.module.css";

/**
 * Modal confirmation for consequential changes. A reason is required and is
 * written to the audit trail by the service. Focus is trapped by the native
 * <dialog> and returns to the trigger on close.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  danger = false,
  children,
  validate,
  onConfirm,
  onClose,
  reasonLabel,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  children?: ReactNode;
  validate?: () => boolean;
  onConfirm: (reason: string) => Promise<unknown>;
  onClose: () => void;
  reasonLabel?: string;
}) {
  const { t } = useI18n();
  const id = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string>();
  const { run, pending, error, clear } = useServiceAction();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setReason("");
      setReasonError(undefined);
      clear();
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit() {
    if (validate && !validate()) return;
    if (!reason.trim()) {
      setReasonError(t("portal.detail.noteRequired"));
      return;
    }
    if (await run("confirm", () => onConfirm(reason.trim()))) onClose();
  }

  return (
    <dialog ref={ref} className={styles.dialog} aria-labelledby={`${id}-title`} onClose={onClose} onCancel={onClose}>
      <h2 id={`${id}-title`}>{title}</h2>
      {body && <div className={styles.dialogBody}>{body}</div>}
      {children}
      <TextAreaField
        id={`${id}-reason`}
        label={reasonLabel ?? t("portal.detail.note")}
        hint={t("portal.detail.noteHint")}
        requiredLabel={t("common.requiredMarker")}
        value={reason}
        error={reasonError}
        onChange={(e) => setReason(e.target.value)}
      />
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
      <div className={styles.dialogActions}>
        <Button variant="secondary" onClick={onClose} disabled={Boolean(pending)}>
          {t("common.cancel")}
        </Button>
        <Button variant={danger ? "danger" : "primary"} onClick={submit} disabled={Boolean(pending)} aria-busy={Boolean(pending) || undefined}>
          {pending ? t("common.loading") : confirmLabel}
        </Button>
      </div>
    </dialog>
  );
}
