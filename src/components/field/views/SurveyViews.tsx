"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { FormQuestion } from "@/lib/types";
import type { FieldFormView, FieldSubmission } from "@/lib/services/fieldWork";
import { useConnectivity } from "@/lib/field/connectivity";
import { discardLocalRecord, queueLocalRecord, retryLocalRecord, saveLocalRecord, startSurvey, surveyIssues, syncNow, withdrawLocalRecord } from "@/lib/field/client";
import type { LocalRecordOf, SurveyData } from "@/lib/field/device";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { useDevice, useFieldAction, useFieldData, useSyncRunning } from "../FieldData";
import { KV, LocalHistory, PageHead, recordChip, SourceNote, StatusChip, submissionChip, WhereTrack } from "../FieldBits";
import { useLookups, useParam } from "../lookup";
import { EarlierVersions, Feedback } from "./ReportViews";
import { SyncErrorNotice, SyncProgress } from "./SyncView";
import styles from "../field.module.css";

type SurveyRecord = LocalRecordOf<"survey">;
type SurveySubmission = Extract<FieldSubmission, { kind: "survey" }>;

function periodState(form: FieldFormView): "open" | "upcoming" | "closed" {
  const now = Date.now();
  if (new Date(form.deploymentStart).getTime() > now) return "upcoming";
  if (new Date(form.deploymentEnd).getTime() < now) return "closed";
  return form.published ? "open" : "closed";
}

/* ================================================================== List */

export function SurveysView() {
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const focusForm = useParam("form");
  const focusIntervention = useParam("intervention");
  const { snapshot } = useFieldData();
  const device = useDevice();
  const { online } = useConnectivity();
  const lk = useLookups();
  const { run, error } = useFieldAction();
  const [interventionFilter, setInterventionFilter] = useState(focusIntervention ?? "all");
  const [openOnly, setOpenOnly] = useState(false);

  if (!snapshot) return <SourceNote />;
  const surveys = snapshot.forms.filter((f) => f.kind === "survey");
  const shown = surveys.filter(
    (f) => (interventionFilter === "all" || f.interventionIds.includes(interventionFilter)) && (!openOnly || periodState(f) === "open") && (!focusForm || f.id === focusForm),
  );
  const local = device.records.filter((r): r is SurveyRecord => r.kind === "survey");
  const localIds = new Set(local.map((r) => r.localId));
  const centralOnly = snapshot.submissions.filter((s): s is SurveySubmission => s.kind === "survey" && !(s.clientRecordId && localIds.has(s.clientRecordId)) && !local.some((r) => r.central?.id === s.id));
  const canCollect = snapshot.account.permissions.includes("surveys.collect");

  return (
    <div className={styles.stack}>
      <PageHead title={t("field.surveys.title")} intro={t("field.surveys.intro")} back={focusForm ? { href: "/field/surveys", label: t("field.surveys.all") } : undefined} />
      <SourceNote />
      {!focusForm && (
        <div className={styles.card}>
          <div className={styles.row2}>
            <SelectField id="survey-intervention" label={t("field.common.intervention")} value={interventionFilter} onChange={(e) => setInterventionFilter(e.target.value)}>
              <option value="all">{t("common.all")}</option>
              {snapshot.interventions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.ref} — {i.title}
                </option>
              ))}
            </SelectField>
          </div>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} />
            <span>{t("field.surveys.openOnly")}</span>
          </label>
        </div>
      )}
      {shown.length === 0 && <p className={styles.muted}>{t("field.surveys.none")}</p>}
      <ul className={styles.list}>
        {shown.map((f) => {
          const state = periodState(f);
          const mine = local.filter((r) => r.data.formId === f.id);
          const count = (fn: (r: SurveyRecord) => boolean) => mine.filter(fn).length;
          const centralAccepted = snapshot.submissions.filter((s) => s.kind === "survey" && s.formId === f.id && s.status === "accepted").length;
          return (
            <li key={f.id} className={styles.card}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>{f.title}</h2>
                <Badge tone={state === "open" ? "success" : "neutral"} icon={state === "open" ? "checkCircle" : "clock"}>
                  {t(`field.surveys.period.${state}`)}
                </Badge>
              </div>
              <p className={`${styles.small} ${styles.muted}`}>{f.purpose}</p>
              <KV
                items={[
                  { label: t("field.common.reference"), value: <span className={styles.ref}>{f.ref}</span> },
                  { label: t("field.surveys.versionLabel"), value: f.published ? t("field.surveys.version", { version: f.published.version }) : t("field.surveys.noPublished") },
                  { label: t("field.surveys.periodLabel"), value: `${formatDate(f.deploymentStart)} – ${formatDate(f.deploymentEnd)}` },
                  { label: t("field.common.settlement"), value: [...new Set(f.interventionIds.map((id) => lk.settlementName(lk.intervention(id)?.settlementId)))].join(", ") },
                  { label: t("field.common.intervention"), value: f.interventionIds.map((id) => lk.intervention(id)?.ref).join(", "), wide: true },
                  {
                    label: t("field.surveys.yourResponses"),
                    value: t("field.surveys.counts", {
                      draft: count((r) => r.state === "draft"),
                      queued: count((r) => r.state === "pending" || r.state === "syncing"),
                      rejected: count((r) => r.state === "failed"),
                      synced: count((r) => r.state === "synced"),
                      accepted: centralAccepted,
                    }),
                    wide: true,
                  },
                ]}
              />
              {canCollect && state === "open" && f.published && (
                <div className={styles.actions}>
                  {f.interventionIds.map((iid) => (
                    <Button
                      key={iid}
                      icon="plus"
                      onClick={() =>
                        void run("start", () => {
                          const id = startSurvey(f, iid);
                          router.push(`/field/survey?id=${id}`);
                        })
                      }
                    >
                      {f.interventionIds.length > 1 ? t("field.surveys.startFor", { ref: lk.intervention(iid)?.ref ?? "" }) : t("field.surveys.start")}
                    </Button>
                  ))}
                </div>
              )}
              {!online && state === "open" && <p className={`${styles.small} ${styles.muted}`}>{t("field.surveys.offlineOk", { version: f.published?.version ?? "" })}</p>}
            </li>
          );
        })}
      </ul>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}

      <section className={styles.stack} aria-labelledby="responses-title">
        <h2 id="responses-title" className={styles.cardTitle}>
          {t("field.surveys.responses")}
        </h2>
        {local.length + centralOnly.length === 0 && <p className={styles.muted}>{t("field.surveys.noResponses")}</p>}
        <ul className={styles.list}>
          {local
            .filter((r) => !focusForm || r.data.formId === focusForm)
            .map((r) => (
              <li key={r.localId}>
                <Link href={`/field/survey?id=${r.localId}`} className={styles.item}>
                  <span className={styles.itemTitle}>{r.data.formTitle}</span>
                  <span className={styles.itemMeta}>
                    <span>{t("field.surveys.version", { version: r.data.formVersion })}</span>
                    <span>{lk.intervention(r.data.interventionId)?.ref}</span>
                    {r.central && <span className={styles.ref}>{r.central.ref}</span>}
                    <span>{formatDate(r.updatedAt, true)}</span>
                  </span>
                  <span className={styles.badges}>
                    <StatusChip chip={recordChip(r, online, lk.submissionFor(r))} />
                  </span>
                </Link>
              </li>
            ))}
          {centralOnly
            .filter((s) => !focusForm || s.formId === focusForm)
            .map((s) => (
              <li key={s.id}>
                <Link href={`/field/survey?central=${s.id}`} className={styles.item}>
                  <span className={styles.itemTitle}>{s.title}</span>
                  <span className={styles.itemMeta}>
                    <span>{t("field.surveys.version", { version: s.formVersion })}</span>
                    <span className={styles.ref}>{s.ref}</span>
                    <span>{formatDate(s.collectedAt, true)}</span>
                  </span>
                  <span className={styles.badges}>
                    <StatusChip chip={submissionChip(s)} />
                  </span>
                </Link>
              </li>
            ))}
        </ul>
      </section>
    </div>
  );
}

/* ============================================================== Response */

export function SurveyResponseView() {
  const { t } = useI18n();
  const id = useParam("id");
  const central = useParam("central");
  const device = useDevice();
  const lk = useLookups();
  const { snapshot } = useFieldData();
  const record = device.records.find((r): r is SurveyRecord => r.kind === "survey" && (r.localId === id || (Boolean(central) && (r.central?.id === central || lk.submission(central ?? "")?.clientRecordId === r.localId))));
  if (record) return <LocalResponse key={record.localId} record={record} />;
  const sub = central ? lk.submission(central) : undefined;
  if (sub && sub.kind === "survey") return <CentralResponse submission={sub} />;
  if (!snapshot) return <SourceNote />;
  return (
    <div className={styles.stack}>
      <PageHead title={t("field.denied.title")} back={{ href: "/field/surveys", label: t("field.nav.surveys") }} />
      <Notice tone="warning">{t("field.surveys.notOnDevice")}</Notice>
    </div>
  );
}

function answerText(q: FormQuestion, value: string, t: ReturnType<typeof useI18n>["t"]) {
  if (!value) return "—";
  if (q.type === "choice" && !q.options && (value === "yes" || value === "no")) return value === "yes" ? t("common.yes") : t("common.no");
  return value;
}

function CentralResponse({ submission }: { submission: SurveySubmission }) {
  const { t, formatDate } = useI18n();
  const lk = useLookups();
  const questions = lk.form(submission.formId)?.versions.find((v) => v.version === submission.formVersion)?.questions ?? [];
  return (
    <div className={styles.stack}>
      <PageHead title={submission.title} back={{ href: "/field/surveys", label: t("field.nav.surveys") }} badges={<><span className={styles.ref}>{submission.ref}</span><Badge tone="info">{t("field.surveys.version", { version: submission.formVersion })}</Badge><StatusChip chip={submissionChip(submission)} /></>} />
      <SourceNote />
      <WhereTrack saved central reviewed={submission.status === "accepted"} />
      <section className={styles.card}>
        <KV items={questions.map((q) => ({ label: q.label, value: answerText(q, submission.answers?.find((a) => a.questionId === q.id)?.value ?? "", t), wide: true }))} />
        <p className={`${styles.small} ${styles.muted}`}>{t("field.surveys.collectedAt", { at: formatDate(submission.collectedAt, true) })}</p>
      </section>
    </div>
  );
}

function QuestionInput({ q, value, onChange, error }: { q: FormQuestion; value: string; onChange: (v: string) => void; error?: string }) {
  const { t } = useI18n();
  const id = `q-${q.id}`;
  if (q.type === "choice") {
    const options = q.options ?? ["yes", "no"];
    return (
      <fieldset className={styles.fieldset} aria-describedby={error ? `${id}-error` : undefined}>
        <legend className={styles.question}>
          {q.label} {q.required ? <span className={styles.muted}>{t("common.requiredMarker")}</span> : <span className={styles.muted}>{t("common.optional")}</span>}
        </legend>
        {error && (
          <p id={`${id}-error`} className={styles.small} style={{ color: "var(--color-error)" }}>
            <Icon name="alertCircle" size={16} /> {error}
          </p>
        )}
        <div className={styles.choiceList}>
          {options.map((o) => (
            <label key={o} className={styles.choice}>
              <input type="radio" name={id} value={o} checked={value === o} onChange={() => onChange(o)} />
              {q.options ? o : o === "yes" ? t("common.yes") : t("common.no")}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  const label = (
    <span className={styles.question}>
      {q.label} {q.required ? <span className={styles.muted}>{t("common.requiredMarker")}</span> : <span className={styles.muted}>{t("common.optional")}</span>}
    </span>
  );
  if (q.type === "text") return <TextAreaField id={id} rows={4} label={label} value={value} error={error} onChange={(e) => onChange(e.target.value)} />;
  if (q.type === "number")
    return <TextField id={id} type="number" inputMode="decimal" min={0} className={styles.bigInput} label={label} value={value} error={error} onChange={(e) => onChange(e.target.value)} />;
  if (q.type === "date") return <TextField id={id} type="date" label={label} value={value} error={error} onChange={(e) => onChange(e.target.value)} />;
  return <TextField id={id} label={label} hint={q.type === "gps" ? t("field.surveys.gpsHint") : t("field.surveys.photoHint")} value={value} error={error} onChange={(e) => onChange(e.target.value)} />;
}

function LocalResponse({ record }: { record: SurveyRecord }) {
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const { online } = useConnectivity();
  const lk = useLookups();
  const running = useSyncRunning();
  const { run, pending, error, success } = useFieldAction();
  const sub = lk.submissionFor(record) as SurveySubmission | undefined;
  const editable = record.state === "draft" || (record.state === "failed" && !record.error?.retryable && record.error?.code !== "FORM_VERSION_RETIRED");
  const [data, setData] = useState<SurveyData>(record.data);
  const [reviewing, setReviewing] = useState(false);
  const [questionError, setQuestionError] = useState<string | undefined>();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const total = data.questions.length;
  const position = Math.min(data.position, total - 1);
  const q = data.questions[position];
  const issues = surveyIssues(data);
  const previousAnswers = record.previous.find((p) => p.reason === "formVersionRetired")?.data as SurveyData | undefined;

  const persist = (next: SurveyData) => {
    setData(next);
    try {
      saveLocalRecord<"survey">(record.localId, next);
    } catch {
      // Reported by the explicit save action.
    }
  };

  useEffect(() => {
    headingRef.current?.focus();
  }, [position, reviewing]);

  const questionIssue = (question: FormQuestion, value: string) => {
    if (question.required && !value.trim()) return t("field.surveys.required");
    if (value.trim() && question.type === "number" && !(Number.isFinite(Number(value)) && Number(value) >= 0)) return t("field.surveys.number");
    return undefined;
  };

  function next() {
    const problem = questionIssue(q, data.answers[q.id] ?? "");
    setQuestionError(problem);
    if (problem) return;
    if (position >= total - 1) setReviewing(true);
    else persist({ ...data, position: position + 1 });
  }

  async function finish() {
    if (issues.length) {
      persist({ ...data, position: data.questions.findIndex((x) => issues.includes(x.id)) });
      setReviewing(false);
      setQuestionError(t("field.surveys.required"));
      return;
    }
    await run(
      "finish",
      async () => {
        saveLocalRecord<"survey">(record.localId, data);
        queueLocalRecord(record.localId);
        if (online) await syncNow({ only: [record.localId] });
      },
      online ? t("field.surveys.submitted") : t("field.surveys.savedOffline"),
    );
  }

  const header = (
    <PageHead
      title={data.formTitle}
      back={{ href: "/field/surveys", label: t("field.nav.surveys") }}
      badges={
        <>
          <Badge tone="info" icon="lock">
            {t("field.surveys.version", { version: data.formVersion })}
          </Badge>
          <span className={styles.ref}>{data.formRef}</span>
          {record.central && <span className={styles.ref}>{record.central.ref}</span>}
          <StatusChip chip={recordChip(record, online, sub)} />
        </>
      }
    />
  );

  if (!editable) {
    return (
      <div className={styles.stack}>
        {header}
        <WhereTrack saved central={record.state === "synced"} reviewed={sub?.status === "accepted"} />
        {record.state === "syncing" && <SyncProgress record={record} />}
        {record.state === "failed" && <SyncErrorNotice record={record} />}
        {record.state === "pending" && <p>{online ? t("field.explain.readyToSync") : t("field.explain.savedOffline")}</p>}
        {record.state === "synced" && <p>{t("field.explain.surveySynced", { ref: record.central?.ref ?? "", version: data.formVersion })}</p>}
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
            <Button icon="refresh" disabled={!online || running} onClick={() => void run("retry", () => retryLocalRecord(record.localId))}>
              {t("field.sync.retry")}
            </Button>
          )}
        </div>
        <section className={styles.card}>
          <KV items={data.questions.map((question) => ({ label: question.label, value: answerText(question, data.answers[question.id] ?? "", t), wide: true }))} />
        </section>
        <EarlierVersions record={record} />
        <details className={styles.card}>
          <summary className={styles.cardTitle}>{t("field.common.deviceHistory")}</summary>
          <LocalHistory record={record} />
        </details>
        <Feedback error={error} success={success} />
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      {header}
      {data.migratedFrom && <Notice tone="info">{t("field.surveys.migrated", { from: data.migratedFrom.version, to: data.formVersion })}</Notice>}
      {record.state === "failed" && <SyncErrorNotice record={record} />}
      <p className={`${styles.small} ${styles.muted}`}>
        <Icon name="smartphone" size={14} /> {t("field.surveys.savedAsYouGo")}
      </p>

      {!reviewing ? (
        <>
          <div className={styles.progress} role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={position + 1} aria-label={t("field.surveys.progressLabel")}>
            <div className={styles.progressFill} style={{ width: `${((position + 1) / total) * 100}%` }} />
          </div>
          <h2 ref={headingRef} tabIndex={-1} className={styles.small}>
            {t("field.surveys.questionOf", { n: position + 1, total })}
            {previousAnswers && !(q.id in previousAnswers.answers) && (
              <>
                {" "}
                <Badge tone="warning">{t("field.surveys.newQuestion")}</Badge>
              </>
            )}
          </h2>
          <QuestionInput key={q.id} q={q} value={data.answers[q.id] ?? ""} error={questionError} onChange={(v) => (setQuestionError(undefined), persist({ ...data, answers: { ...data.answers, [q.id]: v } }))} />
          <div className={styles.stickyActions}>
            {position > 0 && (
              <Button variant="secondary" icon="arrowLeft" onClick={() => (setQuestionError(undefined), persist({ ...data, position: position - 1 }))}>
                {t("field.common.back")}
              </Button>
            )}
            <Button variant="secondary" icon="smartphone" onClick={() => void run("exit", () => (saveLocalRecord<"survey">(record.localId, data), router.push("/field/surveys")))}>
              {t("field.surveys.saveExit")}
            </Button>
            <Button iconEnd="arrowRight" onClick={next}>
              {position >= total - 1 ? t("field.surveys.review") : t("field.common.next")}
            </Button>
          </div>
        </>
      ) : (
        <>
          <h2 ref={headingRef} tabIndex={-1} className={styles.cardTitle}>
            {t("field.surveys.reviewTitle")}
          </h2>
          <ul className={styles.list}>
            {data.questions.map((question, i) => (
              <li key={question.id} className={styles.item}>
                <span className={styles.itemTop}>
                  <span className={styles.itemTitle}>{question.label}</span>
                  <Button size="sm" variant="ghost" icon="pen" onClick={() => (persist({ ...data, position: i }), setReviewing(false))} aria-label={`${t("field.surveys.change")}: ${question.label}`}>
                    {t("field.surveys.change")}
                  </Button>
                </span>
                <span>{answerText(question, data.answers[question.id] ?? "", t)}</span>
                {issues.includes(question.id) && <Badge tone="error">{t("field.surveys.required")}</Badge>}
              </li>
            ))}
          </ul>
          <p className={`${styles.small} ${styles.muted}`}>{t("field.surveys.versionKept", { version: data.formVersion })}</p>
          <div className={styles.stickyActions}>
            <Button variant="secondary" icon="arrowLeft" onClick={() => setReviewing(false)}>
              {t("field.common.back")}
            </Button>
            <Button icon={online ? "send" : "wifiOff"} onClick={() => void finish()} disabled={Boolean(pending) || running}>
              {pending === "finish" ? t("field.sync.running") : online ? t("field.surveys.submit") : t("field.surveys.saveOffline")}
            </Button>
          </div>
        </>
      )}
      <Feedback error={error} success={success} />
      {!record.central && (
        <div className={styles.card}>
          {!confirmDiscard ? (
            <Button variant="ghost" icon="trash" onClick={() => setConfirmDiscard(true)}>
              {t("field.surveys.discard")}
            </Button>
          ) : (
            <div className={styles.actions}>
              <span>{t("field.reports.discardConfirm")}</span>
              <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" icon="trash" onClick={() => void run("discard", async () => (await discardLocalRecord(record.localId), router.push("/field/surveys")))}>
                {t("field.reports.discardYes")}
              </Button>
            </div>
          )}
        </div>
      )}
      <EarlierVersions record={record} />
      <p className={`${styles.small} ${styles.muted}`}>{t("field.surveys.startedAt", { at: formatDate(record.createdAt, true) })}</p>
    </div>
  );
}
