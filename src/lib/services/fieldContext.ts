"use client";

import type { AuditEntry, DemoState, EntityType, FieldPermission, FieldTask, Intervention, NotificationKind, Partner, Settlement, UserAccount } from "@/lib/types";
import { FIELD_ROLES } from "@/lib/types";
import { fieldSupervisorPermissions } from "@/lib/demo/reference";
import { addAudit, addNotification, getState } from "@/lib/demo/store";
import { getSession } from "./session";
import { ServiceError } from "./core";
import { REPORTABLE } from "./interventions";

/**
 * Access rules for the Field Operations Portal. Every field service starts
 * here. A field officer sees only the interventions and tasks assigned to
 * them, inside their assigned settlement, for their own organisation. A
 * settlement supervisor sees the organisation's work in their settlement and
 * can assign and review it. Neither can browse the national beneficiary
 * database or another organisation's restricted records. These checks run in
 * the service layer, so they hold for every screen and any future API.
 */

export interface FieldContext {
  user: UserAccount;
  organisation: Partner;
  settlementIds: string[];
  isSupervisor: boolean;
  permissions: FieldPermission[];
  /** Name recorded in audit entries and comments. */
  actor: string;
}

/** Supervisor permissions are never effective on an officer account, even if listed. */
export function fieldPermissionsOf(user: Pick<UserAccount, "role" | "fieldPermissions">): FieldPermission[] {
  const listed = user.fieldPermissions ?? [];
  if (user.role === "field_supervisor") return listed;
  if (user.role === "field_officer") return listed.filter((p) => !fieldSupervisorPermissions.includes(p));
  return [];
}

export function isFieldRole(role: UserAccount["role"] | undefined): boolean {
  return Boolean(role && FIELD_ROLES.includes(role));
}

export function fieldContext(state: DemoState = getState()): FieldContext {
  const session = getSession();
  if (!session) throw new ServiceError("UNAUTHENTICATED");
  if (!isFieldRole(session.role)) throw new ServiceError("FORBIDDEN");
  const user = state.users.find((u) => u.id === session.userId);
  if (!user || !isFieldRole(user.role) || user.status !== "active") throw new ServiceError("FORBIDDEN");
  const organisation = state.partners.find((p) => p.id === user.fieldOrganisationId);
  if (!organisation) throw new ServiceError("FORBIDDEN");
  const settlementIds = user.scope.level === "settlement" ? user.scope.ids : [];
  return {
    user,
    organisation,
    settlementIds,
    isSupervisor: user.role === "field_supervisor",
    permissions: fieldPermissionsOf(user),
    actor: user.name,
  };
}

/** Synchronous check for showing or disabling controls; the services enforce the same rule. */
export function fieldCan(permission: FieldPermission): boolean {
  try {
    return fieldContext().permissions.includes(permission);
  } catch {
    return false;
  }
}

export function requireFieldPermission(ctx: FieldContext, permission: FieldPermission): void {
  if (!ctx.permissions.includes(permission)) throw new ServiceError("FORBIDDEN");
}

export function inFieldSettlement(ctx: FieldContext, settlementId: string | undefined): boolean {
  return Boolean(settlementId && ctx.settlementIds.includes(settlementId));
}

/**
 * Interventions this user may open: the organisation's approved work in the
 * user's settlement, and for officers only the ones assigned to them.
 */
export function visibleFieldInterventions(state: DemoState, ctx: FieldContext): Intervention[] {
  const assigned = new Set(ctx.user.interventionIds ?? []);
  return state.interventions.filter(
    (i) =>
      i.partnerId === ctx.organisation.id &&
      inFieldSettlement(ctx, i.settlementId) &&
      ["approved", "active", "completed"].includes(i.status) &&
      (ctx.isSupervisor || assigned.has(i.id)),
  );
}

/** Loads an intervention the user may see, or refuses without revealing whose it is. */
export function ownFieldIntervention(state: DemoState, ctx: FieldContext, id: string): Intervention {
  const i = state.interventions.find((x) => x.id === id);
  if (!i) throw new ServiceError("NOT_FOUND");
  if (!visibleFieldInterventions(state, ctx).some((x) => x.id === id)) throw new ServiceError("NOT_PARTNER_RECORD");
  return i;
}

/** Reporting is open only on approved or active work. */
export function reportableIntervention(state: DemoState, ctx: FieldContext, id: string): Intervention {
  const i = ownFieldIntervention(state, ctx, id);
  if (!REPORTABLE.includes(i.status)) throw new ServiceError("INTERVENTION_NOT_APPROVED");
  return i;
}

/** Tasks: officers see their own; supervisors see every task on the organisation's work in their settlement. */
export function visibleTasks(state: DemoState, ctx: FieldContext): FieldTask[] {
  const interventions = new Set(visibleFieldInterventions(state, ctx).map((i) => i.id));
  return state.fieldTasks.filter((t) => interventions.has(t.interventionId) && (ctx.isSupervisor || t.assignedTo === ctx.user.id));
}

export function ownTask(state: DemoState, ctx: FieldContext, id: string): FieldTask {
  const task = state.fieldTasks.find((t) => t.id === id);
  if (!task) throw new ServiceError("NOT_FOUND");
  if (!visibleTasks(state, ctx).some((t) => t.id === id)) throw new ServiceError("NOT_PARTNER_RECORD");
  return task;
}

/** Officers of the same organisation working in the supervisor's settlement. */
export function teamMembers(state: DemoState, ctx: FieldContext): UserAccount[] {
  return state.users.filter(
    (u) => u.role === "field_officer" && u.status === "active" && u.fieldOrganisationId === ctx.organisation.id && u.scope.ids.some((id) => ctx.settlementIds.includes(id)),
  );
}

export function assignedSettlements(state: DemoState, ctx: FieldContext): Settlement[] {
  return state.settlements.filter((s) => ctx.settlementIds.includes(s.id));
}

/** Audit helper for field actions; entries appear in the OPM audit trail. */
export function fieldAudit(
  draft: DemoState,
  ctx: FieldContext,
  action: string,
  entity: EntityType,
  entityId: string,
  entityRef: string,
  params: Record<string, string | number> = {},
  extra: { note?: string; simulated?: boolean; category?: AuditEntry["category"]; sensitive?: boolean } = {},
): void {
  addAudit(draft, {
    actor: ctx.actor,
    action,
    category: extra.category ?? "record",
    params: { name: entityRef, ...params },
    entity,
    entityId,
    entityRef,
    note: extra.note,
    simulated: extra.simulated,
    sensitive: extra.sensitive,
  });
}

/** Notification for one field user only (never shown in the OPM inbox or to a partner organisation). */
export function notifyFieldUser(
  draft: DemoState,
  userId: string,
  kind: NotificationKind,
  message: string,
  params: Record<string, string | number>,
  entity: EntityType,
  entityId: string,
): void {
  addNotification(draft, { kind, message, params, entity, entityId, audience: { userId } });
}

/** Where a field notification or record opens in the Field Operations Portal. */
export function fieldHref(entity: EntityType | "session", id: string | undefined, state: DemoState = getState()): string {
  if (!id) return "/field";
  switch (entity) {
    case "intervention":
      return `/field/intervention?id=${id}`;
    case "fieldTask":
      return `/field/task?id=${id}`;
    case "fieldReport": {
      const r = state.fieldReports.find((x) => x.id === id);
      return r?.kind === "survey" ? `/field/surveys?response=${r.clientRecordId ?? ""}` : `/field/report?central=${id}`;
    }
    case "form":
      return `/field/surveys?form=${id}`;
    case "assistance":
      return "/field/assistance";
    case "verification":
      return "/field/verify";
    case "fieldIssue":
      return `/field/issues`;
    default:
      return "/field";
  }
}
