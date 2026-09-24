"use client";

import type { Sector } from "@/lib/types";
import { getState } from "@/lib/demo/store";
import { settlements } from "@/lib/demo/reference";
import { isOverdue } from "./cases";

export type SettlementAlertLevel = "clear" | "watch" | "attention";

export interface SettlementMonitoring {
  settlementId: string;
  name: string;
  region: string;
  lat: number;
  lng: number;
  partners: number;
  interventions: { total: number; approved: number; submitted: number; completed: number };
  fieldReports: { accepted: number; submitted: number; held: number };
  openCases: number;
  overdueCases: number;
  openExceptions: number;
  peopleReached: number;
  lastActivityAt: string | null;
  alertLevel: SettlementAlertLevel;
}

export interface GisOverview {
  rows: SettlementMonitoring[];
  totals: {
    partners: number;
    interventions: number;
    peopleReached: number;
    openCases: number;
    openExceptions: number;
  };
}

/**
 * Settlement-level GIS tracking and monitoring aggregate. Positions are the
 * settlement's approximate public location, never an individual one; every
 * figure is computed live from the current demo state so the map always
 * agrees with the record screens.
 */
export async function getGisOverview(sector?: Sector): Promise<GisOverview> {
  const state = getState();

  const rows: SettlementMonitoring[] = settlements.map((s) => {
    const partners = state.partners.filter(
      (p) => p.settlementIds.includes(s.id) && p.status === "approved" && (!sector || p.sectors.includes(sector)),
    ).length;

    const interventionsHere = state.interventions.filter((i) => i.settlementId === s.id && (!sector || i.sector === sector));
    const interventionIds = new Set(interventionsHere.map((i) => i.id));

    const fieldReportsHere = state.fieldReports.filter((r) => interventionIds.has(r.interventionId));
    const fieldReportIds = new Set(fieldReportsHere.map((r) => r.id));

    const casesHere = state.cases.filter((c) => c.settlementId === s.id);
    const exceptionsHere = state.exceptions.filter((e) => fieldReportIds.has(e.fieldReportId));

    const peopleReached = fieldReportsHere
      .filter((r) => r.status === "accepted")
      .reduce((sum, r) => sum + r.reached.women + r.reached.men + r.reached.children, 0);

    const openCases = casesHere.filter((c) => c.status !== "resolved" && c.status !== "closed").length;
    const overdueCases = casesHere.filter((c) => isOverdue(c)).length;
    const openExceptions = exceptionsHere.filter((e) => e.status === "open" || e.status === "escalated").length;

    const dates = [
      ...interventionsHere.map((i) => i.updatedAt),
      ...fieldReportsHere.map((r) => r.updatedAt),
      ...casesHere.map((c) => c.updatedAt),
      ...exceptionsHere.map((e) => e.updatedAt),
    ].sort();
    const lastActivityAt = dates.length ? dates[dates.length - 1] : null;

    const alertLevel: SettlementAlertLevel =
      openExceptions > 0 || overdueCases > 0
        ? "attention"
        : openCases > 0 || interventionsHere.some((i) => i.status === "submitted") || fieldReportsHere.some((r) => r.status === "submitted")
          ? "watch"
          : "clear";

    return {
      settlementId: s.id,
      name: s.name,
      region: s.region,
      lat: s.lat,
      lng: s.lng,
      partners,
      interventions: {
        total: interventionsHere.length,
        approved: interventionsHere.filter((i) => i.status === "approved").length,
        submitted: interventionsHere.filter((i) => i.status === "submitted").length,
        completed: interventionsHere.filter((i) => i.status === "completed").length,
      },
      fieldReports: {
        accepted: fieldReportsHere.filter((r) => r.status === "accepted").length,
        submitted: fieldReportsHere.filter((r) => r.status === "submitted").length,
        held: fieldReportsHere.filter((r) => r.status === "held").length,
      },
      openCases,
      overdueCases,
      openExceptions,
      peopleReached,
      lastActivityAt,
      alertLevel,
    };
  });

  return {
    rows,
    totals: {
      partners: rows.reduce((sum, r) => sum + r.partners, 0),
      interventions: rows.reduce((sum, r) => sum + r.interventions.total, 0),
      peopleReached: rows.reduce((sum, r) => sum + r.peopleReached, 0),
      openCases: rows.reduce((sum, r) => sum + r.openCases, 0),
      openExceptions: rows.reduce((sum, r) => sum + r.openExceptions, 0),
    },
  };
}
