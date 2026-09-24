"use client";

import type { CaseStatus, Sector } from "@/lib/types";
import { getState } from "@/lib/demo/store";
import { sectors, settlements } from "@/lib/demo/reference";
import { totalReached } from "./fieldReports";

/**
 * Aggregates for the analytics page. Figures are computed only from reviewed
 * records (approved interventions, accepted field reports) so they agree with
 * the dashboard and the national report. All data is fictional.
 */
export interface Analytics {
  totals: { budgetApprovedUsd: number; peopleReached: number; reportsAccepted: number; reportsTotal: number; casesOpen: number };
  budgetBySector: { sector: Sector; value: number; interventions: number }[];
  reachBySettlement: { settlementId: string; name: string; women: number; men: number; children: number; total: number }[];
  reachByGroup: { group: "women" | "men" | "children"; value: number }[];
  reachVsTarget: { id: string; ref: string; title: string; reached: number; target: number }[];
  casesByStatus: { status: CaseStatus; value: number }[];
  activityByDay: { day: string; value: number }[];
}

const DAY = 24 * 60 * 60 * 1000;
const caseStatuses: CaseStatus[] = ["new", "assigned", "in_progress", "resolved", "closed"];

/** Local calendar day, so counts follow the viewer's day boundaries rather than UTC. */
function dayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export async function getAnalytics(days = 30): Promise<Analytics> {
  const state = getState();
  const approved = state.interventions.filter((i) => i.status === "approved" || i.status === "completed");
  const approvedIds = new Set(approved.map((i) => i.id));
  const accepted = state.fieldReports.filter((r) => r.status === "accepted" && approvedIds.has(r.interventionId));

  const budgetBySector = sectors
    .map((sector) => {
      const items = approved.filter((i) => i.sector === sector);
      return { sector, value: items.reduce((sum, i) => sum + i.budgetUsd, 0), interventions: items.length };
    })
    .filter((row) => row.value > 0)
    .sort((a, b) => b.value - a.value);

  const reachBySettlement = settlements
    .map((s) => {
      const reports = accepted.filter((r) => state.interventions.find((i) => i.id === r.interventionId)?.settlementId === s.id);
      const women = reports.reduce((sum, r) => sum + r.reached.women, 0);
      const men = reports.reduce((sum, r) => sum + r.reached.men, 0);
      const children = reports.reduce((sum, r) => sum + r.reached.children, 0);
      return { settlementId: s.id, name: s.name, women, men, children, total: women + men + children };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.total - a.total);

  const reachByGroup = (["women", "men", "children"] as const).map((group) => ({
    group,
    value: accepted.reduce((sum, r) => sum + r.reached[group], 0),
  }));

  const reachVsTarget = approved
    .map((i) => ({
      id: i.id,
      ref: i.ref,
      title: i.title,
      target: i.targetReach,
      reached: accepted.filter((r) => r.interventionId === i.id).reduce((sum, r) => sum + totalReached(r), 0),
    }))
    .sort((a, b) => b.reached / b.target - a.reached / a.target);

  const casesByStatus = caseStatuses.map((status) => ({ status, value: state.cases.filter((c) => c.status === status).length }));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const counts = new Map<string, number>();
  for (const entry of state.audit) {
    if (entry.entity === "session") continue;
    const key = dayKey(new Date(entry.at));
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const activityByDay = Array.from({ length: days }, (_, index) => {
    const date = new Date(today.getTime() - (days - 1 - index) * DAY);
    return { day: date.toISOString(), value: counts.get(dayKey(date)) ?? 0 };
  });

  return {
    totals: {
      budgetApprovedUsd: approved.reduce((sum, i) => sum + i.budgetUsd, 0),
      peopleReached: accepted.reduce((sum, r) => sum + totalReached(r), 0),
      reportsAccepted: accepted.length,
      reportsTotal: state.fieldReports.length,
      casesOpen: state.cases.filter((c) => c.status !== "resolved" && c.status !== "closed").length,
    },
    budgetBySector,
    reachBySettlement,
    reachByGroup,
    reachVsTarget,
    casesByStatus,
    activityByDay,
  };
}
