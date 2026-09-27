"use client";

import type { AssistanceRecord, BeneficiaryReview, DemoState, FieldReport, Intervention, ReviewStatus, Sector } from "@/lib/types";
import { addAudit, getState, mutate, newId } from "@/lib/demo/store";
import { delay, hasPermission, now, requireNote, requirePermission, requireScope, ServiceError } from "./core";
import { match, type RecordFilters } from "./filters";
import { simulateProgres } from "./external";

/* -------------------------------------------------------------- Aggregates */

export type AssistanceGroup = "settlement" | "sector" | "partner" | "item" | "period";

export interface AssistanceLine {
  key: string;
  quantity: number;
  households: number;
  records: number;
}

export interface AssistanceSummary {
  totals: { quantity: number; households: number; records: number; flagged: number };
  lines: AssistanceLine[];
}

interface FlatLine {
  report: FieldReport;
  intervention: Intervention;
  item: string;
  quantity: number;
  households: number;
}

/** Distribution lines from accepted field reports only. Aggregate figures; no individual records. */
export function assistanceLines(state: DemoState, filters: RecordFilters = {}): FlatLine[] {
  return state.fieldReports
    .filter((r) => r.status === "accepted" && match.fieldReport(state, r, filters))
    .flatMap((r) => {
      const intervention = state.interventions.find((i) => i.id === r.interventionId)!;
      return r.distributed.map((d) => ({ report: r, intervention, item: d.item, quantity: d.quantity, households: d.households }));
    });
}

export function periodKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function getAssistanceSummary(filters: RecordFilters, group: AssistanceGroup): Promise<AssistanceSummary> {
  requirePermission("beneficiary.aggregate");
  const state = getState();
  const lines = assistanceLines(state, filters);
  const keyOf = (l: FlatLine): string => {
    switch (group) {
      case "settlement":
        return l.intervention.settlementId;
      case "sector":
        return l.intervention.sector;
      case "partner":
        return l.intervention.partnerId;
      case "item":
        return l.item;
      case "period":
        return periodKey(l.report.collectedAt);
    }
  };
  const map = new Map<string, AssistanceLine>();
  for (const l of lines) {
    const key = keyOf(l);
    const row = map.get(key) ?? { key, quantity: 0, households: 0, records: 0 };
    row.quantity += l.quantity;
    row.households += l.households;
    row.records += 1;
    map.set(key, row);
  }
  const flagged = state.reviews.filter((rv) => !rv.status.startsWith("resolved") && rv.status !== "waiting" && match.review(state, rv, filters)).length;
  return {
    totals: {
      quantity: lines.reduce((s, l) => s + l.quantity, 0),
      households: lines.reduce((s, l) => s + l.households, 0),
      records: lines.length,
      flagged,
    },
    lines: [...map.values()].sort((a, b) => b.quantity - a.quantity),
  };
}

/* ------------------------------------------------------------ Review queue */

export const OPEN_REVIEW: ReviewStatus[] = ["open", "in_review", "escalated"];

/** Queue rows never carry the restricted block. */
export type ReviewRow = Omit<BeneficiaryReview, "restricted"> & {
  fieldReportRef: string;
  settlementId: string;
  sector: Sector;
  partnerName: string;
};

function strip(state: DemoState, rv: BeneficiaryReview): ReviewRow {
  const { restricted, ...rest } = rv;
  void restricted;
  const r = state.fieldReports.find((x) => x.id === rv.fieldReportId);
  const i = state.interventions.find((x) => x.id === (r?.interventionId ?? rv.interventionId));
  const assistance = state.assistance.find((x) => x.id === rv.assistanceId);
  return {
    ...rest,
    progres: { ...rv.progres, script: [] },
    fieldReportRef: r?.ref ?? assistance?.ref ?? "—",
    settlementId: i?.settlementId ?? "",
    sector: i?.sector ?? "health",
    partnerName: state.partners.find((p) => p.id === i?.partnerId)?.name ?? "—",
  };
}

export async function listReviews(filters: RecordFilters = {}): Promise<ReviewRow[]> {
  requirePermission("beneficiary.review");
  const state = getState();
  return state.reviews
    .filter((rv) => match.review(state, rv, filters))
    .map((rv) => strip(state, rv))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getReview(id: string): Promise<{ review: ReviewRow; report?: FieldReport; assistance?: AssistanceRecord; intervention: Intervention; reviewers: string[] }> {
  requirePermission("beneficiary.review");
  const state = getState();
  const rv = state.reviews.find((x) => x.id === id);
  if (!rv) throw new ServiceError("NOT_FOUND");
  const report = state.fieldReports.find((r) => r.id === rv.fieldReportId);
  // Reviews raised from a Partner Portal assistance entry have no field report.
  const assistance = state.assistance.find((a) => a.id === rv.assistanceId);
  const intervention = state.interventions.find((i) => i.id === (report?.interventionId ?? rv.interventionId));
  if ((!report && !assistance) || !intervention) throw new ServiceError("NOT_FOUND");
  requireScope(intervention.settlementId);
  return {
    review: strip(state, rv),
    report,
    assistance,
    intervention,
    reviewers: state.users.filter((u) => u.status === "active" && (u.role === "opm_coordinator" || u.role === "me_officer")).map((u) => u.name),
  };
}

/**
 * Reveals the minimum restricted detail for one review. Every reveal needs a
 * reason and is written to the audit trail as sensitive access. The detail is
 * returned to the caller only and is never kept in page state across reloads.
 */
export async function revealRestricted(id: string, reason: string): Promise<BeneficiaryReview["restricted"]> {
  const why = requireNote(reason);
  await delay(300);
  const actor = requirePermission("beneficiary.review");
  return mutate((draft) => {
    const rv = draft.reviews.find((x) => x.id === id);
    if (!rv) throw new ServiceError("NOT_FOUND");
    addAudit(draft, { actor, action: "sensitiveViewed", category: "access", params: { name: rv.ref }, entity: "review", entityId: id, entityRef: rv.ref, note: why, sensitive: true });
    return { ...rv.restricted };
  });
}

function load(draft: DemoState, id: string): BeneficiaryReview {
  const rv = draft.reviews.find((x) => x.id === id);
  if (!rv) throw new ServiceError("NOT_FOUND");
  return rv;
}

function log(draft: DemoState, rv: BeneficiaryReview, actor: string | null, action: string, category: "decision" | "status" | "record", note?: string, params: Record<string, string> = {}) {
  addAudit(draft, { actor, action, category, params: { name: rv.ref, ...params }, entity: "review", entityId: rv.id, entityRef: rv.ref, note });
}

export async function assignReview(id: string, reviewer: string): Promise<void> {
  if (!reviewer) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const actor = requirePermission("beneficiary.review");
  mutate((draft) => {
    const rv = load(draft, id);
    if (!OPEN_REVIEW.includes(rv.status)) throw new ServiceError("INVALID_STATE");
    rv.assignedTo = reviewer;
    if (rv.status === "open") rv.status = "in_review";
    rv.updatedAt = now();
    log(draft, rv, actor, "reviewAssigned", "status", undefined, { reviewer });
  });
}

/** SIMULATED ProGres v4 request. The result is fictional and never a real UNHCR verification. */
export async function requestProgresVerification(id: string): Promise<BeneficiaryReview["progres"]["outcome"]> {
  await delay(1000);
  const actor = requirePermission("beneficiary.review");
  return mutate((draft) => {
    const rv = load(draft, id);
    if (!OPEN_REVIEW.includes(rv.status)) throw new ServiceError("INVALID_STATE");
    log(draft, rv, actor, "progresRequested", "status");
    simulateProgres(draft, rv, rv.progres.attempts > 0 ? "retry" : "workflow");
    if (rv.status === "open") rv.status = "in_review";
    rv.updatedAt = now();
    return rv.progres.outcome;
  });
}

export async function addReviewNote(id: string, text: string): Promise<void> {
  const body = requireNote(text);
  await delay(150);
  const actor = requirePermission("beneficiary.review");
  mutate((draft) => {
    const rv = load(draft, id);
    rv.notes.push({ id: newId("n"), at: now(), author: actor, text: body });
    rv.updatedAt = now();
    log(draft, rv, actor, "commentAdded", "record");
  });
}

/**
 * Human decision. "Duplicate" means the distribution record is corrected; it
 * is not a fraud finding and does not stop the household's assistance.
 * Deciding against the ProGres result (or without one) is logged as an override.
 */
export async function decideReview(id: string, decision: "valid" | "duplicate", note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("beneficiary.review");
  mutate((draft) => {
    const rv = load(draft, id);
    if (!OPEN_REVIEW.includes(rv.status)) throw new ServiceError("INVALID_STATE");
    const override = rv.progres.outcome !== "success";
    rv.status = decision === "valid" ? "resolved_valid" : "resolved_duplicate";
    rv.notes.push({ id: newId("n"), at: now(), author: actor, text: reason });
    if (override) {
      rv.overrides.push({ at: now(), by: actor, note: reason });
      log(draft, rv, actor, "reviewOverride", "decision", reason, { outcome: rv.progres.outcome });
    }
    rv.updatedAt = now();
    log(draft, rv, actor, decision === "valid" ? "reviewResolvedValid" : "reviewResolvedDuplicate", "decision", reason);
  });
}

export async function escalateReview(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("beneficiary.review");
  mutate((draft) => {
    const rv = load(draft, id);
    if (rv.status !== "open" && rv.status !== "in_review") throw new ServiceError("INVALID_STATE");
    rv.status = "escalated";
    rv.notes.push({ id: newId("n"), at: now(), author: actor, text: reason });
    rv.updatedAt = now();
    log(draft, rv, actor, "reviewEscalated", "decision", reason);
  });
}

export function canReview(): boolean {
  return hasPermission("beneficiary.review");
}
