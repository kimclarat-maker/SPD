"use client";

import type { DemoState, DocumentCategory, DocumentRecord, Partner } from "@/lib/types";
import { addAudit, addNotification, getState, mutate, newId } from "@/lib/demo/store";
import { currentActor, DAY_MS, delay, now, requireNote, requirePermission, ServiceError } from "./core";
import { recordLabel } from "./lookup";
import { simulateSignatureRequest } from "./external";

export interface DocumentRow extends DocumentRecord {
  relatedRef?: string;
  relatedTitle?: string;
  currentVersion: number;
  expiry: "none" | "valid" | "expiring" | "expired";
}

export function expiryState(d: DocumentRecord, at = Date.now()): DocumentRow["expiry"] {
  if (!d.expiresAt || d.status === "missing") return "none";
  const t = new Date(d.expiresAt).getTime();
  if (t < at) return "expired";
  if (t < at + 30 * DAY_MS) return "expiring";
  return "valid";
}

function toRow(state: DemoState, d: DocumentRecord): DocumentRow {
  const label = d.related ? recordLabel(d.related.entity, d.related.id, state) : null;
  return {
    ...d,
    relatedRef: label?.ref,
    relatedTitle: label?.title,
    currentVersion: d.versions[d.versions.length - 1]?.version ?? 0,
    expiry: expiryState(d),
  };
}

export async function listDocuments(filter: { category?: DocumentCategory; relatedId?: string } = {}): Promise<DocumentRow[]> {
  const state = getState();
  return state.documents
    .filter((d) => (!filter.category || d.category === filter.category) && (!filter.relatedId || d.related?.id === filter.relatedId))
    .map((d) => toRow(state, d))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getDocument(id: string): Promise<{ document: DocumentRow; routes: DemoState["approvalRoutes"] }> {
  const state = getState();
  const d = state.documents.find((x) => x.id === id);
  if (!d) throw new ServiceError("NOT_FOUND");
  return { document: toRow(state, d), routes: state.approvalRoutes };
}

function load(draft: DemoState, id: string): DocumentRecord {
  const d = draft.documents.find((x) => x.id === id);
  if (!d) throw new ServiceError("NOT_FOUND");
  return d;
}

function log(draft: DemoState, d: DocumentRecord, actor: string | null, action: string, category: "decision" | "status" | "record", note?: string, params: Record<string, string | number> = {}, simulated?: boolean) {
  addAudit(draft, { actor, action, category, params: { name: d.title, ...params }, entity: "document", entityId: d.id, entityRef: d.ref, note, simulated });
  // Partner documents also appear on the partner's timeline.
  if (d.related && d.related.entity !== "document") {
    addAudit(draft, { actor, action, category, params: { name: d.title, ...params }, entity: d.related.entity, entityId: d.related.id, entityRef: recordLabel(d.related.entity, d.related.id, draft)?.ref, note, simulated });
  }
}

export function currentStep(d: DocumentRecord) {
  return d.route.find((s) => !s.decision);
}

/** Simulated upload of a new version. Earlier versions are kept. */
export async function addVersion(id: string, note: string): Promise<void> {
  const text = requireNote(note);
  await delay();
  const actor = requirePermission("document.review");
  mutate((draft) => {
    const d = load(draft, id);
    const version = (d.versions[d.versions.length - 1]?.version ?? 0) + 1;
    d.versions.push({ version, at: now(), author: actor, note: text, sizeKb: 300 + ((version * 97) % 400) });
    if (d.status === "missing" || d.status === "changes_requested" || d.status === "rejected") d.status = "draft";
    d.updatedAt = now();
    log(draft, d, actor, "documentVersionAdded", "record", text, { version });
  });
}

/** Starts (or restarts) the approval route configured for this kind of document. */
export async function routeForApproval(id: string, routeId: string, note?: string): Promise<void> {
  await delay();
  const actor = requirePermission("document.review");
  mutate((draft) => {
    const d = load(draft, id);
    if (!["draft", "changes_requested"].includes(d.status)) throw new ServiceError("INVALID_STATE");
    if (d.versions.length === 0) throw new ServiceError("MISSING_INFORMATION");
    const route = draft.approvalRoutes.find((r) => r.id === routeId);
    if (!route) throw new ServiceError("FIELD_REQUIRED");
    d.route = route.steps.map((role) => ({ id: newId("s"), role }));
    d.status = "in_review";
    d.updatedAt = now();
    log(draft, d, actor, "documentRouted", "status", note?.trim() || undefined, { route: route.name });
  });
}

/** Records a decision on the current step of the route. A reason is always required. */
export async function decideStep(id: string, decision: "approved" | "changes_requested" | "rejected", note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("document.review");
  mutate((draft) => applyStepDecision(draft, load(draft, id), actor, decision, reason));
}

/** SIMULATED electronic signature request. No signing or authentication service is contacted. */
export async function requestSignature(id: string, signer: string): Promise<void> {
  if (!signer.trim()) throw new ServiceError("FIELD_REQUIRED");
  await delay(600);
  const actor = requirePermission("document.sign");
  mutate((draft) => applySignatureRequest(draft, load(draft, id), actor, signer));
}

/** SIMULATED signature request, shared by the OPM screen and the demonstration controls. */
export function applySignatureRequest(draft: DemoState, d: DocumentRecord, actor: string, signer: string): void {
  if (d.status !== "approved") throw new ServiceError("CHECKS_INCOMPLETE");
  if (d.signature.status === "signed" || d.signature.status === "requested") throw new ServiceError("INVALID_STATE");
  d.signature = { status: "requested", signer: signer.trim(), requestedAt: now(), simulated: true };
  d.updatedAt = now();
  log(draft, d, actor, "signatureRequested", "status", undefined, { signer: signer.trim() }, true);
  simulateSignatureRequest(draft, { signer: signer.trim(), document: d.title, entity: "document", entityId: d.id, entityRef: d.ref });
}

/** Demo helper: stands in for the signer completing the simulated e-signature. */
export async function simulateSignatureCompleted(id: string, declined = false): Promise<void> {
  await delay(600);
  currentActor();
  mutate((draft) => {
    const d = load(draft, id);
    if (d.signature.status !== "requested") throw new ServiceError("INVALID_STATE");
    d.signature = { ...d.signature, status: declined ? "declined" : "signed", signedAt: declined ? undefined : now() };
    d.updatedAt = now();
    log(draft, d, null, declined ? "documentSignatureDeclined" : "documentSigned", "decision", undefined, {}, true);
    addNotification(draft, { kind: "decision", message: declined ? "signatureDeclined" : "signatureCompleted", params: { ref: d.ref }, entity: "document", entityId: d.id });
  });
}

/**
 * On approval, OPM prepares the partner's memorandum of understanding from
 * the template. It goes through legal review and the Commissioner before a
 * signature is requested from the partner's authorised signatory.
 */
export function prepareMou(draft: DemoState, p: Partner, actor: string): DocumentRecord {
  const existing = draft.documents.find((d) => d.category === "mou" && d.related?.entity === "partner" && d.related.id === p.id);
  if (existing) return existing;
  const mou: DocumentRecord = {
    id: newId("doc"),
    ref: `DOC-2026-${String(700 + draft.documents.length)}`,
    title: `Memorandum of understanding — ${p.name}`,
    category: "mou",
    owner: "OPM Department of Refugees",
    related: { entity: "partner", id: p.id },
    classification: "internal",
    versions: [{ version: 1, at: now(), author: actor, note: `Draft from template. Operating areas and sectors taken from the approved accreditation.`, sizeKb: 604 }],
    status: "in_review",
    route: [
      { id: newId("s"), role: "Legal review", assignee: "Legal officer (fictional)" },
      { id: newId("s"), role: "Commissioner for Refugees", assignee: "Commissioner's office (fictional)" },
    ],
    signature: { status: "not_requested", simulated: true },
    updatedAt: now(),
  };
  draft.documents.push(mou);
  log(draft, mou, actor, "documentUploaded", "record", undefined, { version: 1 });
  return mou;
}

/** Records one route decision on a document (shared by the OPM screen and the demonstration controls). */
export function applyStepDecision(draft: DemoState, d: DocumentRecord, actor: string, decision: "approved" | "changes_requested" | "rejected", reason: string, simulated?: boolean): void {
  if (d.status !== "in_review") throw new ServiceError("INVALID_STATE");
  const step = currentStep(d);
  if (!step) throw new ServiceError("INVALID_STATE");
  step.decision = decision;
  step.by = actor;
  step.at = now();
  step.note = reason;
  if (decision === "approved") {
    if (!currentStep(d)) d.status = "approved";
  } else {
    d.status = decision;
  }
  d.updatedAt = now();
  log(draft, d, actor, `documentStep_${decision}`, "decision", reason, { step: step.role }, simulated);
}

/** Documents expiring within 30 days or already expired (required documents only). */
export function expiringDocuments(state: DemoState): DocumentRecord[] {
  return state.documents.filter((d) => d.required && ["expiring", "expired"].includes(expiryState(d)));
}
