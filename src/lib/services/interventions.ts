"use client";

import type { DemoState, DocumentRecord, FieldReport, Intervention, InterventionStatus, Partner, ServicePoint } from "@/lib/types";
import { addAudit, getState, mutate, newId } from "@/lib/demo/store";
import { delay, now, requireNote, requirePermission, requireScope, ServiceError } from "./core";
import { match, type RecordFilters } from "./filters";
import { partnerEligibility, type Eligibility } from "./partners";
import { simulateMessage } from "./external";

/** Statuses in which an intervention is live and can receive field reports. */
export const REPORTABLE: InterventionStatus[] = ["approved", "active", "completed"];
/** Statuses that count as approved work for figures and coverage. */
export const APPROVED_WORK: InterventionStatus[] = ["approved", "active", "completed", "closed"];
const IN_PIPELINE: InterventionStatus[] = ["submitted", "coordination_review", "approved", "active"];

export interface Overlap {
  intervention: Intervention;
  partnerName: string;
  sharedServicePoints: string[];
  resolved?: { note: string; by: string; at: string };
}

export type MissingField = "fundingSource" | "indicators" | "servicePoints" | "milestones" | "evidence";

export interface InterventionValidation {
  eligibility: Eligibility;
  missing: MissingField[];
  overlaps: Overlap[];
  unresolvedOverlaps: number;
  missingPermission: boolean;
  blocking: boolean;
}

export interface Progress {
  reached: number;
  percent: number;
  acceptedReports: number;
  indicators: { indicatorId: string; target: number; actual: number; percent: number }[];
  lastAcceptedAt?: string;
}

export function findOverlaps(state: DemoState, i: Intervention): Overlap[] {
  const start = new Date(i.startDate).getTime();
  const end = new Date(i.endDate).getTime();
  return state.interventions
    .filter(
      (other) =>
        other.id !== i.id &&
        other.settlementId === i.settlementId &&
        other.sector === i.sector &&
        IN_PIPELINE.includes(other.status) &&
        new Date(other.startDate).getTime() <= end &&
        new Date(other.endDate).getTime() >= start,
    )
    .map((other) => {
      const resolved =
        i.overlapResolutions.find((r) => r.interventionId === other.id) ?? other.overlapResolutions.find((r) => r.interventionId === i.id);
      return {
        intervention: other,
        partnerName: state.partners.find((p) => p.id === other.partnerId)?.name ?? "—",
        sharedServicePoints: other.servicePointIds.filter((sp) => i.servicePointIds.includes(sp)),
        resolved: resolved ? { note: resolved.note, by: resolved.by, at: resolved.at } : undefined,
      };
    });
}

export function evidenceDocuments(state: DemoState, id: string): DocumentRecord[] {
  return state.documents.filter((d) => d.related?.entity === "intervention" && d.related.id === id);
}

export function validateIntervention(state: DemoState, i: Intervention): InterventionValidation {
  const partner = state.partners.find((p) => p.id === i.partnerId);
  const eligibility: Eligibility = partner ? partnerEligibility(state, partner) : { eligible: false, reason: "not_approved" };
  const missing: MissingField[] = [];
  if (!i.fundingSource.trim()) missing.push("fundingSource");
  if (i.indicatorTargets.length === 0) missing.push("indicators");
  if (i.servicePointIds.length === 0) missing.push("servicePoints");
  if (i.milestones.length === 0) missing.push("milestones");
  if (evidenceDocuments(state, i.id).filter((d) => d.category === "intervention_evidence").length === 0) missing.push("evidence");
  const overlaps = findOverlaps(state, i);
  const unresolvedOverlaps = overlaps.filter((o) => !o.resolved).length;
  const missingPermission =
    eligibility.eligible && !partner!.permissions.some((perm) => perm.settlementId === i.settlementId && perm.sector === i.sector);
  return {
    eligibility,
    missing,
    overlaps,
    unresolvedOverlaps,
    missingPermission,
    blocking: !eligibility.eligible || missing.length > 0 || unresolvedOverlaps > 0 || missingPermission,
  };
}

export function interventionProgress(state: DemoState, i: Intervention): Progress {
  const accepted = state.fieldReports.filter((r) => r.interventionId === i.id && r.status === "accepted");
  const reached = accepted.reduce((sum, r) => sum + r.reached.women + r.reached.men + r.reached.children, 0);
  const indicators = i.indicatorTargets.map((t) => {
    const actual = accepted.reduce((sum, r) => sum + (r.indicatorValues.find((v) => v.indicatorId === t.indicatorId)?.value ?? 0), 0);
    return { indicatorId: t.indicatorId, target: t.target, actual, percent: t.target ? Math.min(100, Math.round((actual / t.target) * 100)) : 0 };
  });
  // Progress follows indicators where they exist, otherwise people reached against the target.
  const percent = indicators.length
    ? Math.round(indicators.reduce((sum, x) => sum + x.percent, 0) / indicators.length)
    : i.targetReach
      ? Math.min(100, Math.round((reached / i.targetReach) * 100))
      : 0;
  const lastAcceptedAt = accepted.map((r) => r.updatedAt).sort().pop();
  return { reached, percent, acceptedReports: accepted.length, indicators, lastAcceptedAt };
}

export interface InterventionRow extends Intervention {
  partnerName: string;
  progress: Progress;
  validation: InterventionValidation;
}

export async function listInterventions(filters: RecordFilters = {}): Promise<InterventionRow[]> {
  const state = getState();
  return state.interventions
    .filter((i) => match.intervention(state, i, filters))
    .map((i) => ({
      ...i,
      partnerName: state.partners.find((p) => p.id === i.partnerId)?.name ?? "—",
      progress: interventionProgress(state, i),
      validation: validateIntervention(state, i),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getIntervention(id: string): Promise<{
  intervention: Intervention;
  partner: Partner;
  fieldReports: FieldReport[];
  validation: InterventionValidation;
  progress: Progress;
  servicePoints: ServicePoint[];
  documents: DocumentRecord[];
  assignees: string[];
}> {
  const state = getState();
  const intervention = state.interventions.find((i) => i.id === id);
  // Draft proposals are private to the partner organisation until submitted.
  if (!intervention || intervention.status === "draft") throw new ServiceError("NOT_FOUND");
  requireScope(intervention.settlementId);
  const partner = state.partners.find((p) => p.id === intervention.partnerId);
  if (!partner) throw new ServiceError("NOT_FOUND");
  return {
    intervention,
    partner,
    fieldReports: state.fieldReports.filter((r) => r.interventionId === id),
    validation: validateIntervention(state, intervention),
    progress: interventionProgress(state, intervention),
    servicePoints: state.servicePoints.filter((sp) => intervention.servicePointIds.includes(sp.id)),
    documents: evidenceDocuments(state, id),
    assignees: state.users.filter((u) => u.status === "active" && u.role === "opm_coordinator").map((u) => u.name),
  };
}

function load(draft: DemoState, id: string) {
  const intervention = draft.interventions.find((i) => i.id === id);
  if (!intervention) throw new ServiceError("NOT_FOUND");
  const partner = draft.partners.find((p) => p.id === intervention.partnerId);
  if (!partner) throw new ServiceError("NOT_FOUND");
  return { intervention, partner };
}

function log(draft: DemoState, i: Intervention, actor: string | null, action: string, category: "decision" | "status" | "record", note?: string, params: Record<string, string> = {}) {
  addAudit(draft, { actor, action, category, params: { name: i.ref, ...params }, entity: "intervention", entityId: i.id, entityRef: i.ref, note });
}

export async function assignIntervention(id: string, assignee: string, note?: string): Promise<void> {
  if (!assignee) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const actor = requirePermission("intervention.review");
  mutate((draft) => {
    const { intervention } = load(draft, id);
    if (!["submitted", "coordination_review"].includes(intervention.status)) throw new ServiceError("INVALID_STATE");
    intervention.assignedTo = assignee;
    intervention.updatedAt = now();
    log(draft, intervention, actor, "interventionAssigned", "status", note?.trim() || undefined, { assignee });
  });
}

/** Submitted → Coordination review. */
export async function startCoordinationReview(id: string): Promise<void> {
  await delay();
  const actor = requirePermission("intervention.review");
  mutate((draft) => {
    const { intervention } = load(draft, id);
    if (intervention.status !== "submitted") throw new ServiceError("INVALID_STATE");
    intervention.status = "coordination_review";
    intervention.assignedTo ??= actor;
    intervention.updatedAt = now();
    log(draft, intervention, actor, "interventionReviewStarted", "status");
  });
}

/** Records how an overlap is handled (e.g. zones split between partners). Both records keep the note. */
export async function resolveOverlap(id: string, otherId: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("intervention.review");
  mutate((draft) => applyOverlapResolution(draft, id, otherId, actor, reason));
}

export function applyOverlapResolution(draft: DemoState, id: string, otherId: string, actor: string, reason: string, simulated?: boolean): void {
  const { intervention } = load(draft, id);
  const other = draft.interventions.find((i) => i.id === otherId);
  if (!other) throw new ServiceError("NOT_FOUND");
  intervention.overlapResolutions = intervention.overlapResolutions.filter((r) => r.interventionId !== otherId);
  intervention.overlapResolutions.push({ interventionId: otherId, note: reason, by: actor, at: now() });
  intervention.updatedAt = now();
  addAudit(draft, { actor, action: "overlapResolved", category: "decision", params: { name: intervention.ref, other: other.ref }, entity: "intervention", entityId: id, entityRef: intervention.ref, note: reason, simulated });
}

/** Approval requires an eligible partner, complete information and every overlap resolved. It opens field reporting. */
export async function approveIntervention(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("intervention.decide");
  mutate((draft) => applyInterventionApproval(draft, id, actor, reason));
}

/** Coordination review → Approved (shared by the OPM screen and the demonstration controls). */
export function applyInterventionApproval(draft: DemoState, id: string, actor: string, reason: string, simulated?: boolean): void {
  const { intervention, partner } = load(draft, id);
  if (intervention.status !== "coordination_review") throw new ServiceError("INVALID_STATE");
  const v = validateIntervention(draft, intervention);
  if (!v.eligibility.eligible) throw new ServiceError("PARTNER_NOT_ELIGIBLE");
  if (v.missing.length > 0 || v.missingPermission) throw new ServiceError("MISSING_INFORMATION");
  if (v.unresolvedOverlaps > 0) throw new ServiceError("OVERLAP_UNRESOLVED");
  intervention.status = "approved";
  intervention.updatedAt = now();
  addAudit(draft, { actor, action: "interventionApproved", category: "decision", params: { name: intervention.ref }, entity: "intervention", entityId: id, entityRef: intervention.ref, note: reason, simulated });
  // Field reporting opens: deploy the standard forms to the partner's devices,
  // plus any open survey for the intervention's sector.
  const open = (f: (typeof draft.forms)[number]) => f.kind === "survey" && f.sector === intervention.sector && new Date(f.deploymentEnd) > new Date() && f.versions.some((x) => x.status === "published");
  for (const form of draft.forms.filter((f) => f.id === "frm-activity" || f.id === "frm-dist" || open(f))) {
    if (!form.interventionIds.includes(id)) form.interventionIds.push(id);
  }
  addAudit(draft, {
    actor: null,
    action: "formsDeployed",
    category: "record",
    params: { name: intervention.ref },
    entity: "intervention",
    entityId: id,
    entityRef: intervention.ref,
    simulated: true,
  });
  simulateMessage(draft, { channel: "email", recipient: `${partner.focalRole}, ${partner.name}`, entity: "intervention", entityId: id, entityRef: intervention.ref });
}

/** Open proposal → Changes requested or Rejected, with the reason sent to the partner. */
export function applyInterventionDecision(draft: DemoState, id: string, actor: string, reason: string, status: "changes_requested" | "rejected", simulated?: boolean): void {
  const { intervention, partner } = load(draft, id);
  if (!["submitted", "coordination_review"].includes(intervention.status)) throw new ServiceError("INVALID_STATE");
  intervention.status = status;
  intervention.comments.push({ id: newId("c"), at: now(), author: actor, text: reason });
  intervention.updatedAt = now();
  const action = status === "changes_requested" ? "interventionChangesRequested" : "interventionRejected";
  addAudit(draft, { actor, action, category: "decision", params: { name: intervention.ref }, entity: "intervention", entityId: id, entityRef: intervention.ref, note: reason, simulated });
  simulateMessage(draft, { channel: "email", recipient: `${partner.focalRole}, ${partner.name}`, entity: "intervention", entityId: id, entityRef: intervention.ref });
}

async function decide(id: string, note: string, status: "changes_requested" | "rejected") {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("intervention.decide");
  mutate((draft) => applyInterventionDecision(draft, id, actor, reason, status));
}

export function requestInterventionChanges(id: string, note: string) {
  return decide(id, note, "changes_requested");
}

export function rejectIntervention(id: string, note: string) {
  return decide(id, note, "rejected");
}

async function transition(id: string, from: InterventionStatus, to: InterventionStatus, action: string, note: string | undefined, noteRequired: boolean) {
  const reason = noteRequired ? requireNote(note) : note?.trim() || undefined;
  await delay();
  const actor = requirePermission("intervention.decide");
  mutate((draft) => {
    const { intervention } = load(draft, id);
    if (intervention.status !== from) throw new ServiceError("INVALID_STATE");
    intervention.status = to;
    intervention.updatedAt = now();
    log(draft, intervention, actor, action, "status", reason);
  });
}

export const activateIntervention = (id: string, note?: string) => transition(id, "approved", "active", "interventionActivated", note, false);
export const completeIntervention = (id: string, note: string) => transition(id, "active", "completed", "interventionCompleted", note, true);
export const closeIntervention = (id: string, note: string) => transition(id, "completed", "closed", "interventionClosed", note, true);

export async function toggleMilestone(id: string, milestoneId: string): Promise<void> {
  await delay(150);
  const actor = requirePermission("intervention.review");
  mutate((draft) => {
    const { intervention } = load(draft, id);
    const m = intervention.milestones.find((x) => x.id === milestoneId);
    if (!m) throw new ServiceError("NOT_FOUND");
    m.done = !m.done;
    intervention.updatedAt = now();
    log(draft, intervention, actor, m.done ? "milestoneDone" : "milestoneReopened", "record", undefined, { milestone: m.title });
  });
}

export async function addInterventionComment(id: string, text: string): Promise<void> {
  const body = requireNote(text);
  await delay(150);
  const actor = requirePermission("intervention.review");
  mutate((draft) => {
    const { intervention } = load(draft, id);
    intervention.comments.push({ id: newId("c"), at: now(), author: actor, text: body });
    log(draft, intervention, actor, "commentAdded", "record");
  });
}
