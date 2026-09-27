"use client";

import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { FieldReportField, FieldTaskKind, Priority } from "@/lib/types";
import { RETURNABLE_FIELDS } from "@/lib/services/fieldReports";
import { assignFieldTask, cancelFieldTask, supervisorEndorseReport, supervisorReturnReport, taskIssues, updateFieldIssueStatus, updateFieldTask, type FieldReviewItem, type TaskInput } from "@/lib/services/fieldWork";
import { useConnectivity } from "@/lib/field/connectivity";
import { localDateTime } from "@/lib/field/client";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { PriorityBadge, StatusBadge } from "@/components/portal/StatusBadge";
import { useFieldAction, useFieldData } from "../FieldData";
import { KV, NeedsConnection, PageHead, normaliseRefInput } from "../FieldBits";
import { useLookups } from "../lookup";
import { TASK_ICON } from "./WorkViews";
import { Feedback } from "./ReportViews";
import styles from "../field.module.css";

const KINDS: FieldTaskKind[] = ["visit", "activity", "survey", "assistance", "follow_up"];

function AssignForm() {
  const { t } = useI18n();
  const { snapshot } = useFieldData();
  const lk = useLookups();
  const { run, pending, error, success } = useFieldAction();
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const blank = (): TaskInput => ({
    kind: "visit",
    title: "",
    instructions: "",
    interventionId: snapshot?.interventions[0]?.id ?? "",
    servicePointId: "",
    formId: "",
    dueAt: localDateTime(tomorrow),
    priority: "medium",
    assignedTo: snapshot?.team?.officers[0]?.id ?? "",
  });
  const [input, setInput] = useState<TaskInput>(blank);
  const [showErrors, setShowErrors] = useState(false);
  if (!snapshot?.team) return null;
  const intervention = lk.intervention(input.interventionId);
  const officers = snapshot.team.officers.filter((o) => input.kind !== "assistance" || o.permissions.includes("assistance.record"));
  const forms = snapshot.forms.filter((f) => f.kind === "survey" && f.interventionIds.includes(input.interventionId) && f.published);
  const issues = taskIssues(input);
  const err = (k: string) => (showErrors && issues.includes(k as never) ? t(`field.team.errors.${k}` as MessageKey) : undefined);

  return (
    <form
      className={styles.card}
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setShowErrors(true);
        if (issues.length) return;
        void run("assign", async () => {
          await assignFieldTask(input);
          setInput(blank());
          setShowErrors(false);
        }, t("field.team.assigned"));
      }}
      aria-labelledby="assign-title"
    >
      <h2 id="assign-title" className={styles.cardTitle}>
        {t("field.team.assignTitle")}
      </h2>
      <div className={styles.row2}>
        <SelectField id="ta-kind" label={t("field.team.kind")} value={input.kind} onChange={(e) => setInput({ ...input, kind: e.target.value as FieldTaskKind, allocation: e.target.value === "assistance" ? { householdRef: "", assistanceType: "", quantity: 1, unit: "" } : undefined })}>
          {KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`field.taskKind.${k}` as MessageKey)}
            </option>
          ))}
        </SelectField>
        <SelectField id="ta-assignee" label={t("field.task.assignedTo")} value={input.assignedTo} error={err("assignedTo")} onChange={(e) => setInput({ ...input, assignedTo: e.target.value })}>
          <option value="">{t("field.common.choose")}</option>
          {officers.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </SelectField>
      </div>
      <TextField id="ta-title" label={t("field.team.taskTitle")} requiredLabel={t("common.requiredMarker")} value={input.title} error={err("title")} onChange={(e) => setInput({ ...input, title: e.target.value })} />
      <TextAreaField id="ta-instructions" label={t("field.task.instructions")} value={input.instructions} onChange={(e) => setInput({ ...input, instructions: e.target.value })} />
      <div className={styles.row2}>
        <SelectField id="ta-intervention" label={t("field.common.intervention")} value={input.interventionId} error={err("intervention")} onChange={(e) => setInput({ ...input, interventionId: e.target.value, servicePointId: "", formId: "" })}>
          {snapshot.interventions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.ref} — {i.title}
            </option>
          ))}
        </SelectField>
        <SelectField id="ta-point" label={t("field.common.location")} value={input.servicePointId ?? ""} error={err("servicePoint")} onChange={(e) => setInput({ ...input, servicePointId: e.target.value })}>
          <option value="">{t("field.common.choose")}</option>
          {(intervention?.servicePointIds ?? []).map((id) => (
            <option key={id} value={id}>
              {lk.servicePointName(id)}
            </option>
          ))}
        </SelectField>
      </div>
      {input.kind === "survey" && (
        <SelectField id="ta-form" label={t("field.common.form")} value={input.formId ?? ""} error={err("form")} onChange={(e) => setInput({ ...input, formId: e.target.value })}>
          <option value="">{t("field.common.choose")}</option>
          {forms.map((f) => (
            <option key={f.id} value={f.id}>
              {f.ref} — {f.title}
            </option>
          ))}
        </SelectField>
      )}
      {input.kind === "assistance" && input.allocation && (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{t("field.task.allocation")}</legend>
          {err("allocation") && <p className={styles.small} style={{ color: "var(--color-error)" }}>{err("allocation")}</p>}
          <TextField id="ta-household" label={t("field.assistance.household")} hint={t("field.assistance.householdHint")} value={input.allocation.householdRef} onChange={(e) => setInput({ ...input, allocation: { ...input.allocation!, householdRef: normaliseRefInput(e.target.value) } })} />
          <div className={styles.row3}>
            <TextField id="ta-type" label={t("field.assistance.type")} value={input.allocation.assistanceType} onChange={(e) => setInput({ ...input, allocation: { ...input.allocation!, assistanceType: e.target.value } })} />
            <TextField id="ta-qty" type="number" min={1} label={t("field.assistance.quantity")} value={String(input.allocation.quantity)} onChange={(e) => setInput({ ...input, allocation: { ...input.allocation!, quantity: Number(e.target.value) } })} />
            <TextField id="ta-unit" label={t("field.assistance.unit")} value={input.allocation.unit} onChange={(e) => setInput({ ...input, allocation: { ...input.allocation!, unit: e.target.value } })} />
          </div>
        </fieldset>
      )}
      <div className={styles.row2}>
        <TextField id="ta-due" type="datetime-local" label={t("field.common.due")} value={input.dueAt} error={err("dueAt")} onChange={(e) => setInput({ ...input, dueAt: e.target.value })} />
        <SelectField id="ta-priority" label={t("field.issues.priority")} value={input.priority} onChange={(e) => setInput({ ...input, priority: e.target.value as Priority })}>
          {(["high", "medium", "low"] as Priority[]).map((p) => (
            <option key={p} value={p}>
              {t(`portal.status.priority.${p}` as MessageKey)}
            </option>
          ))}
        </SelectField>
      </div>
      <div className={styles.actions}>
        <Button type="submit" icon="plus" disabled={Boolean(pending)}>
          {t("field.team.assign")}
        </Button>
      </div>
      <Feedback error={error} success={success} />
    </form>
  );
}

function TaskActions({ id, hasAllocation }: { id: string; hasAllocation: boolean }) {
  const { t } = useI18n();
  const { run, pending, error, success } = useFieldAction();
  const [open, setOpen] = useState<"change" | "cancel" | null>(null);
  const [due, setDue] = useState("");
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  return (
    <div className={styles.stack} style={{ gap: 8 }}>
      <div className={styles.actions}>
        <Button size="sm" variant="secondary" icon="pen" onClick={() => setOpen(open === "change" ? null : "change")}>
          {t("field.team.change")}
        </Button>
        <Button size="sm" variant="ghost" icon="xCircle" onClick={() => setOpen(open === "cancel" ? null : "cancel")}>
          {t("field.team.cancelTask")}
        </Button>
      </div>
      {open && (
        <div className={styles.stack} style={{ gap: 8 }}>
          {open === "change" && (
            <div className={styles.row2}>
              <TextField id={`due-${id}`} type="datetime-local" label={t("field.common.due")} value={due} onChange={(e) => setDue(e.target.value)} />
              {hasAllocation && <TextField id={`qty-${id}`} type="number" min={1} label={t("field.assistance.quantity")} value={quantity} onChange={(e) => setQuantity(e.target.value)} />}
            </div>
          )}
          <TextAreaField id={`note-${id}`} label={t("field.team.reason")} requiredLabel={t("common.requiredMarker")} value={note} onChange={(e) => setNote(e.target.value)} />
          <Button
            size="sm"
            disabled={Boolean(pending)}
            onClick={() =>
              void run(
                open,
                () => (open === "cancel" ? cancelFieldTask(id, note) : updateFieldTask(id, { dueAt: due || undefined, quantity: quantity ? Number(quantity) : undefined }, note)),
                open === "cancel" ? t("field.team.cancelled") : t("field.team.changed"),
              ).then(() => (setNote(""), setOpen(null)))
            }
          >
            {t("common.confirm")}
          </Button>
        </div>
      )}
      <Feedback error={error} success={success} />
    </div>
  );
}

function ReviewItem({ item }: { item: FieldReviewItem }) {
  const { t, formatDate } = useI18n();
  const lk = useLookups();
  const { run, pending, error, success } = useFieldAction();
  const [field, setField] = useState<FieldReportField | "">("");
  const [note, setNote] = useState("");
  const reviewable = ["synced", "needs_review"].includes(item.status);
  const c = item.content;
  return (
    <li className={styles.item}>
      <span className={styles.itemTop}>
        <span className={styles.itemTitle}>{item.title}</span>
        <StatusBadge entity="fieldReport" status={item.status} />
      </span>
      <span className={styles.itemMeta}>
        <span className={styles.ref}>{item.ref}</span>
        <span>{item.submittedBy}</span>
        <span>{formatDate(item.collectedAt, true)}</span>
      </span>
      {c && (
        <details>
          <summary className={styles.small}>{t("field.team.showReport")}</summary>
          <KV
            items={[
              { label: t("field.reports.fields.location"), value: lk.servicePointName(c.servicePointId) },
              { label: t("field.reports.fields.reached"), value: t("field.reports.reachedValue", { women: c.reached.women, men: c.reached.men, children: c.reached.children }) },
              { label: t("field.reports.fields.observations"), value: c.observations, wide: true },
              { label: t("field.reports.fields.workCompleted"), value: c.workCompleted, wide: true },
              { label: t("field.reports.fields.gps"), value: c.gps ? `${c.gps.lat.toFixed(4)}, ${c.gps.lng.toFixed(4)} ±${c.gps.accuracyM} m` : c.gpsUnavailableReason ?? "—", wide: true },
            ]}
          />
        </details>
      )}
      {reviewable && item.kind === "report" && (
        <div className={styles.stack} style={{ gap: 8 }}>
          <div className={styles.row2}>
            <SelectField id={`rv-field-${item.id}`} label={t("field.team.fieldToFix")} value={field} onChange={(e) => setField(e.target.value as FieldReportField | "")}>
              <option value="">{t("field.team.noField")}</option>
              {RETURNABLE_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {t(`field.fieldNames.${f}` as MessageKey)}
                </option>
              ))}
            </SelectField>
          </div>
          <TextAreaField id={`rv-note-${item.id}`} label={t("field.team.comment")} requiredLabel={t("common.requiredMarker")} value={note} onChange={(e) => setNote(e.target.value)} />
          <div className={styles.actions}>
            <Button size="sm" variant="secondary" icon="arrowLeft" disabled={Boolean(pending)} onClick={() => void run("return", () => supervisorReturnReport(item.id, field || undefined, note), t("field.team.returned"))}>
              {t("field.team.return")}
            </Button>
            <Button size="sm" icon="check" disabled={Boolean(pending)} onClick={() => void run("endorse", () => supervisorEndorseReport(item.id, note), t("field.team.endorsed"))}>
              {t("field.team.endorse")}
            </Button>
          </div>
          <p className={`${styles.small} ${styles.muted}`}>{t("field.team.reviewNote")}</p>
        </div>
      )}
      <Feedback error={error} success={success} />
    </li>
  );
}

export function TeamView() {
  const { t, formatDate } = useI18n();
  const { snapshot } = useFieldData();
  const { online } = useConnectivity();
  const lk = useLookups();
  const { run, error, success } = useFieldAction();
  if (!snapshot) return null;
  if (!snapshot.account.permissions.includes("work.assign")) {
    return (
      <div className={styles.stack}>
        <PageHead title={t("field.denied.permissionTitle")} />
        <Notice tone="warning">{t("field.denied.permissionBody")}</Notice>
      </div>
    );
  }
  if (!online || !snapshot.team) {
    return (
      <div className={styles.stack}>
        <PageHead title={t("field.team.title")} intro={t("field.team.intro")} />
        <NeedsConnection>{t("field.team.needsConnection")}</NeedsConnection>
      </div>
    );
  }
  const team = snapshot.team;
  const teamIds = new Set(team.officers.map((o) => o.id));
  const teamTasks = snapshot.tasks.filter((task) => teamIds.has(task.assignedTo));

  return (
    <div className={styles.stack}>
      <PageHead title={t("field.team.title")} intro={t("field.team.intro")} />
      <AssignForm />

      <section className={styles.stack} aria-labelledby="team-tasks">
        <h2 id="team-tasks" className={styles.cardTitle}>
          {t("field.team.tasks")}
        </h2>
        {team.officers.map((o) => (
          <div key={o.id} className={styles.card}>
            <h3 className={styles.cardTitle}>{o.name}</h3>
            <ul className={styles.list}>
              {teamTasks
                .filter((task) => task.assignedTo === o.id)
                .map((task) => (
                  <li key={task.id} className={styles.item}>
                    <span className={styles.itemTop}>
                      <span className={styles.itemTitle}>{task.title}</span>
                      <PriorityBadge priority={task.priority} />
                    </span>
                    <span className={styles.itemMeta}>
                      <span>{t(`field.taskKind.${task.kind}` as MessageKey)}</span>
                      <span className={styles.ref}>{task.ref}</span>
                      <span>{t("field.work.due", { date: formatDate(task.dueAt, true) })}</span>
                      <span>{t(`field.taskStatus.${task.status}` as MessageKey)}</span>
                      <span>v{task.version}</span>
                      {task.maskedHousehold && <span>{task.maskedHousehold}</span>}
                    </span>
                    {!["completed", "cancelled"].includes(task.status) && <TaskActions id={task.id} hasAllocation={Boolean(task.maskedHousehold)} />}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>

      <section className={styles.stack} aria-labelledby="team-review">
        <h2 id="team-review" className={styles.cardTitle}>
          {t("field.team.review")}
        </h2>
        {team.reviewQueue.length === 0 && <p className={styles.muted}>{t("field.team.reviewNone")}</p>}
        <ul className={styles.list}>
          {team.reviewQueue.map((item) => (
            <ReviewItem key={item.id} item={item} />
          ))}
        </ul>
      </section>

      <section className={styles.stack} aria-labelledby="team-issues">
        <h2 id="team-issues" className={styles.cardTitle}>
          {t("field.team.issues")}
        </h2>
        <ul className={styles.list}>
          {team.issues.map((i) => (
            <li key={i.id} className={styles.item}>
              <span className={styles.itemTop}>
                <span className={styles.itemTitle}>{t(`field.issues.categories.${i.category}` as MessageKey)}</span>
                <Badge tone="info">{t(`field.issueStatus.${i.status}` as MessageKey)}</Badge>
              </span>
              <span className={styles.itemMeta}>
                <span className={styles.ref}>{i.ref}</span>
                <span>{i.raisedBy}</span>
                <span>{i.routedTo}</span>
              </span>
              {i.restricted ? <p className={`${styles.small} ${styles.muted}`}>{t("field.team.restrictedIssue")}</p> : <p className={styles.small}>{i.description}</p>}
              {!i.restricted && i.category !== "referral" && !["resolved", "closed"].includes(i.status) && (
                <div className={styles.actions}>
                  <Button size="sm" variant="secondary" onClick={() => void run(i.id, () => updateFieldIssueStatus(i.id, i.status === "received" ? "in_progress" : "resolved", t("field.team.issueNote")), t("field.team.issueUpdated"))}>
                    {i.status === "received" ? t("field.team.startIssue") : t("field.team.resolveIssue")}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
        <Feedback error={error} success={success} />
      </section>
      <p className={`${styles.small} ${styles.muted}`}>{t("field.team.scope", { settlement: lk.settlementName(snapshot.settlements[0]?.id) })}</p>
    </div>
  );
}
