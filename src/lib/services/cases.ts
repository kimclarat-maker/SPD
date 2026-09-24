"use client";

import type { Partner, ServiceCase } from "@/lib/types";
import { addAudit, getState, mutate } from "@/lib/demo/store";
import { currentActor, delay, now, requireNote, ServiceError } from "./core";
import { simulateNotification } from "./external";

export interface CaseRow extends ServiceCase {
  partnerName?: string;
  overdue: boolean;
}

export function isOverdue(c: ServiceCase, at = new Date()): boolean {
  return (c.status === "new" || c.status === "assigned" || c.status === "in_progress") && new Date(c.dueAt) < at;
}

export async function listCases(): Promise<CaseRow[]> {
  const state = getState();
  return state.cases
    .map((c) => ({
      ...c,
      partnerName: state.partners.find((p) => p.id === c.assignedPartnerId)?.name,
      overdue: isOverdue(c),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCase(id: string): Promise<{ serviceCase: ServiceCase; partner?: Partner; overdue: boolean }> {
  const state = getState();
  const serviceCase = state.cases.find((c) => c.id === id);
  if (!serviceCase) throw new ServiceError("NOT_FOUND");
  return {
    serviceCase,
    partner: state.partners.find((p) => p.id === serviceCase.assignedPartnerId),
    overdue: isOverdue(serviceCase),
  };
}

function load(draft: ReturnType<typeof getState>, id: string): ServiceCase {
  const c = draft.cases.find((x) => x.id === id);
  if (!c) throw new ServiceError("NOT_FOUND");
  return c;
}

/** Cases can only be assigned to approved partners. */
export async function assignCase(id: string, partnerId: string, note?: string): Promise<void> {
  await delay();
  const actor = currentActor();
  mutate((draft) => {
    const c = load(draft, id);
    const partner = draft.partners.find((p) => p.id === partnerId);
    if (!partner) throw new ServiceError("NOT_FOUND");
    if (partner.status !== "approved") throw new ServiceError("PARTNER_NOT_APPROVED");
    if (c.status !== "new" && c.status !== "assigned") throw new ServiceError("INVALID_STATE");
    c.assignedPartnerId = partnerId;
    c.status = "assigned";
    c.updatedAt = now();
    addAudit(draft, {
      actor,
      action: "caseAssigned",
      params: { name: c.ref, partner: partner.name },
      entity: "case",
      entityId: id,
      note: note?.trim() || undefined,
    });
    simulateNotification(draft, {
      kind: "email",
      recipient: `${partner.focalRole}, ${partner.name}`,
      message: `Service case ${c.ref} assigned to your organisation. Response due ${c.dueAt.slice(0, 10)}.`,
      entity: "case",
      entityId: id,
    });
  });
}

export async function startCase(id: string): Promise<void> {
  await delay();
  const actor = currentActor();
  mutate((draft) => {
    const c = load(draft, id);
    if (c.status !== "assigned") throw new ServiceError("INVALID_STATE");
    c.status = "in_progress";
    c.updatedAt = now();
    addAudit(draft, { actor, action: "caseStarted", params: { name: c.ref }, entity: "case", entityId: id });
  });
}

export async function resolveCase(id: string, resolution: string): Promise<void> {
  const text = requireNote(resolution);
  await delay();
  const actor = currentActor();
  mutate((draft) => {
    const c = load(draft, id);
    if (c.status !== "assigned" && c.status !== "in_progress") throw new ServiceError("INVALID_STATE");
    c.status = "resolved";
    c.resolution = text;
    c.updatedAt = now();
    addAudit(draft, { actor, action: "caseResolved", params: { name: c.ref }, entity: "case", entityId: id, note: text });
  });
}

export async function closeCase(id: string): Promise<void> {
  await delay();
  const actor = currentActor();
  mutate((draft) => {
    const c = load(draft, id);
    if (c.status !== "resolved") throw new ServiceError("INVALID_STATE");
    c.status = "closed";
    c.updatedAt = now();
    addAudit(draft, { actor, action: "caseClosed", params: { name: c.ref }, entity: "case", entityId: id });
  });
}

/** Simulated SMS to the requester. Queued in the outbox only; nothing is delivered. */
export async function notifyRequester(id: string): Promise<void> {
  await delay();
  const actor = currentActor();
  mutate((draft) => {
    const c = load(draft, id);
    simulateNotification(draft, {
      kind: "sms",
      recipient: `Requester ${c.requesterRef}`,
      message: `Update on your request ${c.ref}: status is now "${c.status.replace("_", " ")}".`,
      entity: "case",
      entityId: id,
    });
    addAudit(draft, { actor, action: "caseNotified", params: { name: c.ref }, entity: "case", entityId: id, simulated: true });
  });
}
