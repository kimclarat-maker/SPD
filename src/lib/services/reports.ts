"use client";

import type { DemoState, NationalReport, ReportFigures } from "@/lib/types";
import { addAudit, getState, mutate } from "@/lib/demo/store";
import { currentActor, delay, now, requireNote, ServiceError } from "./core";
import { simulateExchange, simulateSignature } from "./external";
import { totalReached } from "./fieldReports";

export interface Readiness {
  pendingFieldReports: number;
  openExceptions: number;
  unassignedHighPriority: number;
  ready: boolean;
}

/** Figures come only from reviewed records: approved interventions, accepted reports, decided exceptions. */
export function computeFigures(state: DemoState): ReportFigures {
  const approvedInterventions = state.interventions.filter((i) => i.status === "approved" || i.status === "completed");
  const accepted = state.fieldReports.filter((r) => r.status === "accepted");
  return {
    partnersApproved: state.partners.filter((p) => p.status === "approved").length,
    interventionsApproved: approvedInterventions.length,
    fieldReportsAccepted: accepted.length,
    peopleReached: accepted.reduce((sum, r) => sum + totalReached(r), 0),
    exceptionsResolved: state.exceptions.filter((e) => e.status === "cleared" || e.status === "duplicate").length,
    casesResolved: state.cases.filter((c) => c.status === "resolved" || c.status === "closed").length,
    casesOpen: state.cases.filter((c) => c.status !== "resolved" && c.status !== "closed").length,
    budgetApprovedUsd: approvedInterventions.reduce((sum, i) => sum + i.budgetUsd, 0),
  };
}

export function computeReadiness(state: DemoState): Readiness {
  const pendingFieldReports = state.fieldReports.filter((r) => r.status !== "accepted").length;
  const openExceptions = state.exceptions.filter((e) => e.status === "waiting" || e.status === "open" || e.status === "escalated").length;
  const unassignedHighPriority = state.cases.filter((c) => c.priority === "high" && c.status === "new").length;
  return {
    pendingFieldReports,
    openExceptions,
    unassignedHighPriority,
    ready: pendingFieldReports === 0 && openExceptions === 0 && unassignedHighPriority === 0,
  };
}

export async function listReports(): Promise<NationalReport[]> {
  return [...getState().reports];
}

export async function getReport(
  id: string,
): Promise<{ report: NationalReport; figures: ReportFigures; readiness: Readiness; frozen: boolean }> {
  const state = getState();
  const report = state.reports.find((r) => r.id === id);
  if (!report) throw new ServiceError("NOT_FOUND");
  return {
    report,
    figures: report.frozenFigures ?? computeFigures(state),
    readiness: computeReadiness(state),
    frozen: Boolean(report.frozenFigures),
  };
}

function load(draft: DemoState, id: string): NationalReport {
  const report = draft.reports.find((r) => r.id === id);
  if (!report) throw new ServiceError("NOT_FOUND");
  return report;
}

/** Simulated e-signature. The typed name is recorded; no signing service is contacted. */
export async function signReport(id: string, signerName: string): Promise<void> {
  const name = requireNote(signerName);
  await delay(600);
  const actor = currentActor();
  mutate((draft) => {
    const report = load(draft, id);
    if (report.status !== "draft") throw new ServiceError("INVALID_STATE");
    if (!computeReadiness(draft).ready) throw new ServiceError("CHECKS_INCOMPLETE");
    const signature = simulateSignature(draft, {
      signer: name,
      document: `${report.ref} ${report.title}`,
      entity: "report",
      entityId: id,
    });
    report.status = "signed";
    report.signedBy = signature.signedBy;
    report.signedAt = signature.signedAt;
    report.frozenFigures = computeFigures(draft);
    report.updatedAt = now();
    addAudit(draft, { actor, action: "reportSigned", params: { name: report.ref }, entity: "report", entityId: id, simulated: true });
  });
}

/** Simulated data exchange to every approved partner. */
export async function shareReport(id: string): Promise<void> {
  await delay(600);
  const actor = currentActor();
  mutate((draft) => {
    const report = load(draft, id);
    if (report.status !== "signed") throw new ServiceError("INVALID_STATE");
    const recipients = draft.partners.filter((p) => p.status === "approved").map((p) => p.name);
    simulateExchange(draft, { recipients, payload: `${report.ref} (signed PDF and aggregate indicators)`, entity: "report", entityId: id });
    report.status = "shared";
    report.sharedAt = now();
    report.sharedCount = recipients.length;
    report.updatedAt = now();
    addAudit(draft, {
      actor,
      action: "reportShared",
      params: { name: report.ref, count: recipients.length },
      entity: "report",
      entityId: id,
      simulated: true,
    });
  });
}

export async function reopenReport(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = currentActor();
  mutate((draft) => {
    const report = load(draft, id);
    if (report.status !== "signed") throw new ServiceError("INVALID_STATE");
    report.status = "draft";
    report.signedBy = undefined;
    report.signedAt = undefined;
    report.frozenFigures = undefined;
    report.updatedAt = now();
    addAudit(draft, { actor, action: "reportReopened", params: { name: report.ref }, entity: "report", entityId: id, note: reason });
  });
}
