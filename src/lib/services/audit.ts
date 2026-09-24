"use client";

import type { AuditEntry, EntityType } from "@/lib/types";
import { getState } from "@/lib/demo/store";

export async function listAudit(filter: { entity?: EntityType | "session"; entityId?: string; limit?: number } = {}): Promise<
  AuditEntry[]
> {
  let entries = getState().audit;
  if (filter.entity) entries = entries.filter((e) => e.entity === filter.entity);
  if (filter.entityId) entries = entries.filter((e) => e.entityId === filter.entityId);
  return filter.limit ? entries.slice(0, filter.limit) : [...entries];
}

/** Where a record lives in the portal, so audit rows and alerts can link to it. */
export function recordHref(entity: AuditEntry["entity"], id?: string): string | null {
  if (!id) return null;
  switch (entity) {
    case "partner":
      return `/portal/partners/${id}`;
    case "intervention":
      return `/portal/interventions/${id}`;
    case "fieldReport":
      return `/portal/field-reports/${id}`;
    case "exception":
      return `/portal/exceptions/${id}`;
    case "case":
      return `/portal/cases/${id}`;
    case "report":
      return `/portal/reports/${id}`;
    case "integration":
      return `/portal/integrations/${id}`;
    default:
      return null;
  }
}
