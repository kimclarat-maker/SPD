"use client";

import type { DemoState, EntityType, Sector } from "@/lib/types";
import { baseSectors, baseSettlements } from "@/lib/demo/reference";
import { getState } from "@/lib/demo/store";
import { inScope } from "./core";

/**
 * Synchronous lookups for names and references. Reference data lives in the
 * demo state (administrators can edit it), with the starting data as fallback.
 */
export function settlementName(id: string | undefined): string {
  if (!id) return "—";
  return getState().settlements.find((s) => s.id === id)?.name ?? baseSettlements.find((s) => s.id === id)?.name ?? id;
}

export function sectorName(id: Sector | string | undefined): string {
  if (!id) return "—";
  return getState().sectors.find((s) => s.id === id)?.name ?? baseSectors.find((s) => s.id === id)?.name ?? id;
}

export function districtOf(settlementId: string | undefined): string {
  return getState().settlements.find((s) => s.id === settlementId)?.district ?? "—";
}

export function servicePointName(id: string | undefined): string {
  if (!id) return "—";
  return getState().servicePoints.find((s) => s.id === id)?.name ?? id;
}

export function partnerName(id: string | undefined): string {
  if (!id) return "—";
  return getState().partners.find((p) => p.id === id)?.name ?? id;
}

export function indicatorLabel(id: string): string {
  const ind = getState().indicators.find((i) => i.id === id);
  return ind ? `${ind.code} ${ind.name}` : id;
}

/** Human-readable reference and title for any record, used by audit rows, notifications and documents. */
export function recordLabel(
  entity: EntityType | "session",
  id: string | undefined,
  state: DemoState = getState(),
): { ref: string; title: string } | null {
  if (!id) return null;
  switch (entity) {
    case "partner": {
      const p = state.partners.find((x) => x.id === id);
      return p ? { ref: p.ref, title: p.name } : null;
    }
    case "intervention": {
      const i = state.interventions.find((x) => x.id === id);
      return i ? { ref: i.ref, title: i.title } : null;
    }
    case "fieldReport": {
      const r = state.fieldReports.find((x) => x.id === id);
      return r ? { ref: r.ref, title: r.title } : null;
    }
    case "form": {
      const f = state.forms.find((x) => x.id === id);
      return f ? { ref: f.ref, title: f.title } : null;
    }
    case "indicator": {
      const i = state.indicators.find((x) => x.id === id);
      return i ? { ref: i.code, title: i.name } : null;
    }
    case "review": {
      const r = state.reviews.find((x) => x.id === id);
      return r ? { ref: r.ref, title: r.householdMasked } : null;
    }
    case "case": {
      const c = state.cases.find((x) => x.id === id);
      return c ? { ref: c.ref, title: c.summary } : null;
    }
    case "document": {
      const d = state.documents.find((x) => x.id === id);
      return d ? { ref: d.ref, title: d.title } : null;
    }
    case "report": {
      const r = state.reports.find((x) => x.id === id);
      return r ? { ref: r.ref, title: r.title } : null;
    }
    case "integration": {
      const i = state.integrations.find((x) => x.id === id);
      return i ? { ref: i.id.toUpperCase(), title: i.name } : null;
    }
    case "user": {
      const u = state.users.find((x) => x.id === id);
      return u ? { ref: u.email, title: u.name } : null;
    }
    case "assistance": {
      const a = state.assistance.find((x) => x.id === id);
      return a ? { ref: a.ref, title: a.assistanceType } : null;
    }
    case "verification": {
      const v = state.verifications.find((x) => x.id === id);
      return v ? { ref: v.ref, title: v.purpose } : null;
    }
    default:
      return null;
  }
}

/** Where a record lives in the portal, so audit rows, notifications and alerts can link to it. */
export function recordHref(entity: EntityType | "session", id?: string): string | null {
  if (!id) return null;
  switch (entity) {
    case "partner":
      return `/portal/partners/${id}`;
    case "intervention":
      return `/portal/interventions/${id}`;
    case "fieldReport":
      return `/portal/field-reports/${id}`;
    case "form":
      return `/portal/surveys/forms/${id}`;
    case "indicator":
      return `/portal/surveys/indicators/${id}`;
    case "review":
      return `/portal/beneficiaries/reviews/${id}`;
    case "case":
      return `/portal/cases/${id}`;
    case "document":
      return `/portal/documents/${id}`;
    case "report":
      return `/portal/reports/${id}`;
    case "integration":
      return `/portal/integrations/${id}`;
    case "user":
    case "config":
      return "/portal/admin";
    case "assistance": {
      // OPM reaches Partner Portal assistance entries through their review, if one was raised.
      const reviewId = getState().assistance.find((a) => a.id === id)?.reviewId;
      return reviewId ? `/portal/beneficiaries/reviews/${reviewId}` : "/portal/beneficiaries";
    }
    case "verification":
      return "/portal/integrations/progres";
    default:
      return null;
  }
}

/** Options for the shared filter bar, limited to the viewer's geographic scope. */
export function getFilterOptions(): {
  districts: string[];
  settlements: { id: string; name: string; district: string }[];
  sectors: { id: Sector; name: string }[];
  partners: { id: string; name: string }[];
} {
  const state = getState();
  const settlements = state.settlements.filter((s) => s.active && inScope(s.id));
  const ids = new Set(settlements.map((s) => s.id));
  return {
    districts: [...new Set(settlements.map((s) => s.district))].sort(),
    settlements: settlements.map((s) => ({ id: s.id, name: s.name, district: s.district })).sort((a, b) => a.name.localeCompare(b.name)),
    sectors: state.sectors.filter((s) => s.active).map((s) => ({ id: s.id, name: s.name })),
    partners: state.partners
      .filter((p) => p.settlementIds.some((id) => ids.has(id)))
      .map((p) => ({ id: p.id, name: p.name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
