"use client";

import type { CaseStatus, DemoState, ServiceCase } from "@/lib/types";
import { addAudit, addNotification, getState, mutate, newId } from "@/lib/demo/store";
import { currentActor, delay, now, requireNote, requirePermission, requireScope, ServiceError } from "./core";
import { getSession } from "./session";
import { match, type RecordFilters } from "./filters";
import { simulateMessage } from "./external";

export const OPEN_CASE: CaseStatus[] = ["received", "assigned", "in_progress", "awaiting_info"];

export function isOverdue(c: ServiceCase, at = new Date()): boolean {
  return OPEN_CASE.includes(c.status) && new Date(c.dueAt) < at;
}

export function hasCaseAccess(c: ServiceCase): boolean {
  const session = getSession();
  return Boolean(session && c.accessGrants.some((g) => g.user === session.displayName));
}

const MASK = "••••••";

/** Requester details are replaced unless the viewer holds case-level access for this case. */
function masked(c: ServiceCase): ServiceCase {
  if (hasCaseAccess(c)) return c;
  return {
    ...c,
    requester: { name: MASK, individualId: `${c.requester.individualId.slice(0, 8)}${MASK}`, phone: MASK, household: MASK },
  };
}

export interface CaseRow extends ServiceCase {
  overdue: boolean;
}

export async function listCases(filters: RecordFilters = {}): Promise<CaseRow[]> {
  requirePermission("case.monitor");
  const state = getState();
  return state.cases
    .filter((c) => match.case(state, c, filters))
    .map((c) => ({ ...masked(c), overdue: isOverdue(c) }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getCase(id: string): Promise<{ serviceCase: ServiceCase; overdue: boolean; hasAccess: boolean; teams: string[] }> {
  requirePermission("case.monitor");
  const state = getState();
  const c = state.cases.find((x) => x.id === id);
  if (!c) throw new ServiceError("NOT_FOUND");
  requireScope(c.settlementId);
  return { serviceCase: masked(c), overdue: isOverdue(c), hasAccess: hasCaseAccess(c), teams: state.teams };
}

function load(draft: DemoState, id: string): ServiceCase {
  const c = draft.cases.find((x) => x.id === id);
  if (!c) throw new ServiceError("NOT_FOUND");
  return c;
}

function log(draft: DemoState, c: ServiceCase, actor: string | null, action: string, category: "decision" | "status" | "record" | "access", note?: string, params: Record<string, string> = {}, extra: { sensitive?: boolean; simulated?: boolean } = {}) {
  addAudit(draft, { actor, action, category, params: { name: c.ref, ...params }, entity: "case", entityId: c.id, entityRef: c.ref, note, ...extra });
}

/** Case-level access is granted per case with a recorded reason (just-in-time access). */
export async function requestCaseAccess(id: string, reason: string): Promise<void> {
  const why = requireNote(reason);
  await delay(300);
  const actor = requirePermission("case.assign");
  mutate((draft) => {
    const c = load(draft, id);
    if (!c.accessGrants.some((g) => g.user === actor)) c.accessGrants.push({ user: actor, at: now(), reason: why });
    log(draft, c, actor, "caseAccessGranted", "access", why, {}, { sensitive: true });
  });
}

export async function assignCase(id: string, team: string, note?: string): Promise<void> {
  if (!team) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const actor = requirePermission("case.assign");
  mutate((draft) => {
    const c = load(draft, id);
    if (!OPEN_CASE.includes(c.status)) throw new ServiceError("INVALID_STATE");
    const reassign = Boolean(c.assignedTeam);
    c.assignedTeam = team;
    if (c.status === "received") c.status = "assigned";
    c.nextAction = `${team}: start work on the request.`;
    c.updatedAt = now();
    log(draft, c, actor, reassign ? "caseReassigned" : "caseAssigned", "status", note?.trim() || undefined, { team });
  });
}

async function move(id: string, from: CaseStatus[], to: CaseStatus, action: string, nextAction: string, note?: string) {
  await delay();
  const actor = requirePermission("case.assign");
  mutate((draft) => {
    const c = load(draft, id);
    if (!from.includes(c.status)) throw new ServiceError("INVALID_STATE");
    c.status = to;
    c.nextAction = nextAction;
    c.updatedAt = now();
    log(draft, c, actor, action, "status", note);
  });
}

export const startCase = (id: string) => move(id, ["assigned"], "in_progress", "caseStarted", "Complete the service and record the outcome.");

/** Awaiting information: the message is sent to the requester (simulated SMS). */
export async function requestInformation(id: string, message: string): Promise<void> {
  const text = requireNote(message);
  await delay();
  const actor = requirePermission("case.assign");
  mutate((draft) => {
    const c = load(draft, id);
    if (c.status !== "in_progress" && c.status !== "assigned") throw new ServiceError("INVALID_STATE");
    c.status = "awaiting_info";
    c.nextAction = "Waiting for the requester to respond.";
    c.messages.push({ id: newId("m"), at: now(), direction: "out", channel: "sms", text });
    c.updatedAt = now();
    log(draft, c, actor, "caseInfoRequested", "status", text);
    simulateMessage(draft, { channel: "sms", recipient: `Requester of ${c.ref}`, entity: "case", entityId: id, entityRef: c.ref });
  });
}

/** Demo helper: stands in for the requester replying at the help desk. */
export async function simulateRequesterReply(id: string): Promise<void> {
  await delay();
  currentActor();
  mutate((draft) => {
    const c = load(draft, id);
    if (c.status !== "awaiting_info") throw new ServiceError("INVALID_STATE");
    c.messages.push({ id: newId("m"), at: now(), direction: "in", channel: "help_desk", text: "I have brought the requested document to the help desk." });
    c.documents = c.documents.map((d) => (d.status === "pending" && d.name.toLowerCase().includes("letter") ? { ...d, status: "authorised" } : d));
    c.status = "in_progress";
    c.nextAction = "Review the information received and complete the service.";
    c.updatedAt = now();
    log(draft, c, null, "caseInfoReceived", "status", undefined, {}, { simulated: true });
  });
}

export async function resolveCase(id: string, resolution: string): Promise<void> {
  const text = requireNote(resolution);
  await delay();
  const actor = requirePermission("case.assign");
  mutate((draft) => {
    const c = load(draft, id);
    if (c.status !== "in_progress" && c.status !== "assigned") throw new ServiceError("INVALID_STATE");
    c.status = "resolved";
    c.resolution = text;
    c.nextAction = "Close the case once the requester confirms.";
    c.documents = c.documents.map((d) => ({ ...d, status: "issued" }));
    c.updatedAt = now();
    log(draft, c, actor, "caseResolved", "decision", text);
  });
}

export const closeCase = (id: string, note?: string) => move(id, ["resolved"], "closed", "caseClosed", "None.", note?.trim() || undefined);

/** Escalation is independent of status. */
export async function setEscalation(id: string, escalated: boolean, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("case.assign");
  mutate((draft) => {
    const c = load(draft, id);
    if (!OPEN_CASE.includes(c.status)) throw new ServiceError("INVALID_STATE");
    if (c.escalated === escalated) throw new ServiceError("INVALID_STATE");
    c.escalated = escalated;
    c.internalNotes.push({ id: newId("n"), at: now(), author: actor, text: reason });
    c.updatedAt = now();
    log(draft, c, actor, escalated ? "caseEscalated" : "caseDeescalated", "decision", reason);
    if (escalated) addNotification(draft, { kind: "deadline", message: "caseEscalated", params: { ref: c.ref }, entity: "case", entityId: id });
  });
}

/** Message to the requester (simulated SMS). Kept separate from internal notes. */
export async function sendRequesterMessage(id: string, text: string): Promise<void> {
  const body = requireNote(text);
  await delay();
  const actor = requirePermission("case.assign");
  mutate((draft) => {
    const c = load(draft, id);
    c.messages.push({ id: newId("m"), at: now(), direction: "out", channel: "sms", text: body });
    c.updatedAt = now();
    log(draft, c, actor, "caseMessageSent", "record", undefined, {}, { simulated: true });
    simulateMessage(draft, { channel: "sms", recipient: `Requester of ${c.ref}`, entity: "case", entityId: id, entityRef: c.ref });
  });
}

/** Internal note: visible to staff only, never sent to the requester. */
export async function addInternalNote(id: string, text: string): Promise<void> {
  const body = requireNote(text);
  await delay(150);
  const actor = requirePermission("case.monitor");
  mutate((draft) => {
    const c = load(draft, id);
    c.internalNotes.push({ id: newId("n"), at: now(), author: actor, text: body });
    c.updatedAt = now();
    log(draft, c, actor, "caseNoteAdded", "record");
  });
}

export async function scheduleAppointment(id: string, kind: string, at: string, location: string): Promise<void> {
  if (!kind.trim() || !at || !location.trim()) throw new ServiceError("FIELD_REQUIRED");
  await delay();
  const actor = requirePermission("case.assign");
  mutate((draft) => {
    const c = load(draft, id);
    if (!OPEN_CASE.includes(c.status)) throw new ServiceError("INVALID_STATE");
    c.appointments.push({ id: newId("ap"), kind: kind.trim(), at: new Date(at).toISOString(), location: location.trim(), status: "scheduled" });
    c.updatedAt = now();
    log(draft, c, actor, "caseAppointmentScheduled", "record", undefined, { kind: kind.trim() });
    simulateMessage(draft, { channel: "sms", recipient: `Requester of ${c.ref}`, entity: "case", entityId: id, entityRef: c.ref });
  });
}
