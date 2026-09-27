"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { FieldComment } from "@/lib/types";
import type { FieldSubmission } from "@/lib/services/fieldWork";
import type { GpsFix, LocalRecord } from "@/lib/field/device";
import { AttachmentError, captureAttachment, deleteFiles, getFile, type LocalAttachment } from "@/lib/field/files";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { SelectField, TextAreaField } from "@/components/ui/Field";
import { useFieldData } from "./FieldData";
import styles from "./field.module.css";

/* ================================================================ Status */

export interface Chip {
  label: MessageKey;
  tone: Tone;
  icon?: IconName;
}

/** Status of a record the central system holds, in the field officer's words. */
export function submissionChip(sub: FieldSubmission): Chip {
  switch (sub.kind) {
    case "report":
    case "survey":
      if (sub.status === "accepted") return { label: "field.status.accepted", tone: "success", icon: "checkCircle" };
      if (sub.status === "returned") return { label: "field.status.returned", tone: "warning", icon: "arrowLeft" };
      return sub.kind === "survey" ? { label: "field.status.synced", tone: "info", icon: "cloud" } : { label: "field.status.underReview", tone: "info", icon: "eye" };
    case "assistance":
      if (sub.reviewed) return { label: "field.status.reviewed", tone: "success", icon: "checkCircle" };
      if (sub.status === "flagged") return { label: "field.status.syncedFlagged", tone: "warning", icon: "flag" };
      return { label: "field.status.synced", tone: "info", icon: "cloud" };
    case "verification":
      return verificationChip(sub.status);
    case "issue":
      return { label: `field.issueStatus.${sub.status}` as MessageKey, tone: sub.status === "resolved" || sub.status === "closed" ? "success" : "info", icon: sub.status === "received" ? "inbox" : sub.status === "resolved" || sub.status === "closed" ? "checkCircle" : "refresh" };
  }
}

export function verificationChip(status: string): Chip {
  switch (status) {
    case "verified":
      return { label: "field.status.verified", tone: "success", icon: "checkCircle" };
    case "inconclusive":
      return { label: "field.status.inconclusive", tone: "info", icon: "help" };
    case "unavailable":
      return { label: "field.status.unavailable", tone: "warning", icon: "alertTriangle" };
    case "needs_review":
      return { label: "field.status.needsReview", tone: "warning", icon: "flag" };
    default:
      return { label: "field.status.pendingSync", tone: "warning", icon: "clock" };
  }
}

/** Status of a device record, combined with its central status once it has synced. */
export function recordChip(r: LocalRecord, online: boolean, sub?: FieldSubmission): Chip {
  switch (r.state) {
    case "draft":
      if (r.revision) return { label: "field.status.correcting", tone: "warning", icon: "pen" };
      return { label: r.kind === "survey" ? "field.status.localDraft" : "field.status.draft", tone: "neutral", icon: "pen" };
    case "pending":
      if (r.kind === "assistance") return { label: "field.status.recordedLocally", tone: "warning", icon: "smartphone" };
      if (r.kind === "verification") return { label: "field.status.pendingSync", tone: "warning", icon: "clock" };
      if (r.kind === "survey") return online ? { label: "field.status.queued", tone: "info", icon: "cloud" } : { label: "field.status.savedOffline", tone: "neutral", icon: "wifiOff" };
      return online ? { label: "field.status.readyToSync", tone: "info", icon: "cloud" } : { label: "field.status.savedOffline", tone: "neutral", icon: "wifiOff" };
    case "syncing":
      return { label: "field.status.syncing", tone: "info", icon: "refresh" };
    case "failed":
      if (r.error?.retryable) return { label: "field.status.interrupted", tone: "warning", icon: "alertTriangle" };
      return { label: r.kind === "survey" ? "field.status.rejected" : "field.status.syncError", tone: "error", icon: "xCircle" };
    case "conflict":
      return { label: "field.status.conflict", tone: "error", icon: "gitCompare" };
    case "synced":
      if (sub) return submissionChip(sub);
      if (r.kind === "verification" && r.data.result) return verificationChip(r.data.result.status);
      return { label: "field.status.synced", tone: "info", icon: "cloud" };
  }
}

export function StatusChip({ chip }: { chip: Chip }) {
  const { t } = useI18n();
  return (
    <Badge tone={chip.tone} icon={chip.icon}>
      {t(chip.label)}
    </Badge>
  );
}

/** The central record a device record became, if the latest read includes it. */
export function useSubmissionFor(r: LocalRecord | undefined): FieldSubmission | undefined {
  const { snapshot } = useFieldData();
  if (!r || !snapshot) return undefined;
  return snapshot.submissions.find((s) => (r.central && s.id === r.central.id) || s.clientRecordId === r.localId);
}

/**
 * Where a record is: on this device, in the central system, reviewed. Makes
 * the difference between "saved here" and "the central record changed"
 * impossible to miss.
 */
export function WhereTrack({ saved, central, reviewed, reviewedLabel }: { saved: boolean; central: boolean; reviewed: boolean; reviewedLabel?: MessageKey }) {
  const { t } = useI18n();
  const steps: { key: string; label: string; done: boolean; current: boolean; icon: IconName }[] = [
    { key: "device", label: t("field.track.device"), done: saved, current: !central, icon: "smartphone" },
    { key: "central", label: t("field.track.central"), done: central, current: central && !reviewed, icon: "cloud" },
    { key: "reviewed", label: t(reviewedLabel ?? "field.track.reviewed"), done: reviewed, current: false, icon: "checkCircle" },
  ];
  return (
    <ol className={styles.track} aria-label={t("field.track.label")}>
      {steps.map((s) => (
        <li key={s.key} className={`${styles.trackStep} ${s.done && !(s.key === "device" && !central) ? styles.trackDone : ""} ${s.key === "device" && !central ? styles.trackCurrent : ""}`}>
          <span className={styles.trackLabel}>
            <Icon name={s.done ? "check" : s.icon} size={16} />
            {s.label}
          </span>
          <span className="visually-hidden">{s.done ? t("field.track.done") : t("field.track.notYet")}</span>
        </li>
      ))}
    </ol>
  );
}

/* ============================================================ Page parts */

export function PageHead({ title, back, intro, badges }: { title: ReactNode; back?: { href: string; label: string }; intro?: ReactNode; badges?: ReactNode }) {
  return (
    <header className={styles.pageHead}>
      {back && (
        <Link href={back.href} className={styles.back}>
          <Icon name="arrowLeft" size={18} />
          {back.label}
        </Link>
      )}
      <h1 className={styles.pageTitle}>{title}</h1>
      {badges && <div className={styles.badges}>{badges}</div>}
      {intro && <p className={styles.muted}>{intro}</p>}
    </header>
  );
}

/** Says where the screen's information comes from, so cached data is never mistaken for current data. */
export function SourceNote() {
  const { t, formatDate } = useI18n();
  const { source, takenAt, online } = useFieldData();
  if (source === "live") return null;
  if (source === "none")
    return (
      <Notice tone="warning" title={t("field.source.noneTitle")}>
        <p>{t("field.source.noneBody")}</p>
      </Notice>
    );
  return (
    <p className={`${styles.small} ${styles.muted}`} role="note">
      <Icon name="smartphone" size={14} /> {online ? t("field.source.loading", { at: formatDate(takenAt!, true) }) : t("field.source.cached", { at: formatDate(takenAt!, true) })}
    </p>
  );
}

/** Shown in place of an action that needs the central system while the device is offline. */
export function NeedsConnection({ children }: { children?: ReactNode }) {
  const { t } = useI18n();
  return (
    <Notice tone="warning" title={t("field.offline.needsConnectionTitle")}>
      <p>{children ?? t("field.offline.needsConnectionBody")}</p>
    </Notice>
  );
}

export function Loading() {
  const { t } = useI18n();
  return (
    <p role="status" className={styles.muted}>
      {t("common.loading")}
    </p>
  );
}

export function KV({ items }: { items: { label: ReactNode; value: ReactNode; wide?: boolean }[] }) {
  return (
    <dl className={styles.kv}>
      {items.map((item, index) => (
        <div key={index} className={item.wide ? styles.wide : undefined}>
          <dt>{item.label}</dt>
          <dd>{item.value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** DEMONSTRATION CONTROL: stands in for someone else acting in the central system. */
export function DemoAction({ label, onRun, pending, disabled, hint }: { label: string; onRun: () => void; pending?: boolean; disabled?: boolean; hint?: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className={styles.demoControl}>
      <p className={styles.small}>
        <Badge tone="simulated">{t("field.demo.controlTag")}</Badge> {hint}
      </p>
      <div className={styles.actions}>
        <Button size="sm" variant="secondary" icon="refresh" onClick={onRun} disabled={pending || disabled} aria-busy={pending || undefined}>
          {pending ? t("common.loading") : label}
        </Button>
      </div>
    </div>
  );
}

/** A record's local activity history. */
export function LocalHistory({ record }: { record: LocalRecord }) {
  const { t, formatDate } = useI18n();
  return (
    <ul className={styles.timeline}>
      {[...record.events].reverse().map((e, index) => (
        <li key={index}>
          <span>{t(`field.events.${e.type}` as MessageKey, e.params)}</span>
          <span className={`${styles.small} ${styles.muted}`}>{formatDate(e.at, true)}</span>
        </li>
      ))}
    </ul>
  );
}

/* ====================================================== Review comments */

/** Reviewer comments on one field, shown beside that field. The latest round is highlighted. */
export function FieldReviewComments({ comments, latestVersion }: { comments: FieldComment[]; latestVersion: number }) {
  const { t, formatDate } = useI18n();
  if (comments.length === 0) return null;
  return (
    <div className={styles.stack} style={{ gap: 6 }}>
      {comments.map((c) => {
        const current = c.version >= latestVersion;
        return (
          <div key={c.id} className={`${styles.reviewComment} ${current ? "" : styles.reviewCommentOld}`} role="note">
            <strong>
              <Icon name={current ? "messageSquare" : "check"} size={14} /> {current ? t("field.review.commentNow") : t("field.review.commentEarlier", { version: c.version })}
            </strong>
            <span>{c.text}</span>
            <span className={`${styles.small} ${styles.muted}`}>
              {c.by} · {formatDate(c.at, true)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== GPS */

type GpsState = "idle" | "locating" | "denied" | "unavailable" | "timeout";

/**
 * GPS capture. The browser asks for location permission only when the officer
 * presses the button, after reading why it is needed. Coordinates are shown
 * for review before submission. If GPS is unavailable, a reason is recorded.
 */
export function GpsCapture({
  value,
  reason,
  onChange,
  onReason,
  fallback,
  error,
  comments,
}: {
  value?: GpsFix;
  reason: string;
  onChange: (fix: GpsFix | undefined) => void;
  onReason: (reason: string) => void;
  fallback?: { lat: number; lng: number; name: string };
  error?: string;
  comments?: ReactNode;
}) {
  const { t, formatDate } = useI18n();
  const id = useId();
  const [state, setState] = useState<GpsState>("idle");
  const [noGps, setNoGps] = useState(Boolean(reason && !value));
  const reasons = ["noSignal", "permissionDeclined", "noDeviceGps", "indoors", "other"] as const;
  const preset = reasons.find((r) => r !== "other" && reason === t(`field.gps.reasons.${r}`));

  function capture() {
    if (!("geolocation" in navigator)) {
      setState("unavailable");
      return;
    }
    setState("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setState("idle");
        setNoGps(false);
        onReason("");
        onChange({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyM: Math.round(pos.coords.accuracy), capturedAt: new Date().toISOString(), source: "device" });
      },
      (err) => setState(err.code === err.PERMISSION_DENIED ? "denied" : err.code === err.TIMEOUT ? "timeout" : "unavailable"),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  return (
    <fieldset className={`${styles.fieldset} ${comments ? styles.attention : ""}`} id="field-gps" aria-describedby={`${id}-why`}>
      <legend className={styles.legend}>
        {t("field.gps.legend")} <span className={styles.muted}>{t("common.requiredMarker")}</span>
      </legend>
      {comments}
      <p id={`${id}-why`} className={`${styles.small} ${styles.muted}`}>
        {t("field.gps.why")}
      </p>
      {error && (
        <p className={styles.small} style={{ color: "var(--color-error)" }} role="alert">
          <Icon name="alertCircle" size={16} /> {error}
        </p>
      )}
      {value ? (
        <div className={styles.gpsBox}>
          <p className={styles.coords}>
            {value.lat.toFixed(5)}, {value.lng.toFixed(5)} · ±{value.accuracyM} m
          </p>
          <p className={`${styles.small} ${styles.muted}`}>
            {t("field.gps.capturedAt", { at: formatDate(value.capturedAt, true) })}{" "}
            {value.source === "simulated" && <Badge tone="simulated">{t("common.simulated")}</Badge>}
          </p>
          {value.accuracyM > 100 && <p className={styles.small}>{t("field.gps.lowAccuracy")}</p>}
          <div className={styles.actions}>
            <Button size="sm" variant="secondary" icon="mapPin" onClick={capture} disabled={state === "locating"}>
              {t("field.gps.recapture")}
            </Button>
            <Button size="sm" variant="ghost" icon="x" onClick={() => onChange(undefined)}>
              {t("field.gps.remove")}
            </Button>
          </div>
        </div>
      ) : (
        <div className={styles.actions}>
          <Button icon="mapPin" onClick={capture} disabled={state === "locating"} aria-busy={state === "locating" || undefined}>
            {state === "locating" ? t("field.gps.locating") : t("field.gps.capture")}
          </Button>
          {fallback && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setNoGps(false);
                onReason("");
                onChange({ lat: fallback.lat + 0.0008, lng: fallback.lng - 0.0006, accuracyM: 12, capturedAt: new Date().toISOString(), source: "simulated" });
              }}
            >
              {t("field.gps.useDemo", { place: fallback.name })}
            </Button>
          )}
        </div>
      )}
      <div aria-live="polite">
        {state === "denied" && <Notice tone="warning">{t("field.gps.denied")}</Notice>}
        {state === "timeout" && <Notice tone="warning">{t("field.gps.timeout")}</Notice>}
        {state === "unavailable" && <Notice tone="warning">{t("field.gps.unavailable")}</Notice>}
      </div>
      {!value && (
        <label className={styles.checkRow}>
          <input type="checkbox" checked={noGps} onChange={(e) => (setNoGps(e.target.checked), !e.target.checked && onReason(""))} />
          <span>{t("field.gps.noGps")}</span>
        </label>
      )}
      {!value && noGps && (
        <div className={styles.row2}>
          <SelectField
            id={`${id}-reason`}
            label={t("field.gps.reasonLabel")}
            value={preset ?? (reason ? "other" : "")}
            onChange={(e) => onReason(e.target.value === "other" ? " " : e.target.value ? t(`field.gps.reasons.${e.target.value as (typeof reasons)[number]}`) : "")}
          >
            <option value="">{t("field.common.choose")}</option>
            {reasons.map((r) => (
              <option key={r} value={r}>
                {t(`field.gps.reasons.${r}`)}
              </option>
            ))}
          </SelectField>
          {!preset && reason && <TextAreaField id={`${id}-other`} label={t("field.gps.otherLabel")} value={reason.trim()} onChange={(e) => onReason(e.target.value || " ")} />}
        </div>
      )}
    </fieldset>
  );
}

/* =========================================================== Attachments */

function Thumb({ item, onRemove, removeLabel }: { item: LocalAttachment; onRemove?: () => void; removeLabel: string }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let revoked: string | null = null;
    let active = true;
    if (item.stored && item.kind === "photo") {
      void getFile(item.id).then((blob) => {
        if (!active || !blob) return;
        revoked = URL.createObjectURL(blob);
        setUrl(revoked);
      });
    }
    return () => {
      active = false;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [item.id, item.stored, item.kind]);
  return (
    <div className={styles.thumb}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={item.name} />
      ) : (
        <span className={styles.thumbIcon} aria-hidden="true">
          <Icon name={item.kind === "photo" ? "eye" : "fileText"} size={28} />
        </span>
      )}
      <span className={styles.thumbName} title={item.name}>
        {item.name}
      </span>
      <span>
        {item.originalKb !== item.storedKb ? t("field.files.compressed", { from: item.originalKb, to: item.storedKb }) : t("field.files.size", { size: item.storedKb })}
      </span>
      <span>{item.uploaded ? t("field.files.uploaded") : item.stored ? t("field.files.onDevice") : t("field.files.notOnDevice")}</span>
      {onRemove && (
        <Button size="sm" variant="ghost" icon="trash" onClick={onRemove} aria-label={`${removeLabel}: ${item.name}`}>
          {removeLabel}
        </Button>
      )}
    </div>
  );
}

/**
 * Photos and files. The camera opens only when the officer chooses "Take
 * photo". Photos are compressed and stored on the device until they are
 * uploaded.
 */
export function AttachmentPicker({
  label,
  items,
  onChange,
  prefix,
  hint,
  locked,
  comments,
}: {
  label: string;
  items: LocalAttachment[];
  onChange: (next: LocalAttachment[]) => void;
  prefix: string;
  hint?: string;
  locked?: boolean;
  comments?: ReactNode;
}) {
  const { t } = useI18n();
  const id = useId();
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    setError(null);
    const added: LocalAttachment[] = [];
    for (const file of Array.from(files)) {
      try {
        added.push(await captureAttachment(file, prefix));
      } catch (err) {
        setError(err instanceof AttachmentError && err.code === "TOO_LARGE" ? t("field.files.tooLarge") : t("field.files.storageError"));
      }
    }
    onChange([...items, ...added]);
    setBusy(false);
    if (cameraRef.current) cameraRef.current.value = "";
    if (fileRef.current) fileRef.current.value = "";
  }

  return (
    <fieldset className={`${styles.fieldset} ${comments ? styles.attention : ""}`} id="field-attachments">
      <legend className={styles.legend}>
        {label} <span className={styles.muted}>{t("common.optional")}</span>
      </legend>
      {comments}
      <p className={`${styles.small} ${styles.muted}`}>{hint ?? t("field.files.hint")}</p>
      {items.length > 0 && (
        <div className={styles.thumbs}>
          {items.map((item) => (
            <Thumb
              key={item.id}
              item={item}
              removeLabel={t("field.files.remove")}
              onRemove={
                locked
                  ? undefined
                  : () => {
                      void deleteFiles([item.id]);
                      onChange(items.filter((x) => x.id !== item.id));
                    }
              }
            />
          ))}
        </div>
      )}
      {!locked && (
        <div className={styles.actions}>
          <input ref={cameraRef} id={`${id}-camera`} className={styles.fileInput} type="file" accept="image/*" capture="environment" onChange={(e) => void add(e.target.files)} tabIndex={-1} aria-hidden="true" />
          <input ref={fileRef} id={`${id}-file`} className={styles.fileInput} type="file" accept="image/*,application/pdf" multiple onChange={(e) => void add(e.target.files)} tabIndex={-1} aria-hidden="true" />
          <Button variant="secondary" icon="eye" onClick={() => cameraRef.current?.click()} disabled={busy}>
            {t("field.files.takePhoto")}
          </Button>
          <Button variant="secondary" icon="paperclip" onClick={() => fileRef.current?.click()} disabled={busy}>
            {t("field.files.chooseFile")}
          </Button>
        </div>
      )}
      <div aria-live="polite">{busy && <p className={styles.small}>{t("field.files.compressing")}</p>}</div>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
    </fieldset>
  );
}

/** Formats a household or beneficiary reference as the officer types it. */
export function normaliseRefInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 14);
}
