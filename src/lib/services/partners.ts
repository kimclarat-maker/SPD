"use client";

import type { Intervention, Partner } from "@/lib/types";
import { addAudit, getState, mutate } from "@/lib/demo/store";
import { currentActor, delay, now, requireNote, ServiceError } from "./core";
import { simulateNotification, simulateSignature } from "./external";

export interface PartnerChecks {
  documentsVerified: boolean;
  agreementSigned: boolean;
  ready: boolean;
}

export function partnerChecks(partner: Partner): PartnerChecks {
  const documentsVerified = partner.documents.every((doc) => doc.status === "verified");
  const agreementSigned = partner.agreement.status === "signed";
  return { documentsVerified, agreementSigned, ready: documentsVerified && agreementSigned };
}

export async function listPartners(): Promise<Partner[]> {
  return [...getState().partners].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function listApprovedPartners(): Promise<Partner[]> {
  return getState()
    .partners.filter((p) => p.status === "approved")
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPartner(id: string): Promise<{ partner: Partner; interventions: Intervention[] }> {
  const state = getState();
  const partner = state.partners.find((p) => p.id === id);
  if (!partner) throw new ServiceError("NOT_FOUND");
  return { partner, interventions: state.interventions.filter((i) => i.partnerId === id) };
}

function findPartner(draft: ReturnType<typeof getState>, id: string): Partner {
  const partner = draft.partners.find((p) => p.id === id);
  if (!partner) throw new ServiceError("NOT_FOUND");
  return partner;
}

export async function verifyDocument(partnerId: string, documentId: string): Promise<void> {
  await delay();
  const actor = currentActor();
  mutate((draft) => {
    const partner = findPartner(draft, partnerId);
    const doc = partner.documents.find((d) => d.id === documentId);
    if (!doc || doc.status !== "pending") throw new ServiceError("INVALID_STATE");
    doc.status = "verified";
    partner.updatedAt = now();
    addAudit(draft, {
      actor,
      action: "partnerDocApproved",
      params: { name: partner.name, doc: doc.name },
      entity: "partner",
      entityId: partner.id,
    });
  });
}

/** Simulated e-signature: the fictional partner signatory "signs" immediately. */
export async function requestAgreementSignature(partnerId: string): Promise<void> {
  await delay(600);
  const actor = currentActor();
  mutate((draft) => {
    const partner = findPartner(draft, partnerId);
    if (partner.agreement.status === "signed") throw new ServiceError("INVALID_STATE");
    addAudit(draft, {
      actor,
      action: "partnerSignatureRequested",
      params: { name: partner.name },
      entity: "partner",
      entityId: partner.id,
      simulated: true,
    });
    const signature = simulateSignature(draft, {
      signer: `${partner.focalRole}, ${partner.name} (fictional)`,
      document: `Partnership agreement ${partner.ref}`,
      entity: "partner",
      entityId: partner.id,
    });
    partner.agreement = { status: "signed", ...signature };
    partner.updatedAt = now();
    addAudit(draft, {
      actor: null,
      action: "partnerSigned",
      params: { name: partner.name },
      entity: "partner",
      entityId: partner.id,
      simulated: true,
    });
  });
}

export async function approvePartner(id: string, note?: string): Promise<void> {
  await delay();
  const actor = currentActor();
  mutate((draft) => {
    const partner = findPartner(draft, id);
    if (partner.status !== "pending") throw new ServiceError("INVALID_STATE");
    if (!partnerChecks(partner).ready) throw new ServiceError("CHECKS_INCOMPLETE");
    partner.status = "approved";
    partner.updatedAt = now();
    addAudit(draft, {
      actor,
      action: "partnerApproved",
      params: { name: partner.name },
      entity: "partner",
      entityId: partner.id,
      note: note?.trim() || undefined,
    });
    simulateNotification(draft, {
      kind: "email",
      recipient: `${partner.focalRole}, ${partner.name}`,
      message: `Your organisation has been approved as a response partner (${partner.ref}).`,
      entity: "partner",
      entityId: partner.id,
    });
  });
}

export async function rejectPartner(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = currentActor();
  mutate((draft) => {
    const partner = findPartner(draft, id);
    if (partner.status !== "pending") throw new ServiceError("INVALID_STATE");
    partner.status = "rejected";
    partner.updatedAt = now();
    addAudit(draft, { actor, action: "partnerRejected", params: { name: partner.name }, entity: "partner", entityId: id, note: reason });
  });
}

export async function suspendPartner(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = currentActor();
  mutate((draft) => {
    const partner = findPartner(draft, id);
    if (partner.status !== "approved") throw new ServiceError("INVALID_STATE");
    partner.status = "suspended";
    partner.updatedAt = now();
    addAudit(draft, { actor, action: "partnerSuspended", params: { name: partner.name }, entity: "partner", entityId: id, note: reason });
  });
}

export async function reinstatePartner(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = currentActor();
  mutate((draft) => {
    const partner = findPartner(draft, id);
    if (partner.status !== "suspended") throw new ServiceError("INVALID_STATE");
    partner.status = "approved";
    partner.updatedAt = now();
    addAudit(draft, { actor, action: "partnerReinstated", params: { name: partner.name }, entity: "partner", entityId: id, note: reason });
  });
}
