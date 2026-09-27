"use client";

import { useSearchParams } from "next/navigation";
import { useMemo } from "react";
import type { FieldSnapshot, FieldSubmission } from "@/lib/services/fieldWork";
import type { LocalRecord } from "@/lib/field/device";
import { useFieldData } from "./FieldData";

/** Reads a query-string value in the browser (record ids live in the query so cached pages work offline). */
export function useParam(name: string): string | null {
  return useSearchParams().get(name);
}

/** Look-ups over the assigned-work snapshot (live or cached). */
export function useLookups() {
  const { snapshot } = useFieldData();
  return useMemo(() => lookups(snapshot), [snapshot]);
}

export function lookups(s: FieldSnapshot | undefined) {
  return {
    intervention: (id?: string) => s?.interventions.find((i) => i.id === id),
    servicePoint: (id?: string) => s?.servicePoints.find((sp) => sp.id === id),
    servicePointName: (id?: string) => s?.servicePoints.find((sp) => sp.id === id)?.name ?? "—",
    settlementName: (id?: string) => s?.settlements.find((x) => x.id === id)?.name ?? "—",
    form: (id?: string) => s?.forms.find((f) => f.id === id),
    task: (id?: string) => s?.tasks.find((t) => t.id === id),
    indicator: (id: string) => s?.indicators.find((i) => i.id === id),
    indicatorLabel: (id: string) => {
      const ind = s?.indicators.find((i) => i.id === id);
      return ind ? `${ind.code} — ${ind.name}` : id;
    },
    submissionFor: (r?: LocalRecord): FieldSubmission | undefined =>
      r ? s?.submissions.find((x) => (r.central && x.id === r.central.id) || x.clientRecordId === r.localId) : undefined,
    submission: (id?: string) => s?.submissions.find((x) => x.id === id),
  };
}

export type Lookups = ReturnType<typeof lookups>;
