"use client";

import type { InterventionStatus, Sector, ServicePointType } from "@/lib/types";
import { getState } from "@/lib/demo/store";
import { match, placeMatches, type RecordFilters } from "./filters";
import { APPROVED_WORK, interventionProgress } from "./interventions";
import { isOverdue, OPEN_CASE } from "./cases";
import { totalReached } from "./fieldReports";

export type GisView = "coverage" | "gaps" | "progress";
export type StatusFilter = "all" | "live" | "pipeline" | "closed";

export interface SettlementFeature {
  id: string;
  name: string;
  district: string;
  region: string;
  lat: number;
  lng: number;
  interventions: number;
  partners: number;
  sectorsCovered: Sector[];
  sectorsMissing: Sector[];
  progress: number;
  peopleReached: number;
  openCases: number;
  overdueCases: number;
  lastActivityAt?: string;
}

export interface InterventionFeature {
  id: string;
  ref: string;
  title: string;
  status: InterventionStatus;
  sector: Sector;
  partnerName: string;
  settlementId: string;
  lat: number;
  lng: number;
  progress: number;
}

export interface ActivityFeature {
  id: string;
  ref: string;
  title: string;
  status: string;
  collectedAt: string;
  interventionRef: string;
  servicePointName: string;
  lat: number;
  lng: number;
}

export interface ServicePointFeature {
  id: string;
  name: string;
  type: ServicePointType;
  settlementId: string;
  lat: number;
  lng: number;
  interventions: number;
}

export interface GisData {
  settlements: SettlementFeature[];
  interventions: InterventionFeature[];
  activities: ActivityFeature[];
  servicePoints: ServicePointFeature[];
}

const STATUS_GROUPS: Record<StatusFilter, InterventionStatus[]> = {
  all: ["submitted", "coordination_review", "approved", "active", "completed", "closed", "changes_requested"],
  live: ["approved", "active"],
  pipeline: ["submitted", "coordination_review", "changes_requested"],
  closed: ["completed", "closed"],
};

/**
 * Map features. Every position is a settlement centre or a public service
 * point (a facility). Households and individuals are never mapped, so the map
 * is safe for broadly accessible use.
 */
export async function getGisData(f: RecordFilters, status: StatusFilter): Promise<GisData> {
  const state = getState();
  const allowed = STATUS_GROUPS[status];
  const interventions = state.interventions.filter((i) => allowed.includes(i.status) && match.intervention(state, i, f));
  const activeSectors = state.sectors.filter((s) => s.active).map((s) => s.id);
  const pointOf = (spId: string | undefined, settlementId: string) => {
    const sp = state.servicePoints.find((x) => x.id === spId);
    const s = state.settlements.find((x) => x.id === settlementId)!;
    return sp ? { lat: sp.lat, lng: sp.lng } : { lat: s.lat, lng: s.lng };
  };

  const settlements: SettlementFeature[] = state.settlements
    .filter((s) => s.active && placeMatches(state, s.id, f))
    .map((s) => {
      const here = interventions.filter((i) => i.settlementId === s.id);
      const live = here.filter((i) => APPROVED_WORK.includes(i.status) && i.status !== "closed");
      const covered = [...new Set(live.map((i) => i.sector))];
      const progress = live.map((i) => interventionProgress(state, i));
      const reports = state.fieldReports.filter((r) => r.status === "accepted" && here.some((i) => i.id === r.interventionId) && match.fieldReport(state, r, f));
      const cases = state.cases.filter((c) => c.settlementId === s.id && match.case(state, c, f));
      const dates = [...here.map((i) => i.updatedAt), ...reports.map((r) => r.updatedAt), ...cases.map((c) => c.updatedAt)].sort();
      return {
        id: s.id,
        name: s.name,
        district: s.district,
        region: s.region,
        lat: s.lat,
        lng: s.lng,
        interventions: here.length,
        partners: new Set(here.map((i) => i.partnerId)).size,
        sectorsCovered: covered,
        sectorsMissing: (f.sector ? [f.sector] : activeSectors).filter((x) => !covered.includes(x)),
        progress: progress.length ? Math.round(progress.reduce((sum, p) => sum + p.percent, 0) / progress.length) : 0,
        peopleReached: reports.reduce((sum, r) => sum + totalReached(r), 0),
        openCases: cases.filter((c) => OPEN_CASE.includes(c.status)).length,
        overdueCases: cases.filter((c) => isOverdue(c)).length,
        lastActivityAt: dates[dates.length - 1],
      };
    });

  const interventionFeatures: InterventionFeature[] = interventions.map((i) => ({
    id: i.id,
    ref: i.ref,
    title: i.title,
    status: i.status,
    sector: i.sector,
    partnerName: state.partners.find((p) => p.id === i.partnerId)?.name ?? "—",
    settlementId: i.settlementId,
    ...pointOf(i.servicePointIds[0], i.settlementId),
    progress: interventionProgress(state, i).percent,
  }));

  const ids = new Set(interventions.map((i) => i.id));
  const activities: ActivityFeature[] = state.fieldReports
    .filter((r) => ids.has(r.interventionId) && ["accepted", "synced", "needs_review"].includes(r.status) && match.fieldReport(state, r, f))
    .map((r) => {
      const i = interventions.find((x) => x.id === r.interventionId)!;
      const sp = state.servicePoints.find((x) => x.id === r.servicePointId);
      // Plot at the facility, never at the raw device position.
      return {
        id: r.id,
        ref: r.ref,
        title: r.title,
        status: r.status,
        collectedAt: r.collectedAt,
        interventionRef: i.ref,
        servicePointName: sp?.name ?? "—",
        ...pointOf(r.servicePointId, i.settlementId),
      };
    });

  const servicePoints: ServicePointFeature[] = state.servicePoints
    .filter((sp) => placeMatches(state, sp.settlementId, f))
    .map((sp) => ({ ...sp, interventions: interventions.filter((i) => i.servicePointIds.includes(sp.id)).length }));

  return { settlements, interventions: interventionFeatures, activities, servicePoints };
}
