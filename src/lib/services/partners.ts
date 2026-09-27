"use client";

import type { ComplianceStatus, DemoState, DocumentRecord, Intervention, Partner, PartnerStatus, VerificationOutcome } from "@/lib/types";
import { addAudit, getState, mutate, newId } from "@/lib/demo/store";
import { currentActor, DAY_MS, delay, inScope, now, requireNote, requirePermission, ServiceError } from "./core";
import { match, type RecordFilters } from "./filters";
import { simulateMessage, simulateRegistryCheck } from "./external";
import { prepareMou } from "./documents";

export const OPEN_APPLICATION: PartnerStatus[] = ["submitted", "completeness_review", "verification"];

export interface Compliance {
  status: ComplianceStatus;
  /** Earliest upcoming or passed expiry among accreditation and required documents. */
  nextExpiry?: { label: string; at: string };
  missing: number;
}

export interface Eligibility {
  eligible: boolean;
  reason?: "not_approved" | "suspended" | "accreditation_expired" | "document_expired";
}

export interface PartnerChecks {
  documentsUploaded: boolean;
  documentsVerified: boolean;
  ursb: boolean;
  ngoBureau: boolean;
  ready: boolean;
}

export function partnerDocuments(state: DemoState, partnerId: string): DocumentRecord[] {
  return state.documents.filter((d) => d.related?.entity === "partner" && d.related.id === partnerId);
}

export function partnerCompliance(state: DemoState, p: Partner, at = new Date()): Compliance {
  const docs = partnerDocuments(state, p.id).filter((d) => d.required);
  const missing = docs.filter((d) => d.status === "missing" || d.status === "rejected").length;
  const expiries = [
    ...(p.accreditedUntil ? [{ label: "accreditation", at: p.accreditedUntil }] : []),
    ...docs.filter((d) => d.expiresAt && d.status !== "missing").map((d) => ({ label: d.title, at: d.expiresAt! })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const nextExpiry = expiries[0];
  const soon = at.getTime() + 30 * DAY_MS;
  let status: ComplianceStatus = "compliant";
  if (!OPEN_APPLICATION.includes(p.status) && p.status !== "changes_requested" && p.status !== "rejected") {
    if (nextExpiry && new Date(nextExpiry.at) < at) status = "expired";
    else if (missing > 0) status = "incomplete";
    else if (nextExpiry && new Date(nextExpiry.at).getTime() < soon) status = "expiring";
  } else {
    status = "incomplete";
  }
  return { status, nextExpiry, missing };
}

/** Only an approved partner with valid accreditation and in-date documents may submit or run interventions. */
export function partnerEligibility(state: DemoState, p: Partner, at = new Date()): Eligibility {
  if (p.status === "suspended") return { eligible: false, reason: "suspended" };
  if (p.status !== "approved") return { eligible: false, reason: "not_approved" };
  if (!p.accreditedUntil || new Date(p.accreditedUntil) < at) return { eligible: false, reason: "accreditation_expired" };
  const expiredDoc = partnerDocuments(state, p.id).some((d) => d.required && d.expiresAt && new Date(d.expiresAt) < at);
  if (expiredDoc) return { eligible: false, reason: "document_expired" };
  return { eligible: true };
}

export function partnerChecks(state: DemoState, p: Partner): PartnerChecks {
  const docs = partnerDocuments(state, p.id).filter((d) => d.required);
  const documentsUploaded = docs.every((d) => d.status !== "missing");
  const documentsVerified = docs.every((d) => d.status === "approved");
  const ursb = p.verification.ursb.outcome === "match";
  const ngoBureau = p.verification.ngoBureau.outcome === "match";
  return { documentsUploaded, documentsVerified, ursb, ngoBureau, ready: documentsVerified && ursb && ngoBureau };
}

export interface PartnerRow extends Partner {
  compliance: Compliance;
  eligibility: Eligibility;
  lastActivityAt: string;
}

function lastActivity(state: DemoState, entityId: string, fallback: string): string {
  return state.audit.find((a) => a.entityId === entityId)?.at ?? fallback;
}

export async function listPartners(filters: RecordFilters = {}): Promise<PartnerRow[]> {
  const state = getState();
  return state.partners
    .filter((p) => match.partner(state, p, filters))
    .map((p) => ({
      ...p,
      compliance: partnerCompliance(state, p),
      eligibility: partnerEligibility(state, p),
      lastActivityAt: lastActivity(state, p.id, p.updatedAt),
    }))
    .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
}

export async function listEligiblePartners(): Promise<Partner[]> {
  const state = getState();
  return state.partners.filter((p) => partnerEligibility(state, p).eligible).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getPartner(id: string): Promise<{
  partner: Partner;
  documents: DocumentRecord[];
  interventions: Intervention[];
  compliance: Compliance;
  eligibility: Eligibility;
  checks: PartnerChecks;
  reviewers: string[];
}> {
  const state = getState();
  const partner = state.partners.find((p) => p.id === id);
  // A draft profile stays private to the partner organisation until it submits the application.
  if (!partner || partner.status === "draft") throw new ServiceError("NOT_FOUND");
  if (!partner.settlementIds.some((s) => inScope(s))) throw new ServiceError("OUT_OF_SCOPE");
  return {
    partner,
    documents: partnerDocuments(state, id),
    interventions: state.interventions.filter((i) => i.partnerId === id),
    compliance: partnerCompliance(state, partner),
    eligibility: partnerEligibility(state, partner),
    checks: partnerChecks(state, partner),
    reviewers: state.users.filter((u) => u.status === "active" && u.role === "opm_coordinator").map((u) => u.name),
  };
}

function load(draft: DemoState, id: string): Partner {
  const partner = draft.partners.find((p) => p.id === id);
  if (!partner) throw new ServiceError("NOT_FOUND");
  return partner;
}

function audit(draft: DemoState, p: Partner, actor: string | null, action: string, category: "decision" | "status" | "record", note?: string, params: Record<string, string> = {}) {
  addAudit(draft, { actor, action, category, params: { name: p.name, ...params }, entity: "partner", entityId: p.id, entityRef: p.ref, note });
}

export async function assignReviewer(id: string, reviewer: string, note?: string): Promise<void> {
  if (!reviewer) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const actor = requirePermission("partner.review");
  mutate((draft) => {
    const p = load(draft, id);
    if (!OPEN_APPLICATION.includes(p.status) && p.status !== "changes_requested") throw new ServiceError("INVALID_STATE");
    p.assignedReviewer = reviewer;
    p.updatedAt = now();
    audit(draft, p, actor, "partnerReviewerAssigned", "status", note?.trim() || undefined, { reviewer });
  });
}

/** Submitted → Completeness review. */
export async function startCompletenessReview(id: string): Promise<void> {
  await delay();
  const actor = requirePermission("partner.review");
  mutate((draft) => {
    const p = load(draft, id);
    if (p.status !== "submitted") throw new ServiceError("INVALID_STATE");
    p.status = "completeness_review";
    p.assignedReviewer ??= actor;
    p.updatedAt = now();
    audit(draft, p, actor, "partnerCompletenessStarted", "status");
  });
}

/** Completeness review → URSB and NGO Bureau verification. Every required document must be uploaded. */
export async function completeCompleteness(id: string, note?: string): Promise<void> {
  await delay();
  const actor = requirePermission("partner.review");
  mutate((draft) => {
    const p = load(draft, id);
    if (p.status !== "completeness_review") throw new ServiceError("INVALID_STATE");
    if (!partnerChecks(draft, p).documentsUploaded) throw new ServiceError("CHECKS_INCOMPLETE");
    p.status = "verification";
    p.updatedAt = now();
    audit(draft, p, actor, "partnerCompletenessDone", "status", note?.trim() || undefined);
  });
}

/** Runs the simulated registry check. Results are fictional and labelled as simulated. */
export async function runVerification(id: string, service: "ursb" | "ngoBureau"): Promise<VerificationOutcome> {
  await delay(900);
  const actor = requirePermission("partner.review");
  return mutate((draft) => {
    const p = load(draft, id);
    if (p.status !== "verification" && p.status !== "approved") throw new ServiceError("INVALID_STATE");
    audit(draft, p, actor, "verificationRequested", "status", undefined, { service: service === "ursb" ? "URSB" : "NGO Bureau" });
    simulateRegistryCheck(draft, p, service, "workflow");
    p.updatedAt = now();
    return p.verification[service].outcome;
  });
}

/** Records an outcome confirmed outside the system (e.g. a letter from the registry). A reason is required. */
export async function recordVerificationOutcome(id: string, service: "ursb" | "ngoBureau", outcome: "match" | "mismatch", note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("partner.decide");
  mutate((draft) => {
    const p = load(draft, id);
    if (p.status !== "verification") throw new ServiceError("INVALID_STATE");
    p.verification[service] = { ...p.verification[service], outcome, at: now(), detail: reason, reference: `MANUAL-${newId("v").slice(-6).toUpperCase()}`, simulated: true };
    p.updatedAt = now();
    audit(draft, p, actor, "verificationRecorded", "decision", reason, { service: service === "ursb" ? "URSB" : "NGO Bureau", outcome });
  });
}

/** Documents OPM can ask a partner to add when it requests changes. */
export const REQUESTABLE_DOCUMENTS = ["Tax compliance certificate", "Board resolution authorising the signatory", "Proof of office address", "Organisational chart"];

/**
 * Open application → Changes requested. Optionally adds a required document
 * the partner must upload before resubmitting from the Partner Portal.
 */
export function applyPartnerChangesRequest(draft: DemoState, p: Partner, actor: string, reason: string, requestedDocument?: string, simulated?: boolean): void {
  if (!OPEN_APPLICATION.includes(p.status)) throw new ServiceError("INVALID_STATE");
  p.status = "changes_requested";
  p.comments.push({ id: newId("c"), at: now(), author: actor, text: reason });
  p.updatedAt = now();
  const title = requestedDocument?.trim();
  if (title && !partnerDocuments(draft, p.id).some((d) => d.title === title)) {
    draft.documents.push({
      id: newId("doc"),
      ref: `DOC-2026-${String(900 + draft.documents.length)}`,
      title,
      category: "partner_document",
      owner: p.name,
      related: { entity: "partner", id: p.id },
      classification: "internal",
      required: true,
      versions: [],
      status: "missing",
      route: [],
      signature: { status: "not_required", simulated: true },
      updatedAt: now(),
    });
    addAudit(draft, { actor, action: "partnerDocumentRequested", category: "record", params: { name: p.name, document: title }, entity: "partner", entityId: p.id, entityRef: p.ref, simulated });
  }
  addAudit(draft, { actor, action: "partnerChangesRequested", category: "decision", params: { name: p.name }, entity: "partner", entityId: p.id, entityRef: p.ref, note: reason, simulated });
  simulateMessage(draft, { channel: "email", recipient: `${p.focalRole}, ${p.name}`, entity: "partner", entityId: p.id, entityRef: p.ref });
}

export async function requestPartnerChanges(id: string, note: string, requestedDocument?: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("partner.decide");
  mutate((draft) => applyPartnerChangesRequest(draft, load(draft, id), actor, reason, requestedDocument));
}

/** Demo helper: stands in for the partner correcting and resubmitting the application in the planned partner portal. */
export async function simulatePartnerResubmission(id: string): Promise<void> {
  await delay();
  currentActor();
  mutate((draft) => {
    const p = load(draft, id);
    if (p.status !== "changes_requested") throw new ServiceError("INVALID_STATE");
    for (const d of partnerDocuments(draft, p.id).filter((x) => x.status === "missing" || x.status === "changes_requested")) {
      d.status = "in_review";
      d.versions.push({ version: d.versions.length + 1, at: now(), author: `${p.focalRole}, ${p.name}`, note: "Uploaded with resubmission (simulated).", sizeKb: 350 });
      d.updatedAt = now();
    }
    p.status = "completeness_review";
    p.updatedAt = now();
    audit(draft, p, null, "partnerResubmitted", "record");
  });
}

/** Verification → Approved: sets accreditation and operating permissions and prepares the MoU draft. */
export function applyPartnerApproval(draft: DemoState, p: Partner, actor: string, reason: string, simulated?: boolean): void {
  if (p.status !== "verification") throw new ServiceError("INVALID_STATE");
  if (!partnerChecks(draft, p).ready) throw new ServiceError("CHECKS_INCOMPLETE");
  const until = new Date(Date.now() + 365 * DAY_MS).toISOString();
  p.status = "approved";
  p.accreditedUntil = until;
  p.permissions = p.settlementIds.flatMap((settlementId) => p.sectors.map((sector) => ({ settlementId, sector, validUntil: until })));
  p.updatedAt = now();
  addAudit(draft, { actor, action: "partnerApproved", category: "decision", params: { name: p.name }, entity: "partner", entityId: p.id, entityRef: p.ref, note: reason, simulated });
  prepareMou(draft, p, actor);
  simulateMessage(draft, { channel: "email", recipient: `${p.focalRole}, ${p.name}`, entity: "partner", entityId: p.id, entityRef: p.ref });
}

export async function approvePartner(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("partner.decide");
  mutate((draft) => applyPartnerApproval(draft, load(draft, id), actor, reason));
}

export async function rejectPartner(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("partner.decide");
  mutate((draft) => {
    const p = load(draft, id);
    if (!OPEN_APPLICATION.includes(p.status) && p.status !== "changes_requested") throw new ServiceError("INVALID_STATE");
    p.status = "rejected";
    p.updatedAt = now();
    audit(draft, p, actor, "partnerRejected", "decision", reason);
    simulateMessage(draft, { channel: "email", recipient: `${p.focalRole}, ${p.name}`, entity: "partner", entityId: p.id, entityRef: p.ref });
  });
}

export async function suspendPartner(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("partner.decide");
  mutate((draft) => {
    const p = load(draft, id);
    if (p.status !== "approved") throw new ServiceError("INVALID_STATE");
    p.status = "suspended";
    p.updatedAt = now();
    audit(draft, p, actor, "partnerSuspended", "decision", reason);
  });
}

export async function reinstatePartner(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("partner.decide");
  mutate((draft) => {
    const p = load(draft, id);
    if (p.status !== "suspended") throw new ServiceError("INVALID_STATE");
    p.status = "approved";
    p.updatedAt = now();
    audit(draft, p, actor, "partnerReinstated", "decision", reason);
  });
}

/** Renewal review: approving extends accreditation and operating permissions by twelve months. */
export async function decideRenewal(id: string, approve: boolean, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("partner.decide");
  mutate((draft) => {
    const p = load(draft, id);
    if (p.status !== "approved" || p.renewal?.status !== "pending") throw new ServiceError("INVALID_STATE");
    if (approve) {
      const base = Math.max(Date.now(), new Date(p.accreditedUntil ?? Date.now()).getTime());
      const until = new Date(base + 365 * DAY_MS).toISOString();
      p.accreditedUntil = until;
      p.permissions = p.permissions.map((perm) => ({ ...perm, validUntil: until }));
      for (const d of partnerDocuments(draft, p.id).filter((x) => x.title === "NGO operating permit")) {
        d.expiresAt = until;
        d.versions.push({ version: d.versions.length + 1, at: now(), author: `${p.focalRole}, ${p.name}`, note: "Renewed permit (simulated upload).", sizeKb: 410 });
        d.updatedAt = now();
      }
      p.renewal = { ...p.renewal, status: "approved" };
    } else {
      p.renewal = undefined;
    }
    p.updatedAt = now();
    audit(draft, p, actor, approve ? "partnerRenewalApproved" : "partnerRenewalDeclined", "decision", reason);
  });
}

export async function addPartnerComment(id: string, text: string): Promise<void> {
  const body = requireNote(text);
  await delay(150);
  const actor = requirePermission("partner.review");
  mutate((draft) => {
    const p = load(draft, id);
    p.comments.push({ id: newId("c"), at: now(), author: actor, text: body });
    p.updatedAt = now();
    audit(draft, p, actor, "commentAdded", "record");
  });
}
