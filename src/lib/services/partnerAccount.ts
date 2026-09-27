"use client";

import type {
  AuditEntry,
  Comment,
  DemoState,
  DocumentRecord,
  Partner,
  PartnerPermission,
  PartnerProfileData,
  ProfileChangeRequest,
  ProfileField,
  RoleId,
  Sector,
  UserAccount,
} from "@/lib/types";
import { partnerDelegable, partnerRoles } from "@/lib/demo/reference";
import { addNotification, getState, mutate, newId } from "@/lib/demo/store";
import { DAY_MS, delay, now, requireNote, ServiceError } from "./core";
import { OPEN_APPLICATION, partnerCompliance, partnerDocuments, partnerEligibility, type Compliance, type Eligibility } from "./partners";
import { expiryState, type DocumentRow } from "./documents";
import { recordLabel } from "./lookup";
import {
  nextRef,
  notifyOpm,
  ownDocument,
  ownDocuments,
  ownIntervention,
  partnerAudit,
  partnerAuthor,
  partnerContext,
  partnerPermissionsOf,
  partnerVisibleAudit,
  requirePartnerPermission,
  visibleInterventions,
  type PartnerContext,
} from "./partnerContext";

/* ================================================================ Profile */

export type ProfileFieldState = "editable" | "under_review" | "verified" | "locked";
export type ProfileMode = "draft" | "in_review" | "approved" | "closed";

export const PROFILE_FIELDS: ProfileField[] = ["name", "acronym", "type", "registrationNo", "ngoPermitNo", "tin", "focalRole", "contacts", "sectors", "settlementIds", "personnel"];
/** After approval these can change through an OPM-reviewed change request; the rest are verified or locked. */
export const CHANGEABLE_AFTER_APPROVAL: ProfileField[] = ["acronym", "tin", "focalRole", "contacts", "personnel"];

export const ORGANISATION_TYPES = ["National NGO", "International NGO", "Community-based organisation", "Faith-based organisation", "UN agency", "Development partner"];

export function profileOf(p: Partner): PartnerProfileData {
  return {
    name: p.name,
    acronym: p.acronym ?? "",
    type: p.type,
    registrationNo: p.registrationNo,
    ngoPermitNo: p.ngoPermitNo ?? "",
    tin: p.tin ?? "",
    focalRole: p.focalRole,
    contacts: { email: "", phone: "", address: "", website: "", ...p.contacts },
    sectors: [...p.sectors],
    settlementIds: [...p.settlementIds],
    personnel: (p.personnel ?? []).map((x) => ({ ...x })),
  };
}

export function profileMode(p: Partner): ProfileMode {
  if (p.status === "draft" || p.status === "changes_requested") return "draft";
  if (OPEN_APPLICATION.includes(p.status)) return "in_review";
  if (p.status === "approved" || p.status === "suspended") return "approved";
  return "closed";
}

/** Editable, under review, verified by a (simulated) registry, or locked as part of the approved record. */
export function profileFieldStates(p: Partner): Record<ProfileField, ProfileFieldState> {
  const mode = profileMode(p);
  const pending = (p.profileChanges ?? []).find((c) => c.status === "under_review");
  const states = {} as Record<ProfileField, ProfileFieldState>;
  for (const f of PROFILE_FIELDS) {
    let state: ProfileFieldState;
    if (mode === "draft") state = "editable";
    else if (mode === "in_review") state = "under_review";
    else if (mode === "closed") state = "locked";
    else if (pending?.fields.includes(f)) state = "under_review";
    else if ((f === "name" || f === "registrationNo") && p.verification.ursb.outcome === "match") state = "verified";
    else if (f === "ngoPermitNo" && p.verification.ngoBureau.outcome === "match") state = "verified";
    else if (CHANGEABLE_AFTER_APPROVAL.includes(f)) state = "editable";
    else state = "locked";
    states[f] = state;
  }
  return states;
}

export type ProfileIssue =
  | "name"
  | "type"
  | "registrationNo"
  | "ngoPermitNo"
  | "tin"
  | "tinFormat"
  | "focalRole"
  | "contactEmail"
  | "contactEmailFormat"
  | "contactPhone"
  | "contactAddress"
  | "sectors"
  | "settlementIds"
  | "personnel"
  | "personnelEmail";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Required-field and format checks for the profile. The same rules run in the form and the service. */
export function profileIssues(d: PartnerProfileData): ProfileIssue[] {
  const issues: ProfileIssue[] = [];
  if (!d.name.trim()) issues.push("name");
  if (!d.type.trim()) issues.push("type");
  if (!d.registrationNo.trim()) issues.push("registrationNo");
  if (!d.ngoPermitNo.trim()) issues.push("ngoPermitNo");
  if (!d.tin.trim()) issues.push("tin");
  else if (!/^\d{10}$/.test(d.tin.trim())) issues.push("tinFormat");
  if (!d.focalRole.trim()) issues.push("focalRole");
  if (!d.contacts.email.trim()) issues.push("contactEmail");
  else if (!EMAIL.test(d.contacts.email.trim())) issues.push("contactEmailFormat");
  if (!d.contacts.phone.trim()) issues.push("contactPhone");
  if (!d.contacts.address.trim()) issues.push("contactAddress");
  if (d.sectors.length === 0) issues.push("sectors");
  if (d.settlementIds.length === 0) issues.push("settlementIds");
  if (d.personnel.length === 0 || d.personnel.some((p) => !p.name.trim() || !p.role.trim())) issues.push("personnel");
  if (d.personnel.some((p) => p.email.trim() && !EMAIL.test(p.email.trim()))) issues.push("personnelEmail");
  return issues;
}

/** Format problems block saving; missing values only block submission. */
const FORMAT_ISSUES: ProfileIssue[] = ["tinFormat", "contactEmailFormat", "personnelEmail"];

function clean(d: PartnerProfileData): PartnerProfileData {
  return {
    ...d,
    name: d.name.trim(),
    acronym: d.acronym.trim(),
    type: d.type.trim(),
    registrationNo: d.registrationNo.trim(),
    ngoPermitNo: d.ngoPermitNo.trim(),
    tin: d.tin.trim(),
    focalRole: d.focalRole.trim(),
    contacts: { email: d.contacts.email.trim(), phone: d.contacts.phone.trim(), address: d.contacts.address.trim(), website: d.contacts.website?.trim() ?? "" },
    personnel: d.personnel.map((p) => ({ ...p, name: p.name.trim(), role: p.role.trim(), email: p.email.trim() })),
  };
}

function apply(p: Partner, d: Partial<PartnerProfileData>) {
  if (d.name !== undefined) p.name = d.name;
  if (d.acronym !== undefined) p.acronym = d.acronym;
  if (d.type !== undefined) p.type = d.type;
  if (d.registrationNo !== undefined) p.registrationNo = d.registrationNo;
  if (d.ngoPermitNo !== undefined) p.ngoPermitNo = d.ngoPermitNo;
  if (d.tin !== undefined) p.tin = d.tin;
  if (d.focalRole !== undefined) p.focalRole = d.focalRole;
  if (d.contacts !== undefined) p.contacts = { ...d.contacts };
  if (d.sectors !== undefined) p.sectors = [...d.sectors];
  if (d.settlementIds !== undefined) p.settlementIds = [...d.settlementIds];
  if (d.personnel !== undefined) p.personnel = d.personnel.map((x) => ({ ...x }));
}

export function changedFields(before: PartnerProfileData, after: PartnerProfileData): ProfileField[] {
  return PROFILE_FIELDS.filter((f) => JSON.stringify(before[f]) !== JSON.stringify(after[f]));
}

export async function getPartnerProfile(): Promise<{
  partner: Partner;
  profile: PartnerProfileData;
  mode: ProfileMode;
  states: Record<ProfileField, ProfileFieldState>;
  pendingChange?: ProfileChangeRequest;
  changes: ProfileChangeRequest[];
  canEdit: boolean;
  options: { sectors: { id: Sector; name: string }[]; settlements: { id: string; name: string; district: string }[] };
}> {
  const state = getState();
  const ctx = partnerContext(state);
  const p = ctx.partner;
  return {
    options: {
      sectors: state.sectors.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name })),
      settlements: state.settlements.filter((x) => x.active).map((x) => ({ id: x.id, name: x.name, district: x.district })),
    },
    partner: p,
    profile: profileOf(p),
    mode: profileMode(p),
    states: profileFieldStates(p),
    pendingChange: (p.profileChanges ?? []).find((c) => c.status === "under_review"),
    changes: [...(p.profileChanges ?? [])].reverse(),
    canEdit: ctx.permissions.includes("profile.edit"),
  };
}

/** Saves a draft (or a profile returned for changes) directly. Nothing goes to OPM until the application is submitted. */
export async function saveProfileDraft(data: PartnerProfileData): Promise<void> {
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "profile.edit");
  const next = clean(data);
  if (profileIssues(next).some((i) => FORMAT_ISSUES.includes(i))) throw new ServiceError("INVALID_VALUE");
  mutate((draft) => {
    const p = draft.partners.find((x) => x.id === ctx.partner.id)!;
    if (profileMode(p) !== "draft") throw new ServiceError("LOCKED");
    const fields = changedFields(profileOf(p), next);
    if (fields.length === 0) throw new ServiceError("NO_CHANGES");
    apply(p, next);
    p.updatedAt = now();
    partnerAudit(draft, ctx, "partnerProfileSaved", "partner", p.id, p.ref, { count: fields.length });
  });
}

/** An approved partner asks OPM to change editable profile details. Nothing changes until OPM approves. */
export async function submitProfileChange(data: PartnerProfileData, reason: string): Promise<void> {
  const why = requireNote(reason);
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "profile.edit");
  const next = clean(data);
  if (profileIssues(next).length > 0) throw new ServiceError("INVALID_VALUE");
  mutate((draft) => {
    const p = draft.partners.find((x) => x.id === ctx.partner.id)!;
    if (profileMode(p) !== "approved") throw new ServiceError("LOCKED");
    if ((p.profileChanges ?? []).some((c) => c.status === "under_review")) throw new ServiceError("INVALID_STATE");
    const before = profileOf(p);
    const states = profileFieldStates(p);
    const fields = changedFields(before, next);
    if (fields.some((f) => states[f] !== "editable")) throw new ServiceError("LOCKED");
    if (fields.length === 0) throw new ServiceError("NO_CHANGES");
    const request: ProfileChangeRequest = {
      id: newId("pc"),
      ref: nextRef(draft.partners.flatMap((x) => (x.profileChanges ?? []).map((c) => c.ref)), "PCR-2026-", 3),
      submittedAt: now(),
      submittedBy: ctx.actor,
      fields,
      proposed: Object.fromEntries(fields.map((f) => [f, next[f]])),
      previous: Object.fromEntries(fields.map((f) => [f, before[f]])),
      reason: why,
      status: "under_review",
    };
    p.profileChanges = [...(p.profileChanges ?? []), request];
    p.updatedAt = now();
    partnerAudit(draft, ctx, "profileChangeSubmitted", "partner", p.id, p.ref, { ref: request.ref }, { note: why });
    notifyOpm(draft, "profileChangeSubmitted", { name: p.name, ref: request.ref }, "partner", p.id);
  });
}

/* ========================================================== Accreditation */

export interface ChecklistItem {
  key: string;
  kind: "field" | "document";
  /** ProfileIssue for fields; document title for documents. */
  label: string;
  done: boolean;
  documentId?: string;
  requested?: boolean;
}

/** What must be complete before the application can be submitted (or resubmitted). */
export function applicationChecklist(state: DemoState, p: Partner): { items: ChecklistItem[]; complete: boolean } {
  const issues = profileIssues(profileOf(p));
  const fieldKeys: { key: ProfileIssue; covers: ProfileIssue[] }[] = [
    { key: "name", covers: ["name"] },
    { key: "type", covers: ["type"] },
    { key: "registrationNo", covers: ["registrationNo"] },
    { key: "ngoPermitNo", covers: ["ngoPermitNo"] },
    { key: "tin", covers: ["tin", "tinFormat"] },
    { key: "contactEmail", covers: ["contactEmail", "contactEmailFormat"] },
    { key: "contactPhone", covers: ["contactPhone"] },
    { key: "contactAddress", covers: ["contactAddress"] },
    { key: "sectors", covers: ["sectors"] },
    { key: "settlementIds", covers: ["settlementIds"] },
    { key: "personnel", covers: ["personnel", "personnelEmail"] },
  ];
  const items: ChecklistItem[] = fieldKeys.map((f) => ({ key: f.key, kind: "field", label: f.key, done: !f.covers.some((c) => issues.includes(c)) }));
  const requested = new Set(requestedDocumentTitles(state, p));
  for (const d of partnerDocuments(state, p.id).filter((x) => x.required && x.category === "partner_document")) {
    items.push({ key: d.id, kind: "document", label: d.title, done: d.status !== "missing" && d.status !== "rejected", documentId: d.id, requested: requested.has(d.title) });
  }
  return { items, complete: items.every((i) => i.done) };
}

/** Required documents OPM added when it requested changes (they have no version from the original submission). */
function requestedDocumentTitles(state: DemoState, p: Partner): string[] {
  return partnerDocuments(state, p.id)
    .filter((d) => d.required && d.category === "partner_document" && state.audit.some((a) => a.action === "partnerDocumentRequested" && a.entityId === p.id && a.params.document === d.title))
    .map((d) => d.title);
}

export interface Suspension {
  reason?: string;
  at?: string;
}

export async function getAccreditation(): Promise<{
  partner: Partner;
  checklist: { items: ChecklistItem[]; complete: boolean };
  compliance: Compliance;
  eligibility: Eligibility;
  documents: DocumentRecord[];
  history: AuditEntry[];
  comments: Comment[];
  suspension?: Suspension;
  canSubmit: boolean;
  renewalDue: boolean;
}> {
  const state = getState();
  const ctx = partnerContext(state);
  const p = ctx.partner;
  const suspendedEntry = state.audit.find((a) => a.entityId === p.id && a.action === "partnerSuspended");
  const decisionActions = new Set(["decision", "status", "integration"]);
  const partnerActions = new Set(["partnerApplied", "partnerResubmittedByPartner", "partnerProfileStarted", "partnerRenewalRequested", "profileChangeSubmitted"]);
  const docIds = new Set(partnerDocuments(state, p.id).map((d) => d.id));
  const history = partnerVisibleAudit(state, ctx).filter(
    (a) => (a.entityId === p.id && (decisionActions.has(a.category) || partnerActions.has(a.action))) || (a.entityId && docIds.has(a.entityId) && a.entity === "document" && a.category === "decision"),
  );
  const until = p.accreditedUntil ? new Date(p.accreditedUntil).getTime() : 0;
  return {
    partner: p,
    checklist: applicationChecklist(state, p),
    compliance: partnerCompliance(state, p),
    eligibility: partnerEligibility(state, p),
    documents: partnerDocuments(state, p.id).filter((d) => d.category === "partner_document"),
    history,
    comments: p.comments,
    suspension: p.status === "suspended" ? { reason: suspendedEntry?.note, at: suspendedEntry?.at } : undefined,
    canSubmit: ctx.permissions.includes("profile.edit"),
    renewalDue: p.status === "approved" && !p.renewal && until > 0 && until < Date.now() + 60 * DAY_MS,
  };
}

function routeForPartnerDocument(d: DocumentRecord) {
  d.route = [{ id: newId("s"), role: d.category === "partner_document" ? "Partnerships officer" : "Coordination review" }];
}

/** Draft → Submitted. Every required field and document must be complete. */
export async function submitApplication(): Promise<void> {
  await delay(400);
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "profile.edit");
  mutate((draft) => {
    const p = draft.partners.find((x) => x.id === ctx.partner.id)!;
    if (p.status !== "draft") throw new ServiceError("INVALID_STATE");
    if (!applicationChecklist(draft, p).complete) throw new ServiceError("PROFILE_INCOMPLETE");
    for (const d of partnerDocuments(draft, p.id).filter((x) => x.status === "draft")) {
      d.status = "in_review";
      routeForPartnerDocument(d);
      d.updatedAt = now();
    }
    p.status = "submitted";
    p.submittedAt = now();
    p.updatedAt = now();
    partnerAudit(draft, ctx, "partnerApplied", "partner", p.id, p.ref);
    notifyOpm(draft, "partnerApplicationSubmitted", { name: p.name }, "partner", p.id);
  });
}

/** Changes requested → back to the OPM completeness review with the corrections. */
export async function resubmitApplication(note: string): Promise<void> {
  const reply = requireNote(note);
  await delay(400);
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "profile.edit");
  mutate((draft) => {
    const p = draft.partners.find((x) => x.id === ctx.partner.id)!;
    if (p.status !== "changes_requested") throw new ServiceError("INVALID_STATE");
    if (!applicationChecklist(draft, p).complete) throw new ServiceError("PROFILE_INCOMPLETE");
    for (const d of partnerDocuments(draft, p.id).filter((x) => ["draft", "changes_requested", "rejected"].includes(x.status) && x.versions.length > 0)) {
      d.status = "in_review";
      routeForPartnerDocument(d);
      d.updatedAt = now();
    }
    p.status = "completeness_review";
    p.comments.push({ id: newId("c"), at: now(), author: partnerAuthor(ctx), text: reply });
    p.updatedAt = now();
    partnerAudit(draft, ctx, "partnerResubmittedByPartner", "partner", p.id, p.ref, {}, { note: reply });
    notifyOpm(draft, "partnerApplicationResubmitted", { name: p.name }, "partner", p.id);
  });
}

/** Asks OPM to renew accreditation before it expires. */
export async function requestRenewal(): Promise<void> {
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "profile.edit");
  mutate((draft) => {
    const p = draft.partners.find((x) => x.id === ctx.partner.id)!;
    if (p.status !== "approved" || p.renewal?.status === "pending") throw new ServiceError("INVALID_STATE");
    p.renewal = { requestedAt: now(), status: "pending" };
    p.updatedAt = now();
    partnerAudit(draft, ctx, "partnerRenewalRequested", "partner", p.id, p.ref);
    notifyOpm(draft, "partnerRenewalRequested", { name: p.name }, "partner", p.id);
  });
}

/* ============================================================== Documents */

export interface PartnerDocumentRow extends DocumentRow {
  /** OPM decisions and comments from the review route. */
  opmComments: { at: string; by: string; role: string; decision: string; note: string }[];
}

function toRow(state: DemoState, d: DocumentRecord): PartnerDocumentRow {
  const label = d.related ? recordLabel(d.related.entity, d.related.id, state) : null;
  return {
    ...d,
    relatedRef: label?.ref,
    relatedTitle: label?.title,
    currentVersion: d.versions[d.versions.length - 1]?.version ?? 0,
    expiry: expiryState(d),
    opmComments: d.route.filter((s) => s.decision && s.note).map((s) => ({ at: s.at!, by: s.by ?? "—", role: s.role, decision: s.decision!, note: s.note! })),
  };
}

export async function listPartnerDocuments(): Promise<PartnerDocumentRow[]> {
  const state = getState();
  const ctx = partnerContext(state);
  return ownDocuments(state, ctx)
    .filter((d) => d.category !== "mou")
    .map((d) => toRow(state, d))
    .sort((a, b) => Number(Boolean(b.required)) - Number(Boolean(a.required)) || b.updatedAt.localeCompare(a.updatedAt));
}

export async function getPartnerDocument(id: string): Promise<{ document: PartnerDocumentRow; history: AuditEntry[]; canManage: boolean }> {
  const state = getState();
  const ctx = partnerContext(state);
  const d = ownDocument(state, ctx, id);
  const canManage =
    d.related?.entity === "partner" ? ctx.permissions.includes("documents.manage") : ctx.permissions.includes("proposals.manage") || ctx.permissions.includes("progress.update");
  return { document: toRow(state, d), history: partnerVisibleAudit(state, ctx, id), canManage: canManage && d.category !== "mou" };
}

export interface UploadInput {
  /** Existing slot to add a version to (replace); omit to add a new document. */
  documentId?: string;
  title?: string;
  /** Intervention the new document supports; omit for an organisation document. */
  interventionId?: string;
  fileName: string;
  sizeKb: number;
  expiresAt?: string;
  note: string;
}

/**
 * SIMULATED upload: the file name and size are recorded as a new version, but
 * no file is stored and nothing is authenticated. Earlier versions are kept.
 * A new version goes to OPM for review unless the profile is still a draft.
 */
export async function uploadPartnerDocument(input: UploadInput): Promise<string> {
  if (!input.fileName.trim()) throw new ServiceError("FIELD_REQUIRED");
  const note = requireNote(input.note);
  await delay(500);
  const ctx = partnerContext();
  return mutate((draft) => {
    const p = draft.partners.find((x) => x.id === ctx.partner.id)!;
    let d: DocumentRecord;
    if (input.documentId) {
      d = ownDocument(draft, ctx, input.documentId);
      if (d.category === "mou" || d.category === "approval") throw new ServiceError("LOCKED");
    } else {
      const title = (input.title ?? "").trim();
      if (!title) throw new ServiceError("FIELD_REQUIRED");
      const intervention = input.interventionId ? ownIntervention(draft, ctx, input.interventionId) : undefined;
      d = {
        id: newId("doc"),
        ref: nextRef(draft.documents.map((x) => x.ref), "DOC-2026-", 3),
        title,
        category: intervention ? "intervention_evidence" : "partner_document",
        owner: p.name,
        related: intervention ? { entity: "intervention", id: intervention.id } : { entity: "partner", id: p.id },
        classification: "internal",
        required: false,
        versions: [],
        status: "draft",
        route: [],
        signature: { status: "not_required", simulated: true },
        updatedAt: now(),
      };
      draft.documents.push(d);
    }
    if (d.related?.entity === "partner") requirePartnerPermission(ctx, "documents.manage");
    else if (!(["proposals.manage", "progress.update", "finance.submit", "fieldReports.submit"] as const).some((x) => ctx.permissions.includes(x))) throw new ServiceError("FORBIDDEN");
    if (input.expiresAt && Number.isNaN(new Date(input.expiresAt).getTime())) throw new ServiceError("INVALID_VALUE");

    const version = (d.versions[d.versions.length - 1]?.version ?? 0) + 1;
    d.versions.push({ version, at: now(), author: partnerAuthor(ctx), note: `${note} — ${input.fileName.trim()}`, sizeKb: Math.max(1, Math.round(input.sizeKb)) });
    if (input.expiresAt) d.expiresAt = new Date(input.expiresAt).toISOString();
    // Draft profiles and draft proposals keep documents as drafts until submission.
    const intervention = d.related?.entity === "intervention" ? draft.interventions.find((i) => i.id === d.related!.id) : undefined;
    const holdAsDraft = d.related?.entity === "partner" ? p.status === "draft" || p.status === "changes_requested" : intervention?.status === "draft" || intervention?.status === "changes_requested";
    if (holdAsDraft) {
      d.status = "draft";
    } else {
      d.status = "in_review";
      routeForPartnerDocument(d);
    }
    d.updatedAt = now();
    partnerAudit(draft, ctx, version === 1 ? "documentUploaded" : "documentVersionAdded", "document", d.id, d.ref, { name: d.title, version }, { note, simulated: true });
    if (d.related && d.related.entity !== "document") {
      const label = recordLabel(d.related.entity, d.related.id, draft);
      partnerAudit(draft, ctx, "documentVersionAdded", d.related.entity, d.related.id, label?.ref ?? d.ref, { name: d.title, version }, { note, simulated: true });
    }
    if (!holdAsDraft) notifyOpm(draft, "partnerDocumentUploaded", { name: d.title, partner: p.name }, "document", d.id);
    return d.id;
  });
}

/* ============================================================ Agreements */

export async function listAgreements(): Promise<PartnerDocumentRow[]> {
  const state = getState();
  const ctx = partnerContext(state);
  const interventions = new Set(visibleInterventions(state, ctx).map((i) => i.id));
  return state.documents
    .filter(
      (d) =>
        (d.category === "mou" && d.related?.entity === "partner" && d.related.id === ctx.partner.id) ||
        (d.category === "approval" && d.related?.entity === "intervention" && interventions.has(d.related.id)),
    )
    .map((d) => toRow(state, d))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getAgreement(id: string): Promise<{ document: PartnerDocumentRow; history: AuditEntry[]; canSign: boolean }> {
  const state = getState();
  const ctx = partnerContext(state);
  const list = await listAgreements();
  const document = list.find((d) => d.id === id);
  if (!document) throw new ServiceError(state.documents.some((d) => d.id === id) ? "NOT_PARTNER_RECORD" : "NOT_FOUND");
  return { document, history: partnerVisibleAudit(state, ctx, id), canSign: ctx.permissions.includes("agreements.sign") };
}

/**
 * The partner's authorised signatory responds to a signature request.
 * SIMULATED: no electronic-signature or identity service is contacted; the
 * typed name stands in for signer authentication.
 */
export async function respondToSignature(id: string, decision: "sign" | "decline", note: string, typedName: string): Promise<void> {
  if (decision === "sign" && !typedName.trim()) throw new ServiceError("FIELD_REQUIRED");
  const reason = decision === "decline" ? requireNote(note) : note.trim() || undefined;
  await delay(700);
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "agreements.sign");
  mutate((draft) => {
    const d = draft.documents.find((x) => x.id === id);
    if (!d || d.related?.entity !== "partner" || d.related.id !== ctx.partner.id) throw new ServiceError("NOT_PARTNER_RECORD");
    if (d.signature.status !== "requested") throw new ServiceError("INVALID_STATE");
    const signer = `${typedName.trim() || ctx.actor}, ${ctx.partner.name}`;
    d.signature = { ...d.signature, status: decision === "sign" ? "signed" : "declined", signer, signedAt: decision === "sign" ? now() : undefined, simulated: true };
    d.updatedAt = now();
    partnerAudit(draft, ctx, decision === "sign" ? "documentSigned" : "documentSignatureDeclined", "document", d.id, d.ref, { name: d.title }, { note: reason, simulated: true, category: "decision" });
    partnerAudit(draft, ctx, decision === "sign" ? "documentSigned" : "documentSignatureDeclined", "partner", ctx.partner.id, ctx.partner.ref, { name: d.title }, { note: reason, simulated: true, category: "decision" });
    addNotification(draft, { kind: "decision", message: decision === "sign" ? "signatureCompleted" : "signatureDeclined", params: { ref: d.ref }, entity: "document", entityId: d.id });
  });
}

/* ================================================================== Team */

export interface TeamMember extends UserAccount {
  permissionsEffective: PartnerPermission[];
}

export async function listTeam(): Promise<{
  members: TeamMember[];
  me: string;
  canManage: boolean;
  interventions: { id: string; ref: string; title: string }[];
  history: AuditEntry[];
}> {
  const state = getState();
  const ctx = partnerContext(state);
  const members = state.users
    .filter((u) => u.partnerId === ctx.partner.id)
    .map((u) => ({ ...u, permissionsEffective: partnerPermissionsOf(u) }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    members: ctx.isAdmin ? members : members.filter((m) => m.status !== "deactivated"),
    me: ctx.user.id,
    canManage: ctx.permissions.includes("team.manage"),
    interventions: state.interventions.filter((i) => i.partnerId === ctx.partner.id && i.status !== "rejected").map((i) => ({ id: i.id, ref: i.ref, title: i.title })),
    history: ctx.isAdmin ? partnerVisibleAudit(state, ctx).slice(0, 150) : [],
  };
}

export interface MemberInput {
  name: string;
  email: string;
  title: string;
  role: RoleId;
  permissions: PartnerPermission[];
  interventionIds: string[];
}

function checkMemberInput(state: DemoState, ctx: PartnerContext, input: MemberInput) {
  // A partner administrator can only hand out partner roles and delegable partner permissions.
  if (!partnerRoles.includes(input.role)) throw new ServiceError("FORBIDDEN");
  if (input.permissions.some((p) => !partnerDelegable.includes(p))) throw new ServiceError("FORBIDDEN");
  for (const id of input.interventionIds) {
    const i = state.interventions.find((x) => x.id === id);
    if (!i || i.partnerId !== ctx.partner.id) throw new ServiceError("NOT_PARTNER_RECORD");
  }
}

export async function invitePartnerUser(input: MemberInput): Promise<void> {
  if (!input.name.trim() || !input.email.trim() || !input.title.trim()) throw new ServiceError("FIELD_REQUIRED");
  if (!EMAIL.test(input.email.trim())) throw new ServiceError("INVALID_VALUE");
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "team.manage");
  mutate((draft) => {
    checkMemberInput(draft, ctx, input);
    if (draft.users.some((u) => u.email.toLowerCase() === input.email.trim().toLowerCase())) throw new ServiceError("DUPLICATE");
    const user: UserAccount = {
      id: newId("u"),
      name: input.name.trim(),
      email: input.email.trim(),
      title: input.title.trim(),
      role: input.role,
      scope: { level: "national", ids: [] },
      status: "invited",
      invitedAt: now(),
      partnerId: ctx.partner.id,
      partnerPermissions: [...new Set(input.permissions)],
      interventionIds: [...new Set(input.interventionIds)],
    };
    draft.users.push(user);
    partnerAudit(draft, ctx, "partnerUserInvited", "user", user.id, user.email, { name: user.name }, { category: "config", simulated: true });
  });
}

export async function updatePartnerUser(id: string, input: Omit<MemberInput, "name" | "email">): Promise<void> {
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "team.manage");
  if (id === ctx.user.id) throw new ServiceError("SELF_CHANGE");
  mutate((draft) => {
    const u = draft.users.find((x) => x.id === id);
    if (!u || u.partnerId !== ctx.partner.id) throw new ServiceError("NOT_PARTNER_RECORD");
    checkMemberInput(draft, ctx, { ...input, name: u.name, email: u.email });
    u.role = input.role;
    u.title = input.title.trim() || u.title;
    u.partnerPermissions = [...new Set(input.permissions)];
    u.interventionIds = [...new Set(input.interventionIds)];
    partnerAudit(draft, ctx, "partnerUserUpdated", "user", u.id, u.email, { name: u.name }, { category: "config" });
  });
}

export async function setPartnerUserStatus(id: string, status: "active" | "deactivated", note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "team.manage");
  if (id === ctx.user.id) throw new ServiceError("SELF_CHANGE");
  mutate((draft) => {
    const u = draft.users.find((x) => x.id === id);
    if (!u || u.partnerId !== ctx.partner.id) throw new ServiceError("NOT_PARTNER_RECORD");
    if (status === "active" && u.status !== "deactivated") throw new ServiceError("INVALID_STATE");
    if (status === "deactivated" && u.status === "deactivated") throw new ServiceError("INVALID_STATE");
    u.status = status;
    partnerAudit(draft, ctx, status === "active" ? "partnerUserReactivated" : "partnerUserDeactivated", "user", u.id, u.email, { name: u.name }, { note: reason, category: "config" });
  });
}
