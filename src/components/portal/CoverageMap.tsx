"use client";

import { useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { Sector } from "@/lib/types";
import { sectorNames, sectors } from "@/lib/demo/reference";
import { getCoverage } from "@/lib/services/dashboard";
import { useServiceQuery } from "@/lib/services/hooks";
import styles from "./CoverageMap.module.css";

/** Rough schematic outline on a 0–100 grid. Deliberately not a geographic map. */
const OUTLINE = "M20 5 L48 3 L75 3 L92 10 L96 34 L88 55 L80 70 L70 90 L40 96 L22 94 L12 80 L15 60 L18 40 L28 24 Z";

/**
 * Settlement-level aggregate map. The SVG is a visual summary; the table
 * beneath carries the same numbers for screen readers and print.
 */
export function CoverageMap() {
  const { t, formatNumber } = useI18n();
  const id = useId();
  const [sector, setSector] = useState<Sector | "">("");
  const { data } = useServiceQuery(() => getCoverage(sector || undefined), [sector]);
  const rows = data ?? [];
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <div className={styles.wrap}>
      <div className={styles.controls}>
        <label htmlFor={`${id}-sector`} className={styles.label}>
          {t("portal.dashboard.mapSector")}
        </label>
        <select id={`${id}-sector`} className={styles.select} value={sector} onChange={(e) => setSector(e.target.value as Sector | "")}>
          <option value="">{t("portal.dashboard.mapAllSectors")}</option>
          {sectors.map((s) => (
            <option key={s} value={s}>
              {sectorNames[s]}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.layout}>
        <figure className={styles.figure}>
          <svg viewBox="0 0 100 100" className={styles.svg} aria-hidden="true" focusable="false">
            <path d={OUTLINE} className={styles.outline} />
            {rows.map((row) => {
              const r = row.count ? 2.2 + (row.count / max) * 3.6 : 1.6;
              return (
                <g key={row.settlementId}>
                  <title>{`${row.name}: ${t("portal.dashboard.mapCount", { count: row.count })}`}</title>
                  <circle cx={row.x} cy={row.y} r={r} className={row.count ? styles.marker : styles.markerEmpty} />
                  {row.count > 0 && (
                    <text x={row.x} y={row.y + 1.1} textAnchor="middle" className={styles.markerText}>
                      {row.count}
                    </text>
                  )}
                  <text x={row.x} y={row.y + r + 3.4} textAnchor="middle" className={styles.markerLabel}>
                    {row.name}
                  </text>
                </g>
              );
            })}
          </svg>
          <figcaption className={styles.caption}>{t("portal.dashboard.mapNote")}</figcaption>
        </figure>

        <div className={styles.tableWrap} role="region" aria-label={t("portal.dashboard.mapTable")} tabIndex={0}>
          <table className={styles.table}>
            <caption className="visually-hidden">{t("portal.dashboard.mapTable")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("portal.dashboard.mapSettlement")}</th>
                <th scope="col">{t("portal.dashboard.mapRegion")}</th>
                <th scope="col" className={styles.num}>
                  {t("portal.dashboard.mapInterventions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
                .map((row) => (
                  <tr key={row.settlementId}>
                    <th scope="row">{row.name}</th>
                    <td>{row.region}</td>
                    <td className={styles.num}>
                      <span className={styles.barCell}>
                        <span className={styles.bar} style={{ width: `${(row.count / max) * 120}px` }} aria-hidden="true" />
                        <span>{formatNumber(row.count)}</span>
                      </span>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
