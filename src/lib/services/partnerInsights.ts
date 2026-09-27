"use client";

import type { AuditEntry, Comment, DemoState, EntityType, Intervention, NotificationKind, Partner, PartnerReport, PartnerReportSection, Priority } from "@/lib/types";
import { getState, mutate, newId } from "@/lib/demo/store";
import { DAY_MS, delay, now, requireNote, ServiceError } from "./core";
import { partnerCompliance, partnerDocuments, partnerEligibility, type Compliance, type Eligibility } from "./partners";
import { APPROVED_WORK, interventionProgress, REPORTABLE } from "./interventions";
import { expiryState } from "./documents";
import { indicatorLabel, servicePointName, settlementName } from "./lookup";
import { applicationChecklist } from "./partnerAccount";
import { awaitingOpm, financeSummary, reportingSchedule } from "./partnerWork";
import { assistanceStatus, partnerReportStatus } from "./partnerField";
import {
  nextRef,
  notifyOpm,
  ownDocuments,
  ownFieldReport,
  ownIntervention,
  partnerAudit,
  partnerAuthor,
  partnerContext,
  partnerHref,
  partnerVisibleAudit,
  requirePartnerPermission,
  visibleInterventions,
  type PartnerContext,
} from "./partnerContext";

/* ================================================================== Inbox */

export type InboxKind = NotificationKind | "returned";

export interface InboxItem {
  id: string;
  at: string;
  kind: InboxKind;
  /** Key under partner.notify, or an audit action rendered with portal.auditActions. */
  message?: string;
  audit?: AuditEntry;
  params: Record<string, string | number>;
  entity: EntityType;
  entityId: string;
  href: string;
  read: boolean;
}

const RETURN_ACTIONS = /ChangesRequested|Returned|changes_requested|rejected|Declined/;

/**
 * The partner's work inbox. OPM decisions come from the audit trail of the
 * organisation's own records (so a decision made anywhere in the OPM workspace
 * reaches the partner), plus deadlines, document expiry and sync problems
 * derived from live records, plus notifications addressed to this partner.
 */
export function buildPartnerInbox(state: DemoState, ctx: PartnerContext): InboxItem[] {
  const own = new Set(state.users.filter((u) => u.partnerId === ctx.partner.id).map((u) => u.name));
  const list: Omit<InboxItem, "href" | "read">[] = [];
  const at = Date.now();

  for (const a of partnerVisibleAudit(state, ctx)) {
    if (!a.entityId || (a.actor && own.has(a.actor))) continue;
    if (a.category === "decision") {
      list.push({ id: `aud-${a.id}`, at: a.at, kind: RETURN_ACTIONS.test(a.action) ? "changes_requested" : "decision", audit: a, params: a.params, entity: a.entity as EntityType, entityId: a.entityId });
    } else if (a.category === "integration" && a.entity === "partner") {
      list.push({ id: `aud-${a.id}`, at: a.at, kind: "integration_failed", audit: a, params: a.params, entity: "partner", entityId: a.entityId });
    }
  }

  for (const n of state.notifications.filter((x) => x.audience?.partnerId === ctx.partner.id)) {
    list.push({ id: n.id, at: n.at, kind: n.kind, message: n.message, params: n.params, entity: n.entity, entityId: n.entityId });
  }

  const interventions = visibleInterventions(state, ctx);
  for (const i of interventions.filter((x) => REPORTABLE.includes(x.status))) {
    for (const period of reportingSchedule(state, i).filter((p) => p.status === "overdue" || p.status === "due")) {
      list.push({ id: `due-${i.id}-${period.key}`, at: period.dueAt, kind: period.status === "overdue" ? "overdue" : "deadline", message: period.status === "overdue" ? "reportOverdue" : "reportDue", params: { ref: i.ref, period: period.key }, entity: "intervention", entityId: i.id });
    }
    for (const m of i.milestones.filter((x) => !x.done)) {
      const due = new Date(m.dueAt).getTime();
      if (due < at) list.push({ id: `ms-${i.id}-${m.id}`, at: m.dueAt, kind: "overdue", message: "milestoneOverdue", params: { ref: i.ref, milestone: m.title }, entity: "intervention", entityId: i.id });
      else if (due - at < 7 * DAY_MS) list.push({ id: `ms-${i.id}-${m.id}`, at: m.dueAt, kind: "deadline", message: "milestoneDue", params: { ref: i.ref, milestone: m.title }, entity: "intervention", entityId: i.id });
    }
  }

  for (const d of ownDocuments(state, ctx).filter((x) => x.required)) {
    const expiry = expiryState(d);
    if (expiry === "expired" || expiry === "expiring") {
      list.push({ id: `exp-${d.id}`, at: d.expiresAt!, kind: "document_expiry", message: expiry === "expired" ? "documentExpired" : "documentExpiring", params: { name: d.title }, entity: "document", entityId: d.id });
    }
  }
  const p = ctx.partner;
  if (p.status === "approved" && p.accreditedUntil && new Date(p.accreditedUntil).getTime() < at + 30 * DAY_MS) {
    list.push({ id: `exp-acc-${p.id}`, at: p.accreditedUntil, kind: "document_expiry", message: new Date(p.accreditedUntil).getTime() < at ? "accreditationExpired" : "accreditationExpiring", params: {}, entity: "partner", entityId: p.id });
  }
  for (const d of ownDocuments(state, ctx).filter((x) => x.category === "mou" && x.signature.status === "requested")) {
    list.push({ id: `sig-${d.id}-${d.signature.requestedAt}`, at: d.signature.requestedAt ?? d.updatedAt, kind: "deadline", message: "signatureRequested", params: { name: d.title }, entity: "document", entityId: d.id });
  }

  const ids = new Set(interventions.map((i) => i.id));
  for (const r of state.fieldReports.filter((x) => ids.has(x.interventionId))) {
    const stale = r.status === "saved_offline" && new Date(r.collectedAt).getTime() < at - 3 * DAY_MS;
    if (r.status === "conflict" || stale) {
      list.push({ id: `sync-${r.id}-${r.status}`, at: r.updatedAt, kind: "sync_failed", message: r.status === "conflict" ? "syncConflict" : "syncStale", params: { ref: r.ref }, entity: "fieldReport", entityId: r.id });
    }
  }

  const reads = new Set(state.notificationReads);
  return list
    .map((n) => ({ ...n, href: partnerHref(n.entity, n.entityId, state), read: reads.has(n.id) }))
    .sort((a, b) => Number(a.read) - Number(b.read) || b.at.localeCompare(a.at));
}

export async function listPartnerInbox(): Promise<InboxItem[]> {
  const state = getState();
  return buildPartnerInbox(state, partnerContext(state));
}

export async function markPartnerRead(ids: string[]): Promise<void> {
  await delay(60);
  partnerContext();
  mutate((draft) => {
    draft.notificationReads = [...new Set([...draft.notificationReads, ...ids])];
  });
}

export async function markPartnerUnread(id: string): Promise<void> {
  await delay(60);
  partnerContext();
  mutate((draft) => {
    draft.notificationReads = draft.notificationReads.filter((x) => x !== id);
  });
}

/* ============================================================== Dashboard */

export type NextActionKind =
  | "completeProfile"
  | "submitApplication"
  | "respondAccreditation"
  | "suspended"
  | "accreditationExpired"
  | "renewal"
  | "documentMissing"
  | "documentExpiring"
  | "documentReturned"
  | "proposalReturned"
  | "proposalDraft"
  | "reportReturned"
  | "reportDraft"
  | "surveyReturned"
  | "syncPending"
  | "reportDue"
  | "financeReturned"
  | "progressReturned"
  | "profileChangeReturned"
  | "signMou"
  | "verificationPending"
  | "assistanceFlagged";

export interface NextAction {
  id: string;
  kind: NextActionKind;
  params: Record<string, string | number>;
  href: string;
  priority: Priority;
  at: string;
}

export function nextActions(state: DemoState, ctx: PartnerContext): NextAction[] {
  const p = ctx.partner;
  const can = (x: Parameters<typeof ctx.permissions.includes>[0]) => ctx.permissions.includes(x);
  const items: NextAction[] = [];
  const push = (x: NextAction) => items.push(x);

  if (can("profile.edit")) {
    if (p.status === "draft") {
      const complete = applicationChecklist(state, p).complete;
      push({ id: "acc-draft", kind: complete ? "submitApplication" : "completeProfile", params: { name: p.name }, href: complete ? "/partner/accreditation" : "/partner/profile", priority: "high", at: p.updatedAt });
    }
    if (p.status === "changes_requested") push({ id: "acc-changes", kind: "respondAccreditation", params: {}, href: "/partner/accreditation", priority: "high", at: p.updatedAt });
    const returned = (p.profileChanges ?? []).filter((c) => c.status === "returned").slice(-1)[0];
    if (returned && !(p.profileChanges ?? []).some((c) => c.status === "under_review" && c.submittedAt > returned.submittedAt)) {
      push({ id: `pcr-${returned.id}`, kind: "profileChangeReturned", params: { ref: returned.ref }, href: "/partner/profile", priority: "medium", at: returned.decidedAt ?? returned.submittedAt });
    }
  }
  if (p.status === "suspended") push({ id: "acc-suspended", kind: "suspended", params: {}, href: "/partner/accreditation", priority: "high", at: p.updatedAt });
  const eligibility = partnerEligibility(state, p);
  if (p.status === "approved" && eligibility.reason === "accreditation_expired") push({ id: "acc-expired", kind: "accreditationExpired", params: {}, href: "/partner/accreditation", priority: "high", at: p.accreditedUntil ?? p.updatedAt });
  else if (p.status === "approved" && !p.renewal && p.accreditedUntil && new Date(p.accreditedUntil).getTime() < Date.now() + 60 * DAY_MS && can("profile.edit")) {
    push({ id: "acc-renew", kind: "renewal", params: { date: p.accreditedUntil }, href: "/partner/accreditation", priority: "medium", at: p.accreditedUntil });
  }

  if (can("documents.manage")) {
    for (const d of partnerDocuments(state, p.id).filter((x) => x.category === "partner_document")) {
      if (d.required && (d.status === "missing" || d.status === "rejected")) push({ id: `doc-${d.id}`, kind: "documentMissing", params: { name: d.title }, href: `/partner/documents/${d.id}`, priority: p.status === "draft" || p.status === "changes_requested" ? "high" : "medium", at: d.updatedAt });
      else if (d.status === "changes_requested") push({ id: `doc-${d.id}`, kind: "documentReturned", params: { name: d.title }, href: `/partner/documents/${d.id}`, priority: "high", at: d.updatedAt });
      else if (d.required && ["expired", "expiring"].includes(expiryState(d))) push({ id: `doc-${d.id}`, kind: "documentExpiring", params: { name: d.title, date: d.expiresAt! }, href: `/partner/documents/${d.id}`, priority: expiryState(d) === "expired" ? "high" : "medium", at: d.expiresAt! });
    }
  }

  const interventions = visibleInterventions(state, ctx);
  if (can("proposals.manage")) {
    for (const i of interventions.filter((x) => x.status === "changes_requested")) push({ id: `prop-${i.id}`, kind: "proposalReturned", params: { ref: i.ref }, href: `/partner/proposals/${i.id}`, priority: "high", at: i.updatedAt });
    for (const i of interventions.filter((x) => x.status === "draft")) push({ id: `prop-${i.id}`, kind: "proposalDraft", params: { ref: i.ref, title: i.title }, href: `/partner/proposals/${i.id}`, priority: "low", at: i.updatedAt });
  }
  for (const i of interventions) {
    if (can("finance.submit")) {
      for (const f of (i.financialUpdates ?? []).filter((x) => x.status === "returned")) push({ id: `fin-${f.id}`, kind: "financeReturned", params: { ref: f.ref }, href: `/partner/finance?intervention=${i.id}&update=${f.id}`, priority: "high", at: f.decidedAt ?? f.updatedAt });
    }
    if (can("progress.update")) {
      const returned = (i.progressUpdates ?? []).filter((u) => u.status === "returned");
      if (returned.length) push({ id: `pu-${i.id}`, kind: "progressReturned", params: { ref: i.ref }, href: `/partner/interventions/${i.id}?tab=progress`, priority: "medium", at: returned[returned.length - 1].reviewedAt ?? i.updatedAt });
    }
    if (can("fieldReports.submit") && REPORTABLE.includes(i.status)) {
      const due = reportingSchedule(state, i).filter((x) => x.status === "overdue" || x.status === "due");
      if (due.length) push({ id: `due-${i.id}`, kind: "reportDue", params: { ref: i.ref, period: due[0].key }, href: `/partner/field-reports/new?intervention=${i.id}`, priority: due[0].status === "overdue" ? "high" : "medium", at: due[0].dueAt });
    }
  }
  const ids = new Set(interventions.map((i) => i.id));
  for (const r of state.fieldReports.filter((x) => ids.has(x.interventionId))) {
    const href = partnerHref("fieldReport", r.id, state);
    const permission = r.kind === "survey" ? can("surveys.collect") : can("fieldReports.submit");
    if (!permission) continue;
    if (r.status === "returned") push({ id: `fr-${r.id}`, kind: r.kind === "survey" ? "surveyReturned" : "reportReturned", params: { ref: r.ref }, href, priority: "high", at: r.updatedAt });
    else if (r.status === "draft") push({ id: `fr-${r.id}`, kind: "reportDraft", params: { ref: r.ref }, href, priority: "low", at: r.updatedAt });
    else if (r.status === "saved_offline" || r.status === "awaiting_sync") push({ id: `fr-${r.id}`, kind: "syncPending", params: { ref: r.ref }, href, priority: "medium", at: r.updatedAt });
  }
  if (can("agreements.sign")) {
    for (const d of ownDocuments(state, ctx).filter((x) => x.category === "mou" && x.signature.status === "requested")) push({ id: `mou-${d.id}`, kind: "signMou", params: { name: d.title }, href: `/partner/agreements/${d.id}`, priority: "high", at: d.signature.requestedAt ?? d.updatedAt });
  }
  if (can("beneficiaries.verify")) {
    for (const v of state.verifications.filter((x) => x.partnerId === p.id && ids.has(x.interventionId) && (x.status === "pending" || x.status === "unavailable"))) {
      push({ id: `bv-${v.id}`, kind: "verificationPending", params: { ref: v.ref }, href: "/partner/beneficiaries?tab=verification", priority: "medium", at: v.requestedAt });
    }
  }
  for (const a of state.assistance.filter((x) => x.partnerId === p.id && ids.has(x.interventionId) && assistanceStatus(state, x) === "flagged")) {
    push({ id: `as-${a.id}`, kind: "assistanceFlagged", params: { ref: a.ref }, href: `/partner/beneficiaries/${a.id}`, priority: "low", at: a.recordedAt });
  }
  const order: Record<Priority, number> = { high: 0, medium: 1, low: 2 };
  return items.sort((a, b) => order[a.priority] - order[b.priority] || b.at.localeCompare(a.at));
}

export interface PartnerDashboard {
  partner: Partner;
  eligibility: Eligibility;
  compliance: Compliance;
  isAdmin: boolean;
  counts: {
    active: number;
    awaitingReview: number;
    reportsDue: number;
    returned: number;
    expiringDocuments: number;
    openAssistanceReviews: number;
    unread: number;
  };
  nextActions: NextAction[];
  messages: InboxItem[];
  interventions: { intervention: Intervention; percent: number; awaiting: number }[];
  generatedAt: string;
}

export async function getPartnerDashboard(): Promise<PartnerDashboard> {
  const state = getState();
  const ctx = partnerContext(state);
  const interventions = visibleInterventions(state, ctx);
  const ids = new Set(interventions.map((i) => i.id));
  const inbox = buildPartnerInbox(state, ctx);
  const returned =
    interventions.filter((i) => i.status === "changes_requested").length +
    state.fieldReports.filter((r) => ids.has(r.interventionId) && r.status === "returned").length +
    interventions.reduce((s, i) => s + (i.financialUpdates ?? []).filter((f) => f.status === "returned").length, 0) +
    (ctx.partner.status === "changes_requested" ? 1 : 0);
  return {
    partner: ctx.partner,
    eligibility: partnerEligibility(state, ctx.partner),
    compliance: partnerCompliance(state, ctx.partner),
    isAdmin: ctx.isAdmin,
    counts: {
      active: interventions.filter((i) => i.status === "active" || i.status === "approved").length,
      awaitingReview: interventions.filter((i) => i.status === "submitted" || i.status === "coordination_review").length,
      reportsDue: interventions.filter((i) => REPORTABLE.includes(i.status)).reduce((s, i) => s + reportingSchedule(state, i).filter((p) => p.status === "overdue" || p.status === "due").length, 0),
      returned,
      expiringDocuments: ownDocuments(state, ctx).filter((d) => d.required && ["expired", "expiring"].includes(expiryState(d))).length,
      openAssistanceReviews: state.assistance.filter((a) => a.partnerId === ctx.partner.id && ids.has(a.interventionId) && assistanceStatus(state, a) === "flagged").length,
      unread: inbox.filter((n) => !n.read).length,
    },
    nextActions: nextActions(state, ctx),
    messages: inbox.slice(0, 6),
    interventions: interventions
      .filter((i) => APPROVED_WORK.includes(i.status) && i.status !== "closed")
      .map((i) => ({ intervention: i, percent: interventionProgress(state, i).percent, awaiting: awaitingOpm(state, i).length })),
    generatedAt: now(),
  };
}

/** Sidebar counts: open next actions per section (low-priority reminders excluded) and unread messages. */
export async function getPartnerNavCounts(): Promise<Record<string, number>> {
  const state = getState();
  const ctx = partnerContext(state);
  const counts: Record<string, number> = {};
  for (const a of nextActions(state, ctx).filter((x) => x.priority !== "low")) {
    const section = `/${a.href.split("?")[0].split("/").slice(1, 3).join("/")}`;
    if (section !== "/partner") counts[section] = (counts[section] ?? 0) + 1;
  }
  counts["/partner/messages"] = buildPartnerInbox(state, ctx).filter((n) => !n.read).length;
  return counts;
}

/* ======================================================= Correspondence */

export type ThreadEntity = "partner" | "intervention" | "fieldReport";

export interface Thread {
  entity: ThreadEntity;
  id: string;
  ref: string;
  title: string;
  href: string;
  comments: Comment[];
  notes: Comment[];
  lastAt: string;
  canReply: boolean;
  /** Suffix on formal comments written by this organisation (see partnerAuthor). */
  orgLabel: string;
}

export async function listThreads(): Promise<Thread[]> {
  const state = getState();
  const ctx = partnerContext(state);
  const threads: Thread[] = [];
  const last = (a: Comment[], b: Comment[], fallback: string) => [...a, ...b].map((c) => c.at).sort().pop() ?? fallback;
  const p = ctx.partner;
  threads.push({
    entity: "partner",
    id: p.id,
    ref: p.ref,
    title: p.name,
    href: "/partner/accreditation",
    comments: p.comments,
    notes: p.partnerNotes ?? [],
    lastAt: last(p.comments, p.partnerNotes ?? [], p.updatedAt),
    canReply: ctx.permissions.includes("profile.edit"),
    orgLabel: ctx.partner.acronym || ctx.partner.name,
  });
  const interventions = visibleInterventions(state, ctx);
  for (const i of interventions) {
    threads.push({
      entity: "intervention",
      id: i.id,
      ref: i.ref,
      title: i.title || i.ref,
      href: partnerHref("intervention", i.id, state),
      comments: i.comments,
      notes: i.partnerNotes ?? [],
      lastAt: last(i.comments, i.partnerNotes ?? [], i.updatedAt),
      orgLabel: ctx.partner.acronym || ctx.partner.name,
      canReply: ctx.permissions.includes("proposals.manage") || ctx.permissions.includes("progress.update"),
    });
  }
  const ids = new Set(interventions.map((i) => i.id));
  for (const r of state.fieldReports.filter((x) => ids.has(x.interventionId) && (x.comments.length > 0 || (x.partnerNotes ?? []).length > 0))) {
    threads.push({
      entity: "fieldReport",
      id: r.id,
      ref: r.ref,
      title: r.title,
      href: partnerHref("fieldReport", r.id, state),
      comments: r.comments,
      notes: r.partnerNotes ?? [],
      lastAt: last(r.comments, r.partnerNotes ?? [], r.updatedAt),
      orgLabel: ctx.partner.acronym || ctx.partner.name,
      canReply: ctx.permissions.includes(r.kind === "survey" ? "surveys.collect" : "fieldReports.submit"),
    });
  }
  return threads.sort((a, b) => b.lastAt.localeCompare(a.lastAt));
}

function loadThread(draft: DemoState, ctx: PartnerContext, entity: ThreadEntity, id: string): { comments: Comment[]; notes: Comment[] | undefined; ref: string; set: (c: Comment[]) => void; setNotes: (c: Comment[]) => void } {
  if (entity === "partner") {
    if (id !== ctx.partner.id) throw new ServiceError("NOT_PARTNER_RECORD");
    const p = draft.partners.find((x) => x.id === id)!;
    return { comments: p.comments, notes: p.partnerNotes, ref: p.ref, set: (c) => (p.comments = c), setNotes: (c) => (p.partnerNotes = c) };
  }
  if (entity === "intervention") {
    const i = ownIntervention(draft, ctx, id);
    return { comments: i.comments, notes: i.partnerNotes, ref: i.ref, set: (c) => (i.comments = c), setNotes: (c) => (i.partnerNotes = c) };
  }
  const { report } = ownFieldReport(draft, ctx, id);
  return { comments: report.comments, notes: report.partnerNotes, ref: report.ref, set: (c) => (report.comments = c), setNotes: (c) => (report.partnerNotes = c) };
}

/** A formal reply: visible to OPM on the record and recorded in the audit trail. */
export async function addFormalReply(entity: ThreadEntity, id: string, text: string): Promise<void> {
  const body = requireNote(text);
  await delay(150);
  const ctx = partnerContext();
  mutate((draft) => {
    const thread = loadThread(draft, ctx, entity, id);
    if (entity === "partner") requirePartnerPermission(ctx, "profile.edit");
    else if (entity === "intervention" && !ctx.permissions.includes("proposals.manage") && !ctx.permissions.includes("progress.update")) throw new ServiceError("FORBIDDEN");
    thread.set([...thread.comments, { id: newId("c"), at: now(), author: partnerAuthor(ctx), text: body }]);
    partnerAudit(draft, ctx, "partnerReplied", entity, id, thread.ref);
    notifyOpm(draft, "partnerReplied", { ref: thread.ref, partner: ctx.partner.name }, entity, id);
  });
}

/** An internal note: visible only inside the partner organisation. It is never shown to OPM. */
export async function addInternalNote(entity: ThreadEntity, id: string, text: string): Promise<void> {
  const body = requireNote(text);
  await delay(150);
  const ctx = partnerContext();
  mutate((draft) => {
    const thread = loadThread(draft, ctx, entity, id);
    thread.setNotes([...(thread.notes ?? []), { id: newId("pn"), at: now(), author: ctx.actor, text: body }]);
  });
}

/* ================================================================ Reports */

export interface PartnerReportFilters {
  interventionId?: string;
  from?: string;
  to?: string;
}

export interface PartnerTable {
  section: PartnerReportSection;
  key: string;
  columns: string[];
  rows: (string | number)[][];
}

export interface PartnerReportResult {
  figures: {
    interventions: number;
    activeInterventions: number;
    acceptedReports: number;
    peopleReached: number;
    assistanceEntries: number;
    assistanceQuantity: number;
    settlements: number;
    budgetUsd: number;
    acceptedExpenditureUsd: number;
  };
  tables: PartnerTable[];
}

export const partnerSections: PartnerReportSection[] = ["progress", "fieldActivities", "indicators", "assistance", "coverage", "expenditure"];

/**
 * Partner report figures, computed only from the organisation's own records
 * the user can see. Accepted field reports and accepted expenditure count as
 * official; other figures are labelled by status. No beneficiary references
 * or personal details are included.
 */
export function computePartnerReport(state: DemoState, ctx: PartnerContext, filters: PartnerReportFilters, sections: PartnerReportSection[]): PartnerReportResult {
  const from = filters.from ? new Date(filters.from).getTime() : -Infinity;
  const to = filters.to ? new Date(filters.to).getTime() + DAY_MS - 1 : Infinity;
  const within = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= from && t <= to;
  };
  const interventions = visibleInterventions(state, ctx).filter((i) => APPROVED_WORK.includes(i.status) && (!filters.interventionId || i.id === filters.interventionId));
  const ids = new Set(interventions.map((i) => i.id));
  const reports = state.fieldReports.filter((r) => ids.has(r.interventionId) && r.status !== "draft" && within(r.collectedAt));
  const accepted = reports.filter((r) => r.status === "accepted");
  const assistance = state.assistance.filter((a) => a.partnerId === ctx.partner.id && ids.has(a.interventionId) && within(a.deliveredAt));
  const tables: PartnerTable[] = [];

  if (sections.includes("progress")) {
    tables.push({
      section: "progress",
      key: "progress",
      columns: ["Intervention", "Status", "Settlement", "Progress %", "People reached (accepted)", "Milestones done"],
      rows: interventions.map((i) => {
        const pr = interventionProgress(state, i);
        return [`${i.ref} ${i.title}`, i.status, settlementName(i.settlementId), pr.percent, pr.reached, `${i.milestones.filter((m) => m.done).length}/${i.milestones.length}`];
      }),
    });
  }
  if (sections.includes("fieldActivities")) {
    const statuses = ["submitted", "needs_correction", "accepted", "saved_offline", "awaiting_sync"] as const;
    tables.push({
      section: "fieldActivities",
      key: "fieldActivities",
      columns: ["Intervention", ...statuses.map((s) => `Reports ${s.replace("_", " ")}`), "People reached (accepted)"],
      rows: interventions.map((i) => {
        const mine = reports.filter((r) => r.interventionId === i.id);
        return [i.ref, ...statuses.map((s) => mine.filter((r) => partnerReportStatus(r.status) === s).length), mine.filter((r) => r.status === "accepted").reduce((s, r) => s + r.reached.women + r.reached.men + r.reached.children, 0)];
      }),
    });
  }
  if (sections.includes("indicators")) {
    tables.push({
      section: "indicators",
      key: "indicators",
      columns: ["Intervention", "Indicator", "Target", "Accepted actual", "% of target"],
      rows: interventions.flatMap((i) =>
        i.indicatorTargets.map((t) => {
          const actual = accepted.filter((r) => r.interventionId === i.id).reduce((s, r) => s + (r.indicatorValues.find((v) => v.indicatorId === t.indicatorId)?.value ?? 0), 0);
          return [i.ref, indicatorLabel(t.indicatorId), t.target, actual, t.target ? Math.round((actual / t.target) * 100) : 0];
        }),
      ),
    });
  }
  if (sections.includes("assistance")) {
    const byType = new Map<string, { entries: number; quantity: number; flagged: number; unit: string }>();
    for (const a of assistance) {
      const row = byType.get(a.assistanceType) ?? { entries: 0, quantity: 0, flagged: 0, unit: a.unit };
      row.entries += 1;
      row.quantity += a.quantity;
      if (assistanceStatus(state, a) === "flagged") row.flagged += 1;
      byType.set(a.assistanceType, row);
    }
    const distributed = new Map<string, { quantity: number; households: number }>();
    for (const r of accepted) for (const d of r.distributed) {
      const row = distributed.get(d.item) ?? { quantity: 0, households: 0 };
      row.quantity += d.quantity;
      row.households += d.households;
      distributed.set(d.item, row);
    }
    tables.push({
      section: "assistance",
      key: "assistance",
      columns: ["Assistance type", "Individual entries", "Quantity (entries)", "Unit", "Entries under OPM review", "Distributed in accepted reports", "Households (accepted reports)"],
      rows: [...new Set([...byType.keys(), ...distributed.keys()])].map((type) => {
        const a = byType.get(type);
        const d = distributed.get(type);
        return [type, a?.entries ?? 0, a?.quantity ?? 0, a?.unit ?? "—", a?.flagged ?? 0, d?.quantity ?? 0, d?.households ?? 0];
      }),
    });
  }
  if (sections.includes("coverage")) {
    tables.push({
      section: "coverage",
      key: "coverage",
      columns: ["Settlement", "Service point", "Interventions", "Accepted reports"],
      rows: [...new Set(interventions.flatMap((i) => i.servicePointIds))].map((sp) => {
        const list = interventions.filter((i) => i.servicePointIds.includes(sp));
        const settlement = state.servicePoints.find((x) => x.id === sp)?.settlementId;
        return [settlementName(settlement), servicePointName(sp), list.map((i) => i.ref).join(", "), accepted.filter((r) => r.servicePointId === sp).length];
      }),
    });
  }
  if (sections.includes("expenditure")) {
    tables.push({
      section: "expenditure",
      key: "expenditure",
      columns: ["Intervention", "Budget line", "Approved budget (USD)", "Accepted expenditure (USD)", "Awaiting OPM review (USD)", "Variance (USD)"],
      rows: interventions.flatMap((i) => {
        const f = financeSummary(i);
        return f.lines.map((l) => [i.ref, l.line.category, l.line.amountUsd, l.accepted, l.submitted, l.variance]);
      }),
    });
  }

  return {
    figures: {
      interventions: interventions.length,
      activeInterventions: interventions.filter((i) => i.status === "active").length,
      acceptedReports: accepted.length,
      peopleReached: accepted.reduce((s, r) => s + r.reached.women + r.reached.men + r.reached.children, 0),
      assistanceEntries: assistance.length,
      assistanceQuantity: assistance.reduce((s, a) => s + a.quantity, 0),
      settlements: new Set(interventions.map((i) => i.settlementId)).size,
      budgetUsd: interventions.reduce((s, i) => s + i.budgetUsd, 0),
      acceptedExpenditureUsd: interventions.reduce((s, i) => s + financeSummary(i).accepted, 0),
    },
    tables,
  };
}

export async function previewPartnerReport(filters: PartnerReportFilters, sections: PartnerReportSection[]): Promise<PartnerReportResult> {
  const state = getState();
  const ctx = partnerContext(state);
  if (filters.interventionId) ownIntervention(state, ctx, filters.interventionId);
  return computePartnerReport(state, ctx, filters, sections);
}

export async function listPartnerReports(): Promise<{ reports: PartnerReport[]; interventions: Intervention[]; canExport: boolean }> {
  const state = getState();
  const ctx = partnerContext(state);
  return {
    reports: state.partnerReports.filter((r) => r.partnerId === ctx.partner.id && (ctx.isAdmin || !r.interventionId || (ctx.user.interventionIds ?? []).includes(r.interventionId))).sort((a, b) => b.generatedAt.localeCompare(a.generatedAt)),
    interventions: visibleInterventions(state, ctx).filter((i) => APPROVED_WORK.includes(i.status)),
    canExport: ctx.permissions.includes("reports.export"),
  };
}

/** Freezes the figures so later edits do not change a report that was shared. */
export async function generatePartnerReport(title: string, filters: PartnerReportFilters, sections: PartnerReportSection[]): Promise<string> {
  if (!title.trim()) throw new ServiceError("FIELD_REQUIRED");
  if (sections.length === 0) throw new ServiceError("FIELD_REQUIRED");
  await delay(400);
  const ctx = partnerContext();
  return mutate((draft) => {
    if (filters.interventionId) ownIntervention(draft, ctx, filters.interventionId);
    const result = computePartnerReport(draft, ctx, filters, sections);
    const report: PartnerReport = {
      id: newId("prep"),
      ref: nextRef(draft.partnerReports.map((r) => r.ref), `PR-${ctx.partner.acronym || "PARTNER"}-`, 3),
      partnerId: ctx.partner.id,
      title: title.trim(),
      interventionId: filters.interventionId,
      from: filters.from,
      to: filters.to,
      sections,
      generatedAt: now(),
      generatedBy: ctx.actor,
      snapshot: { ...result.figures },
      exports: [],
    };
    draft.partnerReports.push(report);
    // Logged on the organisation record so the entry links to a real page in both workspaces.
    partnerAudit(draft, ctx, "partnerReportGenerated", "partner", ctx.partner.id, report.ref);
    return report.id;
  });
}

/** Records an export. The file holds the same aggregate tables as the screen, never beneficiary details. */
export async function recordPartnerExport(reportId: string, format: "PDF" | "Excel" | "CSV", rows: number): Promise<void> {
  await delay(80);
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "reports.export");
  mutate((draft) => {
    const r = draft.partnerReports.find((x) => x.id === reportId && x.partnerId === ctx.partner.id);
    if (!r) throw new ServiceError("NOT_PARTNER_RECORD");
    r.exports.push({ format, at: now(), by: ctx.actor });
    partnerAudit(draft, ctx, "reportExported", "partner", ctx.partner.id, r.ref, { format, rows }, { category: "export" });
  });
}

export function reportRows(result: PartnerReportResult): number {
  return result.tables.reduce((n, t) => n + t.rows.length, 0);
}
