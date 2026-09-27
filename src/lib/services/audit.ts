"use client";

import type { AuditCategory, AuditEntity, AuditEntry } from "@/lib/types";
import { addAudit, getState, mutate } from "@/lib/demo/store";
import { currentActor, hasPermission, ServiceError } from "./core";

export { recordHref } from "./lookup";

export interface AuditQuery {
  entity?: AuditEntity;
  entityId?: string;
  category?: AuditCategory;
  actor?: string;
  from?: string;
  to?: string;
  sensitiveOnly?: boolean;
  limit?: number;
}

/**
 * Read-only audit history. There is no update or delete function in the
 * service layer, so the portal cannot change an entry. A record's own
 * timeline is readable by anyone who can open the record; the full audit
 * trail needs the audit.view permission.
 */
export async function listAudit(q: AuditQuery = {}): Promise<AuditEntry[]> {
  if (!q.entityId && !hasPermission("audit.view")) throw new ServiceError("FORBIDDEN");
  let entries = getState().audit;
  if (q.entity) entries = entries.filter((e) => e.entity === q.entity);
  if (q.entityId) entries = entries.filter((e) => e.entityId === q.entityId);
  if (q.category) entries = entries.filter((e) => e.category === q.category);
  if (q.actor === "system") entries = entries.filter((e) => e.actor === null);
  else if (q.actor) entries = entries.filter((e) => e.actor === q.actor);
  if (q.from) entries = entries.filter((e) => e.at >= q.from!);
  if (q.to) entries = entries.filter((e) => e.at <= q.to!);
  if (q.sensitiveOnly) entries = entries.filter((e) => e.sensitive);
  return q.limit ? entries.slice(0, q.limit) : [...entries];
}

export async function listAuditActors(): Promise<string[]> {
  return [...new Set(getState().audit.map((e) => e.actor).filter((a): a is string => Boolean(a)))].sort();
}

/** Opening the full audit trail is itself recorded (once per session visit). */
export function recordAuditViewed(): void {
  try {
    const actor = currentActor();
    if (!hasPermission("audit.view")) return;
    mutate((draft) => addAudit(draft, { actor, action: "auditViewed", category: "access", params: {}, entity: "session" }));
  } catch {
    // not signed in — nothing to record
  }
}
