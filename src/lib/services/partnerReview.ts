"use client";

import type { DemoState, Intervention, Partner } from "@/lib/types";
import { addAudit, getState, mutate, newId } from "@/lib/demo/store";
import { delay, now, requireNote, requirePermission, ServiceError } from "./core";
import { simulateMessage } from "./external";

/**
 * OPM decisions on what partners submit from the Partner Portal: profile
 * changes, scope/location/budget change requests, progress updates, risk
 * flags and expenditure updates. Each decision is written to the record's
 * audit trail, which is also how the partner's inbox learns about it.
 */

function loadPartner(draft: DemoState, id: string): Partner {
  const p = draft.partners.find((x) => x.id === id);
  if (!p) throw new ServiceError("NOT_FOUND");
  return p;
}

function loadIntervention(draft: DemoState, id: string): Intervention {
  const i = draft.interventions.find((x) => x.id === id);
  if (!i || i.status === "draft") throw new ServiceError("NOT_FOUND");
  return i;
}

function decision(draft: DemoState, entity: "partner" | "intervention", id: string, ref: string, actor: string, action: string, reason: string, params: Record<string, string | number> = {}, simulated?: boolean) {
  addAudit(draft, { actor, action, category: "decision", params: { name: ref, ...params }, entity, entityId: id, entityRef: ref, note: reason, simulated });
}

/* ------------------------------------------------------- Profile changes */

export function applyProfileChangeDecision(draft: DemoState, partnerId: string, changeId: string, approve: boolean, actor: string, reason: string, simulated?: boolean): void {
  const p = loadPartner(draft, partnerId);
  const c = (p.profileChanges ?? []).find((x) => x.id === changeId);
  if (!c || c.status !== "under_review") throw new ServiceError("INVALID_STATE");
  if (approve) {
    const d = c.proposed;
    if (d.acronym !== undefined) p.acronym = d.acronym;
    if (d.tin !== undefined) p.tin = d.tin;
    if (d.focalRole !== undefined) p.focalRole = d.focalRole;
    if (d.contacts !== undefined) p.contacts = { ...d.contacts };
    if (d.personnel !== undefined) p.personnel = d.personnel.map((x) => ({ ...x }));
  }
  c.status = approve ? "approved" : "returned";
  c.decidedAt = now();
  c.decidedBy = actor;
  c.decisionNote = reason;
  p.updatedAt = now();
  decision(draft, "partner", p.id, p.ref, actor, approve ? "profileChangeApproved" : "profileChangeReturned", reason, { ref: c.ref, partner: p.name }, simulated);
  simulateMessage(draft, { channel: "email", recipient: `${p.focalRole}, ${p.name}`, entity: "partner", entityId: p.id, entityRef: p.ref });
}

export async function decideProfileChange(partnerId: string, changeId: string, approve: boolean, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("partner.decide");
  mutate((draft) => applyProfileChangeDecision(draft, partnerId, changeId, approve, actor, reason));
}

/* ------------------------------------------------------- Change requests */

/** Approving applies the amendment to the approved record; nothing changed before this point. */
export async function decideChangeRequest(interventionId: string, requestId: string, approve: boolean, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("intervention.decide");
  mutate((draft) => {
    const i = loadIntervention(draft, interventionId);
    const c = (i.changeRequests ?? []).find((x) => x.id === requestId);
    if (!c || c.status !== "submitted") throw new ServiceError("INVALID_STATE");
    if (approve) {
      const d = c.proposed;
      if (d.objective !== undefined) i.objective = d.objective;
      if (d.activities !== undefined) i.activities = [...d.activities];
      if (d.settlementId !== undefined) i.settlementId = d.settlementId;
      if (d.servicePointIds !== undefined) i.servicePointIds = [...d.servicePointIds];
      if (d.endDate !== undefined) i.endDate = d.endDate;
      if (d.budgetUsd !== undefined) {
        // Budget lines are scaled to the approved total so they keep adding up.
        const lines = i.budgetLines ?? [];
        const old = lines.reduce((s, l) => s + l.amountUsd, 0);
        if (lines.length && old > 0) {
          let remaining = d.budgetUsd;
          i.budgetLines = lines.map((l, index) => {
            const amount = index === lines.length - 1 ? remaining : Math.round((l.amountUsd / old) * d.budgetUsd!);
            remaining -= amount;
            return { ...l, amountUsd: amount };
          });
        }
        i.budgetUsd = d.budgetUsd;
      }
    }
    c.status = approve ? "approved" : "rejected";
    c.decidedAt = now();
    c.decidedBy = actor;
    c.decisionNote = reason;
    i.comments.push({ id: newId("c"), at: now(), author: actor, text: `${c.ref}: ${reason}` });
    i.updatedAt = now();
    decision(draft, "intervention", i.id, i.ref, actor, approve ? "changeRequestApproved" : "changeRequestRejected", reason, { ref: c.ref });
  });
}

/* ------------------------------------------------ Progress, risks, finance */

export function applyProgressReview(draft: DemoState, interventionId: string, updateId: string, acknowledge: boolean, actor: string, reason: string, simulated?: boolean): void {
  const i = loadIntervention(draft, interventionId);
  const u = (i.progressUpdates ?? []).find((x) => x.id === updateId);
  if (!u || u.status !== "awaiting_review") throw new ServiceError("INVALID_STATE");
  u.status = acknowledge ? "acknowledged" : "returned";
  u.reviewNote = reason;
  u.reviewedBy = actor;
  u.reviewedAt = now();
  // A milestone counts as done only once OPM acknowledges the update that reports it.
  if (acknowledge && u.milestoneId) {
    const m = i.milestones.find((x) => x.id === u.milestoneId);
    if (m) m.done = true;
  }
  i.updatedAt = now();
  decision(draft, "intervention", i.id, i.ref, actor, acknowledge ? "progressUpdateAcknowledged" : "progressUpdateReturned", reason, {}, simulated);
}

export async function reviewProgressUpdate(interventionId: string, updateId: string, acknowledge: boolean, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("intervention.review");
  mutate((draft) => applyProgressReview(draft, interventionId, updateId, acknowledge, actor, reason));
}

export async function acknowledgeRisk(interventionId: string, riskId: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("intervention.review");
  mutate((draft) => {
    const i = loadIntervention(draft, interventionId);
    const r = (i.risks ?? []).find((x) => x.id === riskId);
    if (!r || r.status !== "open") throw new ServiceError("INVALID_STATE");
    r.status = "acknowledged";
    r.opmNote = reason;
    i.updatedAt = now();
    decision(draft, "intervention", i.id, i.ref, actor, "riskAcknowledged", reason);
  });
}

export function applyFinancialDecision(draft: DemoState, interventionId: string, updateId: string, accept: boolean, actor: string, reason: string, simulated?: boolean): void {
  const i = loadIntervention(draft, interventionId);
  const u = (i.financialUpdates ?? []).find((x) => x.id === updateId);
  if (!u || u.status !== "submitted") throw new ServiceError("INVALID_STATE");
  u.status = accept ? "accepted" : "returned";
  u.decidedAt = now();
  u.decidedBy = actor;
  u.comments.push({ id: newId("c"), at: now(), author: actor, text: reason });
  u.updatedAt = now();
  i.updatedAt = now();
  decision(draft, "intervention", i.id, i.ref, actor, accept ? "financialUpdateAccepted" : "financialUpdateReturned", reason, { ref: u.ref }, simulated);
}

export async function decideFinancialUpdate(interventionId: string, updateId: string, accept: boolean, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("intervention.review");
  mutate((draft) => applyFinancialDecision(draft, interventionId, updateId, accept, actor, reason));
}

/* ---------------------------------------------------------- OPM queue */

export interface PartnerUpdateItem {
  kind: "profileChange" | "changeRequest" | "progressUpdate" | "risk" | "financialUpdate";
  entity: "partner" | "intervention";
  entityId: string;
  ref: string;
  itemRef: string;
  partnerName: string;
  at: string;
}

/** Partner submissions waiting for an OPM decision, for the Needs attention queue. */
export function pendingPartnerUpdates(state: DemoState = getState()): PartnerUpdateItem[] {
  const items: PartnerUpdateItem[] = [];
  for (const p of state.partners) {
    for (const c of (p.profileChanges ?? []).filter((x) => x.status === "under_review")) {
      items.push({ kind: "profileChange", entity: "partner", entityId: p.id, ref: p.ref, itemRef: c.ref, partnerName: p.name, at: c.submittedAt });
    }
  }
  for (const i of state.interventions.filter((x) => x.status !== "draft")) {
    const partnerName = state.partners.find((p) => p.id === i.partnerId)?.name ?? "—";
    for (const c of (i.changeRequests ?? []).filter((x) => x.status === "submitted")) items.push({ kind: "changeRequest", entity: "intervention", entityId: i.id, ref: i.ref, itemRef: c.ref, partnerName, at: c.at });
    for (const u of (i.progressUpdates ?? []).filter((x) => x.status === "awaiting_review")) items.push({ kind: "progressUpdate", entity: "intervention", entityId: i.id, ref: i.ref, itemRef: i.ref, partnerName, at: u.at });
    for (const r of (i.risks ?? []).filter((x) => x.status === "open")) items.push({ kind: "risk", entity: "intervention", entityId: i.id, ref: i.ref, itemRef: r.severity, partnerName, at: r.at });
    for (const f of (i.financialUpdates ?? []).filter((x) => x.status === "submitted")) items.push({ kind: "financialUpdate", entity: "intervention", entityId: i.id, ref: i.ref, itemRef: f.ref, partnerName, at: f.submittedAt ?? f.updatedAt });
  }
  return items;
}
