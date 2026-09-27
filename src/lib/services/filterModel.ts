import type { Sector } from "@/lib/types";

/**
 * One filter model shared by the dashboard, every list, the GIS map and the
 * report builder. Dashboard counts are computed with the same predicates the
 * list pages use, and every count links to the list with the same query
 * string, so the numbers always agree.
 */
export type PeriodKey = "all" | "30d" | "90d" | "quarter" | "year";

export interface RecordFilters {
  period?: PeriodKey;
  district?: string;
  settlementId?: string;
  sector?: Sector;
  partnerId?: string;
  interventionId?: string;
  /** Explicit dates (saved reports); overrides `period`. */
  range?: { from?: Date; to?: Date };
}

export const periodKeys: PeriodKey[] = ["all", "30d", "90d", "quarter", "year"];

export function periodRange(period: PeriodKey | undefined, now = new Date()): { from?: Date; to?: Date } {
  const DAY = 24 * 60 * 60 * 1000;
  switch (period) {
    case "30d":
      return { from: new Date(now.getTime() - 30 * DAY), to: now };
    case "90d":
      return { from: new Date(now.getTime() - 90 * DAY), to: now };
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3);
      return { from: new Date(now.getFullYear(), q * 3, 1), to: now };
    }
    case "year":
      return { from: new Date(now.getFullYear(), 0, 1), to: now };
    default:
      return {};
  }
}

export function rangeOf(f: RecordFilters): { from?: Date; to?: Date } {
  return f.range ?? periodRange(f.period);
}

export function inRange(iso: string | undefined, range: { from?: Date; to?: Date }): boolean {
  if (!range.from && !range.to) return true;
  if (!iso) return false;
  const time = new Date(iso).getTime();
  return (!range.from || time >= range.from.getTime()) && (!range.to || time <= range.to.getTime());
}

type Params = Record<string, string | string[] | undefined>;

export function filtersFromParams(params: Params | undefined): RecordFilters {
  const get = (key: string) => {
    const value = params?.[key];
    return (Array.isArray(value) ? value[0] : value) || undefined;
  };
  const period = get("period") as PeriodKey | undefined;
  return {
    period: period && periodKeys.includes(period) ? period : undefined,
    district: get("district"),
    settlementId: get("settlement"),
    sector: get("sector") as Sector | undefined,
    partnerId: get("partner"),
  };
}

export function filtersToQuery(f: RecordFilters, extra: Record<string, string | undefined> = {}): string {
  const params = new URLSearchParams();
  if (f.period && f.period !== "all") params.set("period", f.period);
  if (f.district) params.set("district", f.district);
  if (f.settlementId) params.set("settlement", f.settlementId);
  if (f.sector) params.set("sector", f.sector);
  if (f.partnerId) params.set("partner", f.partnerId);
  for (const [key, value] of Object.entries(extra)) if (value) params.set(key, value);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export function hasFilters(f: RecordFilters): boolean {
  return Boolean((f.period && f.period !== "all") || f.district || f.settlementId || f.sector || f.partnerId);
}
