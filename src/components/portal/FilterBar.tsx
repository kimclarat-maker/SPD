"use client";

import { useCallback, useId, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { Sector } from "@/lib/types";
import { filtersToQuery, hasFilters, periodKeys, type PeriodKey, type RecordFilters } from "@/lib/services/filters";
import { getFilterOptions } from "@/lib/services/lookup";
import { Button } from "@/components/ui/Button";
import styles from "./portal.module.css";

type FilterField = "period" | "district" | "settlement" | "sector" | "partner";

/**
 * Keeps record filters in the URL so a filtered view can be shared, reloaded,
 * and reached from a dashboard count with exactly the same selection.
 */
export function useRecordFilters(initial: RecordFilters, extra: () => Record<string, string | undefined> = () => ({})) {
  const router = useRouter();
  const pathname = usePathname();
  const [filters, setFilters] = useState<RecordFilters>(initial);
  const update = useCallback(
    (next: RecordFilters) => {
      setFilters(next);
      router.replace(`${pathname}${filtersToQuery(next, extra())}`, { scroll: false });
    },
    [router, pathname, extra],
  );
  return [filters, update] as const;
}

export function FilterBar({
  value,
  onChange,
  fields = ["period", "district", "settlement", "sector", "partner"],
  label,
}: {
  value: RecordFilters;
  onChange: (next: RecordFilters) => void;
  fields?: FilterField[];
  label?: string;
}) {
  const { t } = useI18n();
  const id = useId();
  const options = getFilterOptions();
  const settlements = options.settlements.filter((s) => !value.district || s.district === value.district);

  const select = (field: FilterField, labelKey: MessageKey, current: string, items: { value: string; label: string }[], allKey: MessageKey, apply: (v: string) => RecordFilters) =>
    fields.includes(field) && (
      <div className={styles.filterField} key={field}>
        <label htmlFor={`${id}-${field}`} className={styles.toolbarLabel}>
          {t(labelKey)}
        </label>
        <select id={`${id}-${field}`} className={styles.toolbarSelect} value={current} onChange={(e) => onChange(apply(e.target.value))}>
          <option value="">{t(allKey)}</option>
          {items.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </div>
    );

  return (
    <div className={styles.filterBar} role="group" aria-label={label ?? t("portal.filters.label")}>
      {fields.includes("period") && (
        <div className={styles.filterField}>
          <label htmlFor={`${id}-period`} className={styles.toolbarLabel}>
            {t("portal.filters.period")}
          </label>
          <select
            id={`${id}-period`}
            className={styles.toolbarSelect}
            value={value.period ?? "all"}
            onChange={(e) => onChange({ ...value, period: e.target.value as PeriodKey })}
          >
            {periodKeys.map((p) => (
              <option key={p} value={p}>
                {t(`portal.filters.periods.${p}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
      )}
      {select(
        "district",
        "portal.filters.district",
        value.district ?? "",
        options.districts.map((d) => ({ value: d, label: d })),
        "portal.filters.allDistricts",
        (v) => ({ ...value, district: v || undefined, settlementId: undefined }),
      )}
      {select(
        "settlement",
        "portal.filters.settlement",
        value.settlementId ?? "",
        settlements.map((s) => ({ value: s.id, label: s.name })),
        "portal.filters.allSettlements",
        (v) => ({ ...value, settlementId: v || undefined }),
      )}
      {select(
        "sector",
        "portal.filters.sector",
        value.sector ?? "",
        options.sectors.map((s) => ({ value: s.id, label: s.name })),
        "portal.filters.allSectors",
        (v) => ({ ...value, sector: (v || undefined) as Sector | undefined }),
      )}
      {select(
        "partner",
        "portal.filters.partner",
        value.partnerId ?? "",
        options.partners.map((p) => ({ value: p.id, label: p.name })),
        "portal.filters.allPartners",
        (v) => ({ ...value, partnerId: v || undefined }),
      )}
      {hasFilters(value) && (
        <Button variant="ghost" size="sm" icon="x" onClick={() => onChange({})}>
          {t("portal.table.clearFilters")}
        </Button>
      )}
    </div>
  );
}
