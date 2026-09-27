"use client";

import type {
  CaseServiceType,
  DataExchange,
  DemoState,
  EntityType,
  ExchangeTarget,
  ReportFilters,
  ReportLevel,
  ReportSectionKey,
  SavedReport,
} from "@/lib/types";
import { addAudit, getState, mutate, newId } from "@/lib/demo/store";
import { delay, now, requireNote, requirePermission, ServiceError } from "./core";
import { match, type RecordFilters } from "./filters";
import { APPROVED_WORK, interventionProgress } from "./interventions";
import { totalReached } from "./fieldReports";
import { assistanceLines } from "./beneficiaries";
import { isOverdue, OPEN_CASE } from "./cases";
import { indicatorRow } from "./surveys";
import { partnerEligibility } from "./partners";
import { simulateExchangeSubmit } from "./external";

export const allSections: ReportSectionKey[] = ["interventions", "partners", "assistance", "cases", "surveys", "indicators", "funding"];
export const reportLevels: ReportLevel[] = ["national", "district", "settlement", "sector", "partner", "intervention"];

export interface ReportFigures {
  partnersApproved: number;
  interventionsActive: number;
  reportsAccepted: number;
  peopleReached: number;
  assistanceQuantity: number;
  households: number;
  casesReceived: number;
  casesResolved: number;
  casesOpen: number;
  casesOverdue: number;
  reviewsOpen: number;
  budgetUsd: number;
}

export interface Contributor {
  entity: EntityType;
  id: string;
  ref: string;
  title: string;
}

/** Every cell is a plain string or number so the same table feeds the preview and every export. */
export interface ReportTable {
  section: ReportSectionKey;
  key: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface ReportResult {
  figures: ReportFigures;
  tables: ReportTable[];
  contributors: Contributor[];
  caseTrend: { month: string; received: number; resolved: number }[];
}

export function toRecordFilters(f: ReportFilters): RecordFilters {
  return {
    district: f.district,
    settlementId: f.settlementId,
    sector: f.sector,
    partnerId: f.partnerId,
    interventionId: f.interventionId,
    range: { from: f.from ? new Date(f.from) : undefined, to: f.to ? new Date(f.to) : undefined },
  };
}

const monthKey = (iso: string) => iso.slice(0, 7);

/**
 * Report figures come only from reviewed records: approved interventions,
 * accepted field reports and decided reviews. Tables contain aggregates and
 * record references only — never names or household details.
 */
export function computeReport(state: DemoState, rf: ReportFilters, sections: ReportSectionKey[]): ReportResult {
  const f = toRecordFilters(rf);
  const sectorName = (id: string) => state.sectors.find((s) => s.id === id)?.name ?? id;
  const settlementName = (id: string) => state.settlements.find((s) => s.id === id)?.name ?? id;
  const partnerName = (id: string) => state.partners.find((p) => p.id === id)?.name ?? id;

  const interventions = state.interventions.filter((i) => APPROVED_WORK.includes(i.status) && match.intervention(state, i, f));
  const reports = state.fieldReports.filter((r) => r.status === "accepted" && match.fieldReport(state, r, f));
  const lines = assistanceLines(state, f);
  const cases = state.cases.filter((c) => match.case(state, c, f));
  const reviews = state.reviews.filter((rv) => rv.status !== "waiting" && match.review(state, rv, f));
  const partners = state.partners.filter((p) => match.partner(state, p, f) && partnerEligibility(state, p).eligible);

  const figures: ReportFigures = {
    partnersApproved: partners.length,
    interventionsActive: interventions.filter((i) => i.status === "active" || i.status === "approved").length,
    reportsAccepted: reports.length,
    peopleReached: reports.reduce((s, r) => s + totalReached(r), 0),
    assistanceQuantity: lines.reduce((s, l) => s + l.quantity, 0),
    households: lines.reduce((s, l) => s + l.households, 0),
    casesReceived: cases.length,
    casesResolved: cases.filter((c) => c.status === "resolved" || c.status === "closed").length,
    casesOpen: cases.filter((c) => OPEN_CASE.includes(c.status)).length,
    casesOverdue: cases.filter((c) => isOverdue(c)).length,
    reviewsOpen: reviews.filter((rv) => !rv.status.startsWith("resolved")).length,
    budgetUsd: interventions.reduce((s, i) => s + i.budgetUsd, 0),
  };

  const tables: ReportTable[] = [];
  if (sections.includes("interventions")) {
    tables.push({
      section: "interventions",
      key: "interventionProgress",
      columns: ["Reference", "Intervention", "Partner", "Sector", "Settlement", "Status", "Progress %", "People reached", "Accepted reports"],
      rows: interventions.map((i) => {
        const p = interventionProgress(state, i);
        return [i.ref, i.title, partnerName(i.partnerId), sectorName(i.sector), settlementName(i.settlementId), i.status, p.percent, p.reached, p.acceptedReports];
      }),
    });
  }
  if (sections.includes("partners")) {
    tables.push({
      section: "partners",
      key: "partnerActivity",
      columns: ["Reference", "Partner", "Status", "Interventions", "Accepted reports", "People reached"],
      rows: state.partners
        .filter((p) => match.partner(state, p, f))
        .map((p) => {
          const own = reports.filter((r) => state.interventions.find((i) => i.id === r.interventionId)?.partnerId === p.id);
          return [p.ref, p.name, p.status, interventions.filter((i) => i.partnerId === p.id).length, own.length, own.reduce((s, r) => s + totalReached(r), 0)];
        }),
    });
  }
  if (sections.includes("assistance")) {
    const byItem = new Map<string, { q: number; h: number; n: number }>();
    for (const l of lines) {
      const row = byItem.get(l.item) ?? { q: 0, h: 0, n: 0 };
      row.q += l.quantity;
      row.h += l.households;
      row.n += 1;
      byItem.set(l.item, row);
    }
    tables.push({
      section: "assistance",
      key: "assistanceByType",
      columns: ["Assistance type", "Quantity", "Households", "Distribution records"],
      rows: [...byItem.entries()].map(([item, v]) => [item, v.q, v.h, v.n]),
    });
    tables.push({
      section: "assistance",
      key: "assistanceReviews",
      columns: ["Review status", "Records"],
      rows: ["open", "in_review", "escalated", "resolved_valid", "resolved_duplicate"].map((s) => [s, reviews.filter((rv) => rv.status === s).length]),
    });
  }
  if (sections.includes("cases")) {
    const types = [...new Set(cases.map((c) => c.serviceType))] as CaseServiceType[];
    tables.push({
      section: "cases",
      key: "casesByType",
      columns: ["Service type", "Received", "Open", "Overdue", "Resolved or closed"],
      rows: types.map((type) => {
        const list = cases.filter((c) => c.serviceType === type);
        return [type, list.length, list.filter((c) => OPEN_CASE.includes(c.status)).length, list.filter((c) => isOverdue(c)).length, list.filter((c) => c.status === "resolved" || c.status === "closed").length];
      }),
    });
  }
  if (sections.includes("surveys")) {
    const forms = state.forms.filter((form) => form.kind === "survey" || form.kind === "site_visit");
    tables.push({
      section: "surveys",
      key: "surveyResponses",
      columns: ["Form", "Version", "Responses received", "Accepted"],
      rows: forms.flatMap((form) =>
        form.versions.map((v) => {
          const resp = state.fieldReports.filter((r) => r.formId === form.id && r.formVersion === v.version && match.fieldReport(state, r, f) && r.status !== "saved_offline");
          return [form.title, `v${v.version}`, resp.length, resp.filter((r) => r.status === "accepted").length];
        }),
      ),
    });
  }
  if (sections.includes("indicators")) {
    tables.push({
      section: "indicators",
      key: "indicatorPerformance",
      columns: ["Code", "Indicator", "Unit", "Target", "Actual", "% of target", "Contributing reports"],
      rows: state.indicators
        .filter((ind) => ind.active && (!f.sector || ind.sector === f.sector))
        .map((ind) => {
          const row = indicatorRow(state, ind, f);
          return [ind.code, ind.name, ind.unit, ind.target, row.actual, row.percent, row.contributions];
        }),
    });
  }
  if (sections.includes("funding")) {
    const bySource = new Map<string, { budget: number; n: number; reached: number; accepted: number }>();
    for (const i of interventions) {
      const key = i.fundingSource || "Not stated";
      const row = bySource.get(key) ?? { budget: 0, n: 0, reached: 0, accepted: 0 };
      const p = interventionProgress(state, i);
      row.budget += i.budgetUsd;
      row.n += 1;
      row.reached += p.reached;
      row.accepted += p.acceptedReports;
      bySource.set(key, row);
    }
    tables.push({
      section: "funding",
      key: "fundingVsImplementation",
      columns: ["Funding source", "Interventions", "Budget (USD)", "Accepted reports", "People reached", "USD per person reached"],
      rows: [...bySource.entries()].map(([src, v]) => [src, v.n, v.budget, v.accepted, v.reached, v.reached ? Math.round(v.budget / v.reached) : 0]),
    });
  }

  const contributors: Contributor[] = [
    ...interventions.map((i) => ({ entity: "intervention" as const, id: i.id, ref: i.ref, title: i.title })),
    ...reports.map((r) => ({ entity: "fieldReport" as const, id: r.id, ref: r.ref, title: r.title })),
    ...(sections.includes("cases") ? cases.map((c) => ({ entity: "case" as const, id: c.id, ref: c.ref, title: c.serviceType })) : []),
    ...(sections.includes("assistance") ? reviews.map((rv) => ({ entity: "review" as const, id: rv.id, ref: rv.ref, title: rv.householdMasked })) : []),
  ];

  const months = [...new Set(cases.map((c) => monthKey(c.receivedAt)))].sort();
  const caseTrend = months.map((m) => ({
    month: m,
    received: cases.filter((c) => monthKey(c.receivedAt) === m).length,
    resolved: cases.filter((c) => (c.status === "resolved" || c.status === "closed") && monthKey(c.updatedAt) === m).length,
  }));

  return { figures, tables, contributors, caseTrend };
}

export async function listReports(): Promise<SavedReport[]> {
  return [...getState().reports].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getReport(id: string): Promise<{ report: SavedReport; result: ReportResult; exchanges: DataExchange[] }> {
  const state = getState();
  const report = state.reports.find((r) => r.id === id);
  if (!report) throw new ServiceError("NOT_FOUND");
  return {
    report,
    result: computeReport(state, report.filters, report.sections),
    exchanges: state.exchanges.filter((e) => e.reportId === id),
  };
}

export async function previewReport(filters: ReportFilters, sections: ReportSectionKey[]): Promise<ReportResult> {
  return computeReport(getState(), filters, sections);
}

function load(draft: DemoState, id: string): SavedReport {
  const r = draft.reports.find((x) => x.id === id);
  if (!r) throw new ServiceError("NOT_FOUND");
  return r;
}

function log(draft: DemoState, r: SavedReport, actor: string | null, action: string, category: "record" | "status" | "export" | "integration" | "decision", params: Record<string, string | number> = {}, extra: { note?: string; simulated?: boolean } = {}) {
  addAudit(draft, { actor, action, category, params: { name: r.ref, ...params }, entity: "report", entityId: r.id, entityRef: r.ref, ...extra });
}

export async function saveReport(input: { id?: string; title: string; level: ReportLevel; period: string; filters: ReportFilters; sections: ReportSectionKey[] }): Promise<string> {
  if (!input.title.trim() || input.sections.length === 0) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const actor = requirePermission("report.generate");
  return mutate((draft) => {
    if (input.id) {
      const r = load(draft, input.id);
      if (r.status !== "draft") throw new ServiceError("INVALID_STATE");
      Object.assign(r, { title: input.title.trim(), level: input.level, period: input.period, filters: input.filters, sections: input.sections, updatedAt: now() });
      log(draft, r, actor, "reportSaved", "record");
      return r.id;
    }
    const id = newId("rep");
    const r: SavedReport = {
      id,
      ref: `RPT-${new Date().getFullYear()}-${String(draft.reports.length + 101)}`,
      title: input.title.trim(),
      level: input.level,
      period: input.period,
      filters: input.filters,
      sections: input.sections,
      status: "draft",
      createdBy: actor,
      updatedAt: now(),
    };
    draft.reports.unshift(r);
    log(draft, r, actor, "reportCreated", "record");
    return id;
  });
}

/** Generating freezes the figures so later record changes do not alter what was reported. */
export async function generateReport(id: string): Promise<void> {
  await delay(600);
  const actor = requirePermission("report.generate");
  mutate((draft) => {
    const r = load(draft, id);
    if (r.status !== "draft") throw new ServiceError("INVALID_STATE");
    const result = computeReport(draft, r.filters, r.sections);
    r.snapshot = { ...result.figures };
    r.status = "generated";
    r.generatedAt = now();
    r.updatedAt = now();
    log(draft, r, actor, "reportGenerated", "status", { records: result.contributors.length });
  });
}

export async function reopenReport(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("report.generate");
  mutate((draft) => {
    const r = load(draft, id);
    if (r.status !== "generated") throw new ServiceError("INVALID_STATE");
    if (draft.exchanges.some((e) => e.reportId === id && e.status !== "not_prepared" && e.status !== "prepared")) throw new ServiceError("INVALID_STATE");
    r.status = "draft";
    r.snapshot = undefined;
    r.generatedAt = undefined;
    r.updatedAt = now();
    draft.exchanges = draft.exchanges.filter((e) => e.reportId !== id);
    log(draft, r, actor, "reportReopened", "status", {}, { note: reason });
  });
}

/** Records an export in the audit trail. The file itself is built in the browser from aggregate tables only. */
export async function recordExport(id: string, format: "PDF" | "Excel" | "CSV", rows: number): Promise<void> {
  await delay(200);
  const actor = requirePermission("report.export");
  mutate((draft) => {
    const r = load(draft, id);
    log(draft, r, actor, "reportExported", "export", { format, rows });
  });
}

/** Prepares the AMP or NIMES payload from the generated report and checks it before submission. */
export async function prepareExchange(id: string, target: ExchangeTarget): Promise<void> {
  await delay(500);
  const actor = requirePermission("report.submit");
  mutate((draft) => {
    const r = load(draft, id);
    if (r.status === "draft") throw new ServiceError("CHECKS_INCOMPLETE");
    const result = computeReport(draft, r.filters, r.sections);
    const records =
      target === "amp"
        ? result.tables.find((t) => t.key === "interventionProgress")?.rows.length ?? 0
        : result.tables.find((t) => t.key === "indicatorPerformance")?.rows.length ?? 0;
    let exchange = draft.exchanges.find((e) => e.reportId === id && e.target === target);
    if (!exchange) {
      exchange = { id: newId("ex"), target, reportId: id, period: r.period, status: "not_prepared", records: 0, errors: [] };
      draft.exchanges.push(exchange);
    }
    if (exchange.status === "submitted" || exchange.status === "accepted") throw new ServiceError("INVALID_STATE");
    exchange.records = records;
    exchange.status = "prepared";
    exchange.preparedAt = now();
    exchange.errors = [];
    log(draft, r, actor, "exchangePrepared", "integration", { target: target.toUpperCase(), records });
  });
}

/** SIMULATED submission to AMP or NIMES. A partial result can be resubmitted. */
export async function submitExchange(id: string, target: ExchangeTarget): Promise<DataExchange["status"]> {
  await delay(1100);
  const actor = requirePermission("report.submit");
  return mutate((draft) => {
    const r = load(draft, id);
    const exchange = draft.exchanges.find((e) => e.reportId === id && e.target === target);
    if (!exchange || !["prepared", "partial", "failed"].includes(exchange.status)) throw new ServiceError("INVALID_STATE");
    const resubmission = exchange.status === "partial" || exchange.status === "failed";
    log(draft, r, actor, "exchangeSubmitted", "integration", { target: target.toUpperCase() }, { simulated: true });
    simulateExchangeSubmit(draft, exchange, resubmission ? "retry" : "workflow");
    log(draft, r, null, "exchangeResult", "integration", { target: target.toUpperCase(), status: exchange.status }, { simulated: true });
    const all = draft.exchanges.filter((e) => e.reportId === id);
    if (all.length === 2 && all.every((e) => e.status === "accepted")) {
      r.status = "submitted";
      r.updatedAt = now();
      log(draft, r, null, "reportSubmitted", "status");
    }
    return exchange.status;
  });
}
