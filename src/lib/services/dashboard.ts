"use client";

import type { AuditEntry, EntityType, Priority, Sector } from "@/lib/types";
import type { MessageKey } from "@/i18n/core";
import { addAudit, getState, mutate, resetState } from "@/lib/demo/store";
import { settlements } from "@/lib/demo/reference";
import { JOURNEY } from "@/lib/demo/seed";
import { computeFigures, computeReadiness } from "./reports";
import { isOverdue } from "./cases";
import { recordHref } from "./audit";
import { currentActor, delay } from "./core";

export interface Alert {
  id: string;
  message: MessageKey;
  params: Record<string, string>;
  href: string;
  priority: Priority;
  entity: EntityType;
}

export interface JourneyStep {
  key: "partner" | "intervention" | "fieldReport" | "exception" | "case" | "report";
  done: boolean;
  href: string;
}

export interface CoverageRow {
  settlementId: string;
  name: string;
  region: string;
  x: number;
  y: number;
  count: number;
}

const priorityOrder: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

/** Every alert points at the record that resolves it; alerts disappear when the record is dealt with. */
export function buildAlerts(): Alert[] {
  const state = getState();
  const alerts: Alert[] = [];
  const push = (a: Omit<Alert, "href"> & { entityId: string }) =>
    alerts.push({ ...a, href: recordHref(a.entity, a.entityId) ?? "/portal" });

  for (const p of state.partners.filter((x) => x.status === "pending")) {
    push({ id: `alert-${p.id}`, message: "portal.alerts.partnerPending", params: { name: p.name }, priority: "medium", entity: "partner", entityId: p.id });
  }
  for (const i of state.interventions.filter((x) => x.status === "submitted")) {
    const partnerApproved = state.partners.find((p) => p.id === i.partnerId)?.status === "approved";
    push({
      id: `alert-${i.id}`,
      message: partnerApproved ? "portal.alerts.interventionSubmitted" : "portal.alerts.interventionBlocked",
      params: { name: `${i.ref} ${i.title}` },
      priority: "medium",
      entity: "intervention",
      entityId: i.id,
    });
  }
  for (const r of state.fieldReports.filter((x) => x.status === "submitted")) {
    push({ id: `alert-${r.id}`, message: "portal.alerts.fieldReportSubmitted", params: { name: r.ref }, priority: "medium", entity: "fieldReport", entityId: r.id });
  }
  for (const e of state.exceptions.filter((x) => x.status === "open" || x.status === "escalated")) {
    push({
      id: `alert-${e.id}`,
      message: e.status === "open" ? "portal.alerts.exceptionOpen" : "portal.alerts.exceptionEscalated",
      params: { name: e.ref },
      priority: "high",
      entity: "exception",
      entityId: e.id,
    });
  }
  for (const c of state.cases) {
    if (c.status === "new") {
      push({ id: `alert-${c.id}`, message: "portal.alerts.caseUnassigned", params: { name: `${c.ref} ${c.title}` }, priority: c.priority, entity: "case", entityId: c.id });
    } else if (isOverdue(c)) {
      push({ id: `alert-${c.id}`, message: "portal.alerts.caseOverdue", params: { name: `${c.ref} ${c.title}` }, priority: "high", entity: "case", entityId: c.id });
    }
  }
  const readiness = computeReadiness(state);
  for (const r of state.reports) {
    if (r.status === "draft") {
      push({
        id: `alert-${r.id}`,
        message: readiness.ready ? "portal.alerts.reportReady" : "portal.alerts.reportBlocked",
        params: { name: r.ref },
        priority: readiness.ready ? "high" : "low",
        entity: "report",
        entityId: r.id,
      });
    } else if (r.status === "signed") {
      push({ id: `alert-${r.id}`, message: "portal.alerts.reportSigned", params: { name: r.ref }, priority: "medium", entity: "report", entityId: r.id });
    }
  }
  for (const i of state.integrations.filter((x) => x.status === "delayed")) {
    push({ id: `alert-${i.id}`, message: "portal.alerts.integrationDelayed", params: { name: i.name }, priority: "medium", entity: "integration", entityId: i.id });
  }

  return alerts.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
}

export async function getAlerts(): Promise<Alert[]> {
  return buildAlerts();
}

export async function getDashboard(): Promise<{
  alerts: Alert[];
  figures: ReturnType<typeof computeFigures>;
  openExceptions: number;
  journey: JourneyStep[];
  recent: AuditEntry[];
}> {
  const state = getState();
  const find = <T extends { id: string }>(list: T[], id: string) => list.find((x) => x.id === id);
  const partner = find(state.partners, JOURNEY.partnerId);
  const intervention = find(state.interventions, JOURNEY.interventionId);
  const report = find(state.fieldReports, JOURNEY.fieldReportId);
  const exception = find(state.exceptions, JOURNEY.exceptionId);
  const serviceCase = find(state.cases, JOURNEY.caseId);
  const national = find(state.reports, JOURNEY.reportId);

  const journey: JourneyStep[] = [
    { key: "partner", done: partner?.status === "approved", href: `/portal/partners/${JOURNEY.partnerId}` },
    {
      key: "intervention",
      done: intervention?.status === "approved" || intervention?.status === "completed",
      href: `/portal/interventions/${JOURNEY.interventionId}`,
    },
    { key: "fieldReport", done: report?.status === "accepted", href: `/portal/field-reports/${JOURNEY.fieldReportId}` },
    {
      key: "exception",
      done: exception?.status === "cleared" || exception?.status === "duplicate",
      href: `/portal/exceptions/${JOURNEY.exceptionId}`,
    },
    { key: "case", done: serviceCase?.status === "resolved" || serviceCase?.status === "closed", href: `/portal/cases/${JOURNEY.caseId}` },
    { key: "report", done: national?.status === "shared", href: `/portal/reports/${JOURNEY.reportId}` },
  ];

  return {
    alerts: buildAlerts(),
    figures: computeFigures(state),
    openExceptions: state.exceptions.filter((e) => e.status === "open" || e.status === "escalated").length,
    journey,
    recent: state.audit.slice(0, 6),
  };
}

/** Aggregate counts of approved interventions per settlement. No individual locations exist in the data. */
export async function getCoverage(sector?: Sector): Promise<CoverageRow[]> {
  const state = getState();
  return settlements.map((s) => ({
    settlementId: s.id,
    name: s.name,
    region: s.region,
    x: s.x,
    y: s.y,
    count: state.interventions.filter(
      (i) => i.settlementId === s.id && (i.status === "approved" || i.status === "completed") && (!sector || i.sector === sector),
    ).length,
  }));
}

export async function resetDemo(): Promise<void> {
  await delay(200);
  const actor = currentActor();
  resetState();
  mutate((draft) => addAudit(draft, { actor, action: "demoReset", params: {}, entity: "session" }));
}
