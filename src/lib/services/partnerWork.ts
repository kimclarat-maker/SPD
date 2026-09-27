"use client";

import type {
  AuditEntry,
  BudgetLine,
  DemoState,
  DocumentRecord,
  ExpenditureEntry,
  FieldReport,
  FinancialUpdate,
  IndicatorDef,
  Intervention,
  InterventionChangeRequest,
  Partner,
  Priority,
  ScopeValues,
  Sector,
  ServicePoint,
  UserAccount,
} from "@/lib/types";
import { getState, mutate, newId } from "@/lib/demo/store";
import { DAY_MS, delay, now, requireNote, ServiceError } from "./core";
import { partnerEligibility, type Eligibility } from "./partners";
import { APPROVED_WORK, evidenceDocuments, findOverlaps, interventionProgress, REPORTABLE, type Progress } from "./interventions";
import {
  nextRef,
  notifyOpm,
  ownIntervention,
  partnerAudit,
  partnerAuthor,
  partnerContext,
  partnerVisibleAudit,
  requirePartnerPermission,
  visibleInterventions,
  type PartnerContext,
} from "./partnerContext";

/* ============================================================== Proposals */

export type ProposalIssue =
  | "title"
  | "objective"
  | "sector"
  | "targetGroup"
  | "targetReach"
  | "settlement"
  | "location"
  | "activities"
  | "dates"
  | "milestones"
  | "budget"
  | "budgetLines"
  | "fundingSource"
  | "outputs"
  | "indicators"
  | "servicePoints"
  | "attachments"
  | "permission";

export interface ProposalInput {
  title: string;
  objective: string;
  sector: Sector;
  targetGroup: string;
  targetReach: number;
  settlementId: string;
  location: string;
  servicePointIds: string[];
  activities: string[];
  startDate: string;
  endDate: string;
  milestones: { id?: string; title: string; dueAt: string }[];
  budgetUsd: number;
  budgetLines: { id?: string; category: string; amountUsd: number }[];
  fundingSource: string;
  expectedOutputs: string[];
  indicatorTargets: { indicatorId: string; target: number }[];
  overlapResponse: string;
}

export const EDITABLE_PROPOSAL = ["draft", "changes_requested"] as const;

export function budgetLinesOf(i: Intervention): BudgetLine[] {
  return i.budgetLines?.length ? i.budgetLines : [{ id: "total", category: "Approved budget", amountUsd: i.budgetUsd }];
}

/** Every rule a proposal must meet before it can be submitted. Shown in the form and enforced here. */
export function proposalIssues(state: DemoState, i: Intervention, partner: Partner): ProposalIssue[] {
  const issues: ProposalIssue[] = [];
  const start = new Date(i.startDate).getTime();
  const end = new Date(i.endDate).getTime();
  if (!i.title.trim()) issues.push("title");
  if (!i.objective.trim()) issues.push("objective");
  if (!i.sector) issues.push("sector");
  if (!i.targetGroup.trim()) issues.push("targetGroup");
  if (!(i.targetReach > 0)) issues.push("targetReach");
  if (!i.settlementId) issues.push("settlement");
  if (!(i.location ?? "").trim()) issues.push("location");
  if (i.activities.filter((a) => a.trim()).length === 0) issues.push("activities");
  if (!i.startDate || !i.endDate || Number.isNaN(start) || Number.isNaN(end) || end <= start) issues.push("dates");
  if (i.milestones.length === 0 || i.milestones.some((m) => !m.title.trim() || !m.dueAt || new Date(m.dueAt).getTime() < start || new Date(m.dueAt).getTime() > end)) issues.push("milestones");
  if (!(i.budgetUsd > 0)) issues.push("budget");
  const lines = i.budgetLines ?? [];
  if (lines.length === 0 || lines.some((l) => !l.category.trim() || !(l.amountUsd > 0)) || Math.round(lines.reduce((s, l) => s + l.amountUsd, 0)) !== Math.round(i.budgetUsd)) issues.push("budgetLines");
  if (!i.fundingSource.trim()) issues.push("fundingSource");
  if ((i.expectedOutputs ?? []).filter((o) => o.trim()).length === 0) issues.push("outputs");
  const sectorIndicators = new Set(state.indicators.filter((x) => x.sector === i.sector && x.active).map((x) => x.id));
  if (i.indicatorTargets.length === 0 || i.indicatorTargets.some((t) => !sectorIndicators.has(t.indicatorId) || !(t.target > 0))) issues.push("indicators");
  const points = new Set(state.servicePoints.filter((sp) => sp.settlementId === i.settlementId).map((sp) => sp.id));
  if (i.servicePointIds.length === 0 || i.servicePointIds.some((id) => !points.has(id))) issues.push("servicePoints");
  if (evidenceDocuments(state, i.id).filter((d) => d.category === "intervention_evidence").length === 0) issues.push("attachments");
  if (partner.status === "approved" && !partner.permissions.some((p) => p.settlementId === i.settlementId && p.sector === i.sector)) issues.push("permission");
  return issues;
}

/** Overlap as the partner may see it: other organisations' proposals still under review are not named. */
export interface PartnerOverlap {
  id: string;
  own: boolean;
  approved: boolean;
  ref?: string;
  title?: string;
  partnerName?: string;
  startDate: string;
  endDate: string;
  sharedServicePoints: string[];
  resolved?: { note: string; at: string };
}

export function partnerOverlaps(state: DemoState, i: Intervention, partnerId: string): PartnerOverlap[] {
  return findOverlaps(state, i).map((o) => {
    const own = o.intervention.partnerId === partnerId;
    const approved = APPROVED_WORK.includes(o.intervention.status);
    const visible = own || approved;
    return {
      id: o.intervention.id,
      own,
      approved,
      ref: visible ? o.intervention.ref : undefined,
      title: visible ? o.intervention.title : undefined,
      partnerName: visible ? o.partnerName : undefined,
      startDate: o.intervention.startDate,
      endDate: o.intervention.endDate,
      sharedServicePoints: o.sharedServicePoints,
      resolved: o.resolved ? { note: o.resolved.note, at: o.resolved.at } : undefined,
    };
  });
}

export interface ProposalOptions {
  eligibility: Eligibility;
  partnerStatus: Partner["status"];
  sectors: Sector[];
  settlementIds: string[];
  /** Settlement and sector combinations covered by operating permissions (approved partners). */
  permitted: { settlementId: string; sector: Sector }[];
  servicePoints: ServicePoint[];
  indicators: IndicatorDef[];
  canManage: boolean;
}

export async function getProposalOptions(): Promise<ProposalOptions> {
  const state = getState();
  const ctx = partnerContext(state);
  const p = ctx.partner;
  return {
    eligibility: partnerEligibility(state, p),
    partnerStatus: p.status,
    sectors: p.sectors,
    settlementIds: p.settlementIds,
    permitted: p.permissions.filter((x) => new Date(x.validUntil) > new Date()).map((x) => ({ settlementId: x.settlementId, sector: x.sector })),
    servicePoints: state.servicePoints.filter((sp) => p.settlementIds.includes(sp.settlementId)),
    indicators: state.indicators.filter((ind) => ind.active && p.sectors.includes(ind.sector)),
    canManage: ctx.permissions.includes("proposals.manage"),
  };
}

export interface ProposalRow extends Intervention {
  overlapCount: number;
  issues: ProposalIssue[];
  pendingChangeRequest: boolean;
}

export async function listProposals(): Promise<ProposalRow[]> {
  const state = getState();
  const ctx = partnerContext(state);
  return visibleInterventions(state, ctx)
    .map((i) => ({
      ...i,
      overlapCount: i.status === "draft" ? 0 : partnerOverlaps(state, i, ctx.partner.id).filter((o) => !o.resolved).length,
      issues: proposalIssues(state, i, ctx.partner),
      pendingChangeRequest: (i.changeRequests ?? []).some((c) => c.status === "submitted"),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getProposal(id: string): Promise<{
  intervention: Intervention;
  issues: ProposalIssue[];
  overlaps: PartnerOverlap[];
  eligibility: Eligibility;
  documents: DocumentRecord[];
  history: AuditEntry[];
  canEdit: boolean;
  canManage: boolean;
  /** Suffix on comments written by this organisation, to tell them apart from OPM comments. */
  orgLabel: string;
}> {
  const state = getState();
  const ctx = partnerContext(state);
  const intervention = ownIntervention(state, ctx, id);
  const canManage = ctx.permissions.includes("proposals.manage");
  return {
    orgLabel: ctx.partner.acronym || ctx.partner.name,
    intervention,
    issues: proposalIssues(state, intervention, ctx.partner),
    overlaps: partnerOverlaps(state, intervention, ctx.partner.id),
    eligibility: partnerEligibility(state, ctx.partner),
    documents: evidenceDocuments(state, id),
    history: partnerVisibleAudit(state, ctx, id).filter((a) => a.category === "decision" || a.category === "status" || a.action.startsWith("intervention") || a.action.startsWith("changeRequest")),
    canEdit: canManage && (EDITABLE_PROPOSAL as readonly string[]).includes(intervention.status),
    canManage,
  };
}

function applyInput(i: Intervention, input: ProposalInput) {
  i.title = input.title.trim();
  i.objective = input.objective.trim();
  i.sector = input.sector;
  i.targetGroup = input.targetGroup.trim();
  i.targetReach = Math.max(0, Math.round(input.targetReach || 0));
  i.settlementId = input.settlementId;
  i.location = input.location.trim();
  i.servicePointIds = [...new Set(input.servicePointIds)];
  i.activities = input.activities.map((a) => a.trim()).filter(Boolean);
  i.startDate = input.startDate ? new Date(input.startDate).toISOString() : "";
  i.endDate = input.endDate ? new Date(input.endDate).toISOString() : "";
  i.milestones = input.milestones
    .filter((m) => m.title.trim() || m.dueAt)
    .map((m, index) => ({ id: m.id || `m${index + 1}-${newId("m").slice(-4)}`, title: m.title.trim(), dueAt: m.dueAt ? new Date(m.dueAt).toISOString() : "", done: false }));
  i.budgetUsd = Math.max(0, Math.round(input.budgetUsd || 0));
  i.budgetLines = input.budgetLines
    .filter((l) => l.category.trim() || l.amountUsd)
    .map((l, index) => ({ id: l.id || `b${index + 1}-${newId("b").slice(-4)}`, category: l.category.trim(), amountUsd: Math.max(0, Math.round(l.amountUsd || 0)) }));
  i.fundingSource = input.fundingSource.trim();
  i.expectedOutputs = input.expectedOutputs.map((o) => o.trim()).filter(Boolean);
  i.indicatorTargets = input.indicatorTargets.filter((t) => t.indicatorId).map((t) => ({ indicatorId: t.indicatorId, target: Math.max(0, Math.round(t.target || 0)) }));
  i.overlapResponse = input.overlapResponse.trim() || undefined;
}

function checkPlace(ctx: PartnerContext, input: Pick<ProposalInput, "sector" | "settlementId">) {
  if (input.sector && !ctx.partner.sectors.includes(input.sector)) throw new ServiceError("INVALID_VALUE");
  if (input.settlementId && !ctx.partner.settlementIds.includes(input.settlementId)) throw new ServiceError("INVALID_VALUE");
}

/** Saves a new draft proposal. Drafts are private to the organisation until submitted. */
export async function createProposal(input: ProposalInput): Promise<string> {
  if (!input.title.trim()) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "proposals.manage");
  checkPlace(ctx, input);
  return mutate((draft) => {
    const i: Intervention = {
      id: newId("i"),
      ref: nextRef(draft.interventions.map((x) => x.ref), "INT-2026-"),
      title: "",
      partnerId: ctx.partner.id,
      sector: input.sector,
      settlementId: input.settlementId,
      servicePointIds: [],
      startDate: "",
      endDate: "",
      budgetUsd: 0,
      fundingSource: "",
      targetGroup: "",
      targetReach: 0,
      objective: "",
      activities: [],
      indicatorTargets: [],
      milestones: [],
      status: "draft",
      overlapResolutions: [],
      comments: [],
      submittedAt: now(),
      updatedAt: now(),
      createdBy: ctx.actor,
    };
    applyInput(i, input);
    draft.interventions.push(i);
    partnerAudit(draft, ctx, "proposalDrafted", "intervention", i.id, i.ref);
    return i.id;
  });
}

export async function saveProposal(id: string, input: ProposalInput): Promise<void> {
  if (!input.title.trim()) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "proposals.manage");
  checkPlace(ctx, input);
  mutate((draft) => {
    const i = ownIntervention(draft, ctx, id);
    if (!(EDITABLE_PROPOSAL as readonly string[]).includes(i.status)) throw new ServiceError("LOCKED");
    applyInput(i, input);
    i.updatedAt = now();
    partnerAudit(draft, ctx, "proposalSaved", "intervention", i.id, i.ref);
  });
}

export async function deleteDraftProposal(id: string): Promise<void> {
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "proposals.manage");
  mutate((draft) => {
    const i = ownIntervention(draft, ctx, id);
    if (i.status !== "draft" || (i.revisions ?? []).length > 0) throw new ServiceError("INVALID_STATE");
    draft.interventions = draft.interventions.filter((x) => x.id !== id);
    draft.documents = draft.documents.filter((d) => !(d.related?.entity === "intervention" && d.related.id === id));
    partnerAudit(draft, ctx, "proposalDeleted", "intervention", id, i.ref);
  });
}

/**
 * Draft → Submitted, or Changes requested → back to OPM review. The partner
 * must be eligible and every rule met. Each submission is kept as a version.
 */
export async function submitProposal(id: string, note: string): Promise<void> {
  await delay(400);
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "proposals.manage");
  mutate((draft) => {
    const i = ownIntervention(draft, ctx, id);
    const partner = draft.partners.find((p) => p.id === ctx.partner.id)!;
    if (!(EDITABLE_PROPOSAL as readonly string[]).includes(i.status)) throw new ServiceError("INVALID_STATE");
    if (!partnerEligibility(draft, partner).eligible) throw new ServiceError("PARTNER_NOT_ELIGIBLE");
    if (proposalIssues(draft, i, partner).length > 0) throw new ServiceError("MISSING_INFORMATION");
    const resubmission = i.status === "changes_requested";
    const reply = resubmission ? requireNote(note) : note.trim() || undefined;
    for (const d of evidenceDocuments(draft, i.id).filter((x) => x.status === "draft" || x.status === "changes_requested")) {
      d.status = "in_review";
      d.route = [{ id: newId("s"), role: "Coordination review" }];
      d.updatedAt = now();
    }
    const version = (i.revisions ?? []).length + 1;
    i.revisions = [...(i.revisions ?? []), { version, at: now(), by: ctx.actor, note: reply ?? "First submission." }];
    if (resubmission) {
      // Back to the reviewer who asked for changes, or to the intake queue.
      i.status = i.assignedTo ? "coordination_review" : "submitted";
      if (reply) i.comments.push({ id: newId("c"), at: now(), author: partnerAuthor(ctx), text: reply });
    } else {
      i.status = "submitted";
      i.submittedAt = now();
    }
    i.updatedAt = now();
    partnerAudit(draft, ctx, resubmission ? "interventionResubmitted" : "interventionSubmitted", "intervention", i.id, i.ref, { version }, { note: reply });
    notifyOpm(draft, resubmission ? "proposalResubmitted" : "proposalSubmitted", { ref: i.ref, partner: partner.name }, "intervention", i.id);
  });
}

/* ===================================================== Change requests */

export function scopeOf(i: Intervention): Required<ScopeValues> {
  return {
    objective: i.objective,
    activities: [...i.activities],
    settlementId: i.settlementId,
    servicePointIds: [...i.servicePointIds],
    endDate: i.endDate,
    budgetUsd: i.budgetUsd,
  };
}

/** Approved scope, location, dates and budget cannot change silently: the partner asks, OPM decides. */
export async function requestInterventionChange(id: string, proposed: ScopeValues, reason: string): Promise<void> {
  const why = requireNote(reason);
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "proposals.manage");
  mutate((draft) => {
    const i = ownIntervention(draft, ctx, id);
    if (!["approved", "active", "completed"].includes(i.status)) throw new ServiceError("INVALID_STATE");
    if ((i.changeRequests ?? []).some((c) => c.status === "submitted")) throw new ServiceError("INVALID_STATE");
    const current = scopeOf(i);
    const diff: ScopeValues = {};
    const prev: ScopeValues = {};
    (Object.keys(proposed) as (keyof ScopeValues)[]).forEach((key) => {
      const value = proposed[key];
      if (value === undefined) return;
      if (JSON.stringify(value) !== JSON.stringify(current[key])) {
        (diff as Record<string, unknown>)[key] = value;
        (prev as Record<string, unknown>)[key] = current[key];
      }
    });
    if (Object.keys(diff).length === 0) throw new ServiceError("NO_CHANGES");
    if (diff.settlementId && !ctx.partner.permissions.some((p) => p.settlementId === diff.settlementId && p.sector === i.sector)) throw new ServiceError("INVALID_VALUE");
    if (diff.budgetUsd !== undefined && !(diff.budgetUsd > 0)) throw new ServiceError("INVALID_VALUE");
    if (diff.endDate && new Date(diff.endDate) <= new Date(i.startDate)) throw new ServiceError("INVALID_VALUE");
    const request: InterventionChangeRequest = {
      id: newId("cr"),
      ref: nextRef(draft.interventions.flatMap((x) => (x.changeRequests ?? []).map((c) => c.ref)), "CR-2026-", 3),
      at: now(),
      by: ctx.actor,
      reason: why,
      proposed: diff,
      previous: prev,
      status: "submitted",
    };
    i.changeRequests = [...(i.changeRequests ?? []), request];
    i.updatedAt = now();
    partnerAudit(draft, ctx, "changeRequestSubmitted", "intervention", i.id, i.ref, { ref: request.ref }, { note: why });
    notifyOpm(draft, "changeRequestSubmitted", { ref: i.ref, request: request.ref }, "intervention", i.id);
  });
}

/* ================================================================ Workspace */

export type ScheduleStatus = "accepted" | "submitted" | "overdue" | "due" | "upcoming";

export interface ReportingPeriod {
  key: string;
  start: string;
  end: string;
  dueAt: string;
  status: ScheduleStatus;
  reportIds: string[];
}

/** Monthly reporting: each month's activity report is due on the 5th of the following month. */
export function reportingSchedule(state: DemoState, i: Intervention, at = new Date()): ReportingPeriod[] {
  if (!i.startDate || !i.endDate) return [];
  const periods: ReportingPeriod[] = [];
  const start = new Date(i.startDate);
  const end = new Date(i.endDate);
  const reports = state.fieldReports.filter((r) => r.interventionId === i.id && r.status !== "draft");
  let cursor = new Date(start.getFullYear(), start.getMonth(), 1);
  while (cursor <= end && periods.length < 24) {
    const monthStart = cursor;
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0, 23, 59, 59);
    const due = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 5, 17, 0, 0);
    const inMonth = reports.filter((r) => {
      const t = new Date(r.collectedAt).getTime();
      return t >= monthStart.getTime() && t <= monthEnd.getTime();
    });
    let status: ScheduleStatus;
    if (inMonth.some((r) => r.status === "accepted")) status = "accepted";
    else if (inMonth.length > 0) status = "submitted";
    else if (due < at) status = "overdue";
    else if (monthStart <= at) status = "due";
    else status = "upcoming";
    periods.push({
      key: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, "0")}`,
      start: monthStart.toISOString(),
      end: monthEnd.toISOString(),
      dueAt: due.toISOString(),
      status,
      reportIds: inMonth.map((r) => r.id),
    });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return periods;
}

export interface FinanceSummary {
  lines: { line: BudgetLine; accepted: number; submitted: number; variance: number }[];
  budget: number;
  accepted: number;
  submitted: number;
  /** Share of the implementation period that has passed, to compare with spending. */
  timeElapsedPercent: number;
  spentPercent: number;
}

export function financeSummary(i: Intervention, at = new Date()): FinanceSummary {
  const lines = budgetLinesOf(i);
  const updates = i.financialUpdates ?? [];
  const sumFor = (status: FinancialUpdate["status"][], lineId: string) =>
    updates.filter((u) => status.includes(u.status)).reduce((s, u) => s + u.entries.filter((e) => e.budgetLineId === lineId).reduce((x, e) => x + e.amountUsd, 0), 0);
  const rows = lines.map((line) => {
    const accepted = sumFor(["accepted"], line.id);
    const submitted = sumFor(["submitted"], line.id);
    return { line, accepted, submitted, variance: line.amountUsd - accepted };
  });
  const accepted = rows.reduce((s, r) => s + r.accepted, 0);
  const submitted = rows.reduce((s, r) => s + r.submitted, 0);
  const start = new Date(i.startDate).getTime();
  const end = new Date(i.endDate).getTime();
  const elapsed = end > start ? Math.min(100, Math.max(0, Math.round(((at.getTime() - start) / (end - start)) * 100))) : 0;
  return { lines: rows, budget: i.budgetUsd, accepted, submitted, timeElapsedPercent: elapsed, spentPercent: i.budgetUsd ? Math.round((accepted / i.budgetUsd) * 100) : 0 };
}

export interface AwaitingItem {
  kind: "fieldReport" | "progressUpdate" | "risk" | "changeRequest" | "financialUpdate" | "document";
  id: string;
  label: string;
  at: string;
}

/** Everything the partner submitted that OPM has not yet decided on. */
export function awaitingOpm(state: DemoState, i: Intervention): AwaitingItem[] {
  const items: AwaitingItem[] = [];
  for (const r of state.fieldReports.filter((x) => x.interventionId === i.id && ["synced", "needs_review", "escalated", "awaiting_sync", "saved_offline", "conflict"].includes(x.status))) {
    items.push({ kind: "fieldReport", id: r.id, label: r.ref, at: r.updatedAt });
  }
  for (const u of (i.progressUpdates ?? []).filter((x) => x.status === "awaiting_review")) items.push({ kind: "progressUpdate", id: u.id, label: u.summary, at: u.at });
  for (const r of (i.risks ?? []).filter((x) => x.status === "open")) items.push({ kind: "risk", id: r.id, label: r.description, at: r.at });
  for (const c of (i.changeRequests ?? []).filter((x) => x.status === "submitted")) items.push({ kind: "changeRequest", id: c.id, label: c.ref, at: c.at });
  for (const f of (i.financialUpdates ?? []).filter((x) => x.status === "submitted")) items.push({ kind: "financialUpdate", id: f.id, label: `${f.ref} · ${f.period}`, at: f.submittedAt ?? f.updatedAt });
  for (const d of evidenceDocuments(state, i.id).filter((x) => x.status === "in_review")) items.push({ kind: "document", id: d.id, label: d.title, at: d.updatedAt });
  return items.sort((a, b) => b.at.localeCompare(a.at));
}

export interface WorkspaceRow extends Intervention {
  progress: Progress;
  awaiting: number;
  nextDue?: ReportingPeriod;
}

export async function listWorkspaces(): Promise<WorkspaceRow[]> {
  const state = getState();
  const ctx = partnerContext(state);
  return visibleInterventions(state, ctx)
    .filter((i) => APPROVED_WORK.includes(i.status))
    .map((i) => ({
      ...i,
      progress: interventionProgress(state, i),
      awaiting: awaitingOpm(state, i).length,
      nextDue: reportingSchedule(state, i).find((p) => p.status === "overdue" || p.status === "due"),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getWorkspace(id: string): Promise<{
  intervention: Intervention;
  progress: Progress;
  schedule: ReportingPeriod[];
  finance: FinanceSummary;
  servicePoints: ServicePoint[];
  staff: UserAccount[];
  teamOptions: UserAccount[];
  documents: DocumentRecord[];
  fieldReports: FieldReport[];
  awaiting: AwaitingItem[];
  history: AuditEntry[];
  milestonesAwaiting: string[];
  can: { manage: boolean; progress: boolean; report: boolean; finance: boolean; team: boolean };
}> {
  const state = getState();
  const ctx = partnerContext(state);
  const intervention = ownIntervention(state, ctx, id);
  if (!APPROVED_WORK.includes(intervention.status)) throw new ServiceError("INVALID_STATE");
  const members = state.users.filter((u) => u.partnerId === ctx.partner.id && u.status !== "deactivated");
  return {
    intervention,
    progress: interventionProgress(state, intervention),
    schedule: reportingSchedule(state, intervention),
    finance: financeSummary(intervention),
    servicePoints: state.servicePoints.filter((sp) => intervention.servicePointIds.includes(sp.id)),
    staff: members.filter((u) => u.role === "partner_admin" || (u.interventionIds ?? []).includes(id)),
    teamOptions: members.filter((u) => u.role === "partner_staff"),
    documents: evidenceDocuments(state, id),
    fieldReports: state.fieldReports.filter((r) => r.interventionId === id && r.kind !== "survey").sort((a, b) => b.collectedAt.localeCompare(a.collectedAt)),
    awaiting: awaitingOpm(state, intervention),
    history: partnerVisibleAudit(state, ctx, id),
    milestonesAwaiting: (intervention.progressUpdates ?? []).filter((u) => u.status === "awaiting_review" && u.milestoneId).map((u) => u.milestoneId!),
    can: {
      manage: ctx.permissions.includes("proposals.manage"),
      progress: ctx.permissions.includes("progress.update"),
      report: ctx.permissions.includes("fieldReports.submit"),
      finance: ctx.permissions.includes("finance.submit"),
      team: ctx.permissions.includes("team.manage"),
    },
  };
}

function requireLive(i: Intervention) {
  if (!REPORTABLE.includes(i.status)) throw new ServiceError("INTERVENTION_NOT_APPROVED");
}

/** Reports implementation progress. A milestone reported as done counts only once OPM acknowledges it. */
export async function submitProgressUpdate(id: string, input: { summary: string; milestoneId?: string; evidence?: { fileName: string; sizeKb: number } }): Promise<void> {
  const summary = requireNote(input.summary);
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "progress.update");
  mutate((draft) => {
    const i = ownIntervention(draft, ctx, id);
    requireLive(i);
    if (input.milestoneId && !i.milestones.some((m) => m.id === input.milestoneId && !m.done)) throw new ServiceError("INVALID_VALUE");
    let evidenceDocumentId: string | undefined;
    if (input.evidence?.fileName) {
      evidenceDocumentId = newId("doc");
      draft.documents.push({
        id: evidenceDocumentId,
        ref: nextRef(draft.documents.map((x) => x.ref), "DOC-2026-", 3),
        title: `Progress evidence — ${input.evidence.fileName}`,
        category: "intervention_evidence",
        owner: ctx.partner.name,
        related: { entity: "intervention", id: i.id },
        classification: "internal",
        versions: [{ version: 1, at: now(), author: partnerAuthor(ctx), note: `Uploaded with a progress update — ${input.evidence.fileName}`, sizeKb: Math.max(1, Math.round(input.evidence.sizeKb)) }],
        status: "in_review",
        route: [{ id: newId("s"), role: "Coordination review" }],
        signature: { status: "not_required", simulated: true },
        updatedAt: now(),
      });
    }
    i.progressUpdates = [
      ...(i.progressUpdates ?? []),
      { id: newId("pu"), at: now(), by: ctx.actor, summary, milestoneId: input.milestoneId || undefined, evidenceDocumentId, status: "awaiting_review" },
    ];
    i.updatedAt = now();
    const milestone = i.milestones.find((m) => m.id === input.milestoneId);
    partnerAudit(draft, ctx, "progressUpdateSubmitted", "intervention", i.id, i.ref, { milestone: milestone?.title ?? "—" }, { note: summary });
    notifyOpm(draft, "progressUpdateSubmitted", { ref: i.ref }, "intervention", i.id);
  });
}

export async function flagRisk(id: string, input: { kind: "delay" | "risk"; severity: Priority; description: string; mitigation: string }): Promise<void> {
  const description = requireNote(input.description);
  if (!input.mitigation.trim()) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "progress.update");
  mutate((draft) => {
    const i = ownIntervention(draft, ctx, id);
    requireLive(i);
    i.risks = [...(i.risks ?? []), { id: newId("rk"), at: now(), by: ctx.actor, kind: input.kind, severity: input.severity, description, mitigation: input.mitigation.trim(), status: "open" }];
    i.updatedAt = now();
    partnerAudit(draft, ctx, input.kind === "delay" ? "delayFlagged" : "riskFlagged", "intervention", i.id, i.ref, { severity: input.severity }, { note: description });
    notifyOpm(draft, "riskFlagged", { ref: i.ref }, "intervention", i.id);
  });
}

export async function closeRisk(id: string, riskId: string): Promise<void> {
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "progress.update");
  mutate((draft) => {
    const i = ownIntervention(draft, ctx, id);
    const r = (i.risks ?? []).find((x) => x.id === riskId);
    if (!r || r.status === "closed") throw new ServiceError("INVALID_STATE");
    r.status = "closed";
    i.updatedAt = now();
    partnerAudit(draft, ctx, "riskClosed", "intervention", i.id, i.ref);
  });
}

/** Assigns organisation staff to an intervention. Staff only see interventions they are assigned to. */
export async function setInterventionStaff(id: string, userIds: string[]): Promise<void> {
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "team.manage");
  mutate((draft) => {
    const i = ownIntervention(draft, ctx, id);
    const wanted = new Set(userIds);
    for (const u of draft.users.filter((x) => x.partnerId === ctx.partner.id && x.role === "partner_staff")) {
      const ids = new Set(u.interventionIds ?? []);
      if (wanted.has(u.id)) ids.add(id);
      else ids.delete(id);
      u.interventionIds = [...ids];
    }
    if ([...wanted].some((uid) => !draft.users.some((u) => u.id === uid && u.partnerId === ctx.partner.id))) throw new ServiceError("NOT_PARTNER_RECORD");
    partnerAudit(draft, ctx, "interventionStaffAssigned", "intervention", i.id, i.ref, { count: wanted.size }, { category: "config" });
  });
}

/* ================================================================ Finance */

export async function listFinance(): Promise<{ intervention: Intervention; finance: FinanceSummary }[]> {
  const state = getState();
  const ctx = partnerContext(state);
  return visibleInterventions(state, ctx)
    .filter((i) => APPROVED_WORK.includes(i.status))
    .map((i) => ({ intervention: i, finance: financeSummary(i) }));
}

export interface FinancialUpdateInput {
  id?: string;
  period: string;
  entries: Omit<ExpenditureEntry, "id">[];
}

export type ExpenditureIssue = "period" | "entries" | "entryDate" | "entryAmount" | "entryLine" | "entryDescription";

export function expenditureIssues(i: Intervention, input: FinancialUpdateInput): ExpenditureIssue[] {
  const issues: ExpenditureIssue[] = [];
  if (!input.period.trim()) issues.push("period");
  if (input.entries.length === 0) issues.push("entries");
  const lines = new Set(budgetLinesOf(i).map((l) => l.id));
  const start = new Date(i.startDate).getTime() - DAY_MS;
  const end = new Date(i.endDate).getTime() + DAY_MS;
  for (const e of input.entries) {
    const t = new Date(e.date).getTime();
    if (!e.date || Number.isNaN(t) || t < start || t > end || t > Date.now() + DAY_MS) issues.push("entryDate");
    if (!(e.amountUsd > 0)) issues.push("entryAmount");
    if (!lines.has(e.budgetLineId)) issues.push("entryLine");
    if (!e.description.trim()) issues.push("entryDescription");
  }
  return [...new Set(issues)];
}

/** Saves (or submits) an expenditure update. Only accepted updates count as reported expenditure. */
export async function saveFinancialUpdate(interventionId: string, input: FinancialUpdateInput, submit: boolean): Promise<string> {
  await delay(submit ? 400 : 250);
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "finance.submit");
  return mutate((draft) => {
    const i = ownIntervention(draft, ctx, interventionId);
    requireLive(i);
    if (expenditureIssues(i, input).length > 0) throw new ServiceError("MISSING_INFORMATION");
    const entries = input.entries.map((e) => ({ ...e, id: newId("ex"), description: e.description.trim(), date: new Date(e.date).toISOString(), amountUsd: Math.round(e.amountUsd * 100) / 100 }));
    let update = input.id ? (i.financialUpdates ?? []).find((u) => u.id === input.id) : undefined;
    if (input.id && !update) throw new ServiceError("NOT_FOUND");
    if (update && update.status !== "draft" && update.status !== "returned") throw new ServiceError("LOCKED");
    if (!update) {
      update = {
        id: newId("fu"),
        ref: nextRef(draft.interventions.flatMap((x) => (x.financialUpdates ?? []).map((u) => u.ref)), "FIN-2026-", 3),
        period: input.period.trim(),
        entries,
        status: "draft",
        comments: [],
        updatedAt: now(),
      };
      i.financialUpdates = [...(i.financialUpdates ?? []), update];
    } else {
      update.period = input.period.trim();
      update.entries = entries;
      update.updatedAt = now();
    }
    if (submit) {
      const resubmission = update.status === "returned";
      update.status = "submitted";
      update.submittedAt = now();
      update.submittedBy = ctx.actor;
      partnerAudit(draft, ctx, resubmission ? "financialUpdateResubmitted" : "financialUpdateSubmitted", "intervention", i.id, i.ref, { ref: update.ref, period: update.period });
      notifyOpm(draft, "financialUpdateSubmitted", { ref: i.ref, update: update.ref }, "intervention", i.id);
    } else {
      partnerAudit(draft, ctx, "financialUpdateSaved", "intervention", i.id, i.ref, { ref: update.ref, period: update.period });
    }
    i.updatedAt = now();
    return update.id;
  });
}
