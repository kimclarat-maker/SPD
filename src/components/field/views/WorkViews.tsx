"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { FieldTaskKind } from "@/lib/types";
import { FIELD_JOURNEY } from "@/lib/demo/seed";
import type { FieldSubmission, FieldTaskView } from "@/lib/services/fieldWork";
import { applyCentralChangesWhileOffline, demoOpmAccept, demoOpmReturn } from "@/lib/services/fieldDemo";
import { isOnline, setSimulatedOffline, useConnectivity } from "@/lib/field/connectivity";
import { noteWalkthrough, recordForTask, startReport, startTaskRecord } from "@/lib/field/client";
import type { LocalRecord } from "@/lib/field/device";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { PriorityBadge } from "@/components/portal/StatusBadge";
import { useDevice, useFieldAction, useFieldData } from "../FieldData";
import { DemoAction, KV, Loading, PageHead, recordChip, SourceNote, StatusChip, submissionChip, WhereTrack, type Chip } from "../FieldBits";
import { useLookups, useParam, type Lookups } from "../lookup";
import styles from "../field.module.css";

export const TASK_ICON: Record<FieldTaskKind, IconName> = {
  visit: "mapPin",
  activity: "activity",
  survey: "target",
  assistance: "handshake",
  follow_up: "flag",
};

/** Where a record opens in the portal. */
export function recordHref(r: LocalRecord): string {
  switch (r.kind) {
    case "report":
      return `/field/report?id=${r.localId}`;
    case "survey":
      return `/field/survey?id=${r.localId}`;
    case "assistance":
      return `/field/assistance/record?id=${r.localId}`;
    case "verification":
      return `/field/verify?id=${r.localId}`;
    case "issue":
      return `/field/issue?id=${r.localId}`;
  }
}

export function submissionHref(s: FieldSubmission): string {
  switch (s.kind) {
    case "report":
      return `/field/report?central=${s.id}`;
    case "survey":
      return `/field/survey?central=${s.id}`;
    case "assistance":
      return "/field/assistance";
    case "verification":
      return "/field/verify";
    case "issue":
      return `/field/issue?central=${s.id}`;
  }
}

function isToday(iso: string) {
  const d = new Date(iso);
  const n = new Date();
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
}

/** A task's status combined with the officer's record for it on this device. */
function taskChip(task: FieldTaskView, record: LocalRecord | undefined, lk: Lookups, online: boolean): Chip {
  if (record) return recordChip(record, online, lk.submissionFor(record));
  const linked = task.linkedIds.map((id) => lk.submission(id)).find(Boolean);
  if (linked) return submissionChip(linked);
  switch (task.status) {
    case "completed":
      return { label: "field.taskStatus.completed", tone: "success", icon: "checkCircle" };
    case "submitted":
      return { label: "field.taskStatus.submitted", tone: "info", icon: "send" };
    case "cancelled":
      return { label: "field.taskStatus.cancelled", tone: "neutral", icon: "minusCircle" };
    case "in_progress":
      return { label: "field.taskStatus.in_progress", tone: "info", icon: "refresh" };
    default:
      return { label: "field.taskStatus.assigned", tone: "neutral", icon: "inbox" };
  }
}

function TaskItem({ task }: { task: FieldTaskView }) {
  const { t, formatDate } = useI18n();
  const lk = useLookups();
  const device = useDevice();
  const { online } = useConnectivity();
  const record = device.records.find((r) => "taskId" in r.data && r.data.taskId === task.id);
  const overdue = new Date(task.dueAt).getTime() < Date.now() && !["completed", "submitted", "cancelled"].includes(task.status);
  return (
    <li>
      <Link href={`/field/task?id=${task.id}`} className={styles.item}>
        <span className={styles.itemTop}>
          <span className={styles.itemTitle}>
            <Icon name={TASK_ICON[task.kind]} size={18} /> {task.title}
          </span>
          <PriorityBadge priority={task.priority} />
        </span>
        <span className={styles.itemMeta}>
          <span>{t(`field.taskKind.${task.kind}` as MessageKey)}</span>
          <span>
            <Icon name="mapPin" size={14} /> {lk.servicePointName(task.servicePointId)}
          </span>
          <span>
            <Icon name="clock" size={14} /> {isToday(task.dueAt) ? t("field.work.dueToday", { time: formatDate(task.dueAt, true).split(/,\s*/).pop() ?? "" }) : t("field.work.due", { date: formatDate(task.dueAt, true) })}
          </span>
          <span className={styles.ref}>{task.ref}</span>
        </span>
        <span className={styles.badges}>
          <StatusChip chip={taskChip(task, record, lk, online)} />
          {overdue && <Badge tone="error">{t("field.work.overdue")}</Badge>}
          {task.version > 1 && !["completed", "cancelled"].includes(task.status) && <Badge tone="info" icon="history">{t("field.work.updatedVersion", { version: task.version })}</Badge>}
        </span>
      </Link>
    </li>
  );
}

/* ================================================================ My work */

export function MyWorkView() {
  const { t } = useI18n();
  const { snapshot, source } = useFieldData();
  const device = useDevice();
  const { online } = useConnectivity();
  const [filter, setFilter] = useState<"all" | FieldTaskKind>("all");

  if (!snapshot) {
    return (
      <div className={styles.stack}>
        <PageHead title={t("field.work.title")} />
        <SourceNote />
        {source === "none" && online && <Loading />}
      </div>
    );
  }

  const mine = snapshot.tasks.filter((task) => task.assignedTo === snapshot.userId);
  const open = mine.filter((task) => !["completed", "cancelled"].includes(task.status));
  const shown = open.filter((task) => filter === "all" || task.kind === filter);
  const today = shown.filter((task) => isToday(task.dueAt) || new Date(task.dueAt).getTime() < Date.now());
  const later = shown.filter((task) => !today.includes(task));
  const done = mine.filter((task) => ["completed", "cancelled"].includes(task.status) || task.status === "submitted");
  const drafts = device.records.filter((r) => r.state === "draft").length;
  const ready = device.records.filter((r) => r.state === "pending" || r.state === "syncing").length;
  const errors = device.records.filter((r) => r.state === "failed" || r.state === "conflict").length;
  const underReview = snapshot.submissions.filter((s) => (s.kind === "report" || s.kind === "survey") && ["synced", "needs_review", "escalated", "conflict"].includes(s.status)).length;
  const returned = snapshot.submissions.filter((s) => s.kind === "report" && s.status === "returned");
  const kinds: ("all" | FieldTaskKind)[] = ["all", "visit", "activity", "survey", "assistance", "follow_up"];

  return (
    <div className={styles.stack}>
      <PageHead
        title={t("field.work.title")}
        intro={t("field.work.intro", { name: snapshot.account.name, organisation: snapshot.account.organisation.name, settlement: snapshot.settlements.map((s) => s.name).join(", ") })}
      />
      <SourceNote />

      <section aria-labelledby="counts-title">
        <h2 id="counts-title" className="visually-hidden">
          {t("field.work.countsTitle")}
        </h2>
        <div className={styles.counts}>
          <Link href="/field/sync#device" className={styles.count}>
            <span className={styles.countValue}>{drafts}</span>
            <span className={styles.countLabel}>{t("field.work.countDrafts")}</span>
          </Link>
          <Link href="/field/sync#queue" className={`${styles.count} ${ready ? styles.countWarn : ""}`}>
            <span className={styles.countValue}>{ready}</span>
            <span className={styles.countLabel}>{online ? t("field.work.countReady") : t("field.work.countReadyOffline")}</span>
          </Link>
          <Link href="/field/sync#problems" className={`${styles.count} ${errors ? styles.countError : ""}`}>
            <span className={styles.countValue}>{errors}</span>
            <span className={styles.countLabel}>{t("field.work.countErrors")}</span>
          </Link>
          <Link href="/field/reports?show=review" className={styles.count}>
            <span className={styles.countValue}>{underReview}</span>
            <span className={styles.countLabel}>{t("field.work.countReview")}</span>
          </Link>
        </div>
      </section>

      {returned.length > 0 && (
        <Notice tone="warning" title={t("field.work.returnedTitle", { count: returned.length })}>
          <ul className={styles.list}>
            {returned.map((s) => (
              <li key={s.id}>
                <Link href={`/field/report?central=${s.id}`}>
                  {s.ref} — {s.kind === "report" ? s.title : ""}
                </Link>
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <Walkthrough />

      <section className={styles.stack} aria-labelledby="today-title">
        <div className={styles.cardHead}>
          <h2 id="today-title" className={styles.cardTitle}>
            {t("field.work.today")}
          </h2>
        </div>
        <div className={styles.filters} role="group" aria-label={t("field.work.filterLabel")}>
          {kinds.map((k) => (
            <button key={k} type="button" className={styles.chip} aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {k === "all" ? t("common.all") : t(`field.taskKind.${k}` as MessageKey)}
            </button>
          ))}
        </div>
        {today.length === 0 ? (
          <p className={styles.muted}>{t("field.work.nothingToday")}</p>
        ) : (
          <ul className={styles.list}>
            {today.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </ul>
        )}
      </section>

      {later.length > 0 && (
        <section className={styles.stack} aria-labelledby="later-title">
          <h2 id="later-title" className={styles.cardTitle}>
            {t("field.work.later")}
          </h2>
          <ul className={styles.list}>
            {later.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </ul>
        </section>
      )}

      {done.length > 0 && (
        <details className={styles.card}>
          <summary className={styles.cardTitle}>{t("field.work.done", { count: done.length })}</summary>
          <ul className={styles.list}>
            {done.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

/* ============================================================ Walkthrough */

/**
 * The connected demonstration, step by step. Each step is worked out from the
 * device store and the officer's own central records, so it reflects what
 * actually happened, not what the panel was told.
 */
function Walkthrough() {
  const { t } = useI18n();
  const device = useDevice();
  const { snapshot } = useFieldData();
  const { online, simulatedOffline, browserOnline } = useConnectivity();
  const { run, pending, error, success } = useFieldAction();
  if (!snapshot || snapshot.account.role !== "field_officer") return null;

  const byTask = (id: string) => device.records.find((r) => "taskId" in r.data && r.data.taskId === id);
  const visit = byTask(FIELD_JOURNEY.visitTaskId);
  const survey = byTask(FIELD_JOURNEY.surveyTaskId);
  const assistance = byTask(FIELD_JOURNEY.assistanceTaskId);
  const trio = [visit, survey, assistance];
  const hadEvent = (r: LocalRecord | undefined, type: string) => Boolean(r?.events.some((e) => e.type === type));
  const visitSub = snapshot.submissions.find((s) => s.kind === "report" && ((visit?.central && s.id === visit.central.id) || s.clientRecordId === visit?.localId));
  const visitReport = visitSub && visitSub.kind === "report" ? visitSub : undefined;

  const s1 = Boolean(device.walkthrough.openedOnlineAt);
  const s2 = Boolean(device.walkthrough.wentOfflineAt);
  const s3 = trio.every((r) => r && r.createdOffline && r.state !== "draft") && Boolean(visit && visit.kind === "report" && (visit.data.gps || visit.data.gpsUnavailableReason.trim()));
  const s4 = s3;
  const s5 = Boolean(device.walkthrough.syncedAfterOfflineAt);
  const s6 = hadEvent(visit, "synced") && hadEvent(survey, "rejected") && hadEvent(assistance, "conflict");
  const s7 = survey?.state === "synced" && assistance?.state === "synced" && hadEvent(assistance, "conflictResolved");
  const s8 = Boolean(visitReport && (visitReport.status === "returned" || visitReport.fieldComments.length > 0));
  const s9 = visitReport?.status === "accepted" && visitReport.versions >= 2;
  const done = [s1, s2, s3, s4, s5, s6, s7, s8, s9];
  const currentIndex = done.findIndex((d) => !d);

  async function goOffline() {
    // Central changes are made by other people while this device is away (SIMULATED).
    // Go offline first, so the device cannot refresh its copy with the central changes.
    await run("offline", async () => {
      if (isOnline()) setSimulatedOffline(true);
      noteWalkthrough("wentOfflineAt");
      if (!device.walkthrough.centralChangesAt) {
        await applyCentralChangesWhileOffline();
        noteWalkthrough("centralChangesAt");
      }
    }, t("field.walkthrough.offlineDone"));
  }

  const step = (index: number, body: React.ReactNode) => {
    const isDone = done[index];
    const isCurrent = index === currentIndex;
    return (
      <li key={index} className={`${styles.step} ${isDone ? styles.stepDone : ""} ${isCurrent ? styles.stepCurrent : ""}`} aria-current={isCurrent ? "step" : undefined}>
        <span className={styles.stepMark} aria-hidden="true">
          {isDone ? <Icon name="check" size={16} /> : index + 1}
        </span>
        <div className={styles.stepBody}>
          <p>
            <strong>{t(`field.walkthrough.s${index + 1}.title` as MessageKey)}</strong>
            <span className="visually-hidden"> — {isDone ? t("field.track.done") : t("field.track.notYet")}</span>
          </p>
          <p className={`${styles.small} ${styles.muted}`}>{t(`field.walkthrough.s${index + 1}.body` as MessageKey)}</p>
          {body}
        </div>
      </li>
    );
  };

  return (
    <>
    {s9 && (
      <Notice tone="success" title={t("field.walkthrough.completeTitle")}>
        <p>
          {t("field.walkthrough.completeBody")} <Link href={`/field/intervention?id=${FIELD_JOURNEY.interventionId}`}>{t("field.walkthrough.completeLink")}</Link>
        </p>
      </Notice>
    )}
    <details className={styles.card} open={!s9}>
      <summary className={styles.cardTitle}>
        {t("field.walkthrough.title")} <Badge tone="simulated">{t("common.fictional")}</Badge>
      </summary>
      <p className={`${styles.small} ${styles.muted}`}>{t("field.walkthrough.intro")}</p>
      <ol className={styles.steps}>
        {step(0, !s1 && <ButtonLink size="sm" variant="secondary" href={`/field/intervention?id=${FIELD_JOURNEY.interventionId}`}>{t("field.walkthrough.s1.action")}</ButtonLink>)}
        {step(
          1,
          !s2 && (
            <DemoAction
              label={browserOnline && !simulatedOffline ? t("field.walkthrough.s2.action") : t("field.walkthrough.s2.actionApply")}
              hint={t("field.walkthrough.s2.hint")}
              pending={pending === "offline"}
              onRun={() => void goOffline()}
            />
          ),
        )}
        {step(
          2,
          !s3 && (
            <div className={styles.actions}>
              <ButtonLink size="sm" variant="secondary" href={`/field/task?id=${FIELD_JOURNEY.visitTaskId}`}>{t("field.walkthrough.s3.visit")}</ButtonLink>
              <ButtonLink size="sm" variant="secondary" href={`/field/task?id=${FIELD_JOURNEY.surveyTaskId}`}>{t("field.walkthrough.s3.survey")}</ButtonLink>
              <ButtonLink size="sm" variant="secondary" href={`/field/task?id=${FIELD_JOURNEY.assistanceTaskId}`}>{t("field.walkthrough.s3.assistance")}</ButtonLink>
            </div>
          ),
        )}
        {step(3, s3 && !s5 && <ButtonLink size="sm" variant="secondary" href="/field/sync">{t("field.walkthrough.s4.action")}</ButtonLink>)}
        {step(
          4,
          s4 && !s5 && (
            <div className={styles.actions}>
              {simulatedOffline && (
                <Button size="sm" icon="cloud" onClick={() => setSimulatedOffline(false)}>
                  {t("field.walkthrough.s5.online")}
                </Button>
              )}
              <ButtonLink size="sm" variant="secondary" href="/field/sync">{t("field.walkthrough.s5.action")}</ButtonLink>
            </div>
          ),
        )}
        {step(5, s5 && !s7 && <ButtonLink size="sm" variant="secondary" href="/field/sync#problems">{t("field.walkthrough.s6.action")}</ButtonLink>)}
        {step(6, s6 && !s7 && <ButtonLink size="sm" variant="secondary" href="/field/sync#problems">{t("field.walkthrough.s7.action")}</ButtonLink>)}
        {step(
          7,
          visitReport && !s8 && ["synced", "needs_review"].includes(visitReport.status) && (
            <DemoAction label={t("field.walkthrough.s8.action")} hint={t("field.walkthrough.s8.hint")} pending={pending === "return"} disabled={!online} onRun={() => void run("return", () => demoOpmReturn(visitReport.id), t("field.walkthrough.s8.done"))} />
          ),
        )}
        {step(
          8,
          visitReport && s8 && !s9 && (
            <div className={styles.stack} style={{ gap: 8 }}>
              {visitReport.status === "returned" && <ButtonLink size="sm" variant="secondary" href={`/field/report?central=${visitReport.id}`}>{t("field.walkthrough.s9.correct")}</ButtonLink>}
              {["synced", "needs_review"].includes(visitReport.status) && visitReport.versions >= 2 && (
                <DemoAction label={t("field.walkthrough.s9.action")} hint={t("field.walkthrough.s9.hint")} pending={pending === "accept"} disabled={!online} onRun={() => void run("accept", () => demoOpmAccept(visitReport.id), t("field.walkthrough.s9.done"))} />
              )}
            </div>
          ),
        )}
      </ol>
      <div aria-live="polite">{success && <Notice tone="success">{success}</Notice>}</div>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
    </details>
    </>
  );
}

/* ================================================================== Task */

export function TaskView() {
  const { t, formatDate } = useI18n();
  const id = useParam("id") ?? "";
  const router = useRouter();
  const { snapshot } = useFieldData();
  const lk = useLookups();
  const device = useDevice();
  const { online } = useConnectivity();
  const { run, error } = useFieldAction();
  if (!snapshot) return <SourceNote />;
  const task = lk.task(id);
  if (!task) {
    return (
      <div className={styles.stack}>
        <PageHead title={t("field.denied.title")} back={{ href: "/field", label: t("field.nav.myWork") }} />
        <Notice tone="warning">{t("field.denied.task")}</Notice>
      </div>
    );
  }
  const intervention = lk.intervention(task.interventionId);
  const record = device.records.find((r) => "taskId" in r.data && r.data.taskId === task.id);
  const linked = task.linkedIds.map((x) => lk.submission(x)).filter((x): x is FieldSubmission => Boolean(x));
  const mine = task.assignedTo === snapshot.userId;
  const form = lk.form(task.formId);
  const sub = record ? lk.submissionFor(record) : linked[0];
  const reviewed = sub ? ["accepted"].includes((sub as { status: string }).status) || (sub.kind === "assistance" && sub.reviewed) : false;
  const canStart =
    mine &&
    !record &&
    linked.length === 0 &&
    !["completed", "cancelled"].includes(task.status) &&
    (task.kind !== "survey" || Boolean(form?.published)) &&
    (task.kind !== "assistance" || snapshot.account.permissions.includes("assistance.record"));

  const startLabel: Record<FieldTaskKind, MessageKey> = {
    visit: "field.task.startVisit",
    activity: "field.task.startActivity",
    survey: "field.task.startSurvey",
    assistance: "field.task.startAssistance",
    follow_up: "field.task.startFollowUp",
  };

  return (
    <div className={styles.stack}>
      <PageHead
        title={task.title}
        back={{ href: "/field", label: t("field.nav.myWork") }}
        badges={
          <>
            <Badge tone="neutral" icon={TASK_ICON[task.kind]}>
              {t(`field.taskKind.${task.kind}` as MessageKey)}
            </Badge>
            <PriorityBadge priority={task.priority} />
            <StatusChip chip={taskChip(task, record, lk, online)} />
          </>
        }
      />
      <SourceNote />
      <section className={styles.card} aria-labelledby="task-details">
        <h2 id="task-details" className={styles.cardTitle}>
          {t("field.task.details")}
        </h2>
        <KV
          items={[
            { label: t("field.common.reference"), value: <span className={styles.ref}>{task.ref}</span> },
            { label: t("field.common.due"), value: formatDate(task.dueAt, true) },
            { label: t("field.common.intervention"), value: intervention ? <Link href={`/field/intervention?id=${intervention.id}`}>{`${intervention.ref} — ${intervention.title}`}</Link> : "—", wide: true },
            { label: t("field.common.location"), value: `${lk.servicePointName(task.servicePointId)} · ${lk.settlementName(task.settlementId)}` },
            { label: t("field.task.assignedBy"), value: task.assignedBy },
            ...(snapshot.account.role === "field_supervisor" ? [{ label: t("field.task.assignedTo"), value: task.assigneeName }] : []),
            { label: t("field.task.instructions"), value: task.instructions, wide: true },
            ...(form ? [{ label: t("field.common.form"), value: `${form.ref} — ${form.title} (v${form.published?.version ?? "—"})`, wide: true }] : []),
            ...(task.allocation ? [{ label: t("field.task.allocation"), value: `${task.allocation.quantity} × ${task.allocation.assistanceType} (${task.allocation.unit}) · ${task.maskedHousehold ?? ""}`, wide: true }] : []),
          ]}
        />
      </section>

      {(record || sub) && (
        <section className={styles.card} aria-labelledby="task-record">
          <h2 id="task-record" className={styles.cardTitle}>
            {t("field.task.yourRecord")}
          </h2>
          {record ? <StatusChip chip={recordChip(record, online, sub)} /> : sub ? <StatusChip chip={submissionChip(sub)} /> : null}
          <WhereTrack saved={Boolean(record) || Boolean(sub)} central={Boolean(sub) || record?.state === "synced"} reviewed={Boolean(reviewed)} />
          <div className={styles.actions}>
            {record && <ButtonLink href={recordHrefFor(record)} icon="arrowRight">{record.state === "synced" ? t("field.task.openRecord") : t("field.task.continue")}</ButtonLink>}
            {!record && sub && <ButtonLink href={submissionHref(sub)} icon="arrowRight">{t("field.task.openRecord")}</ButtonLink>}
          </div>
        </section>
      )}

      {canStart && (
        <div className={styles.actions}>
          <Button
            size="lg"
            icon={TASK_ICON[task.kind]}
            onClick={() =>
              void run("start", () => {
                const started = startTaskRecord(task, form);
                router.push(recordHrefFor({ kind: started.kind, localId: started.localId } as LocalRecord));
              })
            }
          >
            {t(startLabel[task.kind])}
          </Button>
          {task.kind === "follow_up" && (
            <ButtonLink variant="secondary" href={`/field/issue?new=follow_up&intervention=${task.interventionId}`} icon="flag">
              {t("field.task.raiseIssue")}
            </ButtonLink>
          )}
        </div>
      )}
      {!online && canStart && <p className={`${styles.small} ${styles.muted}`}>{t("field.task.worksOffline")}</p>}
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}

      {task.versions.length > 1 && (
        <section className={styles.card} aria-labelledby="task-versions">
          <h2 id="task-versions" className={styles.cardTitle}>
            {t("field.task.versions")}
          </h2>
          <ul className={styles.timeline}>
            {[...task.versions].reverse().map((v) => (
              <li key={v.version}>
                <strong>
                  v{v.version} · {v.by}
                </strong>
                <span>{v.note}</span>
                {v.changes.map((c, i) => (
                  <span key={i} className={styles.small}>
                    {t(`field.changeField.${c.field}` as MessageKey)}: {c.from || "—"} → {c.to}
                  </span>
                ))}
                <span className={`${styles.small} ${styles.muted}`}>{formatDate(v.at, true)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function recordHrefFor(r: Pick<LocalRecord, "kind" | "localId">): string {
  return recordHref(r as LocalRecord);
}

/* ========================================================= Interventions */

export function InterventionsView() {
  const { t, formatNumber } = useI18n();
  const { snapshot } = useFieldData();
  const lk = useLookups();
  return (
    <div className={styles.stack}>
      <PageHead title={t("field.interventions.title")} intro={t("field.interventions.intro")} />
      <SourceNote />
      {snapshot && snapshot.interventions.length === 0 && <p className={styles.muted}>{t("field.interventions.none")}</p>}
      <ul className={styles.list}>
        {snapshot?.interventions.map((i) => {
          const tasks = snapshot.tasks.filter((task) => task.interventionId === i.id && task.assignedTo === snapshot.userId && !["completed", "cancelled"].includes(task.status)).length;
          return (
            <li key={i.id}>
              <Link href={`/field/intervention?id=${i.id}`} className={styles.item}>
                <span className={styles.itemTitle}>{i.title}</span>
                <span className={styles.itemMeta}>
                  <span className={styles.ref}>{i.ref}</span>
                  <span>{i.partnerName}</span>
                  <span>
                    <Icon name="mapPin" size={14} /> {lk.settlementName(i.settlementId)}
                  </span>
                </span>
                <span className={styles.itemMeta}>
                  <span>{t("field.interventions.reached", { reached: formatNumber(i.acceptedReach), target: formatNumber(i.targetReach) })}</span>
                  <span>{t("field.interventions.openTasks", { count: tasks })}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function InterventionView() {
  const { t, formatDate, formatNumber } = useI18n();
  const id = useParam("id") ?? "";
  const router = useRouter();
  const { snapshot, source } = useFieldData();
  const lk = useLookups();
  const { online } = useConnectivity();
  const intervention = lk.intervention(id);

  useEffect(() => {
    if (online && intervention && source === "live") noteWalkthrough("openedOnlineAt");
  }, [online, intervention, source]);

  const forms = useMemo(() => (intervention ? intervention.formIds.map((f) => lk.form(f)).filter((f): f is NonNullable<typeof f> => Boolean(f)) : []), [intervention, lk]);

  if (!snapshot) return <SourceNote />;
  if (!intervention) {
    return (
      <div className={styles.stack}>
        <PageHead title={t("field.denied.title")} back={{ href: "/field/interventions", label: t("field.nav.interventions") }} />
        <Notice tone="warning">{t("field.denied.intervention")}</Notice>
      </div>
    );
  }
  const surveys = forms.filter((f) => f.kind === "survey" && f.published);
  const tasks = snapshot.tasks.filter((task) => task.interventionId === intervention.id && task.assignedTo === snapshot.userId);
  const canReport = snapshot.account.permissions.includes("visits.report");

  return (
    <div className={styles.stack}>
      <PageHead
        title={intervention.title}
        back={{ href: "/field/interventions", label: t("field.nav.interventions") }}
        badges={
          <>
            <span className={styles.ref}>{intervention.ref}</span>
            <Badge tone="success" icon="activity">
              {t(`portal.status.intervention.${intervention.status}` as MessageKey)}
            </Badge>
            <Badge tone="neutral" icon="lock">
              {t("field.interventions.readOnly")}
            </Badge>
          </>
        }
      />
      <SourceNote />

      {canReport && (
        <div className={styles.actions}>
          <Button icon="mapPin" onClick={() => router.push(`/field/report?id=${startReport(intervention.id, "site_visit")}`)}>
            {t("field.interventions.startVisit")}
          </Button>
          <Button variant="secondary" icon="activity" onClick={() => router.push(`/field/report?id=${startReport(intervention.id, "activity_update")}`)}>
            {t("field.interventions.activityReport")}
          </Button>
          {surveys.map((f) => (
            <ButtonLink key={f.id} variant="secondary" icon="target" href={`/field/surveys?form=${f.id}&intervention=${intervention.id}`}>
              {t("field.interventions.openSurvey", { title: f.title })}
            </ButtonLink>
          ))}
        </div>
      )}

      <Notice tone="info">{t("field.interventions.scopeNote")}</Notice>

      <section className={styles.card} aria-labelledby="int-plan">
        <h2 id="int-plan" className={styles.cardTitle}>
          {t("field.interventions.plan")}
        </h2>
        <KV
          items={[
            { label: t("field.interventions.objective"), value: intervention.objective, wide: true },
            { label: t("field.common.partner"), value: intervention.partnerName },
            { label: t("field.common.sector"), value: intervention.sectorName },
            { label: t("field.common.settlement"), value: lk.settlementName(intervention.settlementId) },
            { label: t("field.interventions.period"), value: `${formatDate(intervention.startDate)} – ${formatDate(intervention.endDate)}` },
            { label: t("field.interventions.targetGroup"), value: intervention.targetGroup },
            { label: t("field.interventions.targetReach"), value: formatNumber(intervention.targetReach) },
            { label: t("field.interventions.budget"), value: `${formatNumber(intervention.budgetUsd, { style: "currency", currency: "USD", maximumFractionDigits: 0 })} · ${intervention.fundingSource}`, wide: true },
          ]}
        />
      </section>

      <section className={styles.card} aria-labelledby="int-activities">
        <h2 id="int-activities" className={styles.cardTitle}>
          {t("field.interventions.activities")}
        </h2>
        <ul>
          {intervention.activities.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        {intervention.milestones.length > 0 && (
          <>
            <h3 className={styles.small}>{t("field.interventions.milestones")}</h3>
            <ul className={styles.list}>
              {intervention.milestones.map((m) => (
                <li key={m.id} className={styles.itemMeta}>
                  <span>
                    <Icon name={m.done ? "checkCircle" : "circle"} size={16} /> {m.title}
                  </span>
                  <span>{formatDate(m.dueAt)}</span>
                  <span>{m.done ? t("field.interventions.milestoneDone") : t("field.interventions.milestoneOpen")}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className={styles.card} aria-labelledby="int-reporting">
        <h2 id="int-reporting" className={styles.cardTitle}>
          {t("field.interventions.reporting")}
        </h2>
        <p>{intervention.reportingInstructions ?? t("field.interventions.reportingDefault")}</p>
        {forms.length > 0 && (
          <>
            <h3 className={styles.small}>{t("field.interventions.forms")}</h3>
            <ul className={styles.list}>
              {forms.map((f) => (
                <li key={f.id} className={styles.itemMeta}>
                  <Link href={`/field/surveys?form=${f.id}`}>
                    {f.ref} — {f.title}
                  </Link>
                  <span>{f.published ? t("field.surveys.version", { version: f.published.version }) : t("field.surveys.noPublished")}</span>
                  <span>
                    {formatDate(f.deploymentStart)} – {formatDate(f.deploymentEnd)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className={styles.card} aria-labelledby="int-results">
        <h2 id="int-results" className={styles.cardTitle}>
          {t("field.interventions.results")}
        </h2>
        <p className={`${styles.small} ${styles.muted}`}>{t("field.interventions.resultsNote")}</p>
        <p>{t("field.interventions.reached", { reached: formatNumber(intervention.acceptedReach), target: formatNumber(intervention.targetReach) })}</p>
        <ul className={styles.list}>
          {intervention.indicatorTargets.map((it) => {
            const pct = it.target ? Math.min(100, Math.round((it.accepted / it.target) * 100)) : 0;
            return (
              <li key={it.indicatorId} className={styles.stack} style={{ gap: 4 }}>
                <span className={styles.itemMeta}>
                  <strong>{lk.indicatorLabel(it.indicatorId)}</strong>
                  <span>{t("field.interventions.indicatorValue", { accepted: formatNumber(it.accepted), target: formatNumber(it.target), pct })}</span>
                </span>
                <span className={styles.barTrack} role="img" aria-label={`${lk.indicatorLabel(it.indicatorId)}: ${pct}%`}>
                  <span className={styles.barFill} style={{ display: "block", width: `${pct}%` }} />
                </span>
              </li>
            );
          })}
        </ul>
        {intervention.lastAcceptedAt && <p className={`${styles.small} ${styles.muted}`}>{t("field.interventions.lastAccepted", { at: formatDate(intervention.lastAcceptedAt, true), count: intervention.acceptedReports })}</p>}
      </section>

      <section className={styles.card} aria-labelledby="int-points">
        <h2 id="int-points" className={styles.cardTitle}>
          {t("field.interventions.servicePoints")}
        </h2>
        <ul>
          {intervention.servicePointIds.map((sp) => (
            <li key={sp}>{lk.servicePointName(sp)}</li>
          ))}
        </ul>
        <Link href="/field/map">{t("field.interventions.openMap")}</Link>
      </section>

      {tasks.length > 0 && (
        <section className={styles.stack} aria-labelledby="int-tasks">
          <h2 id="int-tasks" className={styles.cardTitle}>
            {t("field.interventions.yourTasks")}
          </h2>
          <ul className={styles.list}>
            {tasks.map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export { recordForTask };
