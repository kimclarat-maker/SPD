"use client";

import { getSession } from "./session";

/**
 * Shared plumbing for the service layer. Every service returns promises so
 * the UI is already written against an asynchronous API.
 */

export type ServiceErrorCode =
  | "NOT_FOUND"
  | "INVALID_STATE"
  | "PARTNER_NOT_APPROVED"
  | "INTERVENTION_NOT_APPROVED"
  | "REPORT_NOT_ACCEPTED"
  | "CHECKS_INCOMPLETE"
  | "NOTE_REQUIRED"
  | "UNAUTHENTICATED";

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

export function requireNote(note: string | undefined): string {
  const trimmed = (note ?? "").trim();
  if (!trimmed) throw new ServiceError("NOTE_REQUIRED");
  return trimmed;
}

export function now(): string {
  return new Date().toISOString();
}
