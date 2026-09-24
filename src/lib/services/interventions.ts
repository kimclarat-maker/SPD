"use client";

import type { FieldReport, Intervention, Partner } from "@/lib/types";
import { addAudit, getState, mutate } from "@/lib/demo/store";
import { currentActor, delay, now, requireNote, ServiceError } from "./core";
import { simulateNotification } from "./external";

export interface InterventionRow extends Intervention {
  partnerName: string;
  partnerStatus: Partner["status"];
}

export async function listInterventions(): Promise<InterventionRow[]> {
  const state = getState();
  return state.interventions
    .map((item) => {
      const partner = state.partners.find((p) => p.id === item.partnerId);
      return { ...item, partnerName: partner?.name ?? "—", partnerStatus: partner?.status ?? "pending" };
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getIntervention(
  id: string,
): Promise<{ intervention: Intervention; partner: Partner; fieldReports: FieldReport[] }> {
  const state = getState();
  const intervention = state.interventions.find((i) => i.id === id);
  if (!intervention) throw new ServiceError("NOT_FOUND");
  const partner = state.partners.find((p) => p.id === intervention.partnerId);
  if (!partner) throw new ServiceError("NOT_FOUND");
  return { intervention, partner, fieldReports: state.fieldReports.filter((r) => r.interventionId === id) };
}

function load(draft: ReturnType<typeof getState>, id: string) {
  const intervention = draft.interventions.find((i) => i.id === id);
  if (!intervention) throw new ServiceError("NOT_FOUND");
  const partner = draft.partners.find((p) => p.id === intervention.partnerId);
  if (!partner) throw new ServiceError("NOT_FOUND");
  return { intervention, partner };
}

/** Only an approved partner's intervention can be approved; approval releases held field reports. */
export async function approveIntervention(id: string, note?: string): Promise<void> {
  await delay();
  const actor = currentActor();
  mutate((draft) => {
    const { intervention, partner } = load(draft, id);
    if (partner.status !== "approved") throw new ServiceError("PARTNER_NOT_APPROVED");
    if (intervention.status !== "submitted") throw new ServiceError("INVALID_STATE");
    intervention.status = "approved";
    intervention.updatedAt = now();
    addAudit(draft, {
      actor,
      action: "interventionApproved",
      params: { name: intervention.ref },
      entity: "intervention",
      entityId: id,
      note: note?.trim() || undefined,
    });
    simulateNotification(draft, {
      kind: "email",
      recipient: `${partner.focalRole}, ${partner.name}`,
      message: `Intervention ${intervention.ref} approved. Field reports can now be reviewed.`,
      entity: "intervention",
      entityId: id,
    });
    for (const report of draft.fieldReports.filter((r) => r.interventionId === id && r.status === "held")) {
      report.status = "submitted";
      report.updatedAt = now();
      addAudit(draft, {
        actor: null,
        action: "fieldReportReleased",
        params: { name: report.ref },
        entity: "fieldReport",
        entityId: report.id,
      });
    }
  });
}

async function decide(id: string, note: string, status: "returned" | "rejected", action: string) {
  const reason = requireNote(note);
  await delay();
  const actor = currentActor();
  mutate((draft) => {
    const { intervention, partner } = load(draft, id);
    if (intervention.status !== "submitted") throw new ServiceError("INVALID_STATE");
    intervention.status = status;
    intervention.updatedAt = now();
    addAudit(draft, { actor, action, params: { name: intervention.ref }, entity: "intervention", entityId: id, note: reason });
    simulateNotification(draft, {
      kind: "email",
      recipient: `${partner.focalRole}, ${partner.name}`,
      message: `Intervention ${intervention.ref}: ${status === "returned" ? "returned for changes" : "not approved"}.`,
      entity: "intervention",
      entityId: id,
    });
  });
}

export function returnIntervention(id: string, note: string) {
  return decide(id, note, "returned", "interventionReturned");
}

export function rejectIntervention(id: string, note: string) {
  return decide(id, note, "rejected", "interventionRejected");
}

export async function completeIntervention(id: string, note?: string): Promise<void> {
  await delay();
  const actor = currentActor();
  mutate((draft) => {
    const { intervention } = load(draft, id);
    if (intervention.status !== "approved") throw new ServiceError("INVALID_STATE");
    intervention.status = "completed";
    intervention.updatedAt = now();
    addAudit(draft, {
      actor,
      action: "interventionCompleted",
      params: { name: intervention.ref },
      entity: "intervention",
      entityId: id,
      note: note?.trim() || undefined,
    });
  });
}
