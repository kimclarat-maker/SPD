"use client";

import type {
  AssistanceStatus,
  Attachment,
  BeneficiaryVerificationStatus,
  CaseStatus,
  FieldComment,
  FieldForm,
  FieldIssue,
  FieldIssueStatus,
  FieldPermission,
  FieldReportStatus,
  FieldTask,
  FieldTaskAllocation,
  FieldTaskKind,
  FieldTaskStatus,
  FormVersion,
  Intervention,
  NotificationKind,
  Priority,
  Sector,
  ServicePoint,
  Settlement,
} from "@/lib/types";
import { getState, mutate, newId } from "@/lib/demo/store";
import { DAY_MS, delay, now, requireNote, ServiceError } from "./core";
import { interventionProgress } from "./interventions";
import { applyFieldReportReturn, RETURNABLE_FIELDS } from "./fieldReports";
import { assistanceStatus } from "./partnerField";
import { maskReference, nextRef } from "./partnerContext";
import {
  assignedSettlements,
  fieldAudit,
  fieldContext,
  fieldHref,
  notifyFieldUser,
  ownFieldIntervention,
  ownTask,
  requireFieldPermission,
  teamMembers,
  visibleFieldInterventions,
  visibleTasks,
  type FieldContext,
} from "./fieldContext";

/**
 * Field Operations Portal reads. `buildFieldSnapshot` returns everything the
 * signed-in officer needs for their assigned work, and nothing else. The
 * device keeps the latest snapshot as its offline cache, so the same rules
 * decide what is stored on the device: assigned interventions, forms and
 * service points only; household references only for open assistance tasks;
 * the officer's own submissions with their review status.
 */

export interface FieldInterventionView {
  id: string;
  ref: string;
  title: string;
  objective: string;
  partnerName: string;
  sector: Sector;
  /** Sector names are record data (English) in this phase. */
  sectorName: string;
  settlementId: string;
  servicePointIds: string[];
  location?: string;
  status: Intervention["status"];
  startDate: string;
  endDate: string;
  targetGroup: string;
  targetReach: number;
  activities: string[];
  milestones: Intervention["milestones"];
  budgetUsd: number;
  fundingSource: string;
  reportingInstructions?: string;
  formIds: string[];
  indicatorTargets: { indicatorId: string; target: number; accepted: number }[];
  acceptedReach: number;
  acceptedReports: number;
  lastAcceptedAt?: string;
}

export interface FieldTaskView {
  id: string;
  ref: string;
  kind: FieldTaskKind;
  title: string;
  instructions: string;
  interventionId: string;
  settlementId: string;
  servicePointId?: string;
  formId?: string;
  dueAt: string;
  priority: Priority;
  status: FieldTaskStatus;
  assignedTo: string;
  assigneeName: string;
  assignedBy: string;
  version: number;
  versions: FieldTask["versions"];
  /** Present only while the task is open and the user may deliver assistance. */
  allocation?: FieldTaskAllocation;
  /** Masked reference, for lists and for tasks already delivered. */
  maskedHousehold?: string;
  /** Assistance this organisation already delivered to the task's household (never other organisations' entries). */
  householdHistory?: { assistanceType: string; quantity: number; unit: string; deliveredAt: string; ref: string }[];
  linkedIds: string[];
}

export interface FieldFormView {
  id: string;
  ref: string;
  title: string;
  purpose: string;
  kind: FieldForm["kind"];
  deploymentStart: string;
  deploymentEnd: string;
  interventionIds: string[];
  published?: FormVersion;
  /** Every version, so a response keeps the exact questions it was collected on. */
  versions: FormVersion[];
}

/** A visit or activity report's content as the central system holds it (the officer's own report). */
export interface VisitContent {
  kind: "site_visit" | "activity_update";
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
  attachments: { name: string; kind: Attachment["kind"]; sizeKb: number }[];
}

/** The officer's own report or survey response as the central system holds it. */
export interface ReportLikeSubmission {
  id: string;
  ref: string;
  clientRecordId?: string;
  title: string;
  interventionId: string;
  status: FieldReportStatus;
  collectedAt: string;
  syncedAt?: string;
  updatedAt: string;
  versions: number;
  formId: string;
  formVersion: number;
  comments: { id: string; at: string; author: string; text: string }[];
  fieldComments: FieldComment[];
  history: { version: number; at: string; by: string; note: string }[];
  taskId?: string;
  content?: VisitContent;
  answers?: { questionId: string; value: string }[];
}

/** One of the officer's own records as the central system holds it. */
export type FieldSubmission =
  | (ReportLikeSubmission & { kind: "report" })
  | (ReportLikeSubmission & { kind: "survey" })
  | {
      kind: "assistance";
      id: string;
      ref: string;
      clientRecordId?: string;
      interventionId: string;
      maskedRef: string;
      assistanceType: string;
      quantity: number;
      unit: string;
      deliveredAt: string;
      status: AssistanceStatus;
      reviewed: boolean;
      updatedAt: string;
      taskId?: string;
    }
  | {
      kind: "verification";
      id: string;
      ref: string;
      clientRecordId?: string;
      interventionId: string;
      maskedRef: string;
      status: BeneficiaryVerificationStatus;
      detail?: string;
      resultAt?: string;
      attempts: number;
      updatedAt: string;
    }
  | {
      kind: "issue";
      id: string;
      ref: string;
      clientRecordId?: string;
      category: FieldIssue["category"];
      priority: Priority;
      status: FieldIssueStatus;
      routedTo: string;
      restricted: boolean;
      /** Referral status only; the officer never sees the service case itself. */
      referralStatus?: CaseStatus;
      updates: FieldIssue["updates"];
      raisedAt: string;
      updatedAt: string;
    };

export interface FieldNotification {
  id: string;
  at: string;
  kind: NotificationKind;
  message: string;
  params: Record<string, string | number>;
  href: string;
  read: boolean;
}

export interface FieldReviewItem {
  id: string;
  ref: string;
  title: string;
  kind: "report" | "survey";
  status: FieldReportStatus;
  submittedBy: string;
  interventionId: string;
  collectedAt: string;
  totalReached: number;
  content?: VisitContent;
  answers?: { questionId: string; value: string }[];
  formVersion: number;
  comments: { id: string; at: string; author: string; text: string }[];
}

export interface FieldSnapshot {
  takenAt: string;
  userId: string;
  account: {
    name: string;
    title?: string;
    email: string;
    role: "field_officer" | "field_supervisor";
    organisation: { id: string; name: string; acronym?: string };
    permissions: FieldPermission[];
  };
  settlements: Settlement[];
  servicePoints: ServicePoint[];
  interventions: FieldInterventionView[];
  indicators: { id: string; code: string; name: string; unit: string }[];
  forms: FieldFormView[];
  tasks: FieldTaskView[];
  submissions: FieldSubmission[];
  notifications: FieldNotification[];
  /** Supervisor only, and only while online. Never cached with personal details. */
  team?: {
    officers: { id: string; name: string; permissions: FieldPermission[]; interventionIds: string[] }[];
    reviewQueue: FieldReviewItem[];
    issues: { id: string; ref: string; category: FieldIssue["category"]; priority: Priority; status: FieldIssueStatus; routedTo: string; restricted: boolean; raisedBy: string; raisedAt: string; description?: string }[];
  };
}

function taskView(ctx: FieldContext, t: FieldTask): FieldTaskView {
  const state = getState();
  const open = !["completed", "cancelled"].includes(t.status);
  const mayDeliver = ctx.permissions.includes("assistance.record") && t.assignedTo === ctx.user.id;
  const assignee = state.users.find((u) => u.id === t.assignedTo);
  const household = t.allocation?.householdRef;
  return {
    id: t.id,
    ref: t.ref,
    kind: t.kind,
    title: t.title,
    instructions: t.instructions,
    interventionId: t.interventionId,
    settlementId: t.settlementId,
    servicePointId: t.servicePointId,
    formId: t.formId,
    dueAt: t.dueAt,
    priority: t.priority,
    status: t.status,
    assignedTo: t.assignedTo,
    assigneeName: assignee?.name ?? "—",
    assignedBy: t.assignedBy,
    version: t.version,
    versions: t.versions,
    allocation: t.allocation && open && mayDeliver ? { ...t.allocation } : undefined,
    maskedHousehold: household ? maskReference(household) : undefined,
    householdHistory:
      household && open && mayDeliver
        ? state.assistance
            .filter((a) => a.beneficiaryRef === household && a.partnerId === ctx.organisation.id)
            .map((a) => ({ assistanceType: a.assistanceType, quantity: a.quantity, unit: a.unit, deliveredAt: a.deliveredAt, ref: a.ref }))
        : undefined,
    linkedIds: [...t.linkedIds],
  };
}

function interventionView(i: Intervention): FieldInterventionView {
  const state = getState();
  const progress = interventionProgress(state, i);
  return {
    id: i.id,
    ref: i.ref,
    title: i.title,
    objective: i.objective,
    partnerName: state.partners.find((p) => p.id === i.partnerId)?.name ?? "—",
    sector: i.sector,
    sectorName: state.sectors.find((s) => s.id === i.sector)?.name ?? i.sector,
    settlementId: i.settlementId,
    servicePointIds: [...i.servicePointIds],
    location: i.location,
    status: i.status,
    startDate: i.startDate,
    endDate: i.endDate,
    targetGroup: i.targetGroup,
    targetReach: i.targetReach,
    activities: [...i.activities],
    milestones: i.milestones.map((m) => ({ ...m })),
    budgetUsd: i.budgetUsd,
    fundingSource: i.fundingSource,
    reportingInstructions: i.reportingInstructions,
    formIds: state.forms.filter((f) => f.interventionIds.includes(i.id)).map((f) => f.id),
    indicatorTargets: i.indicatorTargets.map((t) => ({ ...t, accepted: progress.indicators.find((x) => x.indicatorId === t.indicatorId)?.actual ?? 0 })),
    acceptedReach: progress.reached,
    acceptedReports: progress.acceptedReports,
    lastAcceptedAt: progress.lastAcceptedAt,
  };
}

function caseStatusOf(caseId: string | undefined): CaseStatus | undefined {
  return getState().cases.find((c) => c.id === caseId)?.status;
}

function submissions(ctx: FieldContext): FieldSubmission[] {
  const state = getState();
  const mine = (id?: string) => id === ctx.user.id;
  const list: FieldSubmission[] = [];
  for (const r of state.fieldReports.filter((x) => mine(x.createdByUserId) && x.status !== "draft")) {
    const base: ReportLikeSubmission = {
      id: r.id,
      ref: r.ref,
      clientRecordId: r.clientRecordId,
      title: r.title,
      interventionId: r.interventionId,
      status: r.status,
      collectedAt: r.collectedAt,
      syncedAt: r.syncedAt,
      updatedAt: r.updatedAt,
      versions: (r.history ?? []).length,
      formId: r.formId,
      formVersion: r.formVersion,
      comments: r.comments.map((c) => ({ id: c.id, at: c.at, author: c.author, text: c.text })),
      fieldComments: (r.fieldComments ?? []).map((c) => ({ ...c })),
      history: (r.history ?? []).map((h) => ({ version: h.version, at: h.at, by: h.by, note: h.note })),
      taskId: r.taskId,
      content:
        r.kind === "survey"
          ? undefined
          : {
              kind: r.kind === "activity_update" ? "activity_update" : "site_visit",
              visitAt: r.collectedAt,
              activityType: r.activityType ?? "",
              servicePointId: r.servicePointId ?? "",
              locationNote: r.locationNote ?? "",
              observations: r.narrative,
              workCompleted: r.outputs ?? "",
              reached: { ...r.reached },
              indicatorValues: r.indicatorValues.map((v) => ({ ...v })),
              challenges: r.challenges ?? "",
              followUp: r.followUpActions ?? "",
              gps: r.gps ? { ...r.gps } : undefined,
              gpsUnavailableReason: r.gpsUnavailableReason,
              attachments: r.attachments.map((a) => ({ name: a.name, kind: a.kind, sizeKb: a.sizeKb })),
            },
      answers: r.answers?.map((a) => ({ ...a })),
    };
    list.push(r.kind === "survey" ? { ...base, kind: "survey" } : { ...base, kind: "report" });
  }
  const officerName = ctx.user.name;
  for (const a of state.assistance.filter((x) => x.partnerId === ctx.organisation.id && x.recordedBy === officerName)) {
    const status = assistanceStatus(state, a);
    list.push({
      kind: "assistance",
      id: a.id,
      ref: a.ref,
      clientRecordId: a.clientRecordId,
      interventionId: a.interventionId,
      maskedRef: maskReference(a.beneficiaryRef),
      assistanceType: a.assistanceType,
      quantity: a.quantity,
      unit: a.unit,
      deliveredAt: a.deliveredAt,
      status,
      reviewed: status === "cleared" || status === "corrected",
      updatedAt: a.recordedAt,
      taskId: a.taskId,
    });
  }
  for (const v of state.verifications.filter((x) => x.partnerId === ctx.organisation.id && x.requestedBy === officerName)) {
    list.push({
      kind: "verification",
      id: v.id,
      ref: v.ref,
      clientRecordId: v.clientRecordId,
      interventionId: v.interventionId,
      maskedRef: maskReference(v.beneficiaryRef),
      status: v.status,
      detail: v.detail,
      resultAt: v.resultAt,
      attempts: v.attempts,
      updatedAt: v.resultAt ?? v.requestedAt,
    });
  }
  for (const i of state.fieldIssues.filter((x) => mine(x.raisedByUserId))) {
    list.push({
      kind: "issue",
      id: i.id,
      ref: i.ref,
      clientRecordId: i.clientRecordId,
      category: i.category,
      priority: i.priority,
      status: i.status,
      routedTo: i.routedTo,
      restricted: i.restricted,
      referralStatus: caseStatusOf(i.caseId),
      // Restricted items keep only status updates, never the receiving team's working notes.
      updates: i.updates.map((u) => ({ ...u, text: i.restricted && u.by !== ctx.actor ? "" : u.text })),
      raisedAt: i.raisedAt,
      updatedAt: i.updatedAt,
    });
  }
  return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function buildFieldSnapshotSync(): FieldSnapshot {
  const state = getState();
  const ctx = fieldContext(state);
  const interventions = visibleFieldInterventions(state, ctx);
  const interventionIds = new Set(interventions.map((i) => i.id));
  const pointIds = new Set(interventions.flatMap((i) => i.servicePointIds));
  const tasks = visibleTasks(state, ctx).filter((t) => ctx.isSupervisor || t.assignedTo === ctx.user.id);
  tasks.forEach((t) => t.servicePointId && pointIds.add(t.servicePointId));
  const forms = state.forms.filter((f) => f.interventionIds.some((id) => interventionIds.has(id)));
  const indicatorIds = new Set(interventions.flatMap((i) => i.indicatorTargets.map((t) => t.indicatorId)));
  const reads = new Set(state.notificationReads);
  const snapshot: FieldSnapshot = {
    takenAt: now(),
    userId: ctx.user.id,
    account: {
      name: ctx.user.name,
      title: ctx.user.title,
      email: ctx.user.email,
      role: ctx.user.role as "field_officer" | "field_supervisor",
      organisation: { id: ctx.organisation.id, name: ctx.organisation.name, acronym: ctx.organisation.acronym },
      permissions: [...ctx.permissions],
    },
    settlements: assignedSettlements(state, ctx).map((s) => ({ ...s })),
    servicePoints: state.servicePoints.filter((sp) => pointIds.has(sp.id)).map((sp) => ({ ...sp })),
    interventions: interventions.map(interventionView),
    indicators: state.indicators.filter((i) => indicatorIds.has(i.id)).map((i) => ({ id: i.id, code: i.code, name: i.name, unit: i.unit })),
    forms: forms.map((f) => ({
      id: f.id,
      ref: f.ref,
      title: f.title,
      purpose: f.purpose,
      kind: f.kind,
      deploymentStart: f.deploymentStart,
      deploymentEnd: f.deploymentEnd,
      interventionIds: f.interventionIds.filter((id) => interventionIds.has(id)),
      published: f.versions.find((v) => v.status === "published"),
      versions: f.versions.map((v) => ({ ...v, questions: v.questions.map((q) => ({ ...q })) })),
    })),
    tasks: tasks.map((t) => taskView(ctx, t)).sort((a, b) => a.dueAt.localeCompare(b.dueAt)),
    submissions: submissions(ctx),
    notifications: state.notifications
      .filter((n) => n.audience?.userId === ctx.user.id)
      .map((n) => ({ id: n.id, at: n.at, kind: n.kind, message: n.message, params: n.params, href: fieldHref(n.entity, n.entityId, state), read: reads.has(n.id) }))
      .slice(0, 60),
  };
  if (ctx.isSupervisor && ctx.permissions.includes("work.review")) {
    const team = teamMembers(state, ctx);
    const teamIds = new Set([...team.map((u) => u.id), ctx.user.id]);
    snapshot.team = {
      officers: team.map((u) => ({ id: u.id, name: u.name, permissions: [...(u.fieldPermissions ?? [])], interventionIds: [...(u.interventionIds ?? [])] })),
      reviewQueue: state.fieldReports
        .filter((r) => r.createdByUserId && teamIds.has(r.createdByUserId) && interventionIds.has(r.interventionId) && ["synced", "needs_review", "returned", "accepted"].includes(r.status))
        .map((r) => ({
          id: r.id,
          ref: r.ref,
          title: r.title,
          kind: r.kind === "survey" ? ("survey" as const) : ("report" as const),
          status: r.status,
          submittedBy: r.submittedBy,
          interventionId: r.interventionId,
          collectedAt: r.collectedAt,
          totalReached: r.reached.women + r.reached.men + r.reached.children,
          formVersion: r.formVersion,
          answers: r.answers?.map((a) => ({ ...a })),
          comments: r.comments.map((c) => ({ id: c.id, at: c.at, author: c.author, text: c.text })),
          content:
            r.kind === "survey"
              ? undefined
              : {
                  kind: r.kind === "activity_update" ? ("activity_update" as const) : ("site_visit" as const),
                  visitAt: r.collectedAt,
                  activityType: r.activityType ?? "",
                  servicePointId: r.servicePointId ?? "",
                  locationNote: r.locationNote ?? "",
                  observations: r.narrative,
                  workCompleted: r.outputs ?? "",
                  reached: { ...r.reached },
                  indicatorValues: r.indicatorValues.map((v) => ({ ...v })),
                  challenges: r.challenges ?? "",
                  followUp: r.followUpActions ?? "",
                  gps: r.gps ? { ...r.gps } : undefined,
                  gpsUnavailableReason: r.gpsUnavailableReason,
                  attachments: r.attachments.map((a) => ({ name: a.name, kind: a.kind, sizeKb: a.sizeKb })),
                },
        }))
        .sort((a, b) => b.collectedAt.localeCompare(a.collectedAt)),
      issues: state.fieldIssues
        .filter((i) => ctx.settlementIds.includes(i.settlementId) && teamIds.has(i.raisedByUserId))
        .map((i) => ({
          id: i.id,
          ref: i.ref,
          category: i.category,
          priority: i.priority,
          status: i.status,
          routedTo: i.routedTo,
          restricted: i.restricted,
          raisedBy: i.raisedBy,
          raisedAt: i.raisedAt,
          // Safeguarding details stay with the protection team.
          description: i.restricted ? undefined : i.description,
        })),
    };
  }
  return snapshot;
}

/** Everything the signed-in field user needs for assigned work (live read). */
export async function buildFieldSnapshot(): Promise<FieldSnapshot> {
  return buildFieldSnapshotSync();
}

/* ============================================================ Live look-ups */

/**
 * Assistance this organisation already recorded for a household reference.
 * Other organisations' entries are never returned: the central duplicate
 * check compares them after sync and routes any match to a human reviewer.
 */
export async function lookupOwnAssistanceHistory(householdRef: string): Promise<{ assistanceType: string; quantity: number; unit: string; deliveredAt: string; ref: string }[]> {
  await delay(400);
  const state = getState();
  const ctx = fieldContext(state);
  requireFieldPermission(ctx, "assistance.record");
  const ref = householdRef.trim().toUpperCase();
  return state.assistance
    .filter((a) => a.partnerId === ctx.organisation.id && a.beneficiaryRef === ref)
    .map((a) => ({ assistanceType: a.assistanceType, quantity: a.quantity, unit: a.unit, deliveredAt: a.deliveredAt, ref: a.ref }))
    .sort((a, b) => b.deliveredAt.localeCompare(a.deliveredAt));
}

export async function markFieldNotificationsRead(ids: string[]): Promise<void> {
  await delay(80);
  const ctx = fieldContext();
  mutate((draft) => {
    const own = new Set(draft.notifications.filter((n) => n.audience?.userId === ctx.user.id).map((n) => n.id));
    draft.notificationReads = [...new Set([...draft.notificationReads, ...ids.filter((id) => own.has(id))])];
  });
}

/* ======================================================= Supervisor actions */

export interface TaskInput {
  kind: FieldTaskKind;
  title: string;
  instructions: string;
  interventionId: string;
  servicePointId?: string;
  formId?: string;
  dueAt: string;
  priority: Priority;
  assignedTo: string;
  allocation?: FieldTaskAllocation;
}

export type TaskIssue = "title" | "intervention" | "servicePoint" | "dueAt" | "assignedTo" | "form" | "allocation";

export function taskIssues(input: TaskInput): TaskIssue[] {
  const state = getState();
  const issues: TaskIssue[] = [];
  if (!input.title.trim()) issues.push("title");
  const i = state.interventions.find((x) => x.id === input.interventionId);
  if (!i) issues.push("intervention");
  if (input.servicePointId && i && !i.servicePointIds.includes(input.servicePointId)) issues.push("servicePoint");
  const due = new Date(input.dueAt).getTime();
  if (!input.dueAt || Number.isNaN(due) || due < Date.now() - DAY_MS) issues.push("dueAt");
  if (!input.assignedTo) issues.push("assignedTo");
  if (input.kind === "survey" && !input.formId) issues.push("form");
  if (input.kind === "assistance" && (!input.allocation || !/^[A-Z]{2}-[A-Z]{3}-\d{4}-\d{2}$/.test(input.allocation.householdRef.trim().toUpperCase()) || !(input.allocation.quantity > 0) || !input.allocation.assistanceType.trim())) issues.push("allocation");
  return issues;
}

/** Assigns work to an officer of the same organisation in the supervisor's settlement. */
export async function assignFieldTask(input: TaskInput): Promise<string> {
  if (taskIssues(input).length > 0) throw new ServiceError("MISSING_INFORMATION");
  await delay(350);
  const ctx = fieldContext();
  requireFieldPermission(ctx, "work.assign");
  return mutate((draft) => {
    const i = ownFieldIntervention(draft, ctx, input.interventionId);
    const assignee = teamMembers(draft, ctx).find((u) => u.id === input.assignedTo);
    if (!assignee) throw new ServiceError("NOT_PARTNER_RECORD");
    const du = draft.users.find((u) => u.id === assignee.id)!;
    if (!(du.interventionIds ?? []).includes(i.id)) {
      du.interventionIds = [...(du.interventionIds ?? []), i.id];
      fieldAudit(draft, ctx, "fieldInterventionAssigned", "user", du.id, du.name, { intervention: i.ref });
    }
    if (input.kind === "assistance" && !(du.fieldPermissions ?? []).includes("assistance.record")) throw new ServiceError("FORBIDDEN");
    const task: FieldTask = {
      id: newId("ft"),
      ref: nextRef(draft.fieldTasks.map((t) => t.ref), "FT-2026-"),
      kind: input.kind,
      title: input.title.trim(),
      instructions: input.instructions.trim(),
      interventionId: i.id,
      settlementId: i.settlementId,
      servicePointId: input.servicePointId || undefined,
      formId: input.formId || undefined,
      dueAt: new Date(input.dueAt).toISOString(),
      priority: input.priority,
      status: "assigned",
      assignedTo: assignee.id,
      assignedBy: ctx.actor,
      assignedAt: now(),
      allocation: input.allocation ? { ...input.allocation, householdRef: input.allocation.householdRef.trim().toUpperCase() } : undefined,
      version: 1,
      versions: [{ version: 1, at: now(), by: ctx.actor, note: "Assigned.", changes: [] }],
      linkedIds: [],
      updatedAt: now(),
    };
    draft.fieldTasks.push(task);
    fieldAudit(draft, ctx, "fieldTaskAssigned", "fieldTask", task.id, task.ref, { assignee: assignee.name });
    notifyFieldUser(draft, assignee.id, "assigned_review", "fieldTaskAssigned", { ref: task.ref, title: task.title }, "fieldTask", task.id);
    return task.id;
  });
}

export interface TaskChange {
  dueAt?: string;
  priority?: Priority;
  instructions?: string;
  quantity?: number;
  assignedTo?: string;
}

/** Applies a supervisor's change as a new task version. Earlier versions stay on record. */
export function applyTaskChange(draft: ReturnType<typeof getState>, ctx: FieldContext, id: string, change: TaskChange, note: string, simulated?: boolean): FieldTask {
  const task = ownTask(draft, ctx, id);
  if (task.status === "completed" || task.status === "cancelled") throw new ServiceError("INVALID_STATE");
  const changes: { field: string; from: string; to: string }[] = [];
  if (change.dueAt && new Date(change.dueAt).toISOString() !== task.dueAt) {
    changes.push({ field: "dueAt", from: task.dueAt, to: new Date(change.dueAt).toISOString() });
    task.dueAt = new Date(change.dueAt).toISOString();
  }
  if (change.priority && change.priority !== task.priority) {
    changes.push({ field: "priority", from: task.priority, to: change.priority });
    task.priority = change.priority;
  }
  if (change.instructions !== undefined && change.instructions.trim() !== task.instructions) {
    changes.push({ field: "instructions", from: task.instructions, to: change.instructions.trim() });
    task.instructions = change.instructions.trim();
  }
  if (change.quantity !== undefined && task.allocation && change.quantity !== task.allocation.quantity) {
    if (!(change.quantity > 0)) throw new ServiceError("INVALID_VALUE");
    changes.push({ field: "quantity", from: String(task.allocation.quantity), to: String(change.quantity) });
    task.allocation = { ...task.allocation, quantity: change.quantity };
  }
  if (change.assignedTo && change.assignedTo !== task.assignedTo) {
    const next = teamMembers(draft, ctx).find((u) => u.id === change.assignedTo);
    if (!next) throw new ServiceError("NOT_PARTNER_RECORD");
    changes.push({ field: "assignedTo", from: task.assignedTo, to: next.id });
    notifyFieldUser(draft, task.assignedTo, "decision", "fieldTaskReassigned", { ref: task.ref }, "fieldTask", task.id);
    task.assignedTo = next.id;
    notifyFieldUser(draft, next.id, "assigned_review", "fieldTaskAssigned", { ref: task.ref, title: task.title }, "fieldTask", task.id);
  }
  if (changes.length === 0) throw new ServiceError("NO_CHANGES");
  task.version += 1;
  task.versions.push({ version: task.version, at: now(), by: ctx.actor, note, changes });
  task.updatedAt = now();
  fieldAudit(draft, ctx, "fieldTaskUpdated", "fieldTask", task.id, task.ref, { version: task.version }, { note, simulated });
  notifyFieldUser(draft, task.assignedTo, "decision", "fieldTaskUpdated", { ref: task.ref, version: task.version }, "fieldTask", task.id);
  return task;
}

export async function updateFieldTask(id: string, change: TaskChange, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay(300);
  const ctx = fieldContext();
  requireFieldPermission(ctx, "work.assign");
  mutate((draft) => void applyTaskChange(draft, ctx, id, change, reason));
}

export async function cancelFieldTask(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay(300);
  const ctx = fieldContext();
  requireFieldPermission(ctx, "work.assign");
  mutate((draft) => {
    const task = ownTask(draft, ctx, id);
    if (task.status === "completed" || task.status === "cancelled") throw new ServiceError("INVALID_STATE");
    task.status = "cancelled";
    task.version += 1;
    task.versions.push({ version: task.version, at: now(), by: ctx.actor, note: reason, changes: [{ field: "status", from: "assigned", to: "cancelled" }] });
    task.updatedAt = now();
    fieldAudit(draft, ctx, "fieldTaskCancelled", "fieldTask", task.id, task.ref, {}, { note: reason });
    notifyFieldUser(draft, task.assignedTo, "decision", "fieldTaskCancelled", { ref: task.ref }, "fieldTask", task.id);
  });
}

/** Supervisor returns a team member's report for correction, pointing at one field. */
export async function supervisorReturnReport(id: string, field: (typeof RETURNABLE_FIELDS)[number] | undefined, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay(350);
  const ctx = fieldContext();
  requireFieldPermission(ctx, "work.review");
  mutate((draft) => {
    const report = draft.fieldReports.find((r) => r.id === id);
    if (!report) throw new ServiceError("NOT_FOUND");
    ownFieldIntervention(draft, ctx, report.interventionId);
    const teamIds = new Set([...teamMembers(draft, ctx).map((u) => u.id), ctx.user.id]);
    if (!report.createdByUserId || !teamIds.has(report.createdByUserId)) throw new ServiceError("NOT_PARTNER_RECORD");
    applyFieldReportReturn(draft, id, `${ctx.actor}, settlement supervisor`, reason, undefined, field);
  });
}

/** Supervisor records that a team member's report was checked before OPM review. */
export async function supervisorEndorseReport(id: string, note: string): Promise<void> {
  const text = requireNote(note);
  await delay(250);
  const ctx = fieldContext();
  requireFieldPermission(ctx, "work.review");
  mutate((draft) => {
    const report = draft.fieldReports.find((r) => r.id === id);
    if (!report) throw new ServiceError("NOT_FOUND");
    ownFieldIntervention(draft, ctx, report.interventionId);
    if (!["synced", "needs_review"].includes(report.status)) throw new ServiceError("INVALID_STATE");
    report.comments.push({ id: newId("c"), at: now(), author: `${ctx.actor}, settlement supervisor`, text });
    report.updatedAt = now();
    fieldAudit(draft, ctx, "fieldReportEndorsed", "fieldReport", report.id, report.ref, {}, { note: text });
  });
}

/** Status updates on issues routed to the supervisor's settlement team. Restricted items stay with their team. */
export async function updateFieldIssueStatus(id: string, status: FieldIssueStatus, note: string): Promise<void> {
  const text = requireNote(note);
  await delay(250);
  const ctx = fieldContext();
  requireFieldPermission(ctx, "work.review");
  mutate((draft) => {
    const issue = draft.fieldIssues.find((i) => i.id === id);
    if (!issue) throw new ServiceError("NOT_FOUND");
    if (!ctx.settlementIds.includes(issue.settlementId) || issue.restricted || issue.category === "referral") throw new ServiceError("NOT_PARTNER_RECORD");
    if (issue.status === status) throw new ServiceError("NO_CHANGES");
    issue.status = status;
    issue.updates.push({ at: now(), by: ctx.actor, text, status });
    issue.updatedAt = now();
    fieldAudit(draft, ctx, "fieldIssueUpdated", "fieldIssue", issue.id, issue.ref, { status }, { note: text });
    if (issue.raisedByUserId !== ctx.user.id) notifyFieldUser(draft, issue.raisedByUserId, "decision", "fieldIssueUpdated", { ref: issue.ref }, "fieldIssue", issue.id);
  });
}

/** Attachment names and sizes only: no file content reaches the central store in this prototype. */
export function attachmentMeta(list: { name: string; kind: Attachment["kind"]; sizeKb: number }[]): Attachment[] {
  return list.map((a, index) => ({ id: `at${index + 1}`, name: a.name, kind: a.kind, sizeKb: a.sizeKb }));
}
