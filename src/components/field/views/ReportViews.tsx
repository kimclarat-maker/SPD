"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { FieldComment, FieldReportField } from "@/lib/types";
import type { FieldSubmission } from "@/lib/services/fieldWork";
import { useConnectivity } from "@/lib/field/connectivity";
import {
  discardLocalRecord,
  queueLocalRecord,
  reportIssues,
  retryLocalRecord,
  saveLocalRecord,
  setCorrectionNote,
  startCorrection,
  startReport,
  syncNow,
  withdrawLocalRecord,
} from "@/lib/field/client";
import type { LocalRecordOf, ReportData } from "@/lib/field/device";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { useDevice, useFieldAction, useFieldData, useSyncRunning } from "../FieldData";
import {
  AttachmentPicker,
  FieldReviewComments,
  GpsCapture,
  KV,
  LocalHistory,
  PageHead,
  recordChip,
  SourceNote,
  StatusChip,
  submissionChip,
  WhereTrack,
} from "../FieldBits";
import { useLookups, useParam } from "../lookup";
import { SyncErrorNotice, SyncProgress } from "./SyncView";
import styles from "../field.module.css";

type ReportRecord = LocalRecordOf<"report">;
type ReportSubmission = Extract<FieldSubmission, { kind: "report" }>;

/* ================================================================== List */

export function ReportsView() {
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const show = useParam("show");
  const { snapshot } = useFieldData();
  const device = useDevice();
  const { online } = useConnectivity();
  const lk = useLookups();
  const [filter, setFilter] = useState<"all" | "device" | "attention" | "review" | "accepted">(show === "review" ? "review" : "all");
  const [newFor, setNewFor] = useState("");

  const local = device.records.filter((r): r is ReportRecord => r.kind === "report");
  const localCentral = new Set(local.map((r) => r.central?.id).filter(Boolean));
  const centralOnly = (snapshot?.submissions ?? []).filter((s): s is ReportSubmission => s.kind === "report" && !localCentral.has(s.id) && !local.some((r) => r.localId === s.clientRecordId));

  type Row = { key: string; href: string; title: string; ref?: string; interventionId: string; at: string; chip: ReturnType<typeof submissionChip>; group: "device" | "attention" | "review" | "accepted" };
  const groupOf = (state: string, central?: string): Row["group"] => {
    if (state === "failed" || state === "conflict" || central === "returned") return "attention";
    if (state !== "synced") return "device";
    return central === "accepted" ? "accepted" : "review";
  };
  const rows: Row[] = [
    ...local.map((r) => {
      const sub = lk.submissionFor(r) as ReportSubmission | undefined;
      return {
        key: r.localId,
        href: `/field/report?id=${r.localId}`,
        title: r.data.title || t("field.reports.untitled"),
        ref: r.central?.ref,
        interventionId: r.data.interventionId,
        at: r.updatedAt,
        chip: recordChip(r, online, sub),
        group: r.revision ? ("attention" as const) : groupOf(r.state, sub?.status),
      };
    }),
    ...centralOnly.map((s) => ({ key: s.id, href: `/field/report?central=${s.id}`, title: s.title, ref: s.ref, interventionId: s.interventionId, at: s.updatedAt, chip: submissionChip(s), group: groupOf("synced", s.status) })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const shown = rows.filter((r) => filter === "all" || r.group === filter);
  const interventions = snapshot?.interventions ?? [];
  const canReport = snapshot?.account.permissions.includes("visits.report");

  return (
    <div className={styles.stack}>
      <PageHead title={t("field.reports.title")} intro={t("field.reports.intro")} />
      <SourceNote />
      {canReport && interventions.length > 0 && (
        <div className={styles.card}>
          <div className={styles.row2}>
            <SelectField id="new-report-intervention" label={t("field.reports.newFor")} value={newFor || interventions[0].id} onChange={(e) => setNewFor(e.target.value)}>
              {interventions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.ref} — {i.title}
                </option>
              ))}
            </SelectField>
          </div>
          <div className={styles.actions}>
            <Button icon="mapPin" onClick={() => router.push(`/field/report?id=${startReport(newFor || interventions[0].id, "site_visit")}`)}>
              {t("field.reports.newVisit")}
            </Button>
            <Button variant="secondary" icon="activity" onClick={() => router.push(`/field/report?id=${startReport(newFor || interventions[0].id, "activity_update")}`)}>
              {t("field.reports.newActivity")}
            </Button>
          </div>
        </div>
      )}
      <div className={styles.filters} role="group" aria-label={t("field.reports.filterLabel")}>
        {(["all", "device", "attention", "review", "accepted"] as const).map((f) => (
          <button key={f} type="button" className={styles.chip} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`field.reports.filter.${f}` as MessageKey)} ({f === "all" ? rows.length : rows.filter((r) => r.group === f).length})
          </button>
        ))}
      </div>
      {shown.length === 0 ? (
        <p className={styles.muted}>{t("field.reports.none")}</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((r) => (
            <li key={r.key}>
              <Link href={r.href} className={styles.item}>
                <span className={styles.itemTitle}>{r.title}</span>
                <span className={styles.itemMeta}>
                  {r.ref && <span className={styles.ref}>{r.ref}</span>}
                  <span>{lk.intervention(r.interventionId)?.ref ?? ""}</span>
                  <span>{formatDate(r.at, true)}</span>
                </span>
                <span className={styles.badges}>
                  <StatusChip chip={r.chip} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ================================================================ Record */

export function ReportView() {
  const { t } = useI18n();
  const localId = useParam("id");
  const centralId = useParam("central");
  const device = useDevice();
  const lk = useLookups();
  const { snapshot } = useFieldData();
  const record = device.records.find(
    (r): r is ReportRecord => r.kind === "report" && (r.localId === localId || (Boolean(centralId) && (r.central?.id === centralId || lk.submission(centralId ?? "")?.clientRecordId === r.localId))),
  );
  if (record) return <LocalReport key={record.localId} record={record} />;
  if (centralId) {
    const sub = lk.submission(centralId);
    if (sub && sub.kind === "report") return <CentralReport submission={sub} />;
    if (!snapshot) return <SourceNote />;
  }
  return (
    <div className={styles.stack}>
      <PageHead title={t("field.denied.title")} back={{ href: "/field/reports", label: t("field.nav.reports") }} />
      <SourceNote />
      <Notice tone="warning">{t("field.reports.notOnDevice")}</Notice>
    </div>
  );
}

/** A report the central system holds but this device has no copy of. */
function CentralReport({ submission }: { submission: ReportSubmission }) {
  const { t } = useI18n();
  const router = useRouter();
  const { run, error } = useFieldAction();
  return (
    <div className={styles.stack}>
      <PageHead title={submission.title} back={{ href: "/field/reports", label: t("field.nav.reports") }} badges={<><span className={styles.ref}>{submission.ref}</span><StatusChip chip={submissionChip(submission)} /></>} />
      <SourceNote />
      <WhereTrack saved central reviewed={submission.status === "accepted"} />
      {submission.content && <ReportSummary content={submission.content} />}
      {submission.status === "returned" && (
        <>
          <ReturnedNotice submission={submission} />
          <Button icon="pen" onClick={() => void run("correct", () => router.replace(`/field/report?id=${startCorrection(submission)}`))}>
            {t("field.reports.correct")}
          </Button>
        </>
      )}
      <CentralHistory submission={submission} />
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
    </div>
  );
}

function ReturnedNotice({ submission }: { submission: ReportSubmission }) {
  const { t, formatDate } = useI18n();
  const latest = submission.comments[submission.comments.length - 1];
  return (
    <Notice tone="warning" title={t("field.reports.returnedTitle")}>
      <p>{t("field.reports.returnedBody")}</p>
      {latest && (
        <p>
          “{latest.text}” — {latest.author}, {formatDate(latest.at, true)}
        </p>
      )}
    </Notice>
  );
}

function CentralHistory({ submission }: { submission: ReportSubmission }) {
  const { t, formatDate } = useI18n();
  return (
    <section className={styles.card} aria-labelledby="central-history">
      <h2 id="central-history" className={styles.cardTitle}>
        {t("field.reports.centralHistory")}
      </h2>
      <p className={`${styles.small} ${styles.muted}`}>{t("field.reports.centralHistoryNote")}</p>
      <ul className={styles.timeline}>
        {[...submission.history].reverse().map((h) => (
          <li key={h.version}>
            <strong>{t("field.reports.versionLabel", { version: h.version })}</strong>
            <span>{h.note}</span>
            <span className={`${styles.small} ${styles.muted}`}>
              {h.by} · {formatDate(h.at, true)}
            </span>
          </li>
        ))}
      </ul>
      {submission.comments.length > 0 && (
        <>
          <h3 className={styles.small}>{t("field.reports.comments")}</h3>
          <ul className={styles.timeline}>
            {submission.comments.map((c) => (
              <li key={c.id}>
                <span>{c.text}</span>
                <span className={`${styles.small} ${styles.muted}`}>
                  {c.author} · {formatDate(c.at, true)}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ReportSummary({ content, commentsFor }: { content: NonNullable<ReportSubmission["content"]> | ReportData; commentsFor?: (field: FieldReportField) => ReactNode }) {
  const { t, formatDate } = useI18n();
  const lk = useLookups();
  const reached = content.reached as Record<string, string | number>;
  const indicators = Array.isArray(content.indicatorValues)
    ? content.indicatorValues.map((v) => [v.indicatorId, String(v.value)] as const)
    : Object.entries(content.indicatorValues).filter(([, v]) => v.trim() !== "");
  const gps = content.gps;
  const attachments = content.attachments as { name: string }[];
  const item = (field: FieldReportField, label: string, value: ReactNode, wide = false) => ({
    label,
    value: (
      <>
        {value || "—"}
        {commentsFor?.(field)}
      </>
    ),
    wide,
  });
  return (
    <section className={styles.card} aria-labelledby="report-summary">
      <h2 id="report-summary" className={styles.cardTitle}>
        {t("field.reports.summary")}
      </h2>
      <KV
        items={[
          item("visitAt", t("field.reports.fields.visitAt"), content.visitAt ? formatDate(new Date(content.visitAt).toISOString(), true) : ""),
          item("activityType", t("field.reports.fields.activityType"), content.activityType),
          item("location", t("field.reports.fields.location"), `${lk.servicePointName(content.servicePointId)}${content.locationNote ? ` · ${content.locationNote}` : ""}`, true),
          item("gps", t("field.reports.fields.gps"), gps ? <span className={styles.coords}>{`${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} ±${gps.accuracyM} m`}</span> : t("field.reports.gpsReason", { reason: content.gpsUnavailableReason ?? "" }), true),
          item("observations", t("field.reports.fields.observations"), content.observations, true),
          item("workCompleted", t("field.reports.fields.workCompleted"), content.workCompleted, true),
          item("reached", t("field.reports.fields.reached"), t("field.reports.reachedValue", { women: reached.women, men: reached.men, children: reached.children }), true),
          item("indicators", t("field.reports.fields.indicators"), indicators.map(([id, v]) => `${lk.indicatorLabel(id)}: ${v}`).join("; "), true),
          item("challenges", t("field.reports.fields.challenges"), content.challenges, true),
          item("followUp", t("field.reports.fields.followUp"), content.followUp, true),
          item("attachments", t("field.reports.fields.attachments"), attachments.map((a) => a.name).join(", "), true),
        ]}
      />
    </section>
  );
}

const STEPS = ["visit", "observations", "results", "followUp", "evidence", "review"] as const;
const STEP_OF: Record<FieldReportField, number> = {
  visitAt: 0,
  activityType: 0,
  location: 0,
  gps: 0,
  observations: 1,
  workCompleted: 1,
  reached: 2,
  indicators: 2,
  challenges: 3,
  followUp: 3,
  attachments: 4,
};

function LocalReport({ record }: { record: ReportRecord }) {
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const { online } = useConnectivity();
  const lk = useLookups();
  const { snapshot } = useFieldData();
  const running = useSyncRunning();
  const { run, pending, error, success } = useFieldAction();
  const sub = lk.submissionFor(record) as ReportSubmission | undefined;
  const editable = record.state === "draft" || (record.state === "failed" && !record.error?.retryable);
  const [data, setData] = useState<ReportData>(record.data);
  const [step, setStep] = useState(0);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const dirty = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const intervention = lk.intervention(data.interventionId);
  const points = (intervention?.servicePointIds ?? []).map((id) => lk.servicePoint(id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const issues = reportIssues(data, intervention?.servicePointIds ?? []);
  const fieldComments: FieldComment[] = sub?.fieldComments ?? [];
  const latestVersion = sub?.versions ?? 0;

  // Autosave to the device while editing, so nothing is lost if the app closes.
  useEffect(() => {
    if (!editable || !dirty.current) return;
    const timer = setTimeout(() => {
      try {
        saveLocalRecord<"report">(record.localId, data, data.title);
        setSavedAt(new Date().toISOString());
        dirty.current = false;
      } catch {
        // The explicit Save button reports storage problems.
      }
    }, 700);
    return () => clearTimeout(timer);
  }, [data, editable, record.localId]);

  const update = (patch: Partial<ReportData>) => {
    dirty.current = true;
    setData((d) => ({ ...d, ...patch }));
  };

  const goTo = (next: number) => {
    setStep(next);
    requestAnimationFrame(() => headingRef.current?.focus());
  };

  const commentsFor = (field: FieldReportField) => {
    const list = fieldComments.filter((c) => c.field === field);
    return list.length ? <FieldReviewComments comments={list} latestVersion={latestVersion} /> : null;
  };
  const attention = (field: FieldReportField) => fieldComments.some((c) => c.field === field && c.version >= latestVersion) && Boolean(record.revision);
  const err = (field: FieldReportField) => (showErrors && issues.includes(field) ? t(`field.reports.errors.${field}` as MessageKey) : undefined);
  const serverFields = record.state === "failed" && record.error ? record.error.fields : [];

  async function saveDraft() {
    await run("save", () => {
      saveLocalRecord<"report">(record.localId, data, data.title);
      dirty.current = false;
      setSavedAt(new Date().toISOString());
    }, t("field.reports.savedDraft"));
  }

  async function submit() {
    setShowErrors(true);
    if (issues.length > 0) {
      goTo(5);
      return;
    }
    await run(
      "submit",
      async () => {
        saveLocalRecord<"report">(record.localId, data, data.title || t("field.reports.untitled"));
        queueLocalRecord(record.localId);
        dirty.current = false;
        if (online) await syncNow({ only: [record.localId] });
      },
      online ? t("field.reports.submitted") : t("field.reports.savedOffline"),
    );
  }

  /* ------------------------------------------------------------ Read-only */
  if (!editable) {
    return (
      <div className={styles.stack}>
        <PageHead
          title={record.data.title || t("field.reports.untitled")}
          back={{ href: "/field/reports", label: t("field.nav.reports") }}
          badges={
            <>
              {record.central && <span className={styles.ref}>{record.central.ref}</span>}
              <StatusChip chip={recordChip(record, online, sub)} />
            </>
          }
        />
        <WhereTrack saved central={record.state === "synced"} reviewed={sub?.status === "accepted"} />
        <StateExplanation record={record} sub={sub} />
        {record.state === "syncing" && <SyncProgress record={record} />}
        {record.state === "failed" && record.error && <SyncErrorNotice record={record} />}
        <div className={styles.actions}>
          {record.state === "pending" && online && (
            <Button icon="refresh" disabled={running} onClick={() => void run("sync", () => syncNow({ only: [record.localId] }), t("field.sync.done"))}>
              {t("field.sync.syncThis")}
            </Button>
          )}
          {record.state === "pending" && (
            <Button variant="secondary" icon="pen" onClick={() => void run("withdraw", () => withdrawLocalRecord(record.localId))}>
              {t("field.reports.withdraw")}
            </Button>
          )}
          {record.state === "failed" && record.error?.retryable && (
            <Button icon="refresh" disabled={running || !online} onClick={() => void run("retry", () => retryLocalRecord(record.localId), t("field.sync.retried"))}>
              {t("field.sync.retry")}
            </Button>
          )}
          {record.state === "conflict" && <ButtonLink href="/field/sync#problems" icon="gitCompare">{t("field.sync.resolve")}</ButtonLink>}
          {sub?.status === "returned" && !record.revision && (
            <Button icon="pen" onClick={() => void run("correct", () => startCorrection(sub))}>
              {t("field.reports.correct")}
            </Button>
          )}
        </div>
        {sub?.status === "returned" && <ReturnedNotice submission={sub} />}
        <ReportSummary content={record.data} commentsFor={sub?.status === "returned" ? commentsFor : undefined} />
        {sub && <CentralHistory submission={sub} />}
        <EarlierVersions record={record} />
        <details className={styles.card}>
          <summary className={styles.cardTitle}>{t("field.common.deviceHistory")}</summary>
          <LocalHistory record={record} />
        </details>
        <Feedback error={error} success={success} />
      </div>
    );
  }

  /* -------------------------------------------------------------- Editing */
  const stepIssues = (i: number) => issues.filter((f) => STEP_OF[f] === i);
  const activities = intervention?.activities ?? [];

  return (
    <div className={styles.stack}>
      <PageHead
        title={record.revision ? t("field.reports.correctingTitle", { ref: record.central?.ref ?? "" }) : data.kind === "activity_update" ? t("field.reports.activityTitle") : t("field.reports.visitTitle")}
        back={{ href: "/field/reports", label: t("field.nav.reports") }}
        badges={<StatusChip chip={recordChip(record, online, sub)} />}
      />
      {record.state === "failed" && record.error && <SyncErrorNotice record={record} />}
      {record.revision && sub && <ReturnedNotice submission={sub} />}
      <p className={`${styles.small} ${styles.muted}`} aria-live="polite">
        <Icon name="smartphone" size={14} /> {savedAt ? t("field.reports.autosaved", { at: formatDate(savedAt, true) }) : online ? t("field.reports.deviceOnlyOnline") : t("field.reports.deviceOnlyOffline")}
      </p>

      <nav aria-label={t("field.reports.stepsLabel")} className={styles.filters}>
        {STEPS.map((s, i) => (
          <button key={s} type="button" className={styles.chip} aria-pressed={step === i} aria-current={step === i ? "step" : undefined} onClick={() => goTo(i)}>
            {i + 1}. {t(`field.reports.steps.${s}` as MessageKey)}
            {showErrors && stepIssues(i).length > 0 && (
              <>
                {" "}
                <Icon name="alertCircle" size={14} />
                <span className="visually-hidden">{t("field.reports.stepHasErrors")}</span>
              </>
            )}
          </button>
        ))}
      </nav>
      <div className={styles.progress} aria-hidden="true">
        <div className={styles.progressFill} style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
      </div>
      <h2 ref={headingRef} tabIndex={-1} className={styles.cardTitle}>
        {t("field.reports.stepOf", { step: step + 1, total: STEPS.length, name: t(`field.reports.steps.${STEPS[step]}` as MessageKey) })}
      </h2>

      <form className={styles.form} onSubmit={(e) => e.preventDefault()} noValidate>
        {step === 0 && (
          <>
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>{t("field.reports.kindLegend")}</legend>
              <div className={styles.choiceList}>
                {(["site_visit", "activity_update"] as const).map((k) => (
                  <label key={k} className={styles.choice}>
                    <input type="radio" name="report-kind" checked={data.kind === k} onChange={() => update({ kind: k })} />
                    {t(`field.reports.kinds.${k}` as MessageKey)}
                  </label>
                ))}
              </div>
            </fieldset>
            <TextField id="rf-title" label={t("field.reports.fields.title")} value={data.title} onChange={(e) => update({ title: e.target.value })} placeholder={t("field.reports.titlePlaceholder")} />
            <SelectField
              id="rf-intervention"
              label={t("field.common.intervention")}
              value={data.interventionId}
              disabled={Boolean(data.taskId) || Boolean(record.revision)}
              hint={data.taskId ? t("field.reports.fromTask") : undefined}
              onChange={(e) => update({ interventionId: e.target.value, servicePointId: "" })}
            >
              {(snapshot?.interventions ?? []).map((i) => (
                <option key={i.id} value={i.id}>
                  {i.ref} — {i.title}
                </option>
              ))}
            </SelectField>
            <div className={attention("visitAt") ? styles.attention : undefined}>
              {commentsFor("visitAt")}
              <TextField id="field-visitAt" type="datetime-local" label={t("field.reports.fields.visitAt")} requiredLabel={t("common.requiredMarker")} value={data.visitAt} error={err("visitAt")} onChange={(e) => update({ visitAt: e.target.value })} />
            </div>
            <div className={attention("activityType") ? styles.attention : undefined}>
              {commentsFor("activityType")}
              <TextField
                id="field-activityType"
                label={t("field.reports.fields.activityType")}
                requiredLabel={t("common.requiredMarker")}
                list="rf-activities"
                value={data.activityType}
                error={err("activityType")}
                hint={t("field.reports.activityHint")}
                onChange={(e) => update({ activityType: e.target.value })}
              />
              <datalist id="rf-activities">
                {activities.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
            <div className={attention("location") ? styles.attention : undefined}>
              {commentsFor("location")}
              <div className={styles.row2}>
                <SelectField id="field-location" label={t("field.reports.fields.location")} requiredLabel={t("common.requiredMarker")} value={data.servicePointId} error={err("location")} onChange={(e) => update({ servicePointId: e.target.value })}>
                  <option value="">{t("field.common.choose")}</option>
                  {points.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </SelectField>
                <TextField id="rf-locationNote" label={t("field.reports.fields.locationNote")} value={data.locationNote} onChange={(e) => update({ locationNote: e.target.value })} />
              </div>
            </div>
            <GpsCapture
              value={data.gps}
              reason={data.gpsUnavailableReason}
              onChange={(gps) => update({ gps })}
              onReason={(gpsUnavailableReason) => update({ gpsUnavailableReason })}
              fallback={lk.servicePoint(data.servicePointId) ? { lat: lk.servicePoint(data.servicePointId)!.lat, lng: lk.servicePoint(data.servicePointId)!.lng, name: lk.servicePoint(data.servicePointId)!.name } : undefined}
              error={err("gps")}
              comments={attention("gps") ? commentsFor("gps") : undefined}
            />
          </>
        )}

        {step === 1 && (
          <>
            <div className={attention("observations") ? styles.attention : undefined}>
              {commentsFor("observations")}
              <TextAreaField id="field-observations" rows={5} label={t("field.reports.fields.observations")} requiredLabel={t("common.requiredMarker")} hint={t("field.reports.observationsHint")} value={data.observations} error={err("observations")} onChange={(e) => update({ observations: e.target.value })} />
            </div>
            <div className={attention("workCompleted") ? styles.attention : undefined}>
              {commentsFor("workCompleted")}
              <TextAreaField id="field-workCompleted" rows={4} label={t("field.reports.fields.workCompleted")} requiredLabel={t("common.requiredMarker")} value={data.workCompleted} error={err("workCompleted")} onChange={(e) => update({ workCompleted: e.target.value })} />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <fieldset className={`${styles.fieldset} ${attention("reached") ? styles.attention : ""}`} id="field-reached">
              <legend className={styles.legend}>
                {t("field.reports.fields.reached")} <span className={styles.muted}>{t("common.requiredMarker")}</span>
              </legend>
              {commentsFor("reached")}
              <p className={`${styles.small} ${styles.muted}`}>{t("field.reports.reachedHint")}</p>
              {err("reached") && (
                <p className={styles.small} style={{ color: "var(--color-error)" }}>
                  <Icon name="alertCircle" size={16} /> {err("reached")}
                </p>
              )}
              <div className={styles.row3}>
                {(["women", "men", "children"] as const).map((k) => (
                  <TextField
                    key={k}
                    id={`rf-reached-${k}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    step={1}
                    className={styles.bigInput}
                    label={t(`field.reports.reached.${k}` as MessageKey)}
                    value={data.reached[k]}
                    onChange={(e) => update({ reached: { ...data.reached, [k]: e.target.value } })}
                  />
                ))}
              </div>
              <p className={styles.small}>
                {t("field.reports.reachedTotal", { total: (["women", "men", "children"] as const).reduce((s, k) => s + (Number(data.reached[k]) || 0), 0) })}
              </p>
            </fieldset>
            <fieldset className={`${styles.fieldset} ${attention("indicators") ? styles.attention : ""}`} id="field-indicators">
              <legend className={styles.legend}>
                {t("field.reports.fields.indicators")} <span className={styles.muted}>{t("common.optional")}</span>
              </legend>
              {commentsFor("indicators")}
              {err("indicators") && <p className={styles.small}>{err("indicators")}</p>}
              {(intervention?.indicatorTargets ?? []).map((it) => (
                <TextField
                  key={it.indicatorId}
                  id={`rf-ind-${it.indicatorId}`}
                  type="number"
                  inputMode="numeric"
                  min={0}
                  label={lk.indicatorLabel(it.indicatorId)}
                  hint={t("field.reports.indicatorHint", { unit: lk.indicator(it.indicatorId)?.unit ?? "", target: it.target })}
                  value={data.indicatorValues[it.indicatorId] ?? ""}
                  onChange={(e) => update({ indicatorValues: { ...data.indicatorValues, [it.indicatorId]: e.target.value } })}
                />
              ))}
            </fieldset>
          </>
        )}

        {step === 3 && (
          <>
            <div className={attention("challenges") ? styles.attention : undefined}>
              {commentsFor("challenges")}
              <TextAreaField id="field-challenges" rows={4} label={t("field.reports.fields.challenges")} value={data.challenges} onChange={(e) => update({ challenges: e.target.value })} />
            </div>
            <div className={attention("followUp") ? styles.attention : undefined}>
              {commentsFor("followUp")}
              <TextAreaField id="field-followUp" rows={4} label={t("field.reports.fields.followUp")} hint={t("field.reports.followUpHint")} value={data.followUp} onChange={(e) => update({ followUp: e.target.value })} />
            </div>
          </>
        )}

        {step === 4 && (
          <AttachmentPicker
            label={t("field.reports.fields.attachments")}
            items={data.attachments}
            onChange={(attachments) => update({ attachments })}
            prefix={`dev-${record.localId}`}
            hint={t("field.reports.attachmentsHint")}
            comments={attention("attachments") ? commentsFor("attachments") : undefined}
          />
        )}

        {step === 5 && (
          <>
            {issues.length > 0 ? (
              <Notice tone={showErrors ? "error" : "info"} title={t("field.reports.incompleteTitle")}>
                <p>{t("field.reports.incompleteBody")}</p>
                <ul>
                  {issues.map((f) => (
                    <li key={f}>
                      <button type="button" className={styles.chip} onClick={() => goTo(STEP_OF[f])}>
                        {t(`field.reports.errors.${f}` as MessageKey)}
                      </button>
                    </li>
                  ))}
                </ul>
              </Notice>
            ) : (
              <Notice tone="success">{t("field.reports.complete")}</Notice>
            )}
            {serverFields.length > 0 && <Notice tone="warning">{t("field.reports.serverFields", { fields: serverFields.map((f) => t(`field.reports.fields.${f}` as MessageKey)).join(", ") })}</Notice>}
            {data.kind === "site_visit" && data.attachments.length === 0 && <Notice tone="info">{t("field.reports.noPhotoWarning")}</Notice>}
            <ReportSummary content={data} />
            {record.revision && (
              <TextAreaField
                id="rf-correction"
                label={t("field.reports.correctionNote")}
                requiredLabel={t("common.requiredMarker")}
                hint={t("field.reports.correctionHint")}
                value={record.revision.note}
                onChange={(e) => setCorrectionNote(record.localId, e.target.value)}
                error={showErrors && !record.revision.note.trim() ? t("field.reports.correctionRequired") : undefined}
              />
            )}
            <p className={`${styles.small} ${styles.muted}`}>{online ? t("field.reports.submitOnlineNote") : t("field.reports.submitOfflineNote")}</p>
          </>
        )}

        <div className={styles.stickyActions}>
          {step > 0 && (
            <Button variant="secondary" icon="arrowLeft" onClick={() => goTo(step - 1)}>
              {t("field.common.back")}
            </Button>
          )}
          <Button variant="secondary" icon="smartphone" onClick={() => void saveDraft()} disabled={Boolean(pending)}>
            {t("field.reports.saveDraft")}
          </Button>
          {step < STEPS.length - 1 ? (
            <Button iconEnd="arrowRight" onClick={() => goTo(step + 1)}>
              {t("field.common.next")}
            </Button>
          ) : (
            <Button icon={online ? "send" : "wifiOff"} onClick={() => void submit()} disabled={Boolean(pending) || running} aria-busy={pending === "submit" || undefined}>
              {pending === "submit" ? t("field.sync.running") : record.revision ? (online ? t("field.reports.resubmit") : t("field.reports.resubmitOffline")) : online ? t("field.reports.submit") : t("field.reports.saveOffline")}
            </Button>
          )}
        </div>
      </form>

      <Feedback error={error} success={success} />

      {!record.central && !record.revision && (
        <div className={styles.card}>
          {!confirmDiscard ? (
            <Button variant="ghost" icon="trash" onClick={() => setConfirmDiscard(true)}>
              {t("field.reports.discard")}
            </Button>
          ) : (
            <div className={styles.stack} style={{ gap: 8 }}>
              <p>{t("field.reports.discardConfirm")}</p>
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
                  {t("common.cancel")}
                </Button>
                <Button variant="danger" icon="trash" onClick={() => void run("discard", async () => (await discardLocalRecord(record.localId), router.push("/field/reports")))}>
                  {t("field.reports.discardYes")}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
      <EarlierVersions record={record} />
    </div>
  );
}

function StateExplanation({ record, sub }: { record: ReportRecord; sub?: ReportSubmission }) {
  const { t, formatDate } = useI18n();
  const { online } = useConnectivity();
  let text: string;
  if (record.state === "pending") text = online ? t("field.explain.readyToSync") : t("field.explain.savedOffline");
  else if (record.state === "syncing") text = t("field.explain.syncing");
  else if (record.state === "failed") text = record.error?.retryable ? t("field.explain.interrupted") : t("field.explain.rejected");
  else if (record.state === "conflict") text = t("field.explain.conflict");
  else if (sub?.status === "accepted") text = t("field.explain.accepted", { ref: sub.ref });
  else if (sub?.status === "returned") text = t("field.explain.returned", { ref: sub.ref });
  else text = t("field.explain.synced", { ref: record.central?.ref ?? "", at: record.central ? formatDate(record.central.syncedAt, true) : "" });
  return <p>{text}</p>;
}

export function EarlierVersions({ record }: { record: { previous: { at: string; reason: string; label: string; data: unknown }[] } }) {
  const { t, formatDate } = useI18n();
  if (record.previous.length === 0) return null;
  return (
    <details className={styles.card}>
      <summary className={styles.cardTitle}>{t("field.common.earlierVersions", { count: record.previous.length })}</summary>
      <p className={`${styles.small} ${styles.muted}`}>{t("field.common.earlierVersionsNote")}</p>
      <ul className={styles.timeline}>
        {[...record.previous].reverse().map((p, i) => (
          <li key={i}>
            <strong>
              {t(`field.common.previousReason.${p.reason}` as MessageKey)} · {p.label}
            </strong>
            <span className={`${styles.small} ${styles.muted}`}>{formatDate(p.at, true)}</span>
            <PreviousData data={p.data} />
          </li>
        ))}
      </ul>
    </details>
  );
}

function PreviousData({ data }: { data: unknown }) {
  const { t } = useI18n();
  const d = data as Partial<ReportData> & { answers?: Record<string, string>; quantity?: string; unit?: string; formVersion?: number };
  const parts: string[] = [];
  if (d.reached) parts.push(t("field.reports.reachedValue", { women: d.reached.women, men: d.reached.men, children: d.reached.children }));
  if (d.observations) parts.push(d.observations);
  if (d.quantity) parts.push(`${d.quantity} ${d.unit ?? ""}`);
  if (d.answers) parts.push(Object.values(d.answers).filter(Boolean).join(" · "));
  return <span className={styles.small}>{parts.join(" — ") || "—"}</span>;
}

export function Feedback({ error, success }: { error: string | null; success: string | null }) {
  return (
    <>
      <div aria-live="polite">{success && <Notice tone="success">{success}</Notice>}</div>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
    </>
  );
}

export { Badge };
