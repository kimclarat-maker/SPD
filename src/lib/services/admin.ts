"use client";

import type {
  ApprovalRoute,
  DemoState,
  GeoScope,
  IndicatorDef,
  NotificationTemplate,
  RoleId,
  SecuritySettings,
  Sector,
  UserAccount,
} from "@/lib/types";
import { addAudit, getState, mutate, newId } from "@/lib/demo/store";
import { delay, now, requireNote, requirePermission, ServiceError } from "./core";
import { getSession } from "./session";

/**
 * Administration. User and reference-data changes need admin.users or
 * admin.reference; technical security settings need the separate
 * admin.security permission. Every change is confirmed in the UI and recorded
 * in the audit trail with a reason.
 */

function log(draft: DemoState, actor: string, action: string, params: Record<string, string | number>, note?: string, entity: "user" | "config" | "indicator" = "config", entityId?: string) {
  addAudit(draft, { actor, action, category: "config", params, entity, entityId, entityRef: entityId, note });
}

export async function getAdminData(): Promise<Pick<DemoState, "users" | "sectors" | "settlements" | "indicators" | "approvalRoutes" | "templates">> {
  const state = getState();
  return {
    // Partner Portal accounts are managed by each organisation's partner administrator.
    users: state.users.filter((u) => !u.partnerId),
    sectors: state.sectors,
    settlements: state.settlements,
    indicators: state.indicators,
    approvalRoutes: state.approvalRoutes,
    templates: state.templates,
  };
}

export async function getSecuritySettings(): Promise<SecuritySettings> {
  requirePermission("admin.security");
  return { ...getState().security };
}

/* ------------------------------------------------------------------ Users */

export async function inviteUser(input: { name: string; email: string; role: RoleId; scope: GeoScope }, note: string): Promise<void> {
  const reason = requireNote(note);
  if (!input.name.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(input.email.trim())) throw new ServiceError("FIELD_REQUIRED");
  if (input.scope.level !== "national" && input.scope.ids.length === 0) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const actor = requirePermission("admin.users");
  mutate((draft) => {
    const email = input.email.trim().toLowerCase();
    if (draft.users.some((u) => u.email.toLowerCase() === email)) throw new ServiceError("DUPLICATE");
    const user: UserAccount = { id: newId("u"), name: input.name.trim(), email, role: input.role, scope: input.scope, status: "invited", invitedAt: now() };
    draft.users.push(user);
    log(draft, actor, "userInvited", { name: user.name, role: user.role }, reason, "user", user.id);
  });
}

export async function updateUserAccess(id: string, role: RoleId, scope: GeoScope, note: string): Promise<void> {
  const reason = requireNote(note);
  if (scope.level !== "national" && scope.ids.length === 0) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const actor = requirePermission("admin.users");
  mutate((draft) => {
    const u = draft.users.find((x) => x.id === id);
    if (!u) throw new ServiceError("NOT_FOUND");
    if (u.id === getSession()?.userId) throw new ServiceError("SELF_CHANGE");
    if (u.partnerId) throw new ServiceError("FORBIDDEN");
    u.role = role;
    u.scope = scope;
    log(draft, actor, "userAccessChanged", { name: u.name, role }, reason, "user", u.id);
  });
}

export async function setUserStatus(id: string, status: "active" | "deactivated", note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("admin.users");
  mutate((draft) => {
    const u = draft.users.find((x) => x.id === id);
    if (!u) throw new ServiceError("NOT_FOUND");
    if (u.id === getSession()?.userId) throw new ServiceError("SELF_CHANGE");
    u.status = status;
    log(draft, actor, status === "active" ? "userReactivated" : "userDeactivated", { name: u.name }, reason, "user", u.id);
  });
}

/* ---------------------------------------------------------- Reference data */

export async function setSectorActive(id: Sector, active: boolean, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("admin.reference");
  mutate((draft) => {
    const s = draft.sectors.find((x) => x.id === id);
    if (!s) throw new ServiceError("NOT_FOUND");
    s.active = active;
    log(draft, actor, active ? "referenceActivated" : "referenceDeactivated", { name: s.name }, reason);
  });
}

export async function renameSector(id: Sector, name: string, note: string): Promise<void> {
  const reason = requireNote(note);
  if (!name.trim()) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const actor = requirePermission("admin.reference");
  mutate((draft) => {
    const s = draft.sectors.find((x) => x.id === id);
    if (!s) throw new ServiceError("NOT_FOUND");
    const old = s.name;
    s.name = name.trim();
    log(draft, actor, "referenceRenamed", { name: old, to: s.name }, reason);
  });
}

export async function setSettlementActive(id: string, active: boolean, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("admin.reference");
  mutate((draft) => {
    const s = draft.settlements.find((x) => x.id === id);
    if (!s) throw new ServiceError("NOT_FOUND");
    s.active = active;
    log(draft, actor, active ? "referenceActivated" : "referenceDeactivated", { name: s.name }, reason);
  });
}

export async function addSettlement(input: { name: string; district: string; region: string; lat: number; lng: number }, note: string): Promise<void> {
  const reason = requireNote(note);
  if (!input.name.trim() || !input.district.trim() || !input.region.trim() || Number.isNaN(input.lat) || Number.isNaN(input.lng)) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const actor = requirePermission("admin.reference");
  mutate((draft) => {
    const id = input.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (draft.settlements.some((s) => s.id === id)) throw new ServiceError("DUPLICATE");
    // Schematic position from coordinates (Uganda roughly spans lat −1.5..4.2, lng 29.5..35).
    const x = Math.round(((input.lng - 29.5) / 5.5) * 100);
    const y = Math.round(((4.2 - input.lat) / 5.7) * 100);
    draft.settlements.push({ id, name: input.name.trim(), district: input.district.trim(), region: input.region.trim(), lat: input.lat, lng: input.lng, x, y, active: true });
    log(draft, actor, "settlementAdded", { name: input.name.trim() }, reason);
  });
}

export async function saveIndicator(input: Omit<IndicatorDef, "id" | "active"> & { id?: string }, note: string): Promise<void> {
  const reason = requireNote(note);
  if (!input.code.trim() || !input.name.trim() || !input.unit.trim() || !(input.target > 0)) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const actor = requirePermission("admin.reference");
  mutate((draft) => {
    if (input.id) {
      const ind = draft.indicators.find((x) => x.id === input.id);
      if (!ind) throw new ServiceError("NOT_FOUND");
      Object.assign(ind, { code: input.code.trim(), name: input.name.trim(), unit: input.unit.trim(), sector: input.sector, target: input.target, frequency: input.frequency });
      log(draft, actor, "indicatorUpdated", { name: `${ind.code} ${ind.name}`, target: ind.target }, reason, "indicator", ind.id);
    } else {
      if (draft.indicators.some((x) => x.code.toLowerCase() === input.code.trim().toLowerCase())) throw new ServiceError("DUPLICATE");
      draft.indicators.push({ id: newId("ind"), code: input.code.trim(), name: input.name.trim(), unit: input.unit.trim(), sector: input.sector, target: input.target, frequency: input.frequency, active: true });
      log(draft, actor, "indicatorAdded", { name: `${input.code.trim()} ${input.name.trim()}` }, reason);
    }
  });
}

export async function setIndicatorActive(id: string, active: boolean, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("admin.reference");
  mutate((draft) => {
    const ind = draft.indicators.find((x) => x.id === id);
    if (!ind) throw new ServiceError("NOT_FOUND");
    ind.active = active;
    log(draft, actor, active ? "referenceActivated" : "referenceDeactivated", { name: `${ind.code} ${ind.name}` }, reason, "indicator", ind.id);
  });
}

export async function saveApprovalRoute(id: string, steps: string[], note: string): Promise<void> {
  const reason = requireNote(note);
  const clean = steps.map((s) => s.trim()).filter(Boolean);
  if (clean.length === 0) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const actor = requirePermission("admin.reference");
  mutate((draft) => {
    const route: ApprovalRoute | undefined = draft.approvalRoutes.find((r) => r.id === id);
    if (!route) throw new ServiceError("NOT_FOUND");
    route.steps = clean;
    log(draft, actor, "routeUpdated", { name: route.name, count: clean.length }, reason);
  });
}

export async function saveTemplate(id: string, input: Pick<NotificationTemplate, "subject" | "body" | "active">, note: string): Promise<void> {
  const reason = requireNote(note);
  if (!input.body.trim()) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const actor = requirePermission("admin.reference");
  mutate((draft) => {
    const tpl = draft.templates.find((x) => x.id === id);
    if (!tpl) throw new ServiceError("NOT_FOUND");
    Object.assign(tpl, { subject: input.subject, body: input.body.trim(), active: input.active });
    log(draft, actor, "templateUpdated", { name: tpl.name }, reason);
  });
}

export async function saveSecuritySettings(settings: SecuritySettings, note: string): Promise<void> {
  const reason = requireNote(note);
  if (!(settings.sessionTimeoutMinutes >= 5 && settings.sessionTimeoutMinutes <= 240)) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const actor = requirePermission("admin.security");
  mutate((draft) => {
    draft.security = { ...settings };
    log(draft, actor, "securityUpdated", {}, reason);
  });
}
