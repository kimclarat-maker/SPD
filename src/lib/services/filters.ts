"use client";

import type { BeneficiaryReview, DemoState, FieldReport, Intervention, Partner, ServiceCase } from "@/lib/types";
import { inScope } from "./core";
import { inRange, rangeOf, type RecordFilters } from "./filterModel";

export * from "./filterModel";

/**
 * Record predicates shared by the dashboard, every list, the GIS map and the
 * report builder, so dashboard counts always agree with the lists.
 */

/** Settlement, district and the viewer's geographic scope. */
export function placeMatches(state: DemoState, settlementId: string | undefined, f: RecordFilters): boolean {
  if (!inScope(settlementId)) return false;
  if (f.settlementId && settlementId !== f.settlementId) return false;
  if (f.district) {
    const district = state.settlements.find((s) => s.id === settlementId)?.district;
    if (district !== f.district) return false;
  }
  return true;
}

export const match = {
  /** A partner matches if any of its operating areas matches; the period does not narrow the directory. */
  partner(state: DemoState, p: Partner, f: RecordFilters): boolean {
    // Drafts stay private to the partner organisation until they are submitted.
    if (p.status === "draft") return false;
    if (f.partnerId && p.id !== f.partnerId) return false;
    if (f.interventionId && !state.interventions.some((i) => i.id === f.interventionId && i.partnerId === p.id)) return false;
    if (f.sector && !p.sectors.includes(f.sector)) return false;
    return p.settlementIds.some((id) => placeMatches(state, id, f));
  },

  /** An intervention matches when its implementation period overlaps the selected period. */
  intervention(state: DemoState, i: Intervention, f: RecordFilters): boolean {
    if (i.status === "draft") return false;
    if (f.partnerId && i.partnerId !== f.partnerId) return false;
    if (f.interventionId && i.id !== f.interventionId) return false;
    if (f.sector && i.sector !== f.sector) return false;
    if (!placeMatches(state, i.settlementId, f)) return false;
    const range = rangeOf(f);
    if (range.from && new Date(i.endDate) < range.from) return false;
    if (range.to && new Date(i.startDate) > range.to) return false;
    return true;
  },

  /** A field report matches by its collection time. */
  fieldReport(state: DemoState, r: FieldReport, f: RecordFilters): boolean {
    const i = state.interventions.find((x) => x.id === r.interventionId);
    if (!i || r.status === "draft") return false;
    if (f.partnerId && i.partnerId !== f.partnerId) return false;
    if (f.interventionId && i.id !== f.interventionId) return false;
    if (f.sector && i.sector !== f.sector) return false;
    if (!placeMatches(state, i.settlementId, f)) return false;
    return inRange(r.collectedAt, rangeOf(f));
  },

  /** A review matches by its detection time, or if it is still unresolved. */
  review(state: DemoState, rv: BeneficiaryReview, f: RecordFilters): boolean {
    const r = state.fieldReports.find((x) => x.id === rv.fieldReportId);
    // Reviews raised from Partner Portal assistance entries carry their intervention directly.
    const i = state.interventions.find((x) => x.id === (r?.interventionId ?? rv.interventionId));
    if (!i) return false;
    if (f.partnerId && i.partnerId !== f.partnerId) return false;
    if (f.interventionId && i.id !== f.interventionId) return false;
    if (f.sector && i.sector !== f.sector) return false;
    if (!placeMatches(state, i.settlementId, f)) return false;
    const open = !rv.status.startsWith("resolved");
    return open || inRange(rv.detectedAt, rangeOf(f));
  },

  /** Cases are not tied to a sector or partner; they match by place, and by period unless still open. */
  case(state: DemoState, c: ServiceCase, f: RecordFilters): boolean {
    if (!placeMatches(state, c.settlementId, f)) return false;
    const open = c.status !== "resolved" && c.status !== "closed";
    return open || inRange(c.receivedAt, rangeOf(f));
  },
};

