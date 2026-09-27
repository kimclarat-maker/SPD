"use client";

import type { AuditEntry, EntityType, Priority, Sector } from "@/lib/types";
import { addAudit, getState, mutate, resetState } from "@/lib/demo/store";
import { JOURNEY } from "@/lib/demo/seed";
import { currentActor, delay, hasPermission } from "./core";
import { filtersToQuery, match, placeMatches, type RecordFilters } from "./filters";
import { recordHref } from "./lookup";
import { OPEN_APPLICATION } from "./partners";
import { APPROVED_WORK, interventionProgress } from "./interventions";
import { lateReporting, REVIEWABLE } from "./fieldReports";
import { OPEN_REVIEW } from "./beneficiaries";
import { isOverdue, OPEN_CASE } from "./cases";
import { expiringDocuments, expiryState } from "./documents";
import { pendingPartnerUpdates } from "./partnerReview";

export type MetricKey = "partners" | "interventions" | "fieldReports" | "flagged" | "cases" | "overdue" | "completeness";

export interface Metric {
  key: MetricKey;
  value: number;
  /** For completeness: a percentage. */
  percent?: boolean;
  href: string;
  updatedAt?: string;
  detail?: Record<string, number>;
}

export type AttentionKind = "application" | "proposal" | "partnerUpdate" | "expiry" | "lateReport" | "fieldReview" | "duplicate" | "overdueCase" | "milestone" | "exchange";

export interface AttentionItem {
  id: string;
  kind: AttentionKind;
  entity: EntityType;
  /** Key under portal.attention */
  message: string;
  params: Record<string, string | number>;
  href: string;
  priority: Priority;
  at: string;
  overdue: boolean;
}

export interface SectorProgress {
  sector: Sector;
  interventions: number;
  percent: number;
  reached: number;
}

export interface WalkthroughStep {
  key: "partner" | "overlap" | "intervention" | "fieldReport" | "update" | "review" | "case" | "report" | "audit";
  done: boolean;
  href: string;
}

const latest = (dates: (string | undefined)[]) => dates.filter(Boolean).sort().pop();

/** The live, filtered records the dashboard counts. List pages apply the same predicates. */
export function dashboardRecords(f: RecordFilters) {
  const state = getState();
  const partners = state.partners.filter((p) => match.partner(state, p, f));
  const interventions = state.interventions.filter((i) => match.intervention(state, i, f));
  const reports = state.fieldReports.filter((r) => match.fieldReport(state, r, f));
  const reviews = state.reviews.filter((rv) => rv.status !== "waiting" && match.review(state, rv, f));
  const cases = state.cases.filter((c) => match.case(state, c, f));
  return { state, partners, interventions, reports, reviews, cases };
}

export function buildAttention(f: RecordFilters): AttentionItem[] {
  const { state, partners, interventions, reports, reviews, cases } = dashboardRecords(f);
  const items: AttentionItem[] = [];
  const push = (x: Omit<AttentionItem, "href"> & { entityId: string }) => {
    const { entityId, ...rest } = x;
    items.push({ ...rest, href: recordHref(x.entity, entityId) ?? "/portal" });
  };
  const nowIso = new Date().toISOString();

  for (const p of partners.filter((x) => OPEN_APPLICATION.includes(x.status))) {
    push({ id: `app-${p.id}`, kind: "application", entity: "partner", entityId: p.id, message: `application_${p.status}`, params: { name: p.name }, priority: p.status === "verification" ? "high" : "medium", at: p.updatedAt, overdue: false });
  }
  for (const i of interventions.filter((x) => x.status === "submitted" || x.status === "coordination_review")) {
    push({ id: `prop-${i.id}`, kind: "proposal", entity: "intervention", entityId: i.id, message: `proposal_${i.status}`, params: { name: `${i.ref} ${i.title}` }, priority: "medium", at: i.updatedAt, overdue: false });
  }
  // Partner Portal submissions waiting for an OPM decision.
  const interventionIds = new Set(interventions.map((i) => i.id));
  for (const u of pendingPartnerUpdates(state)) {
    if (u.entity === "intervention" ? !interventionIds.has(u.entityId) : !partners.some((p) => p.id === u.entityId)) continue;
    push({ id: `pu-${u.kind}-${u.entityId}-${u.itemRef}-${u.at}`, kind: "partnerUpdate", entity: u.entity, entityId: u.entityId, message: `partnerUpdate_${u.kind}`, params: { name: u.ref, partner: u.partnerName, item: u.itemRef }, priority: u.kind === "risk" && u.itemRef === "high" ? "high" : "medium", at: u.at, overdue: false });
  }
  const partnerIds = new Set(partners.map((p) => p.id));
  for (const d of expiringDocuments(state).filter((x) => x.related && partnerIds.has(x.related.id))) {
    const owner = state.partners.find((p) => p.id === d.related!.id)!;
    const expired = expiryState(d) === "expired";
    push({ id: `exp-${d.id}`, kind: "expiry", entity: "document", entityId: d.id, message: expired ? "docExpired" : "docExpiring", params: { name: d.title, owner: owner.name }, priority: expired ? "high" : "medium", at: d.expiresAt!, overdue: expired });
  }
  for (const i of lateReporting(state).filter((x) => match.intervention(state, x, f))) {
    push({ id: `late-${i.id}`, kind: "lateReport", entity: "intervention", entityId: i.id, message: "lateReport", params: { name: `${i.ref} ${i.title}` }, priority: "medium", at: i.updatedAt, overdue: true });
  }
  for (const r of reports.filter((x) => REVIEWABLE.includes(x.status) || x.status === "conflict")) {
    push({ id: `fr-${r.id}`, kind: "fieldReview", entity: "fieldReport", entityId: r.id, message: r.status === "conflict" ? "fieldConflict" : "fieldReview", params: { name: r.ref }, priority: r.status === "conflict" ? "high" : "medium", at: r.updatedAt, overdue: false });
  }
  if (hasPermission("beneficiary.review")) {
    for (const rv of reviews.filter((x) => OPEN_REVIEW.includes(x.status))) {
      push({ id: `rv-${rv.id}`, kind: "duplicate", entity: "review", entityId: rv.id, message: rv.kind === "possible_duplicate" ? "possibleDuplicate" : "verificationIssue", params: { name: rv.ref }, priority: rv.status === "escalated" ? "high" : "medium", at: rv.updatedAt, overdue: false });
    }
  }
  for (const c of cases.filter((x) => isOverdue(x))) {
    push({ id: `case-${c.id}`, kind: "overdueCase", entity: "case", entityId: c.id, message: c.escalated ? "caseOverdueEscalated" : "caseOverdue", params: { name: c.ref }, priority: "high", at: c.dueAt, overdue: true });
  }
  for (const i of interventions.filter((x) => x.status === "active" || x.status === "approved")) {
    const overdueMilestones = i.milestones.filter((m) => !m.done && m.dueAt < nowIso);
    if (overdueMilestones.length) {
      push({ id: `ms-${i.id}`, kind: "milestone", entity: "intervention", entityId: i.id, message: "milestoneOverdue", params: { name: i.ref, milestone: overdueMilestones[0].title }, priority: "medium", at: overdueMilestones[0].dueAt, overdue: true });
    }
  }
  if (hasPermission("integration.view")) {
    for (const integration of state.integrations) {
      const last = state.runs.find((r) => r.integrationId === integration.id);
      if (last && last.outcome !== "success") {
        push({ id: `int-${integration.id}`, kind: "exchange", entity: "integration", entityId: integration.id, message: "exchangeFailed", params: { name: integration.name, outcome: last.outcome }, priority: "high", at: last.at, overdue: false });
      }
    }
    for (const e of state.exchanges.filter((x) => x.status === "partial" || x.status === "failed")) {
      push({ id: `exch-${e.id}`, kind: "exchange", entity: "report", entityId: e.reportId, message: "exchangePartial", params: { name: e.target.toUpperCase(), period: e.period }, priority: "high", at: e.submittedAt ?? nowIso, overdue: false });
    }
  }
  const order: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => order[a.priority] - order[b.priority] || a.at.localeCompare(b.at));
}

export async function getDashboard(f: RecordFilters): Promise<{
  metrics: Metric[];
  attention: AttentionItem[];
  sectors: SectorProgress[];
  recent: AuditEntry[];
  walkthrough: WalkthroughStep[];
  generatedAt: string;
}> {
  const { state, partners, interventions, reports, reviews, cases } = dashboardRecords(f);
  const q = (status?: string) => filtersToQuery(f, { status });

  const approvedPartners = partners.filter((p) => p.status === "approved");
  const active = interventions.filter((i) => i.status === "active");
  const awaiting = reports.filter((r) => REVIEWABLE.includes(r.status));
  const flagged = reviews.filter((rv) => OPEN_REVIEW.includes(rv.status));
  const openCases = cases.filter((c) => OPEN_CASE.includes(c.status));
  const attention = buildAttention(f);
  const overdueItems = attention.filter((a) => a.overdue);
  const late = new Set(lateReporting(state).map((i) => i.id));
  const reporting = active.filter((i) => !late.has(i.id));

  const metrics: Metric[] = [
    { key: "partners", value: approvedPartners.length, href: `/portal/partners${q("approved")}`, updatedAt: latest(approvedPartners.map((p) => p.updatedAt)) },
    { key: "interventions", value: active.length, href: `/portal/interventions${q("active")}`, updatedAt: latest(active.map((i) => i.updatedAt)) },
    { key: "fieldReports", value: awaiting.length, href: `/portal/field-reports${q(REVIEWABLE.join(","))}`, updatedAt: latest(awaiting.map((r) => r.updatedAt)) },
    ...(hasPermission("beneficiary.review")
      ? [{ key: "flagged" as const, value: flagged.length, href: `/portal/beneficiaries${filtersToQuery(f, { tab: "reviews", status: OPEN_REVIEW.join(",") })}`, updatedAt: latest(flagged.map((r) => r.updatedAt)) }]
      : []),
    { key: "cases", value: openCases.length, href: `/portal/cases${q(OPEN_CASE.join(","))}`, updatedAt: latest(openCases.map((c) => c.updatedAt)) },
    {
      key: "overdue",
      value: overdueItems.length,
      href: `/portal${filtersToQuery(f, { attention: "overdue" })}#attention`,
      updatedAt: latest(overdueItems.map((a) => a.at)),
      detail: {
        cases: overdueItems.filter((a) => a.kind === "overdueCase").length,
        milestones: overdueItems.filter((a) => a.kind === "milestone").length,
        late: overdueItems.filter((a) => a.kind === "lateReport").length,
        documents: overdueItems.filter((a) => a.kind === "expiry").length,
      },
    },
    {
      key: "completeness",
      value: active.length ? Math.round((reporting.length / active.length) * 100) : 100,
      percent: true,
      href: `/portal/interventions${q("active")}`,
      updatedAt: latest(reports.filter((r) => r.status === "accepted").map((r) => r.updatedAt)),
      detail: { reporting: reporting.length, active: active.length },
    },
  ];

  const sectorIds = [...new Set(state.sectors.filter((s) => s.active).map((s) => s.id))];
  const sectors: SectorProgress[] = sectorIds
    .map((sector) => {
      const list = interventions.filter((i) => i.sector === sector && APPROVED_WORK.includes(i.status) && i.status !== "closed");
      const progress = list.map((i) => interventionProgress(state, i));
      return {
        sector,
        interventions: list.length,
        percent: progress.length ? Math.round(progress.reduce((s, p) => s + p.percent, 0) / progress.length) : 0,
        reached: progress.reduce((s, p) => s + p.reached, 0),
      };
    })
    .filter((s) => s.interventions > 0);

  const find = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id);
  const partner = find(state.partners, JOURNEY.partnerId);
  const intervention = find(state.interventions, JOURNEY.interventionId);
  const report = find(state.fieldReports, JOURNEY.fieldReportId);
  const review = find(state.reviews, JOURNEY.reviewId);
  const serviceCase = find(state.cases, JOURNEY.caseId);
  const exchangeDone = state.exchanges.some((e) => e.reportId === JOURNEY.reportId && e.status !== "not_prepared" && e.status !== "prepared");
  const auditSeen = state.audit.some((a) => a.action === "auditViewed" && a.at > state.seededAt);
  const walkthrough: WalkthroughStep[] = [
    { key: "partner", done: partner?.status === "approved", href: `/portal/partners/${JOURNEY.partnerId}` },
    { key: "overlap", done: Boolean(intervention?.overlapResolutions.some((r) => r.interventionId === JOURNEY.overlapId)), href: `/portal/interventions/${JOURNEY.interventionId}` },
    { key: "intervention", done: Boolean(intervention && APPROVED_WORK.includes(intervention.status)), href: `/portal/interventions/${JOURNEY.interventionId}` },
    { key: "fieldReport", done: report?.status === "accepted", href: `/portal/field-reports/${JOURNEY.fieldReportId}` },
    { key: "update", done: report?.status === "accepted", href: `/portal/surveys/indicators/${JOURNEY.indicatorId}` },
    { key: "review", done: Boolean(review?.status.startsWith("resolved")), href: `/portal/beneficiaries/reviews/${JOURNEY.reviewId}` },
    { key: "case", done: serviceCase?.status === "resolved" || serviceCase?.status === "closed", href: `/portal/cases/${JOURNEY.caseId}` },
    { key: "report", done: exchangeDone, href: `/portal/reports/${JOURNEY.reportId}` },
    { key: "audit", done: auditSeen, href: "/portal/audit" },
  ];

  return {
    metrics,
    attention,
    sectors,
    recent: hasPermission("audit.view") ? state.audit.filter((a) => a.entity !== "session").slice(0, 8) : [],
    walkthrough,
    generatedAt: new Date().toISOString(),
  };
}

export interface CoverageRow {
  settlementId: string;
  name: string;
  region: string;
  x: number;
  y: number;
  count: number;
}

/** Approved interventions per settlement. Aggregate only; no individual locations exist in the data. */
export async function getCoverage(f: RecordFilters = {}): Promise<CoverageRow[]> {
  const state = getState();
  return state.settlements
    .filter((s) => s.active && placeMatches(state, s.id, { ...f, settlementId: undefined, district: undefined }))
    .map((s) => ({
      settlementId: s.id,
      name: s.name,
      region: s.region,
      x: s.x,
      y: s.y,
      count: state.interventions.filter((i) => i.settlementId === s.id && APPROVED_WORK.includes(i.status) && i.status !== "closed" && match.intervention(state, i, f)).length,
    }));
}

/** Alerts for the sidebar counts: the unfiltered attention queue. */
export async function getAttentionCounts(): Promise<Record<string, number>> {
  const items = buildAttention({});
  const counts: Record<string, number> = {};
  for (const item of items) counts[item.entity] = (counts[item.entity] ?? 0) + 1;
  return counts;
}

export async function resetDemo(): Promise<void> {
  await delay(200);
  const actor = currentActor();
  resetState();
  mutate((draft) => addAudit(draft, { actor, action: "demoReset", category: "session", params: {}, entity: "session" }));
}
