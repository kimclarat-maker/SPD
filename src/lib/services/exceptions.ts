"use client";

import type { AssistanceException, FieldReport, Intervention } from "@/lib/types";
import { addAudit, getState, mutate } from "@/lib/demo/store";
import { currentActor, delay, now, requireNote, ServiceError } from "./core";

export type ExceptionDecision = "cleared" | "duplicate" | "escalated";

export interface ExceptionRow extends AssistanceException {
  fieldReportRef: string;
  settlementId: string;
}

export async function listExceptions(): Promise<ExceptionRow[]> {
  const state = getState();
  return state.exceptions
    .map((ex) => {
      const report = state.fieldReports.find((r) => r.id === ex.fieldReportId);
      const intervention = state.interventions.find((i) => i.id === report?.interventionId);
      return { ...ex, fieldReportRef: report?.ref ?? "—", settlementId: intervention?.settlementId ?? "" };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getException(
  id: string,
): Promise<{ exception: AssistanceException; report: FieldReport; intervention: Intervention }> {
  const state = getState();
  const exception = state.exceptions.find((e) => e.id === id);
  if (!exception) throw new ServiceError("NOT_FOUND");
  const report = state.fieldReports.find((r) => r.id === exception.fieldReportId);
  const intervention = state.interventions.find((i) => i.id === report?.interventionId);
  if (!report || !intervention) throw new ServiceError("NOT_FOUND");
  return { exception, report, intervention };
}

const actions: Record<ExceptionDecision, string> = {
  cleared: "exceptionCleared",
  duplicate: "exceptionDuplicate",
  escalated: "exceptionEscalated",
};

/** A decision needs the source field report to be accepted, and always needs a recorded reason. */
export async function decideException(id: string, decision: ExceptionDecision, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = currentActor();
  mutate((draft) => {
    const exception = draft.exceptions.find((e) => e.id === id);
    if (!exception) throw new ServiceError("NOT_FOUND");
    if (exception.status === "waiting") throw new ServiceError("REPORT_NOT_ACCEPTED");
    if (exception.status !== "open" && exception.status !== "escalated") throw new ServiceError("INVALID_STATE");
    if (decision === "escalated" && exception.status === "escalated") throw new ServiceError("INVALID_STATE");
    exception.status = decision;
    exception.updatedAt = now();
    addAudit(draft, { actor, action: actions[decision], params: { name: exception.ref }, entity: "exception", entityId: id, note: reason });
  });
}
