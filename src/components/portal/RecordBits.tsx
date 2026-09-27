"use client";

import { useId, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { Comment } from "@/lib/types";
import { useServiceAction } from "@/lib/services/hooks";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Badge } from "@/components/ui/Badge";
import { TextAreaField } from "@/components/ui/Field";
import styles from "./portal.module.css";

export function RecordNotFound({ backHref }: { backHref: string }) {
  const { t } = useI18n();
  return (
    <div className={styles.stack}>
      <Notice tone="warning" title={t("portal.detail.notFound")} />
      <div>
        <ButtonLink href={backHref} variant="secondary" icon="arrowLeft">
          {t("portal.detail.back")}
        </ButtonLink>
      </div>
    </div>
  );
}

/** Shown when the signed-in role lacks the permission, or the record is outside the user's geographic scope. */
export function PermissionDenied({ title, body, backHref = "/portal" }: { title?: string; body?: string; backHref?: string }) {
  const { t } = useI18n();
  return (
    <div className={styles.stateBox} role="alert">
      <span className={styles.stateIcon} aria-hidden="true">
        <Icon name="lock" size={24} />
      </span>
      <h2 className={styles.stateTitle}>{title ?? t("portal.denied.title")}</h2>
      <p className={styles.muted}>{body ?? t("portal.denied.body")}</p>
      <div>
        <ButtonLink href={backHref} variant="secondary" icon="arrowLeft">
          {t("portal.denied.back")}
        </ButtonLink>
      </div>
    </div>
  );
}

export function EmptyState({ icon = "inbox", title, body, action }: { icon?: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className={styles.stateBox}>
      <span className={styles.stateIcon} aria-hidden="true">
        <Icon name={icon} size={24} />
      </span>
      <p className={styles.stateTitle}>{title}</p>
      {body && <p className={styles.muted}>{body}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useI18n();
  return (
    <Notice tone="error" role="alert" title={t("portal.errorState.title")}>
      <p>{message}</p>
      {onRetry && (
        <div style={{ marginTop: 8 }}>
          <Button size="sm" variant="secondary" icon="refresh" onClick={onRetry}>
            {t("portal.errorState.retry")}
          </Button>
        </div>
      )}
    </Notice>
  );
}

/** Masked personal value with a lock badge, so masking is never mistaken for missing data. */
export function Masked({ value, masked }: { value: ReactNode; masked: boolean }) {
  const { t } = useI18n();
  return (
    <span className={styles.masked}>
      <span dir="ltr" className={styles.monoInline}>
        {value}
      </span>
      {masked && (
        <Badge tone="neutral" icon="lock">
          {t("portal.detail.restricted")}
        </Badge>
      )}
    </span>
  );
}

/** Checks show a word ("Complete"/"Waiting") and an icon, never colour alone. */
export function Checklist({ items }: { items: { label: ReactNode; done: boolean; extra?: ReactNode; stateLabel?: string }[] }) {
  const { t } = useI18n();
  return (
    <ul className={styles.checklist}>
      {items.map((item, index) => (
        <li key={index} className={`${styles.checkItem} ${item.done ? styles.checkDone : styles.checkPending}`}>
          <Icon name={item.done ? "checkCircle" : "clock"} size={20} />
          <span className={styles.checkBody}>
            <span>{item.label}</span>
            <span className={styles.checkState}>{item.stateLabel ?? (item.done ? t("portal.checks.done") : t("portal.checks.pending"))}</span>
            {item.extra}
          </span>
        </li>
      ))}
    </ul>
  );
}

export type StageState = "done" | "current" | "upcoming" | "skipped" | "ended";

/** The workflow path for a record: where it has been, where it is, and what comes next. */
export function WorkflowStepper({ label, stages }: { label: string; stages: { key: string; label: string; state: StageState }[] }) {
  const { t } = useI18n();
  return (
    <ol className={styles.stepper} aria-label={label}>
      {stages.map((stage, index) => (
        <li key={stage.key} className={`${styles.stage} ${styles[`stage_${stage.state}`] ?? ""}`} aria-current={stage.state === "current" ? "step" : undefined}>
          <span className={styles.stageMark} aria-hidden="true">
            {stage.state === "done" ? <Icon name="check" size={14} /> : stage.state === "ended" ? <Icon name="x" size={14} /> : index + 1}
          </span>
          <span className={styles.stageLabel}>{stage.label}</span>
          <span className="visually-hidden">
            {" "}
            — {t(`portal.stage.${stage.state}` as "portal.stage.done")}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** Comment list with an add form. Comments are recorded in the audit trail by the service. */
export function CommentThread({
  comments,
  onAdd,
  canAdd = true,
  label,
  emptyLabel,
  placeholderLabel,
}: {
  comments: Comment[];
  onAdd?: (text: string) => Promise<unknown>;
  canAdd?: boolean;
  label: string;
  emptyLabel: string;
  placeholderLabel?: string;
}) {
  const { t, formatDate } = useI18n();
  const id = useId();
  const [text, setText] = useState("");
  const [fieldError, setFieldError] = useState<string>();
  const { run, pending, error } = useServiceAction();

  return (
    <div className={styles.stack}>
      {comments.length === 0 ? (
        <p className={styles.muted}>{emptyLabel}</p>
      ) : (
        <ul className={styles.commentList}>
          {comments.map((c) => (
            <li key={c.id} className={styles.comment}>
              <p className={styles.commentMeta}>
                <strong>{c.author}</strong> · <time dateTime={c.at}>{formatDate(c.at, true)}</time>
              </p>
              <p>{c.text}</p>
            </li>
          ))}
        </ul>
      )}
      {onAdd && canAdd && (
        <form
          className={styles.inlineForm}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) {
              setFieldError(t("portal.validation.required"));
              return;
            }
            setFieldError(undefined);
            if (await run("comment", () => onAdd(text.trim()))) setText("");
          }}
        >
          <TextAreaField id={`${id}-c`} label={placeholderLabel ?? label} value={text} error={fieldError} onChange={(e) => setText(e.target.value)} />
          <div>
            <Button type="submit" variant="secondary" size="sm" icon="send" disabled={Boolean(pending)}>
              {pending ? t("common.loading") : t("portal.comments.add")}
            </Button>
          </div>
          {error && (
            <Notice tone="error" role="alert">
              {error}
            </Notice>
          )}
        </form>
      )}
    </div>
  );
}

/** "Updated …" line shown under metrics and sections so data freshness is visible. */
export function UpdatedAt({ at }: { at?: string }) {
  const { t, formatDate } = useI18n();
  if (!at) return <span className={styles.updated}>{t("portal.updated.never")}</span>;
  return (
    <span className={styles.updated}>
      {t("portal.updated.at", { date: formatDate(at, true) })}
    </span>
  );
}

export function SimulatedTag() {
  const { t } = useI18n();
  return <Badge tone="simulated">{t("common.simulated")}</Badge>;
}
