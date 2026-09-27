"use client";

import type {
  AssistanceRecord,
  Attachment,
  BeneficiaryVerification,
  BeneficiaryVerificationStatus,
  CaseServiceType,
  DemoState,
  FieldIssue,
  FieldIssueCategory,
  FieldReport,
  FieldTask,
  Priority,
  ServiceCase,
} from "@/lib/types";
import { addAudit, addNotification, getState, mutate, newId } from "@/lib/demo/store";
import { DAY_MS, delay, now, ServiceError } from "./core";
import { validateReport } from "./fieldReports";
import { recordRun } from "./external";
import { BENEFICIARY_REF, earlierAssistance, normaliseRef, runDuplicateCheck, RUN_OUTCOME, scriptedOutcome, VERIFY_DETAIL } from "./partnerField";
import { maskReference, nextRef } from "./partnerContext";
import { fieldAudit, fieldContext, notifyFieldUser, ownTask, reportableIntervention, requireFieldPermission, type FieldContext } from "./fieldContext";

/**
 * The central system's side of field synchronisation. In production these are
 * API endpoints; here they write to the shared demonstration store, which is
 * what the OPM and Partner portals read.
 *
 * Every upload carries the device record id (`clientRecordId`). If the same
 * record arrives twice — for example because the connection dropped after the
 * server saved it but before the device heard back — the existing record is
 * returned and nothing is created twice. That is what makes retries safe.
 *
 * Three outcomes: accepted; rejected by validation (nothing is stored
 * centrally, the device keeps the record and shows what to fix); or a version
 * conflict (the central copy changed after the device's copy was taken;
 * nothing is overwritten until the officer decides).
 */

export type FieldSyncErrorCode =
  | "FORM_VERSION_RETIRED"
  | "COLLECTION_CLOSED"
  | "MISSING_ANSWERS"
  | "MISSING_FIELDS"
  | "NOT_ASSIGNED"
  | "INTERVENTION_CLOSED"
  | "INVALID_REFERENCE"
  | "NOT_RETURNED"
  | "TASK_CANCELLED"
  | "PERMISSION";

export interface TaskConflict {
  taskId: string;
  taskRef: string;
  baseVersion: number;
  centralVersion: number;
  changes: { field: string; base: string; central: string; local: string }[];
  changedBy: string;
  changedAt: string;
  note: string;
}

export type SyncResult =
  | { outcome: "accepted"; centralId: string; ref: string; status: string; replayed: boolean; flagged?: boolean; detail?: string }
  | { outcome: "rejected"; code: FieldSyncErrorCode; fields: string[]; params?: Record<string, string | number> }
  | { outcome: "conflict"; conflict: TaskConflict };

const reject = (code: FieldSyncErrorCode, fields: string[] = [], params?: Record<string, string | number>): SyncResult => ({ outcome: "rejected", code, fields, params });

/** Access errors become validation rejections the officer can read, rather than crashing the sync. */
function guarded(run: () => SyncResult): SyncResult {
  try {
    return run();
  } catch (err) {
    if (err instanceof ServiceError) {
      if (err.code === "NOT_PARTNER_RECORD" || err.code === "NOT_FOUND") return reject("NOT_ASSIGNED");
      if (err.code === "INTERVENTION_NOT_APPROVED") return reject("INTERVENTION_CLOSED");
      if (err.code === "FORBIDDEN") return reject("PERMISSION");
    }
    throw err;
  }
}

/* ============================================================ Visit reports */

export interface VisitPayload {
  clientRecordId: string;
  /** Present when resubmitting a returned report: the central report and this revision's id. */
  resubmissionOf?: string;
  clientRevisionId?: string;
  correctionNote?: string;
  taskId?: string;
  kind: "site_visit" | "activity_update";
  title: string;
  interventionId: string;
  visitAt: string;
  activityType: string;
  servicePointId: string;
  locationNote: string;
  observations: string;
  workCompleted: string;
  reached: { women: number; men: number; children: number };
  indicatorValues: { indicatorId: string; value: number }[];
  challenges: string;
  followUp: string;
  gps?: { lat: number; lng: number; accuracyM: number };
  gpsUnavailableReason?: string;
  attachments: Omit<Attachment, "id">[];
  collectedOffline: boolean;
}

function visitMissing(draft: DemoState, p: VisitPayload): string[] {
  const missing: string[] = [];
  const i = draft.interventions.find((x) => x.id === p.interventionId);
  const t = new Date(p.visitAt).getTime();
  if (!p.visitAt || Number.isNaN(t) || t > Date.now() + 60 * 60 * 1000) missing.push("visitAt");
  if (!p.activityType.trim()) missing.push("activityType");
  if (!p.servicePointId || (i && !i.servicePointIds.includes(p.servicePointId))) missing.push("location");
  if (!p.gps && !p.gpsUnavailableReason?.trim()) missing.push("gps");
  if (!p.observations.trim()) missing.push("observations");
  if (!p.workCompleted.trim()) missing.push("workCompleted");
  const r = p.reached;
  if ([r.women, r.men, r.children].some((n) => !Number.isFinite(n) || n < 0)) missing.push("reached");
  if (i && p.indicatorValues.some((v) => !i.indicatorTargets.some((x) => x.indicatorId === v.indicatorId) || !Number.isFinite(v.value) || v.value < 0)) missing.push("indicators");
  return missing;
}

function formFor(draft: DemoState, kind: FieldReport["kind"], interventionId: string) {
  const preferred = kind === "site_visit" ? "frm-visit" : "frm-activity";
  const form =
    draft.forms.find((f) => f.id === preferred && f.interventionIds.includes(interventionId)) ??
    draft.forms.find((f) => f.kind === kind && f.interventionIds.includes(interventionId)) ??
    draft.forms.find((f) => f.id === preferred)!;
  const version = form.versions.find((v) => v.status === "published") ?? form.versions[form.versions.length - 1];
  return { form, version };
}

function applyVisit(r: FieldReport, p: VisitPayload) {
  r.title = p.title.trim() || r.title;
  r.kind = p.kind;
  r.collectedAt = new Date(p.visitAt).toISOString();
  r.activityType = p.activityType.trim();
  r.servicePointId = p.servicePointId;
  r.locationNote = p.locationNote.trim() || undefined;
  r.narrative = p.observations.trim();
  r.outputs = p.workCompleted.trim();
  r.reached = { women: Math.round(p.reached.women), men: Math.round(p.reached.men), children: Math.round(p.reached.children) };
  r.indicatorValues = p.indicatorValues.filter((v) => v.value > 0).map((v) => ({ indicatorId: v.indicatorId, value: Math.round(v.value) }));
  r.challenges = p.challenges.trim() || undefined;
  r.followUpActions = p.followUp.trim() || undefined;
  r.gps = p.gps ? { lat: p.gps.lat, lng: p.gps.lng, accuracyM: Math.max(1, Math.round(p.gps.accuracyM || 10)) } : undefined;
  r.gpsUnavailableReason = p.gps ? undefined : p.gpsUnavailableReason?.trim();
  r.attachments = p.attachments.map((a, index) => ({ id: `at${index + 1}`, name: a.name, kind: a.kind, sizeKb: a.sizeKb }));
}

function snapshot(r: FieldReport, by: string, note: string, clientRevisionId?: string) {
  r.history = [
    ...(r.history ?? []),
    {
      version: (r.history ?? []).length + 1,
      at: now(),
      by,
      note,
      reached: { ...r.reached },
      indicatorValues: r.indicatorValues.map((v) => ({ ...v })),
      narrative: r.narrative,
      outputs: r.outputs,
      answers: r.answers?.map((a) => ({ ...a })),
      clientRevisionId,
    },
  ];
}

/** Server-side checks on arrival. Soft issues (GPS far from the settlement, missing photo) go to review; they never reject. */
function arrive(draft: DemoState, r: FieldReport, correction = false) {
  r.syncedAt = now();
  r.validationIssues = validateReport(draft, r, r.syncedAt);
  if (correction) r.validationIssues = r.validationIssues.filter((c) => c !== "late_submission");
  r.status = r.validationIssues.length ? "needs_review" : "synced";
  r.updatedAt = now();
}

function linkTask(draft: DemoState, ctx: FieldContext, taskId: string | undefined, recordId: string, status: FieldTask["status"], note: string) {
  if (!taskId) return;
  const task = draft.fieldTasks.find((t) => t.id === taskId && t.assignedTo === ctx.user.id);
  if (!task || task.status === "cancelled") return;
  if (!task.linkedIds.includes(recordId)) task.linkedIds.push(recordId);
  if (task.status !== status && task.status !== "completed") {
    task.version += 1;
    task.versions.push({ version: task.version, at: now(), by: ctx.actor, note, changes: [{ field: "status", from: task.status, to: status }] });
    task.status = status;
  }
  task.updatedAt = now();
}

export async function receiveVisitReport(p: VisitPayload): Promise<SyncResult> {
  await delay(150);
  const ctx = fieldContext();
  return mutate((draft) =>
    guarded(() => {
      requireFieldPermission(ctx, "visits.report");
      const replay = draft.fieldReports.find((r) => r.clientRecordId === p.clientRecordId && r.createdByUserId === ctx.user.id);

      if (p.resubmissionOf) {
        const r = draft.fieldReports.find((x) => x.id === p.resubmissionOf && x.createdByUserId === ctx.user.id);
        if (!r) return reject("NOT_ASSIGNED");
        if (p.clientRevisionId && (r.history ?? []).some((h) => h.clientRevisionId === p.clientRevisionId)) {
          return { outcome: "accepted", centralId: r.id, ref: r.ref, status: r.status, replayed: true };
        }
        if (r.status !== "returned") return reject("NOT_RETURNED", [], { ref: r.ref });
        reportableIntervention(draft, ctx, r.interventionId);
        const missing = visitMissing(draft, p);
        if (missing.length) return reject("MISSING_FIELDS", missing);
        applyVisit(r, p);
        const note = p.correctionNote?.trim() || "Corrected and resubmitted from the field.";
        snapshot(r, ctx.actor, note, p.clientRevisionId);
        r.comments.push({ id: newId("c"), at: now(), author: `${ctx.actor}, ${ctx.organisation.acronym || ctx.organisation.name}`, text: note });
        arrive(draft, r, true);
        fieldAudit(draft, ctx, "fieldReportResubmittedFromField", "fieldReport", r.id, r.ref, {}, { note });
        addNotification(draft, { kind: "assigned_review", message: "fieldReportResubmitted", params: { ref: r.ref, partner: ctx.organisation.name }, entity: "fieldReport", entityId: r.id });
        return { outcome: "accepted", centralId: r.id, ref: r.ref, status: r.status, replayed: false };
      }

      if (replay) return { outcome: "accepted", centralId: replay.id, ref: replay.ref, status: replay.status, replayed: true };
      const i = reportableIntervention(draft, ctx, p.interventionId);
      if (p.taskId) ownTask(draft, ctx, p.taskId);
      const missing = visitMissing(draft, p);
      if (missing.length) return reject("MISSING_FIELDS", missing);
      const { form, version } = formFor(draft, p.kind, i.id);
      const r: FieldReport = {
        id: newId("fr"),
        ref: nextRef(draft.fieldReports.map((x) => x.ref), "FR-2026-"),
        title: p.title.trim(),
        kind: p.kind,
        interventionId: i.id,
        formId: form.id,
        formVersion: version.version,
        submittedBy: ctx.actor,
        channel: p.collectedOffline ? "offline" : "online",
        collectedAt: now(),
        reached: { women: 0, men: 0, children: 0 },
        indicatorValues: [],
        distributed: [],
        attachments: [],
        narrative: "",
        status: "synced",
        validationIssues: [],
        comments: [],
        pendingReviewIds: [],
        updatedAt: now(),
        createdByUserId: ctx.user.id,
        clientRecordId: p.clientRecordId,
        taskId: p.taskId,
      };
      applyVisit(r, p);
      snapshot(r, ctx.actor, p.collectedOffline ? "Collected offline and synced from the field device." : "Submitted from the field device.", p.clientRevisionId);
      draft.fieldReports.push(r);
      arrive(draft, r);
      fieldAudit(draft, ctx, "fieldReportReceivedFromField", "fieldReport", r.id, r.ref, { channel: r.channel });
      addNotification(draft, { kind: "assigned_review", message: "fieldReportSubmitted", params: { ref: r.ref, partner: ctx.organisation.name }, entity: "fieldReport", entityId: r.id });
      linkTask(draft, ctx, p.taskId, r.id, "submitted", `Report ${r.ref} submitted.`);
      return { outcome: "accepted", centralId: r.id, ref: r.ref, status: r.status, replayed: false };
    }),
  );
}

/* ========================================================= Survey responses */

export interface SurveyPayload {
  clientRecordId: string;
  taskId?: string;
  interventionId: string;
  formId: string;
  formVersion: number;
  answers: { questionId: string; value: string }[];
  collectedAt: string;
  collectedOffline: boolean;
  /** Answers first collected on an older version and moved to this one by the officer. */
  migratedFrom?: { version: number };
}

export async function receiveSurveyResponse(p: SurveyPayload): Promise<SyncResult> {
  await delay(150);
  const ctx = fieldContext();
  return mutate((draft) =>
    guarded(() => {
      requireFieldPermission(ctx, "surveys.collect");
      const replay = draft.fieldReports.find((r) => r.clientRecordId === p.clientRecordId && r.createdByUserId === ctx.user.id);
      if (replay) return { outcome: "accepted", centralId: replay.id, ref: replay.ref, status: replay.status, replayed: true };
      const i = reportableIntervention(draft, ctx, p.interventionId);
      if (p.taskId) ownTask(draft, ctx, p.taskId);
      const form = draft.forms.find((f) => f.id === p.formId && f.interventionIds.includes(i.id));
      if (!form) return reject("NOT_ASSIGNED");
      const version = form.versions.find((v) => v.version === p.formVersion);
      const current = form.versions.find((v) => v.status === "published");
      if (!version || version.status === "draft") return reject("FORM_VERSION_RETIRED", [], { version: p.formVersion, current: current?.version ?? 0 });
      // A response collected before a version was retired stays valid; one collected after it cannot be accepted.
      if (version.retiredAt && version.retiredAt <= p.collectedAt) {
        return reject("FORM_VERSION_RETIRED", [], { version: p.formVersion, current: current?.version ?? 0, retiredAt: version.retiredAt });
      }
      if (p.collectedAt > form.deploymentEnd || p.collectedAt < new Date(new Date(form.deploymentStart).getTime() - DAY_MS).toISOString()) return reject("COLLECTION_CLOSED");
      const answers = new Map(p.answers.map((a) => [a.questionId, a.value.trim()]));
      const missing = version.questions
        .filter((q) => {
          const value = answers.get(q.id) ?? "";
          if (q.required && !value) return true;
          return Boolean(value) && q.type === "number" && !(Number.isFinite(Number(value)) && Number(value) >= 0);
        })
        .map((q) => q.id);
      if (missing.length) return reject("MISSING_ANSWERS", missing);
      const r: FieldReport = {
        id: newId("fr"),
        ref: nextRef(draft.fieldReports.map((x) => x.ref), "FR-2026-"),
        title: `${form.title} response`,
        kind: "survey",
        interventionId: i.id,
        formId: form.id,
        formVersion: version.version,
        servicePointId: i.servicePointIds[0],
        submittedBy: ctx.actor,
        channel: p.collectedOffline ? "offline" : "online",
        collectedAt: p.collectedAt,
        reached: { women: 0, men: 0, children: 0 },
        indicatorValues: version.questions
          .filter((q) => q.indicatorId && q.type === "number" && i.indicatorTargets.some((t) => t.indicatorId === q.indicatorId))
          .map((q) => ({ indicatorId: q.indicatorId!, value: Number(answers.get(q.id) || 0) }))
          .filter((v) => v.value > 0),
        distributed: [],
        attachments: [],
        narrative: `Survey response on ${form.ref} version ${version.version}.`,
        outputs: `${[...answers.values()].filter(Boolean).length} answers recorded.`,
        answers: version.questions.map((q) => ({ questionId: q.id, value: answers.get(q.id) ?? "" })),
        status: "synced",
        validationIssues: [],
        comments: [],
        pendingReviewIds: [],
        updatedAt: now(),
        createdByUserId: ctx.user.id,
        clientRecordId: p.clientRecordId,
        taskId: p.taskId,
      };
      snapshot(
        r,
        ctx.actor,
        p.migratedFrom
          ? `Collected on version ${p.migratedFrom.version} on the device; that version was retired while the device was offline, so the officer moved the answers to version ${version.version}. The device keeps the original copy.`
          : p.collectedOffline
            ? "Collected offline and synced from the field device."
            : "Submitted from the field device.",
      );
      draft.fieldReports.push(r);
      arrive(draft, r);
      fieldAudit(draft, ctx, "surveyResponseReceivedFromField", "fieldReport", r.id, r.ref, { form: form.ref, version: version.version });
      linkTask(draft, ctx, p.taskId, r.id, "submitted", `Survey response ${r.ref} submitted.`);
      return { outcome: "accepted", centralId: r.id, ref: r.ref, status: r.status, replayed: false };
    }),
  );
}

/* =============================================================== Assistance */

export interface AssistancePayload {
  clientRecordId: string;
  taskId?: string;
  /** Task version the device copy was taken from. */
  baseTaskVersion?: number;
  interventionId: string;
  householdRef: string;
  assistanceType: string;
  quantity: number;
  unit: string;
  valueUsd?: number;
  deliveredAt: string;
  servicePointId: string;
  evidence: Omit<Attachment, "id">[];
  note: string;
  /** Device id of the verification request made for this delivery, if any. */
  verificationClientId?: string;
  collectedOffline: boolean;
  /** The officer's decision after a version conflict, taken against a specific central version. */
  resolution?: { choice: "keep_mine" | "use_central"; againstVersion: number; note: string };
}

const DELIVERY_FIELDS = new Set(["quantity", "assistanceType", "householdRef", "unit", "servicePointId"]);

function taskValue(task: FieldTask, field: string): string {
  if (field === "quantity") return String(task.allocation?.quantity ?? "");
  if (field === "servicePointId") return task.servicePointId ?? "";
  return String((task.allocation as unknown as Record<string, unknown> | undefined)?.[field] ?? "");
}

export async function receiveAssistance(p: AssistancePayload): Promise<SyncResult> {
  await delay(150);
  const ctx = fieldContext();
  return mutate((draft) =>
    guarded(() => {
      requireFieldPermission(ctx, "assistance.record");
      const replay = draft.assistance.find((a) => a.clientRecordId === p.clientRecordId && a.partnerId === ctx.organisation.id);
      if (replay) return { outcome: "accepted", centralId: replay.id, ref: replay.ref, status: replay.status, replayed: true, flagged: Boolean(replay.reviewId) };
      const i = reportableIntervention(draft, ctx, p.interventionId);
      const ref = normaliseRef(p.householdRef);
      const missing: string[] = [];
      if (!BENEFICIARY_REF.test(ref)) return reject("INVALID_REFERENCE", ["householdRef"]);
      if (!p.assistanceType.trim()) missing.push("assistanceType");
      if (!(p.quantity > 0)) missing.push("quantity");
      if (!p.unit.trim()) missing.push("unit");
      if (!p.servicePointId || !i.servicePointIds.includes(p.servicePointId)) missing.push("servicePoint");
      const t = new Date(p.deliveredAt).getTime();
      if (!p.deliveredAt || Number.isNaN(t) || t > Date.now() + 60 * 60 * 1000) missing.push("deliveredAt");
      if (missing.length) return reject("MISSING_FIELDS", missing);

      let task: FieldTask | undefined;
      let merged = "";
      if (p.taskId) {
        task = ownTask(draft, ctx, p.taskId);
        if (task.assignedTo !== ctx.user.id) return reject("NOT_ASSIGNED");
        if (task.status === "cancelled") return reject("TASK_CANCELLED", [], { ref: task.ref });
        if (task.allocation && normaliseRef(task.allocation.householdRef) !== ref) return reject("INVALID_REFERENCE", ["householdRef"]);
        const base = p.baseTaskVersion ?? task.version;
        if (base !== task.version) {
          const since = task.versions.filter((v) => v.version > base);
          const relevant = since.flatMap((v) => v.changes).filter((c) => DELIVERY_FIELDS.has(c.field));
          const resolved = p.resolution && p.resolution.againstVersion === task.version;
          if (relevant.length > 0 && !resolved) {
            const last = since[since.length - 1];
            const firstChange = (field: string) => relevant.find((c) => c.field === field)!;
            const local: Record<string, string> = { quantity: String(p.quantity), assistanceType: p.assistanceType, householdRef: maskReference(ref), unit: p.unit, servicePointId: p.servicePointId };
            return {
              outcome: "conflict",
              conflict: {
                taskId: task.id,
                taskRef: task.ref,
                baseVersion: base,
                centralVersion: task.version,
                changes: [...new Set(relevant.map((c) => c.field))].map((field) => ({ field, base: firstChange(field).from, central: taskValue(task!, field), local: local[field] ?? "" })),
                changedBy: last.by,
                changedAt: last.at,
                note: last.note,
              },
            };
          }
          // Changes that do not touch the delivery (due date, priority, instructions) merge without asking.
          merged = relevant.length === 0 ? ` Merged with task version ${task.version}.` : "";
        }
      }

      const verification = p.verificationClientId ? draft.verifications.find((v) => v.clientRecordId === p.verificationClientId && v.partnerId === ctx.organisation.id) : undefined;
      const record: AssistanceRecord = {
        id: newId("as"),
        ref: nextRef(draft.assistance.map((x) => x.ref), "AS-2026-"),
        partnerId: ctx.organisation.id,
        interventionId: i.id,
        verificationId: verification?.id,
        beneficiaryRef: ref,
        assistanceType: p.assistanceType.trim(),
        quantity: p.quantity,
        unit: p.unit.trim(),
        valueUsd: p.valueUsd,
        deliveredAt: new Date(p.deliveredAt).toISOString(),
        settlementId: i.settlementId,
        servicePointId: p.servicePointId,
        responsibleStaff: ctx.actor,
        recordedBy: ctx.actor,
        recordedAt: now(),
        status: "recorded",
        clientRecordId: p.clientRecordId,
        taskId: task?.id,
        evidence: p.evidence.map((a, index) => ({ id: `ev${index + 1}`, name: a.name, kind: a.kind, sizeKb: a.sizeKb })),
        note: p.note.trim() || undefined,
        channel: p.collectedOffline ? "offline" : "online",
      };
      const earlier = earlierAssistance(draft, record);
      draft.assistance.push(record);
      fieldAudit(draft, ctx, "assistanceRecorded", "assistance", record.id, record.ref, { type: record.assistanceType, quantity: record.quantity, partner: ctx.organisation.name });
      const flagged = runDuplicateCheck(draft, record, earlier, verification, ctx.organisation.name);

      if (task) {
        const allocated = task.allocation?.quantity;
        const differs = allocated !== undefined && allocated !== p.quantity;
        const resolutionNote = p.resolution ? ` Conflict resolved by the officer (${p.resolution.choice === "keep_mine" ? "kept the delivery as recorded" : "used the central version"}): ${p.resolution.note}` : "";
        task.version += 1;
        task.versions.push({
          version: task.version,
          at: now(),
          by: ctx.actor,
          note: `Delivery ${record.ref} recorded.${merged}${resolutionNote}`,
          changes: [
            { field: "status", from: task.status, to: "completed" },
            { field: "delivered", from: "", to: `${p.quantity} ${p.unit}` },
          ],
        });
        task.status = "completed";
        task.linkedIds.push(record.id);
        task.updatedAt = now();
        if (p.resolution) {
          fieldAudit(draft, ctx, "fieldConflictResolved", "fieldTask", task.id, task.ref, { choice: p.resolution.choice, version: task.version }, { note: p.resolution.note, category: "decision" });
        }
        if (differs) {
          // The difference goes to the supervisor to check. Nobody is labelled, and the delivery stands.
          for (const sup of draft.users.filter((u) => u.role === "field_supervisor" && u.fieldOrganisationId === ctx.organisation.id && u.scope.ids.includes(task!.settlementId))) {
            notifyFieldUser(draft, sup.id, "assigned_review", "fieldAllocationDifference", { ref: task.ref, delivered: p.quantity, allocated: allocated ?? 0 }, "fieldTask", task.id);
          }
        }
      }
      return { outcome: "accepted", centralId: record.id, ref: record.ref, status: record.status, replayed: false, flagged };
    }),
  );
}

/* ============================================================ Verification */

export interface VerificationPayload {
  clientRecordId: string;
  interventionId: string;
  beneficiaryRef: string;
  householdSize?: number;
  purpose: string;
  consent: boolean;
  queuedOffline: boolean;
}

/** Runs the SIMULATED ProGres v4 check. Never a real UNHCR verification. */
function runProgres(draft: DemoState, v: BeneficiaryVerification): BeneficiaryVerificationStatus {
  const outcome = scriptedOutcome(v);
  recordRun(draft, {
    integrationId: "progres",
    operation: `Field verification ${maskReference(v.beneficiaryRef)}`,
    trigger: v.attempts > 0 ? "retry" : "workflow",
    outcome: RUN_OUTCOME[outcome],
    records: outcome === "unavailable" ? 0 : 1,
    errors: outcome === "unavailable" ? 1 : 0,
    message: VERIFY_DETAIL[outcome],
    related: { entity: "verification", id: v.id },
  });
  v.status = outcome;
  v.detail = VERIFY_DETAIL[outcome];
  v.resultAt = now();
  v.attempts += 1;
  addAudit(draft, { actor: null, action: "beneficiaryVerificationResult", category: "integration", params: { name: v.ref, outcome }, entity: "verification", entityId: v.id, entityRef: v.ref, simulated: true });
  return outcome;
}

export async function receiveVerification(p: VerificationPayload): Promise<SyncResult> {
  await delay(900);
  const ctx = fieldContext();
  return mutate((draft) =>
    guarded(() => {
      requireFieldPermission(ctx, "beneficiaries.verify");
      const replay = draft.verifications.find((v) => v.clientRecordId === p.clientRecordId && v.partnerId === ctx.organisation.id);
      if (replay) return { outcome: "accepted", centralId: replay.id, ref: replay.ref, status: replay.status, replayed: true, detail: replay.detail };
      const i = reportableIntervention(draft, ctx, p.interventionId);
      const ref = normaliseRef(p.beneficiaryRef);
      if (!BENEFICIARY_REF.test(ref)) return reject("INVALID_REFERENCE", ["beneficiaryRef"]);
      if (!p.consent) return reject("MISSING_FIELDS", ["consent"]);
      if (!p.purpose.trim()) return reject("MISSING_FIELDS", ["purpose"]);
      const v: BeneficiaryVerification = {
        id: newId("bv"),
        ref: nextRef(draft.verifications.map((x) => x.ref), "BV-2026-"),
        partnerId: ctx.organisation.id,
        interventionId: i.id,
        beneficiaryRef: ref,
        householdSize: p.householdSize && p.householdSize > 0 ? Math.round(p.householdSize) : undefined,
        purpose: p.purpose.trim(),
        status: "pending",
        requestedAt: now(),
        requestedBy: ctx.actor,
        attempts: 0,
        simulated: true,
        clientRecordId: p.clientRecordId,
        consentConfirmed: true,
        queuedOffline: p.queuedOffline,
      };
      draft.verifications.push(v);
      fieldAudit(draft, ctx, "beneficiaryVerificationRequested", "verification", v.id, v.ref, { masked: maskReference(ref), partner: ctx.organisation.name }, { note: v.purpose });
      const status = runProgres(draft, v);
      return { outcome: "accepted", centralId: v.id, ref: v.ref, status, replayed: false, detail: v.detail };
    }),
  );
}

/** Retries an unavailable (SIMULATED) ProGres check. Needs a connection. */
export async function retryFieldVerification(centralId: string): Promise<BeneficiaryVerificationStatus> {
  await delay(900);
  const ctx = fieldContext();
  requireFieldPermission(ctx, "beneficiaries.verify");
  return mutate((draft) => {
    const v = draft.verifications.find((x) => x.id === centralId && x.partnerId === ctx.organisation.id && x.requestedBy === ctx.actor);
    if (!v) throw new ServiceError("NOT_PARTNER_RECORD");
    if (v.status !== "unavailable") throw new ServiceError("INVALID_STATE");
    return runProgres(draft, v);
  });
}

/* ================================================== Issues and referrals */

export interface IssuePayload {
  clientRecordId: string;
  category: FieldIssueCategory;
  priority: Priority;
  interventionId?: string;
  servicePointId?: string;
  locationNote: string;
  description: string;
  evidence: Omit<Attachment, "id">[];
  serviceType?: CaseServiceType;
}

/** Where each kind of issue goes. Safeguarding goes only to the protection desk and is restricted. */
export function routeFor(category: FieldIssueCategory, settlementName: string, organisation: string): { team: string; restricted: boolean } {
  switch (category) {
    case "safeguarding":
      return { team: `${settlementName} protection desk (restricted)`, restricted: true };
    case "service_gap":
      return { team: `OPM ${settlementName} settlement office`, restricted: false };
    case "infrastructure":
      return { team: `Settlement engineering (OPM ${settlementName} office)`, restricted: false };
    case "failed_distribution":
      return { team: `${organisation} programme lead and OPM ${settlementName} settlement office`, restricted: false };
    case "follow_up":
      return { team: `${organisation} settlement supervisor`, restricted: false };
    case "referral":
      return { team: `${settlementName} registration desk (caseworkers)`, restricted: true };
  }
}

export async function receiveIssue(p: IssuePayload): Promise<SyncResult> {
  await delay(150);
  const ctx = fieldContext();
  return mutate((draft) =>
    guarded(() => {
      requireFieldPermission(ctx, p.category === "referral" ? "referrals.create" : "issues.raise");
      const replay = draft.fieldIssues.find((x) => x.clientRecordId === p.clientRecordId && x.raisedByUserId === ctx.user.id);
      if (replay) return { outcome: "accepted", centralId: replay.id, ref: replay.ref, status: replay.status, replayed: true };
      const missing: string[] = [];
      if (!p.description.trim()) missing.push("description");
      if (p.category === "referral" && !p.serviceType) missing.push("serviceType");
      const settlementId = p.interventionId ? reportableIntervention(draft, ctx, p.interventionId).settlementId : ctx.settlementIds[0];
      if (!settlementId) return reject("NOT_ASSIGNED");
      if (p.servicePointId && !draft.servicePoints.some((sp) => sp.id === p.servicePointId && sp.settlementId === settlementId)) missing.push("location");
      if (missing.length) return reject("MISSING_FIELDS", missing);
      const settlementName = draft.settlements.find((s) => s.id === settlementId)?.name ?? settlementId;
      const route = routeFor(p.category, settlementName, ctx.organisation.name);
      const issue: FieldIssue = {
        id: newId("fi"),
        ref: nextRef(draft.fieldIssues.map((x) => x.ref), "FI-2026-"),
        category: p.category,
        priority: p.priority,
        settlementId,
        servicePointId: p.servicePointId || undefined,
        interventionId: p.interventionId || undefined,
        locationNote: p.locationNote.trim(),
        description: p.description.trim(),
        evidence: p.evidence.map((a, index) => ({ id: `ev${index + 1}`, name: a.name, kind: a.kind, sizeKb: a.sizeKb })),
        routedTo: route.team,
        status: "received",
        restricted: route.restricted,
        raisedByUserId: ctx.user.id,
        raisedBy: ctx.actor,
        raisedAt: now(),
        serviceType: p.serviceType,
        updates: [{ at: now(), by: ctx.actor, text: "Raised from the field.", status: "received" }],
        clientRecordId: p.clientRecordId,
        updatedAt: now(),
      };
      if (p.category === "referral" && p.serviceType) {
        // The caseworker workflow receives the need. The officer never gets access to the case itself.
        const c: ServiceCase = {
          id: newId("sc"),
          ref: nextRef(draft.cases.map((x) => x.ref), "SRV-2026-"),
          serviceType: p.serviceType,
          settlementId,
          priority: p.priority,
          receivedAt: now(),
          dueAt: new Date(Date.now() + (p.priority === "high" ? 3 : 10) * DAY_MS).toISOString(),
          status: "received",
          escalated: false,
          channel: "Field officer referral (Field Operations Portal)",
          summary: p.description.trim(),
          nextAction: "Assign a team and contact the person through the help desk.",
          requester: { name: "Not collected by the field officer", individualId: "Not collected", phone: "Not collected", household: "Not collected" },
          documents: [],
          appointments: [],
          messages: [],
          internalNotes: [],
          accessGrants: [],
          updatedAt: now(),
          referral: { fieldIssueId: issue.id, byUserId: ctx.user.id, by: ctx.actor, at: now() },
        };
        draft.cases.push(c);
        issue.caseId = c.id;
        addAudit(draft, { actor: ctx.actor, action: "fieldReferralCreated", category: "record", params: { name: c.ref, issue: issue.ref }, entity: "case", entityId: c.id, entityRef: c.ref });
        addNotification(draft, { kind: "assigned_review", message: "fieldReferralReceived", params: { ref: c.ref }, entity: "case", entityId: c.id });
      }
      draft.fieldIssues.push(issue);
      fieldAudit(draft, ctx, "fieldIssueRaised", "fieldIssue", issue.id, issue.ref, { category: issue.category, team: issue.routedTo }, { sensitive: issue.restricted });
      if (p.category === "safeguarding") {
        addNotification(draft, { kind: "assigned_review", message: "fieldSafeguardingRaised", params: { ref: issue.ref }, entity: "fieldIssue", entityId: issue.id });
      }
      if (p.category === "follow_up" || p.category === "failed_distribution") {
        for (const sup of draft.users.filter((u) => u.role === "field_supervisor" && u.fieldOrganisationId === ctx.organisation.id && u.scope.ids.includes(settlementId) && u.id !== ctx.user.id)) {
          notifyFieldUser(draft, sup.id, "assigned_review", "fieldIssueForTeam", { ref: issue.ref }, "fieldIssue", issue.id);
        }
      }
      return { outcome: "accepted", centralId: issue.id, ref: issue.ref, status: issue.status, replayed: false };
    }),
  );
}

/** Used by tests and the sync centre: the central state has not changed unless an upload was accepted. */
export function centralRecordFor(clientRecordId: string): { entity: string; ref: string } | null {
  const state = getState();
  const r = state.fieldReports.find((x) => x.clientRecordId === clientRecordId);
  if (r) return { entity: "fieldReport", ref: r.ref };
  const a = state.assistance.find((x) => x.clientRecordId === clientRecordId);
  if (a) return { entity: "assistance", ref: a.ref };
  const v = state.verifications.find((x) => x.clientRecordId === clientRecordId);
  if (v) return { entity: "verification", ref: v.ref };
  const i = state.fieldIssues.find((x) => x.clientRecordId === clientRecordId);
  if (i) return { entity: "fieldIssue", ref: i.ref };
  return null;
}
