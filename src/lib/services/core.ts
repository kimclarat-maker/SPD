"use client";

import type { Permission, Settlement } from "@/lib/types";
import { rolePermissions } from "@/lib/demo/reference";
import { getState } from "@/lib/demo/store";
import { getSession } from "./session";

/**
 * Shared plumbing for the service layer. Every service returns promises so
 * the UI is already written against an asynchronous API. Permission and
 * scope checks happen here, in the service layer, not only in the UI.
 */

export type ServiceErrorCode =
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "FORBIDDEN"
  | "OUT_OF_SCOPE"
  | "PARTNER_NOT_ELIGIBLE"
  | "INTERVENTION_NOT_APPROVED"
  | "CHECKS_INCOMPLETE"
  | "OVERLAP_UNRESOLVED"
  | "MISSING_INFORMATION"
  | "REPORT_NOT_ACCEPTED"
  | "CONFLICT_UNRESOLVED"
  | "NOT_SYNCED"
  | "NOTE_REQUIRED"
  | "FIELD_REQUIRED"
  | "DUPLICATE"
  | "SELF_CHANGE"
  | "UNAUTHENTICATED"
  | "NOT_PARTNER_RECORD"
  | "PROFILE_INCOMPLETE"
  | "LOCKED"
  | "NO_CHANGES"
  | "INVALID_VALUE"
  | "OFFLINE"
  | "DEVICE_STORAGE";

export class ServiceError extends Error {
  constructor(
    public code: ServiceErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "ServiceError";
  }
}

/** Simulated network delay so loading states are exercised. */
export function delay(ms = 250): Promise<void> {
  const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  return new Promise((resolve) => setTimeout(resolve, reduced ? Math.min(ms, 80) : ms));
}

export function currentActor(): string {
  const session = getSession();
  if (!session) throw new ServiceError("UNAUTHENTICATED");
  return session.displayName;
}

export function hasPermission(permission: Permission): boolean {
  const session = getSession();
  if (!session) return false;
  return rolePermissions[session.role].includes(permission);
}

/** Throws FORBIDDEN unless the signed-in role holds the permission; returns the actor name. */
export function requirePermission(permission: Permission): string {
  const actor = currentActor();
  if (!hasPermission(permission)) throw new ServiceError("FORBIDDEN");
  return actor;
}

/** Whether a settlement falls inside the signed-in user's geographic scope. */
export function inScope(settlementId: string | undefined): boolean {
  const session = getSession();
  // Partner Portal users never see OPM-wide records; their services scope by organisation instead.
  if (session?.partnerId) return false;
  if (!session || session.scope.level === "national") return true;
  if (!settlementId) return false;
  if (session.scope.level === "settlement") return session.scope.ids.includes(settlementId);
  const settlement: Settlement | undefined = getState().settlements.find((s) => s.id === settlementId);
  return Boolean(settlement && session.scope.ids.includes(settlement.region));
}

export function requireScope(settlementId: string | undefined): void {
  if (!inScope(settlementId)) throw new ServiceError("OUT_OF_SCOPE");
}

export function requireNote(note: string | undefined): string {
  const trimmed = (note ?? "").trim();
  if (!trimmed) throw new ServiceError("NOTE_REQUIRED");
  return trimmed;
}

export function now(): string {
  return new Date().toISOString();
}

export const DAY_MS = 24 * 60 * 60 * 1000;

export function daysBetween(fromIso: string, to = new Date()): number {
  return Math.round((new Date(fromIso).getTime() - to.getTime()) / DAY_MS);
}
