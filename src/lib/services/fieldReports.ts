"use client";

import type { AssistanceException, FieldReport, Intervention, Partner } from "@/lib/types";
import { addAudit, getState, mutate } from "@/lib/demo/store";
import { currentActor, delay, now, requireNote, ServiceError } from "./core";
import { simulateNotification, simulateVerification } from "./external";

export interface FieldReportRow extends FieldReport {
  interventionRef: string;
  interventionTitle: string;
  settlementId: string;
  totalReached: number;
}

export function totalReached(report: FieldReport): number {
  return report.reached.women + report.reached.men + report.reached.children;
}

export async function listFieldReports(): Promise<FieldReportRow[]> {
  const state = getState();
  return state.fieldReports
    .map((report) => {
      const intervention = state.interventions.find((i) => i.id === report.interventionId);
      return {
        ...report,
        interventionRef: intervention?.ref ?? "—",
        interventionTitle: intervention?.title ?? "—",
        settlementId: intervention?.settlementId ?? "",
        totalReached: totalReached(report),
      };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getFieldReport(id: string): Promise<{
  report: FieldReport;
  intervention: Intervention;
  partner: Partner;
  exceptions: AssistanceException[];
}> {
  const state = getState();
  const report = state.fieldReports.find((r) => r.id === id);
  if (!report) throw new ServiceError("NOT_FOUND");
  const intervention = state.interventions.find((i) => i.id === report.interventionId);
  const partner = state.partners.find((p) => p.id === intervention?.partnerId);
  if (!intervention || !partner) throw new ServiceError("NOT_FOUND");
  return {
    report,
    intervention,
    partner,
    exceptions: state.exceptions.filter((e) => e.fieldReportId === id && e.status !== "waiting"),
  };
}

function load(draft: ReturnType<typeof getState>, id: string) {
  const report = draft.fieldReports.find((r) => r.id === id);
  if (!report) throw new ServiceError("NOT_FOUND");
  const intervention = draft.interventions.find((i) => i.id === report.interventionId);
  if (!intervention) throw new ServiceError("NOT_FOUND");
  return { report, intervention };
}

/** Accepting a report runs the (simulated) assistance-history check, which may open exceptions. */
export async function acceptFieldReport(id: string, note?: string): Promise<{ flagged: number }> {
  await delay(500);
  const actor = currentActor();
  return mutate((draft) => {
    const { report, intervention } = load(draft, id);
    if (intervention.status !== "approved" && intervention.status !== "completed") {
      throw new ServiceError("INTERVENTION_NOT_APPROVED");
    }
    if (report.status !== "submitted") throw new ServiceError("INVALID_STATE");
    report.status = "accepted";
    report.updatedAt = now();
    addAudit(draft, {
      actor,
      action: "fieldReportAccepted",
      params: { name: report.ref },
      entity: "fieldReport",
      entityId: id,
      note: note?.trim() || undefined,
    });
    return { flagged: simulateVerification(draft, report) };
  });
}

export async function returnFieldReport(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = currentActor();
  mutate((draft) => {
    const { report } = load(draft, id);
    if (report.status !== "submitted") throw new ServiceError("INVALID_STATE");
    report.status = "returned";
    report.updatedAt = now();
    addAudit(draft, { actor, action: "fieldReportReturned", params: { name: report.ref }, entity: "fieldReport", entityId: id, note: reason });
    simulateNotification(draft, {
      kind: "sms",
      recipient: report.submittedBy,
      message: `Field report ${report.ref} returned for correction.`,
      entity: "fieldReport",
      entityId: id,
    });
  });
}

/** Demo helper: stands in for the field team correcting and re-sending the form. */
export async function simulateResubmission(id: string): Promise<void> {
  await delay();
  mutate((draft) => {
    const { report } = load(draft, id);
    if (report.status !== "returned") throw new ServiceError("INVALID_STATE");
    report.status = "submitted";
    report.receivedAt = now();
    report.updatedAt = now();
    addAudit(draft, {
      actor: null,
      action: "fieldReportResubmitted",
      params: { name: report.ref },
      entity: "fieldReport",
      entityId: id,
      simulated: true,
    });
  });
}
