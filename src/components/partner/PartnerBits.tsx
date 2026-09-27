"use client";

import { useId, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { Eligibility } from "@/lib/services/partners";
import { simulateOpmStep, type OpmStep } from "@/lib/services/partnerDemo";
import { useServiceAction, useServiceQuery } from "@/lib/services/hooks";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Badge } from "@/components/ui/Badge";
import { TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PermissionDenied, RecordNotFound } from "@/components/portal/RecordBits";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { LoadingState } from "@/components/portal/PageHeader";
import { isNotFound, isPartnerDenied } from "./partnerHooks";
import portal from "@/components/portal/portal.module.css";
import styles from "./partner.module.css";

/** Runs a partner service read and reports "not yours" and "not found" separately. */
export function usePartnerQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const q = useServiceQuery(fetcher, deps);
  return { ...q, denied: isPartnerDenied(q.error), notFound: isNotFound(q.error) };
}

/** Shown when a record belongs to another organisation, is not assigned to this user, or needs a permission. */
export function PartnerDenied({ kind = "record" }: { kind?: "record" | "permission" }) {
  const { t } = useI18n();
  return (
    <PermissionDenied
      backHref="/partner"
      title={kind === "record" ? t("partner.denied.recordTitle") : t("partner.denied.permissionTitle")}
      body={kind === "record" ? t("partner.denied.recordBody") : t("partner.denied.permissionBody")}
    />
  );
}

/** Loading, not-found and access states in one place, so every screen handles them the same way. */
export function Gate({ loading, denied, notFound, backHref, children }: { loading: boolean; denied: boolean; notFound: boolean; backHref: string; children: () => ReactNode }) {
  const { t } = useI18n();
  if (denied) return <PartnerDenied />;
  if (notFound) return <RecordNotFound backHref={backHref} />;
  if (loading) return <LoadingState label={t("common.loading")} />;
  return <>{children()}</>;
}

/** Why the organisation cannot submit new proposals right now, and what to do next. */
export function EligibilityNotice({ eligibility }: { eligibility: Eligibility }) {
  const { t } = useI18n();
  if (eligibility.eligible || !eligibility.reason) return null;
  return (
    <Notice tone="warning" title={t(`partner.eligibility.${eligibility.reason}.title` as MessageKey)}>
      <p>{t(`partner.eligibility.${eligibility.reason}.body` as MessageKey)}</p>
    </Notice>
  );
}

/**
 * DEMONSTRATION CONTROL. Applies the OPM decision the walkthrough is waiting
 * for, using the OPM decision rules, recorded as simulated. Real decisions can
 * be made instead in the OPM workspace (coordinator.demo).
 */
export function DemoControl({ step, compact = false, onDone }: { step: OpmStep; compact?: boolean; onDone?: (message: string) => void }) {
  const { t } = useI18n();
  const { run, pending, error, success } = useServiceAction();
  return (
    <div className={styles.demoControl}>
      <p className={portal.small}>
        <Badge tone="simulated">{t("partner.demo.controlTag")}</Badge> {!compact && t("partner.demo.controlIntro")}
      </p>
      <div className={portal.buttonRow}>
        <Button
          size="sm"
          variant="secondary"
          icon="refresh"
          disabled={Boolean(pending)}
          aria-busy={Boolean(pending) || undefined}
          onClick={async () => {
            // The control disappears once its step is done, so the parent can keep the confirmation.
            if (await run(step, () => simulateOpmStep(step), t("partner.demo.done"))) onDone?.(t("partner.demo.done"));
          }}
        >
          {pending ? t("common.loading") : t(`partner.demo.steps.${step}` as MessageKey)}
        </Button>
      </div>
      {!compact && <p className={`${portal.small} ${portal.muted}`}>{t("partner.demo.orReal")}</p>}
      <div aria-live="polite">{success && <Notice tone="success">{success}</Notice>}</div>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
    </div>
  );
}

export interface PickedFile {
  name: string;
  sizeKb: number;
}

/**
 * SIMULATED upload: the browser reads the chosen file's name and size only.
 * Nothing is stored and nothing is authenticated.
 */
export function FilePicker({ id, label, value, onChange, error, required }: { id: string; label: string; value?: PickedFile; onChange: (file: PickedFile | undefined) => void; error?: string; required?: boolean }) {
  const { t } = useI18n();
  return (
    <div className={styles.fieldset}>
      <label htmlFor={id} className={styles.legend}>
        {label} {required ? <span className={portal.muted}>{t("common.requiredMarker")}</span> : <span className={portal.muted}>{t("common.optional")}</span>}
      </label>
      <p id={`${id}-hint`} className={`${portal.small} ${portal.muted}`}>
        {t("partner.upload.hint")}
      </p>
      {error && (
        <p id={`${id}-error`} className={portal.fieldError}>
          <Icon name="alertCircle" size={16} /> {error}
        </p>
      )}
      <input
        id={id}
        type="file"
        aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
        aria-invalid={error ? true : undefined}
        onChange={(e) => {
          const f = e.target.files?.[0];
          onChange(f ? { name: f.name, sizeKb: Math.max(1, Math.round(f.size / 1024)) } : undefined);
        }}
      />
      {value && (
        <p className={portal.small}>
          <Icon name="paperclip" size={14} /> {value.name} · {value.sizeKb} KB <Badge tone="simulated">{t("partner.upload.notStored")}</Badge>
        </p>
      )}
    </div>
  );
}

/** Editable list of short text items (activities, outputs, milestones…). */
export function ListEditor({
  id,
  label,
  values,
  onChange,
  addLabel,
  error,
  placeholder,
}: {
  id: string;
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  addLabel: string;
  error?: string;
  placeholder?: string;
}) {
  const { t } = useI18n();
  return (
    <fieldset className={styles.fieldset} aria-describedby={error ? `${id}-error` : undefined}>
      <legend className={styles.legend}>
        {label} <span className={portal.muted}>{t("common.requiredMarker")}</span>
      </legend>
      {error && (
        <p id={`${id}-error`} className={portal.fieldError}>
          <Icon name="alertCircle" size={16} /> {error}
        </p>
      )}
      {values.map((value, index) => (
        <div key={index} className={styles.listRow}>
          <TextField
            id={`${id}-${index}`}
            label={`${label} ${index + 1}`}
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(values.map((v, i) => (i === index ? e.target.value : v)))}
          />
          <Button variant="ghost" size="sm" icon="trash" aria-label={`${t("partner.common.remove")}: ${label} ${index + 1}`} onClick={() => onChange(values.filter((_, i) => i !== index))}>
            {t("partner.common.remove")}
          </Button>
        </div>
      ))}
      <div>
        <Button variant="secondary" size="sm" icon="plus" onClick={() => onChange([...values, ""])}>
          {addLabel}
        </Button>
      </div>
    </fieldset>
  );
}

/** Summary of problems at the top of a form; each item links to its field. */
export function ErrorSummary({ items, focusRef }: { items: { id: string; message: string }[]; focusRef?: React.RefObject<HTMLDivElement | null> }) {
  const { t } = useI18n();
  if (items.length === 0) return null;
  return (
    <div ref={focusRef} tabIndex={-1} role="alert">
      <Notice tone="error" title={t("common.errorSummary")}>
        <ul className={portal.plainList}>
          {items.map((item) => (
            <li key={item.id + item.message}>
              <a href={`#${item.id}`}>{item.message}</a>
            </li>
          ))}
        </ul>
      </Notice>
    </div>
  );
}

/** Labelled read-only value, used where a field is under review, verified or locked. */
export function ReadOnlyField({ label, value, state }: { label: string; value: ReactNode; state?: "under_review" | "verified" | "locked" | "editable" }) {
  const id = useId();
  return (
    <div className={styles.fieldset} role="group" aria-labelledby={id}>
      <div className={styles.fieldHead}>
        <span id={id} className={styles.legend}>
          {label}
        </span>
        {state && <StatusBadge entity="profileField" status={state} />}
      </div>
      <div className={styles.readValue}>{value || "—"}</div>
    </div>
  );
}

/** Planned against actual, as a bar with the plan marked. */
export function PlanBar({ label, actual, planned, valueLabel }: { label: string; actual: number; planned: number; valueLabel: string }) {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  return (
    <div className={portal.figure}>
      <span className={portal.figureLabel}>{label}</span>
      <span className={portal.figureValue}>{valueLabel}</span>
      <span className={styles.bar} role="img" aria-label={`${label}: ${valueLabel}`}>
        <span className={styles.barFill} style={{ width: `${clamp(actual)}%` }} />
        <span className={styles.barPlan} style={{ insetInlineStart: `${clamp(planned)}%` }} />
      </span>
    </div>
  );
}
