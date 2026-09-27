"use client";

import type { DemoState, EntityType, NotificationKind } from "@/lib/types";
import { getState, mutate } from "@/lib/demo/store";
import { getSession } from "./session";
import { DAY_MS, delay, hasPermission, inScope } from "./core";
import { recordHref } from "./lookup";
import { isOverdue, OPEN_CASE } from "./cases";
import { failedSyncs, lateReporting } from "./fieldReports";
import { expiringDocuments, expiryState } from "./documents";
import { OPEN_APPLICATION } from "./partners";
import { OPEN_REVIEW } from "./beneficiaries";

export interface PortalNotification {
  id: string;
  at: string;
  kind: NotificationKind;
  /** Key under portal.notify */
  message: string;
  params: Record<string, string | number>;
  entity: EntityType;
  entityId: string;
  href: string;
  read: boolean;
}

/**
 * Notifications are derived from the live records (assignments, deadlines,
 * overdue work, expiring documents, failed syncs and failed integrations) plus
 * stored event notifications. Derived ones disappear once the record is dealt
 * with. Read state is kept per notification id.
 */
export function buildNotifications(state: DemoState): PortalNotification[] {
  const me = getSession()?.displayName;
  const nowMs = Date.now();
  const list: Omit<PortalNotification, "href" | "read">[] = [];
  const settlementOf = (entity: EntityType, id: string): string | undefined => {
    if (entity === "case") return state.cases.find((c) => c.id === id)?.settlementId;
    if (entity === "intervention") return state.interventions.find((i) => i.id === id)?.settlementId;
    if (entity === "fieldReport") {
      const r = state.fieldReports.find((x) => x.id === id);
      return state.interventions.find((i) => i.id === r?.interventionId)?.settlementId;
    }
    return undefined;
  };

  if (me) {
    for (const p of state.partners.filter((x) => x.assignedReviewer === me && OPEN_APPLICATION.includes(x.status))) {
      list.push({ id: `asg-p-${p.id}`, at: p.updatedAt, kind: "assigned_review", message: "assignedReview", params: { ref: p.ref }, entity: "partner", entityId: p.id });
    }
    for (const i of state.interventions.filter((x) => x.assignedTo === me && (x.status === "submitted" || x.status === "coordination_review"))) {
      list.push({ id: `asg-i-${i.id}`, at: i.updatedAt, kind: "assigned_review", message: "assignedReview", params: { ref: i.ref }, entity: "intervention", entityId: i.id });
    }
    if (hasPermission("beneficiary.review")) {
      for (const rv of state.reviews.filter((x) => x.assignedTo === me && OPEN_REVIEW.includes(x.status))) {
        list.push({ id: `asg-r-${rv.id}`, at: rv.updatedAt, kind: "assigned_review", message: "assignedReview", params: { ref: rv.ref }, entity: "review", entityId: rv.id });
      }
    }
  }

  for (const c of state.cases.filter((x) => OPEN_CASE.includes(x.status))) {
    const due = new Date(c.dueAt).getTime();
    if (isOverdue(c)) {
      list.push({ id: `od-c-${c.id}`, at: c.dueAt, kind: "overdue", message: "caseOverdue", params: { ref: c.ref }, entity: "case", entityId: c.id });
    } else if (due - nowMs < 2 * DAY_MS) {
      list.push({ id: `dl-c-${c.id}`, at: c.dueAt, kind: "deadline", message: "caseDue", params: { ref: c.ref }, entity: "case", entityId: c.id });
    }
  }
  for (const i of state.interventions.filter((x) => x.status === "active" || x.status === "approved")) {
    for (const m of i.milestones.filter((x) => !x.done)) {
      const due = new Date(m.dueAt).getTime();
      if (due < nowMs) {
        list.push({ id: `od-m-${i.id}-${m.id}`, at: m.dueAt, kind: "overdue", message: "milestoneOverdue", params: { ref: i.ref, milestone: m.title }, entity: "intervention", entityId: i.id });
      } else if (due - nowMs < 7 * DAY_MS) {
        list.push({ id: `dl-m-${i.id}-${m.id}`, at: m.dueAt, kind: "deadline", message: "milestoneDue", params: { ref: i.ref, milestone: m.title }, entity: "intervention", entityId: i.id });
      }
    }
  }
  for (const i of lateReporting(state)) {
    list.push({ id: `od-late-${i.id}`, at: i.updatedAt, kind: "overdue", message: "reportLate", params: { ref: i.ref }, entity: "intervention", entityId: i.id });
  }
  for (const d of expiringDocuments(state)) {
    const related = d.related ? state.partners.find((p) => p.id === d.related!.id) : undefined;
    list.push({
      id: `exp-${d.id}`,
      at: d.expiresAt!,
      kind: "document_expiry",
      message: expiryState(d) === "expired" ? "documentExpired" : "documentExpiring",
      params: { name: d.title, owner: related?.name ?? d.owner },
      entity: "document",
      entityId: d.id,
    });
  }
  for (const p of state.partners.filter((x) => x.status === "approved" && x.accreditedUntil)) {
    const until = new Date(p.accreditedUntil!).getTime();
    if (until < nowMs + 30 * DAY_MS) {
      list.push({ id: `exp-acc-${p.id}`, at: p.accreditedUntil!, kind: "document_expiry", message: until < nowMs ? "accreditationExpired" : "accreditationExpiring", params: { name: p.name }, entity: "partner", entityId: p.id });
    }
  }
  for (const r of failedSyncs(state)) {
    list.push({ id: `sync-${r.id}`, at: r.updatedAt, kind: "sync_failed", message: r.status === "conflict" ? "syncConflict" : "syncStale", params: { ref: r.ref }, entity: "fieldReport", entityId: r.id });
  }
  if (hasPermission("integration.view")) {
    for (const integration of state.integrations) {
      const last = state.runs.find((r) => r.integrationId === integration.id);
      if (last && last.outcome !== "success") {
        list.push({ id: `int-${last.id}`, at: last.at, kind: "integration_failed", message: "integrationFailed", params: { name: integration.name, outcome: last.outcome }, entity: "integration", entityId: integration.id });
      }
    }
  }
  // Notifications addressed to a partner organisation belong in the Partner Portal inbox only.
  for (const n of state.notifications.filter((x) => !x.audience)) list.push(n);

  const reads = new Set(state.notificationReads);
  return list
    .filter((n) => {
      const settlement = settlementOf(n.entity, n.entityId);
      return settlement === undefined || inScope(settlement);
    })
    .filter((n) => n.entity !== "review" || hasPermission("beneficiary.review"))
    .map((n) => ({ ...n, href: recordHref(n.entity, n.entityId) ?? "/portal", read: reads.has(n.id) }))
    .sort((a, b) => Number(a.read) - Number(b.read) || b.at.localeCompare(a.at));
}

export async function listNotifications(): Promise<PortalNotification[]> {
  return buildNotifications(getState());
}

export async function markRead(ids: string[]): Promise<void> {
  await delay(80);
  mutate((draft) => {
    const set = new Set(draft.notificationReads);
    ids.forEach((id) => set.add(id));
    draft.notificationReads = [...set];
  });
}

export async function markUnread(id: string): Promise<void> {
  await delay(80);
  mutate((draft) => {
    draft.notificationReads = draft.notificationReads.filter((x) => x !== id);
  });
}
