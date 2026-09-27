"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import { setSimulatedOffline, useConnectivity } from "@/lib/field/connectivity";
import { moveSurveyToCurrentVersion, removeSyncedCopies, resolveAssistanceConflict, retryLocalRecord, setDeviceSetting, syncNow, type SyncRunSummary } from "@/lib/field/client";
import type { LocalRecord } from "@/lib/field/device";
import { storageStatus } from "@/lib/field/files";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { useDevice, useFieldAction, useFieldData, useSyncRunning } from "../FieldData";
import { PageHead, recordChip, StatusChip } from "../FieldBits";
import { useLookups } from "../lookup";
import { recordHref } from "./WorkViews";
import styles from "../field.module.css";

const KIND_ICON = { report: "clipboard", survey: "target", assistance: "handshake", verification: "shield", issue: "flag" } as const;

export function SyncProgress({ record }: { record: LocalRecord }) {
  const { t } = useI18n();
  const files = "attachments" in record.data ? record.data.attachments : "evidence" in record.data ? record.data.evidence : [];
  const kb = files.filter((a) => !a.uploaded).reduce((s, a) => s + a.storedKb, 0);
  return (
    <p className={styles.small} role="status">
      <Icon name="refresh" size={14} />{" "}
      {record.progress === "uploadingFiles" ? t("field.sync.progress.uploadingFiles", { size: kb }) : t(`field.sync.progress.${record.progress ?? "preparing"}` as MessageKey)}
    </p>
  );
}

/** Why an upload failed, and what the officer can do about it. The record itself is never lost. */
export function SyncErrorNotice({ record }: { record: LocalRecord }) {
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const lk = useLookups();
  const { online } = useConnectivity();
  const running = useSyncRunning();
  const { run, error } = useFieldAction();
  const e = record.error;
  if (!e) return null;
  const form = record.kind === "survey" ? lk.form(record.data.formId) : undefined;
  const fields = e.fields.map((f) => {
    if (record.kind === "survey") return record.data.questions.find((q) => q.id === f)?.label ?? f;
    return t(`field.fieldNames.${f}` as MessageKey);
  });
  return (
    <Notice tone={e.retryable ? "warning" : "error"} title={t(`field.syncErrors.${e.code}.title` as MessageKey)}>
      <p>{t(`field.syncErrors.${e.code}.body` as MessageKey, { ...e.params, ...(e.params?.retiredAt ? { retiredAt: formatDate(String(e.params.retiredAt), true) } : {}) })}</p>
      {fields.length > 0 && <p>{t("field.sync.fieldsToFix", { fields: fields.join(", ") })}</p>}
      <p className={styles.small}>{t("field.sync.keptOnDevice", { at: formatDate(e.at, true) })}</p>
      <div className={styles.actions}>
        {e.retryable && (
          <Button size="sm" icon="refresh" disabled={!online || running} onClick={() => void run("retry", () => retryLocalRecord(record.localId))}>
            {t("field.sync.retry")}
          </Button>
        )}
        {e.code === "FORM_VERSION_RETIRED" && record.kind === "survey" && form?.published && (
          <Button
            size="sm"
            icon="arrowRight"
            onClick={() =>
              void run("migrate", () => {
                moveSurveyToCurrentVersion(record.localId, form);
                router.push(`/field/survey?id=${record.localId}`);
              })
            }
          >
            {t("field.sync.moveToVersion", { version: form.published.version })}
          </Button>
        )}
        {e.code === "FORM_VERSION_RETIRED" && !online && <span className={styles.small}>{t("field.sync.moveNeedsLatest")}</span>}
        {!e.retryable && ["MISSING_FIELDS", "MISSING_ANSWERS", "INVALID_REFERENCE"].includes(e.code) && (
          <ButtonLink size="sm" variant="secondary" icon="pen" href={recordHref(record)}>
            {t("field.sync.openToFix")}
          </ButtonLink>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </Notice>
  );
}

/**
 * Side-by-side comparison of the officer's copy and the newer central version,
 * with a clear choice. `onResolved` lets the page keep the confirmation, since
 * this panel disappears once the conflict is resolved.
 */
export function ConflictResolver({ record, onResolved }: { record: LocalRecord; onResolved?: (message: string) => void }) {
  const { t, formatDate } = useI18n();
  const { online } = useConnectivity();
  const running = useSyncRunning();
  const { run, pending, error, success } = useFieldAction();
  const [choice, setChoice] = useState<"keep_mine" | "use_central">("keep_mine");
  const [note, setNote] = useState("");
  const [showError, setShowError] = useState(false);
  const c = record.conflict;
  if (!c) return null;
  return (
    <div className={styles.stack} style={{ gap: 12 }}>
      <p>{t("field.conflict.intro", { ref: c.taskRef, base: c.baseVersion, central: c.centralVersion, by: c.changedBy, at: formatDate(c.changedAt, true) })}</p>
      {c.note && <p className={styles.small}>“{c.note}”</p>}
      <div className={styles.scroll}>
        <table className={styles.compare}>
          <caption className="visually-hidden">{t("field.conflict.tableCaption")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("field.conflict.field")}</th>
              <th scope="col">{t("field.conflict.base", { version: c.baseVersion })}</th>
              <th scope="col">{t("field.conflict.central", { version: c.centralVersion })}</th>
              <th scope="col">{t("field.conflict.yours")}</th>
            </tr>
          </thead>
          <tbody>
            {c.changes.map((row) => (
              <tr key={row.field}>
                <th scope="row">{t(`field.changeField.${row.field}` as MessageKey)}</th>
                <td>{row.base}</td>
                <td className={styles.changed}>{row.central}</td>
                <td className={row.local !== row.central ? styles.changed : undefined}>{row.local}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`${styles.small} ${styles.muted}`}>{t("field.conflict.nothingLost")}</p>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{t("field.conflict.chooseLegend")}</legend>
        <div className={styles.choiceList}>
          <label className={styles.choice}>
            <input type="radio" name={`conflict-${record.localId}`} checked={choice === "keep_mine"} onChange={() => setChoice("keep_mine")} />
            <span>
              {t("field.conflict.keepMine")}
              <br />
              <span className={`${styles.small} ${styles.muted}`}>{t("field.conflict.keepMineHint")}</span>
            </span>
          </label>
          <label className={styles.choice}>
            <input type="radio" name={`conflict-${record.localId}`} checked={choice === "use_central"} onChange={() => setChoice("use_central")} />
            <span>
              {t("field.conflict.useCentral")}
              <br />
              <span className={`${styles.small} ${styles.muted}`}>{t("field.conflict.useCentralHint")}</span>
            </span>
          </label>
        </div>
      </fieldset>
      <TextAreaField
        id={`conflict-note-${record.localId}`}
        label={t("field.conflict.note")}
        requiredLabel={t("common.requiredMarker")}
        hint={t("field.conflict.noteHint")}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        error={showError && !note.trim() ? t("field.conflict.noteRequired") : undefined}
      />
      <div className={styles.actions}>
        <Button
          icon="gitCompare"
          disabled={Boolean(pending) || running}
          onClick={() => {
            setShowError(true);
            if (!note.trim()) return;
            const message = choice === "keep_mine" ? (online ? t("field.conflict.resolvedSent") : t("field.conflict.resolvedQueued")) : t("field.conflict.resolvedDraft");
            void run("resolve", () => resolveAssistanceConflict(record.localId, choice, note), message).then(() => onResolved?.(message));
          }}
        >
          {t("field.conflict.resolve")}
        </Button>
        {choice === "use_central" && (
          <ButtonLink variant="secondary" href={recordHref(record)}>
            {t("field.conflict.openRecord")}
          </ButtonLink>
        )}
      </div>
      <div aria-live="polite">{success && <Notice tone="success">{success}</Notice>}</div>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
    </div>
  );
}

function RecordRow({ record, children }: { record: LocalRecord; children?: React.ReactNode }) {
  const { t, formatDate } = useI18n();
  const { online } = useConnectivity();
  const lk = useLookups();
  const sub = lk.submissionFor(record);
  return (
    <li className={styles.item}>
      <span className={styles.itemTop}>
        <Link href={recordHref(record)} className={styles.itemTitle}>
          <Icon name={KIND_ICON[record.kind]} size={18} /> {record.title || t(`field.kinds.${record.kind}` as MessageKey)}
        </Link>
        <StatusChip chip={recordChip(record, online, sub)} />
      </span>
      <span className={styles.itemMeta}>
        <span>{t(`field.kinds.${record.kind}` as MessageKey)}</span>
        {record.central && <span className={styles.ref}>{record.central.ref}</span>}
        <span>{t("field.sync.updated", { at: formatDate(record.updatedAt, true) })}</span>
        {record.createdOffline && (
          <span>
            <Icon name="wifiOff" size={14} /> {t("field.sync.createdOffline")}
          </span>
        )}
        {record.attempts > 0 && <span>{t("field.sync.attempts", { count: record.attempts })}</span>}
      </span>
      {children}
    </li>
  );
}

function Toggle({ id, checked, onChange, label, hint }: { id: string; checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  return (
    <label className={styles.checkRow} htmlFor={id}>
      <input id={id} type="checkbox" role="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && (
          <>
            <br />
            <span className={`${styles.small} ${styles.muted}`}>{hint}</span>
          </>
        )}
      </span>
    </label>
  );
}

export function SyncView() {
  const { t, formatDate, formatNumber } = useI18n();
  const device = useDevice();
  const { snapshot, takenAt } = useFieldData();
  const { online, simulatedOffline, browserOnline } = useConnectivity();
  const running = useSyncRunning();
  const { run, pending, error, success } = useFieldAction();
  const [storage, setStorage] = useState<{ usedKb?: number; quotaKb?: number; persisted: boolean | null } | null>(null);
  const [resolved, setResolved] = useState<string | null>(null);

  useEffect(() => {
    void storageStatus().then(setStorage);
  }, [device]);

  const drafts = device.records.filter((r) => r.state === "draft");
  const queued = device.records.filter((r) => r.state === "pending");
  const syncing = device.records.filter((r) => r.state === "syncing");
  const failed = device.records.filter((r) => r.state === "failed");
  const conflicts = device.records.filter((r) => r.state === "conflict");
  const synced = device.records.filter((r) => r.state === "synced");
  const toSend = queued.length + failed.filter((r) => r.error?.retryable).length;
  const summary = (s: SyncRunSummary) => t("field.sync.summary", { accepted: s.accepted, rejected: s.rejected, conflicts: s.conflicts, interrupted: s.interrupted });

  const section = (id: string, title: string, list: LocalRecord[], empty: string, extra?: (r: LocalRecord) => React.ReactNode, intro?: string) => (
    <section id={id} className={styles.stack} aria-labelledby={`${id}-title`} style={{ gap: 10 }}>
      <h2 id={`${id}-title`} className={styles.cardTitle}>
        {title} <span className={styles.muted}>({list.length})</span>
      </h2>
      {intro && <p className={`${styles.small} ${styles.muted}`}>{intro}</p>}
      {list.length === 0 ? (
        <p className={`${styles.small} ${styles.muted}`}>{empty}</p>
      ) : (
        <ul className={styles.list}>
          {list.map((r) => (
            <RecordRow key={r.localId} record={r}>
              {extra?.(r)}
            </RecordRow>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className={styles.stack}>
      <PageHead title={t("field.sync.title")} intro={t("field.sync.intro")} />

      <section className={styles.card} aria-labelledby="sync-status">
        <h2 id="sync-status" className={styles.cardTitle}>
          {t("field.sync.connection")}
        </h2>
        <p className={styles.badges}>
          <Badge tone={online ? "success" : "warning"} icon={online ? "cloud" : "wifiOff"}>
            {online ? t("field.connectivity.online") : simulatedOffline ? t("field.connectivity.offlineSimulated") : t("field.connectivity.offline")}
          </Badge>
          {!browserOnline && <span className={styles.small}>{t("field.sync.browserOffline")}</span>}
        </p>
        <p>
          {device.lastSyncAt ? t("field.sync.last", { at: formatDate(device.lastSyncAt, true) }) : t("field.sync.neverLong")}
          {device.lastRun && (
            <>
              <br />
              <span className={`${styles.small} ${styles.muted}`}>{t("field.sync.lastRun", { at: formatDate(device.lastRun.at, true) })} {summary({ ...device.lastRun, total: 0 })}</span>
            </>
          )}
        </p>
        {takenAt && <p className={`${styles.small} ${styles.muted}`}>{t("field.sync.cacheTaken", { at: formatDate(takenAt, true) })}</p>}
        <div className={styles.actions}>
          <Button
            size="lg"
            icon="refresh"
            disabled={!online || running || toSend === 0}
            aria-busy={running || undefined}
            onClick={() => void run("sync", () => syncNow(), (s) => summary(s as SyncRunSummary))}
          >
            {running ? t("field.sync.running") : t("field.sync.now", { count: toSend })}
          </Button>
        </div>
        {!online && <p className={styles.small}>{t("field.sync.offlineHint")}</p>}
        <div aria-live="polite">{success && <Notice tone="success">{success}</Notice>}</div>
        {error && (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        )}
        <details>
          <summary className={styles.small}>
            <strong>{t("field.sync.settings")}</strong>
          </summary>
          <div className={styles.stack} style={{ gap: 4, marginTop: 8 }}>
            <Toggle id="sim-offline" checked={simulatedOffline} onChange={setSimulatedOffline} label={t("field.sync.simulateOffline")} hint={t("field.sync.simulateOfflineHint")} />
            <Toggle id="sim-unstable" checked={device.settings.unstable} onChange={(v) => setDeviceSetting("unstable", v)} label={t("field.sync.simulateUnstable")} hint={t("field.sync.simulateUnstableHint")} />
            <Toggle id="auto-sync" checked={device.settings.autoSync} onChange={(v) => setDeviceSetting("autoSync", v)} label={t("field.sync.autoSync")} hint={t("field.sync.autoSyncHint")} />
          </div>
        </details>
      </section>

      {section("device", t("field.sync.deviceOnly"), drafts, t("field.sync.deviceOnlyEmpty"), undefined, t("field.sync.deviceOnlyIntro"))}
      {section("queue", online ? t("field.sync.queueOnline") : t("field.sync.queueOffline"), queued, t("field.sync.queueEmpty"), undefined, t("field.sync.queueIntro"))}
      {syncing.length > 0 && section("syncing", t("field.sync.syncingNow"), syncing, "", (r) => <SyncProgress record={r} />)}
      <section id="problems" className={styles.stack} aria-labelledby="problems-title" style={{ gap: 10 }}>
        <h2 id="problems-title" className={styles.cardTitle}>
          {t("field.sync.problems")} <span className={styles.muted}>({failed.length + conflicts.length})</span>
        </h2>
        <div aria-live="polite">{resolved && <Notice tone="success">{resolved}</Notice>}</div>
        {failed.length + conflicts.length === 0 && <p className={`${styles.small} ${styles.muted}`}>{t("field.sync.problemsEmpty")}</p>}
        <ul className={styles.list}>
          {failed.map((r) => (
            <RecordRow key={r.localId} record={r}>
              <SyncErrorNotice record={r} />
            </RecordRow>
          ))}
          {conflicts.map((r) => (
            <RecordRow key={r.localId} record={r}>
              <ConflictResolver record={r} onResolved={setResolved} />
            </RecordRow>
          ))}
        </ul>
      </section>
      {section("synced", t("field.sync.synced"), synced, t("field.sync.syncedEmpty"), undefined, t("field.sync.syncedIntro"))}
      {synced.length > 0 && (
        <div className={styles.actions}>
          <Button variant="secondary" icon="trash" disabled={Boolean(pending)} onClick={() => void run("clean", () => removeSyncedCopies(), (n) => t("field.sync.removed", { count: Number(n) }))}>
            {t("field.sync.removeSynced")}
          </Button>
        </div>
      )}

      <section className={styles.card} aria-labelledby="stored-title">
        <h2 id="stored-title" className={styles.cardTitle}>
          {t("field.sync.storedTitle")}
        </h2>
        <ul>
          <li>{t("field.sync.stored.records", { count: device.records.length })}</li>
          <li>{t("field.sync.stored.cache", { interventions: snapshot?.interventions.length ?? 0, tasks: snapshot?.tasks.length ?? 0, points: snapshot?.servicePoints.length ?? 0 })}</li>
          <li>{t("field.sync.stored.households", { count: snapshot?.tasks.filter((x) => x.allocation).length ?? 0 })}</li>
          <li>{t("field.sync.stored.photos")}</li>
          <li>{t("field.sync.stored.purged")}</li>
          <li>{t("field.sync.stored.notStored")}</li>
        </ul>
        {storage && (
          <p className={`${styles.small} ${styles.muted}`}>
            {storage.usedKb !== undefined && storage.quotaKb !== undefined && t("field.sync.storageUse", { used: formatNumber(Math.round(storage.usedKb)), quota: formatNumber(Math.round(storage.quotaKb / 1024)) })}{" "}
            {storage.persisted === true ? t("field.sync.persisted") : storage.persisted === false ? t("field.sync.notPersisted") : ""}
          </p>
        )}
        <p className={`${styles.small} ${styles.muted}`}>{t("field.sync.prototypeNote")}</p>
      </section>
    </div>
  );
}
