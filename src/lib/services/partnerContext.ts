"use client";

import type { AuditEntry, DemoState, DocumentRecord, EntityType, FieldReport, Intervention, Partner, PartnerPermission, UserAccount } from "@/lib/types";
import { partnerAdminOnly } from "@/lib/demo/reference";
import { addAudit, addNotification, getState } from "@/lib/demo/store";
import { getSession } from "./session";
import { ServiceError } from "./core";

/**
 * Access rules for the Partner Portal. Every partner service starts here: the
 * signed-in user must belong to a partner organisation, and every record they
 * read or change must belong to that organisation. Staff additionally see only
 * the interventions they are assigned to. These checks run in the service
 * layer, so the same rules hold for screens, exports and any future API.
 */

export interface PartnerContext {
  user: UserAccount;
  partner: Partner;
  isAdmin: boolean;
  permissions: PartnerPermission[];
  /** Name recorded in audit entries and comments. */
  actor: string;
}

export function partnerPermissionsOf(user: Pick<UserAccount, "role" | "partnerPermissions">): PartnerPermission[] {
  const delegated = user.partnerPermissions ?? [];
  if (user.role === "partner_admin") return [...new Set<PartnerPermission>([...partnerAdminOnly, ...delegated])];
  if (user.role === "partner_staff") return delegated.filter((p) => !partnerAdminOnly.includes(p));
  return [];
}

export function partnerContext(state: DemoState = getState()): PartnerContext {
  const session = getSession();
  if (!session) throw new ServiceError("UNAUTHENTICATED");
  if (!session.partnerId) throw new ServiceError("FORBIDDEN");
  const user = state.users.find((u) => u.id === session.userId);
  if (!user || user.partnerId !== session.partnerId || user.status === "deactivated") throw new ServiceError("FORBIDDEN");
  const partner = state.partners.find((p) => p.id === session.partnerId);
  if (!partner) throw new ServiceError("NOT_FOUND");
  return { user, partner, isAdmin: user.role === "partner_admin", permissions: partnerPermissionsOf(user), actor: user.name };
}

/** Synchronous check for showing or disabling controls; the services enforce the same rule. */
export function partnerCan(permission: PartnerPermission): boolean {
  try {
    return partnerContext().permissions.includes(permission);
  } catch {
    return false;
  }
}

export function requirePartnerPermission(ctx: PartnerContext, permission: PartnerPermission): void {
  if (!ctx.permissions.includes(permission)) throw new ServiceError("FORBIDDEN");
}

/** The organisation's interventions this user may see: all for administrators, assigned ones for staff. */
export function visibleInterventions(state: DemoState, ctx: PartnerContext): Intervention[] {
  const own = state.interventions.filter((i) => i.partnerId === ctx.partner.id);
  if (ctx.isAdmin) return own;
  const assigned = new Set(ctx.user.interventionIds ?? []);
  return own.filter((i) => assigned.has(i.id));
}

/** Loads one of the organisation's interventions, or refuses. Works on the live state or a mutation draft. */
export function ownIntervention(state: DemoState, ctx: PartnerContext, id: string): Intervention {
  const i = state.interventions.find((x) => x.id === id);
  if (!i) throw new ServiceError("NOT_FOUND");
  if (i.partnerId !== ctx.partner.id) throw new ServiceError("NOT_PARTNER_RECORD");
  if (!ctx.isAdmin && !(ctx.user.interventionIds ?? []).includes(id)) throw new ServiceError("NOT_PARTNER_RECORD");
  return i;
}

export function ownFieldReport(state: DemoState, ctx: PartnerContext, id: string): { report: FieldReport; intervention: Intervention } {
  const report = state.fieldReports.find((r) => r.id === id);
  if (!report) throw new ServiceError("NOT_FOUND");
  return { report, intervention: ownIntervention(state, ctx, report.interventionId) };
}

/** Documents the organisation owns: its profile documents, MoUs, and evidence on its visible work. */
export function ownDocuments(state: DemoState, ctx: PartnerContext): DocumentRecord[] {
  const interventions = new Set(visibleInterventions(state, ctx).map((i) => i.id));
  const reports = new Set(state.fieldReports.filter((r) => interventions.has(r.interventionId)).map((r) => r.id));
  return state.documents.filter((d) => {
    if (!d.related) return false;
    if (d.related.entity === "partner") return d.related.id === ctx.partner.id;
    if (d.related.entity === "intervention") return interventions.has(d.related.id);
    if (d.related.entity === "fieldReport") return reports.has(d.related.id);
    return false;
  });
}

export function ownDocument(state: DemoState, ctx: PartnerContext, id: string): DocumentRecord {
  const d = state.documents.find((x) => x.id === id);
  if (!d) throw new ServiceError("NOT_FOUND");
  if (!ownDocuments(state, ctx).some((x) => x.id === id)) throw new ServiceError("NOT_PARTNER_RECORD");
  return d;
}

/** Ids of every record the organisation owns, used to scope its activity history and inbox. */
export function ownRecordIds(state: DemoState, ctx: PartnerContext): Set<string> {
  const interventions = visibleInterventions(state, ctx);
  const ids = new Set<string>([ctx.partner.id]);
  interventions.forEach((i) => ids.add(i.id));
  const interventionIds = new Set(interventions.map((i) => i.id));
  state.fieldReports.filter((r) => interventionIds.has(r.interventionId)).forEach((r) => ids.add(r.id));
  ownDocuments(state, ctx).forEach((d) => ids.add(d.id));
  state.assistance.filter((a) => a.partnerId === ctx.partner.id && interventionIds.has(a.interventionId)).forEach((a) => ids.add(a.id));
  state.verifications.filter((v) => v.partnerId === ctx.partner.id && interventionIds.has(v.interventionId)).forEach((v) => ids.add(v.id));
  state.partnerReports.filter((r) => r.partnerId === ctx.partner.id).forEach((r) => ids.add(r.id));
  if (ctx.isAdmin) state.users.filter((u) => u.partnerId === ctx.partner.id).forEach((u) => ids.add(u.id));
  return ids;
}

/**
 * Audit entries a partner may read about its own records. Restricted-access
 * entries (sensitive reveals, OPM access logs) stay in the OPM audit trail.
 */
export function partnerVisibleAudit(state: DemoState, ctx: PartnerContext, entityId?: string): AuditEntry[] {
  const ids = entityId ? new Set([entityId]) : ownRecordIds(state, ctx);
  return state.audit.filter((a) => a.entityId && ids.has(a.entityId) && !a.sensitive && a.category !== "access");
}

/** Where a record lives in the Partner Portal. */
export function partnerHref(entity: EntityType | "session", id: string | undefined, state: DemoState = getState()): string {
  if (!id) return "/partner";
  switch (entity) {
    case "partner":
      return "/partner/accreditation";
    case "intervention": {
      const i = state.interventions.find((x) => x.id === id);
      return i && ["approved", "active", "completed", "closed"].includes(i.status) ? `/partner/interventions/${id}` : `/partner/proposals/${id}`;
    }
    case "fieldReport": {
      const r = state.fieldReports.find((x) => x.id === id);
      return r?.kind === "survey" ? `/partner/surveys/responses/${id}` : `/partner/field-reports/${id}`;
    }
    case "form":
      return `/partner/surveys/${id}`;
    case "document": {
      const d = state.documents.find((x) => x.id === id);
      return d?.category === "mou" ? `/partner/agreements/${id}` : `/partner/documents/${id}`;
    }
    case "assistance":
      return `/partner/beneficiaries/${id}`;
    case "verification":
      return "/partner/beneficiaries?tab=verification";
    case "review": {
      const a = state.assistance.find((x) => x.reviewId === id);
      return a ? `/partner/beneficiaries/${a.id}` : "/partner/beneficiaries";
    }
    case "report":
      return "/partner/reports";
    case "user":
      return "/partner/team";
    default:
      return "/partner";
  }
}

/** Author label on formal correspondence, so OPM can see which organisation wrote it. */
export function partnerAuthor(ctx: PartnerContext): string {
  return `${ctx.actor}, ${ctx.partner.acronym || ctx.partner.name}`;
}

/** Audit helper for partner actions; the entry appears in both the OPM trail and the partner's own history. */
export function partnerAudit(
  draft: DemoState,
  ctx: PartnerContext,
  action: string,
  entity: EntityType,
  entityId: string,
  entityRef: string,
  params: Record<string, string | number> = {},
  extra: { note?: string; simulated?: boolean; category?: AuditEntry["category"] } = {},
): void {
  addAudit(draft, {
    actor: ctx.actor,
    action,
    category: extra.category ?? "record",
    params: { name: entityRef, partner: ctx.partner.name, ...params },
    entity,
    entityId,
    entityRef,
    note: extra.note,
    simulated: extra.simulated,
  });
}

/** Tells OPM coordinators that a partner submitted something for review (shown in the OPM inbox only). */
export function notifyOpm(draft: DemoState, message: string, params: Record<string, string | number>, entity: EntityType, entityId: string): void {
  addNotification(draft, { kind: "assigned_review", message, params, entity, entityId });
}

/** Notification for the partner organisation only (never shown to OPM or to another partner). */
export function notifyPartner(
  draft: DemoState,
  partnerId: string,
  kind: "decision" | "changes_requested" | "deadline" | "sync_failed",
  message: string,
  params: Record<string, string | number>,
  entity: EntityType,
  entityId: string,
): void {
  addNotification(draft, { kind, message, params, entity, entityId, audience: { partnerId } });
}

/** Masks a beneficiary reference for lists: keeps the first two segments and the last two characters. */
export function maskReference(ref: string): string {
  const parts = ref.split("-");
  if (parts.length >= 3) return `${parts.slice(0, 2).join("-")}-••••-${ref.slice(-2)}`;
  return ref.length > 4 ? `${"•".repeat(ref.length - 2)}${ref.slice(-2)}` : "••••";
}

/** Next sequential reference in a family, e.g. INT-2026-0156. */
export function nextRef(existing: string[], prefix: string, width = 4): string {
  const numbers = existing.filter((r) => r.startsWith(prefix)).map((r) => Number(r.slice(prefix.length)) || 0);
  return `${prefix}${String(Math.max(0, ...numbers) + 1).padStart(width, "0")}`;
}
