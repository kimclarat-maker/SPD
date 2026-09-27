"use client";

import type {
  BeneficiaryReview,
  DemoState,
  FieldForm,
  FieldReport,
  FieldReportField,
  FieldReportStatus,
  Intervention,
  Partner,
  ServicePoint,
  ValidationCode,
} from "@/lib/types";
import { addAudit, addNotification, getState, mutate, newId } from "@/lib/demo/store";
import { DAY_MS, delay, now, requireNote, requirePermission, requireScope, ServiceError } from "./core";
import { match, type RecordFilters } from "./filters";
import { REPORTABLE } from "./interventions";
import { simulateMessage } from "./external";

export const REVIEWABLE: FieldReportStatus[] = ["synced", "needs_review"];

export function totalReached(report: Pick<FieldReport, "reached">): number {
  return report.reached.women + report.reached.men + report.reached.children;
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

/** Validation rules applied when a submission reaches the server. */
export function validateReport(state: DemoState, r: FieldReport, syncedAt = r.syncedAt): ValidationCode[] {
  const issues: ValidationCode[] = [];
  const i = state.interventions.find((x) => x.id === r.interventionId);
  const settlement = state.settlements.find((s) => s.id === i?.settlementId);
  if (!i || !REPORTABLE.includes(i.status)) issues.push("intervention_not_approved");
  if (r.gps && settlement && distanceKm(r.gps, settlement) > 20) issues.push("gps_outside_settlement");
  if ((r.kind === "distribution" || r.kind === "site_visit") && r.attachments.length === 0) issues.push("missing_attachment");
  if (i && totalReached(r) > i.targetReach) issues.push("reach_above_plan");
  if (syncedAt && new Date(syncedAt).getTime() - new Date(r.collectedAt).getTime() > 5 * DAY_MS) issues.push("late_submission");
  const form = state.forms.find((f) => f.id === r.formId);
  // Only a version already retired when the data was collected is a problem; history stays valid.
  const version = form?.versions.find((v) => v.version === r.formVersion);
  if (version?.retiredAt && version.retiredAt < r.collectedAt) issues.push("form_version_retired");
  return issues;
}

/** Issues are recorded at sync; the intervention check is re-evaluated live so an approval clears it. */
export function currentIssues(state: DemoState, r: FieldReport): ValidationCode[] {
  const live = validateReport(state, r);
  return [...new Set([...r.validationIssues.filter((c) => c !== "intervention_not_approved"), ...live.filter((c) => c === "intervention_not_approved")])];
}

export interface FieldReportRow extends FieldReport {
  interventionRef: string;
  interventionTitle: string;
  partnerName: string;
  settlementId: string;
  sector: Intervention["sector"];
  totalReached: number;
  issues: ValidationCode[];
}

export async function listFieldReports(filters: RecordFilters = {}): Promise<FieldReportRow[]> {
  const state = getState();
  return state.fieldReports
    .filter((r) => match.fieldReport(state, r, filters))
    .map((r) => {
      const i = state.interventions.find((x) => x.id === r.interventionId)!;
      return {
        ...r,
        interventionRef: i.ref,
        interventionTitle: i.title,
        partnerName: state.partners.find((p) => p.id === i.partnerId)?.name ?? "—",
        settlementId: i.settlementId,
        sector: i.sector,
        totalReached: totalReached(r),
        issues: currentIssues(state, r),
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export interface IndicatorChange {
  indicatorId: string;
  value: number;
  /** Accepted total for the intervention's target, before and after this report. */
  before: number;
  after: number;
  target?: number;
  counted: boolean;
}

export async function getFieldReport(id: string): Promise<{
  report: FieldReport;
  intervention: Intervention;
  partner: Partner;
  form?: FieldForm;
  servicePoint?: ServicePoint;
  reviews: BeneficiaryReview[];
  issues: ValidationCode[];
  indicatorChanges: IndicatorChange[];
}> {
  const state = getState();
  const report = state.fieldReports.find((r) => r.id === id);
  // Partner drafts are private until submitted.
  if (!report || report.status === "draft") throw new ServiceError("NOT_FOUND");
  const intervention = state.interventions.find((i) => i.id === report.interventionId);
  const partner = state.partners.find((p) => p.id === intervention?.partnerId);
  if (!intervention || !partner) throw new ServiceError("NOT_FOUND");
  requireScope(intervention.settlementId);
  const counted = report.status === "accepted";
  const others = state.fieldReports.filter((r) => r.interventionId === intervention.id && r.status === "accepted" && r.id !== id);
  const indicatorChanges = report.indicatorValues.map((v) => {
    const before = others.reduce((sum, r) => sum + (r.indicatorValues.find((x) => x.indicatorId === v.indicatorId)?.value ?? 0), 0);
    return {
      indicatorId: v.indicatorId,
      value: v.value,
      before,
      after: before + v.value,
      target: intervention.indicatorTargets.find((t) => t.indicatorId === v.indicatorId)?.target,
      counted,
    };
  });
  return {
    report,
    intervention,
    partner,
    form: state.forms.find((f) => f.id === report.formId),
    servicePoint: state.servicePoints.find((s) => s.id === report.servicePointId),
    reviews: state.reviews.filter((rv) => rv.fieldReportId === id && rv.status !== "waiting"),
    issues: currentIssues(state, report),
    indicatorChanges,
  };
}

function load(draft: DemoState, id: string) {
  const report = draft.fieldReports.find((r) => r.id === id);
  if (!report) throw new ServiceError("NOT_FOUND");
  const intervention = draft.interventions.find((i) => i.id === report.interventionId);
  if (!intervention) throw new ServiceError("NOT_FOUND");
  return { report, intervention };
}

function log(draft: DemoState, r: FieldReport, actor: string | null, action: string, category: "decision" | "status" | "record", note?: string, extra: { simulated?: boolean } = {}) {
  addAudit(draft, { actor, action, category, params: { name: r.ref }, entity: "fieldReport", entityId: r.id, entityRef: r.ref, note, ...extra });
}

/**
 * SIMULATED device sync: stands in for the field team's device reconnecting.
 * The server validates the submission; issues send it to "needs review".
 */
export async function simulateDeviceSync(id: string): Promise<FieldReportStatus> {
  await delay(900);
  requirePermission("field.review");
  return mutate((draft) => {
    const { report } = load(draft, id);
    if (report.status !== "saved_offline" && report.status !== "awaiting_sync") throw new ServiceError("INVALID_STATE");
    if (report.status === "saved_offline") {
      report.status = "awaiting_sync";
      report.updatedAt = now();
      log(draft, report, null, "fieldReportQueued", "record", undefined, { simulated: true });
      return report.status;
    }
    report.syncedAt = now();
    report.validationIssues = validateReport(draft, report, report.syncedAt);
    report.status = report.validationIssues.length ? "needs_review" : "synced";
    report.updatedAt = now();
    log(draft, report, null, "fieldReportSynced", "record", undefined, { simulated: true });
    if (report.status === "needs_review") {
      addAudit(draft, {
        actor: null,
        action: "fieldReportValidation",
        category: "record",
        params: { name: report.ref, count: report.validationIssues.length },
        entity: "fieldReport",
        entityId: report.id,
        entityRef: report.ref,
      });
    }
    return report.status;
  });
}

/**
 * Accepting a report counts it towards the intervention, indicators, map and
 * reports, and runs the (simulated) assistance-history check, which can open
 * a human review task. It never blocks assistance.
 */
export async function acceptFieldReport(id: string, note?: string): Promise<{ flagged: number }> {
  await delay(500);
  const actor = requirePermission("field.review");
  return mutate((draft) => applyFieldReportAcceptance(draft, id, actor, note));
}

/** Accepts a report (shared by the OPM screen and the demonstration controls). */
export function applyFieldReportAcceptance(draft: DemoState, id: string, actor: string, note?: string, simulated?: boolean): { flagged: number } {
  {
    const { report, intervention } = load(draft, id);
    if (report.status === "conflict") throw new ServiceError("CONFLICT_UNRESOLVED");
    if (report.status === "saved_offline" || report.status === "awaiting_sync") throw new ServiceError("NOT_SYNCED");
    if (!REVIEWABLE.includes(report.status)) throw new ServiceError("INVALID_STATE");
    if (!REPORTABLE.includes(intervention.status)) throw new ServiceError("INTERVENTION_NOT_APPROVED");
    const issues = currentIssues(draft, report);
    const reason = issues.length ? requireNote(note) : note?.trim() || undefined;
    report.status = "accepted";
    report.validationIssues = issues;
    report.updatedAt = now();
    log(draft, report, actor, "fieldReportAccepted", "decision", reason, { simulated });

    if (intervention.status === "approved") {
      intervention.status = "active";
      intervention.updatedAt = now();
      addAudit(draft, {
        actor: null,
        action: "interventionActivatedByReport",
        category: "status",
        params: { name: intervention.ref, report: report.ref },
        entity: "intervention",
        entityId: intervention.id,
        entityRef: intervention.ref,
      });
    }
    addAudit(draft, {
      actor: null,
      action: "indicatorsUpdated",
      category: "record",
      params: { name: intervention.ref, report: report.ref, count: report.indicatorValues.length },
      entity: "intervention",
      entityId: intervention.id,
      entityRef: intervention.ref,
    });

    for (const v of report.indicatorValues) {
      const ind = draft.indicators.find((x) => x.id === v.indicatorId);
      if (ind) {
        addAudit(draft, {
          actor: null,
          action: "indicatorContribution",
          category: "record",
          params: { name: ind.code, report: report.ref, value: v.value },
          entity: "indicator",
          entityId: ind.id,
          entityRef: ind.code,
        });
      }
    }

    notifyFieldSubmitter(draft, report, "decision", "fieldReportAccepted");

    let flagged = 0;
    for (const reviewId of report.pendingReviewIds) {
      const rv = draft.reviews.find((x) => x.id === reviewId);
      if (rv && rv.status === "waiting") {
        rv.status = "open";
        rv.detectedAt = now();
        rv.updatedAt = now();
        flagged += 1;
        addAudit(draft, { actor: null, action: "reviewOpened", category: "record", params: { name: rv.ref }, entity: "review", entityId: rv.id, entityRef: rv.ref, simulated: true });
        addNotification(draft, { kind: "assigned_review", message: "reviewOpened", params: { ref: rv.ref }, entity: "review", entityId: rv.id });
      }
    }
    addAudit(draft, {
      actor: null,
      action: "duplicateCheckRun",
      category: "record",
      params: { name: report.ref, count: flagged },
      entity: "fieldReport",
      entityId: report.id,
      entityRef: report.ref,
      simulated: true,
    });
    return { flagged };
  }
}

/** Fields a reviewer can point to when returning a field visit or activity report. */
export const RETURNABLE_FIELDS: FieldReportField[] = [
  "visitAt",
  "activityType",
  "location",
  "gps",
  "observations",
  "workCompleted",
  "reached",
  "indicators",
  "challenges",
  "followUp",
  "attachments",
];

export async function returnFieldReport(id: string, note: string, field?: FieldReportField): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("field.review");
  mutate((draft) => applyFieldReportReturn(draft, id, actor, reason, undefined, field));
}

/**
 * Returns a report for correction with the reason shown to the submitter.
 * When the reviewer names a field, the comment is shown beside that field.
 */
export function applyFieldReportReturn(draft: DemoState, id: string, actor: string, reason: string, simulated?: boolean, field?: FieldReportField): void {
  const { report } = load(draft, id);
  if (!REVIEWABLE.includes(report.status) && report.status !== "escalated") throw new ServiceError("INVALID_STATE");
  report.status = "returned";
  report.comments.push({ id: newId("c"), at: now(), author: actor, text: reason });
  if (field) {
    report.fieldComments = [...(report.fieldComments ?? []), { id: newId("fc"), field, text: reason, by: actor, at: now(), version: (report.history ?? []).length }];
  }
  report.updatedAt = now();
  log(draft, report, actor, "fieldReportReturned", "decision", reason, { simulated });
  simulateMessage(draft, { channel: "sms", recipient: report.submittedBy, entity: "fieldReport", entityId: id, entityRef: report.ref });
  notifyFieldSubmitter(draft, report, "changes_requested", "fieldReportReturned");
}

/** Tells the field officer who submitted a report about a decision (Field Operations Portal only). */
function notifyFieldSubmitter(draft: DemoState, report: FieldReport, kind: "decision" | "changes_requested", message: string): void {
  const user = draft.users.find((u) => u.id === report.createdByUserId);
  if (!user || !(user.role === "field_officer" || user.role === "field_supervisor")) return;
  addNotification(draft, { kind, message, params: { ref: report.ref }, entity: "fieldReport", entityId: report.id, audience: { userId: user.id } });
}

export async function escalateFieldReport(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("field.review");
  mutate((draft) => {
    const { report } = load(draft, id);
    if (!REVIEWABLE.includes(report.status)) throw new ServiceError("INVALID_STATE");
    report.status = "escalated";
    report.comments.push({ id: newId("c"), at: now(), author: actor, text: reason });
    report.updatedAt = now();
    log(draft, report, actor, "fieldReportEscalated", "decision", reason);
  });
}

/** Escalated reports come back to review once the escalation is answered. */
export async function reopenFieldReport(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("field.review");
  mutate((draft) => {
    const { report } = load(draft, id);
    if (report.status !== "escalated") throw new ServiceError("INVALID_STATE");
    report.status = "needs_review";
    report.updatedAt = now();
    log(draft, report, actor, "fieldReportReopened", "status", reason);
  });
}

/**
 * Sync conflict: two devices sent different versions. Nothing is overwritten
 * silently — the reviewer chooses one version with a reason, and both stay on record.
 */
export async function resolveConflict(id: string, versionId: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("field.review");
  mutate((draft) => {
    const { report } = load(draft, id);
    if (report.status !== "conflict" || !report.conflict) throw new ServiceError("INVALID_STATE");
    const chosen = report.conflict.versions.find((v) => v.id === versionId);
    if (!chosen) throw new ServiceError("NOT_FOUND");
    report.reached = { ...chosen.reached };
    report.indicatorValues = chosen.indicatorValues.map((v) => ({ ...v }));
    report.narrative = chosen.narrative;
    report.conflict = { ...report.conflict, resolvedVersionId: versionId, resolvedBy: actor, resolvedAt: now(), note: reason };
    report.validationIssues = validateReport(draft, report);
    report.status = report.validationIssues.length ? "needs_review" : "synced";
    report.updatedAt = now();
    addAudit(draft, {
      actor,
      action: "conflictResolved",
      category: "decision",
      params: { name: report.ref, device: chosen.device },
      entity: "fieldReport",
      entityId: id,
      entityRef: report.ref,
      note: reason,
    });
  });
}

/** Demo helper: stands in for the field team correcting and re-sending the form. */
export async function simulateResubmission(id: string): Promise<void> {
  await delay();
  requirePermission("field.review");
  mutate((draft) => {
    const { report } = load(draft, id);
    if (report.status !== "returned") throw new ServiceError("INVALID_STATE");
    const form = draft.forms.find((f) => f.id === report.formId);
    const published = form?.versions.find((v) => v.status === "published");
    if (published) report.formVersion = published.version;
    report.syncedAt = now();
    report.validationIssues = validateReport(draft, report, report.syncedAt).filter((c) => c !== "late_submission");
    report.status = report.validationIssues.length ? "needs_review" : "synced";
    report.updatedAt = now();
    log(draft, report, null, "fieldReportResubmitted", "record", undefined, { simulated: true });
  });
}

export async function addFieldReportComment(id: string, text: string): Promise<void> {
  const body = requireNote(text);
  await delay(150);
  const actor = requirePermission("field.review");
  mutate((draft) => {
    const { report } = load(draft, id);
    report.comments.push({ id: newId("c"), at: now(), author: actor, text: body });
    log(draft, report, actor, "commentAdded", "record");
  });
}

/** Submissions that are overdue: saved offline for more than three days, or in conflict. */
export function failedSyncs(state: DemoState): FieldReport[] {
  const cutoff = Date.now() - 3 * DAY_MS;
  return state.fieldReports.filter(
    (r) => r.status === "conflict" || (r.status === "saved_offline" && new Date(r.collectedAt).getTime() < cutoff),
  );
}

/** Active interventions with no accepted report in the last 30 days (late reporting). */
export function lateReporting(state: DemoState): Intervention[] {
  const cutoff = Date.now() - 30 * DAY_MS;
  return state.interventions.filter(
    (i) =>
      i.status === "active" &&
      new Date(i.startDate).getTime() < cutoff + 15 * DAY_MS &&
      !state.fieldReports.some((r) => r.interventionId === i.id && r.status === "accepted" && new Date(r.collectedAt).getTime() >= cutoff),
  );
}

