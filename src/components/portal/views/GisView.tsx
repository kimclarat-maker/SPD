"use client";

import dynamic from "next/dynamic";
import { useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { Sector } from "@/lib/types";
import { sectorNames, sectors } from "@/lib/demo/reference";
import { getGisOverview, type SettlementAlertLevel } from "@/lib/services/gis";
import { useServiceQuery } from "@/lib/services/hooks";
import type { MessageKey } from "@/i18n/core";
import { PageHeader, Section, LoadingState } from "@/components/portal/PageHeader";
import { StatTile } from "@/components/portal/charts/Charts";
import { Badge, type Tone } from "@/components/ui/Badge";
import type { IconName } from "@/components/ui/Icon";
import portal from "@/components/portal/portal.module.css";
import styles from "./GisView.module.css";

const GisMap = dynamic(() => import("@/components/portal/GisMap").then((m) => m.GisMap), {
  ssr: false,
  loading: () => <div className={styles.mapLoading} />,
});

const alertBadge: Record<SettlementAlertLevel, [Tone, IconName, MessageKey]> = {
  clear: ["success", "checkCircle", "portal.gis.statusClear"],
  watch: ["warning", "clock", "portal.gis.statusWatch"],
  attention: ["error", "alertTriangle", "portal.gis.statusAttention"],
};

const legendKey: Record<SettlementAlertLevel, MessageKey> = {
  clear: "portal.gis.legendClear",
  watch: "portal.gis.legendWatch",
  attention: "portal.gis.legendAttention",
};

export function GisView() {
  const { t, formatNumber, formatDate } = useI18n();
  const id = useId();
  const [sector, setSector] = useState<Sector | "">("");
  const { data } = useServiceQuery(() => getGisOverview(sector || undefined), [sector]);

  const header = (
    <PageHeader title={t("portal.gis.title")} intro={t("portal.gis.intro")} meta={<span className={portal.muted}>{t("common.fictional")}</span>} />
  );

  if (!data) {
    return (
      <>
        {header}
        <LoadingState label={t("common.loading")} />
      </>
    );
  }

  const { rows, totals } = data;

  return (
    <>
      {header}

      <ul className={styles.tiles} aria-label={t("portal.gis.title")}>
        <li>
          <StatTile label={t("portal.gis.tilePartners")} value={formatNumber(totals.partners)} />
        </li>
        <li>
          <StatTile label={t("portal.gis.tileInterventions")} value={formatNumber(totals.interventions)} />
        </li>
        <li>
          <StatTile label={t("portal.gis.tileReached")} value={formatNumber(totals.peopleReached)} />
        </li>
        <li>
          <StatTile label={t("portal.gis.tileOpenCases")} value={formatNumber(totals.openCases)} />
        </li>
        <li>
          <StatTile label={t("portal.gis.tileOpenExceptions")} value={formatNumber(totals.openExceptions)} />
        </li>
      </ul>

      <Section
        title={t("portal.gis.title")}
        actions={
          <div className={styles.controls}>
            <label htmlFor={`${id}-sector`} className={styles.controlLabel}>
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
        }
      >
        <div role="region" aria-label={t("portal.gis.mapRegion")} className={styles.mapWrap}>
          <GisMap rows={rows} />
        </div>
        <p className={styles.caption}>{t("portal.gis.mapCaption")}</p>
        <ul className={styles.legend} aria-label={t("portal.gis.legendTitle")}>
          {(["clear", "watch", "attention"] as SettlementAlertLevel[]).map((level) => {
            const [tone] = alertBadge[level];
            return (
              <li key={level}>
                <Badge tone={tone}>{t(legendKey[level])}</Badge>
              </li>
            );
          })}
        </ul>

        <div className={styles.tableWrap} role="region" aria-label={t("portal.gis.tableTitle")} tabIndex={0}>
          <table className={styles.table}>
            <caption className="visually-hidden">{t("portal.gis.tableTitle")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("portal.dashboard.mapSettlement")}</th>
                <th scope="col">{t("portal.dashboard.mapRegion")}</th>
                <th scope="col">{t("portal.gis.tableStatus")}</th>
                <th scope="col" className={styles.num}>
                  {t("portal.gis.tablePartners")}
                </th>
                <th scope="col" className={styles.num}>
                  {t("portal.gis.tableInterventions")}
                </th>
                <th scope="col" className={styles.num}>
                  {t("portal.gis.tableOpenCases")}
                </th>
                <th scope="col" className={styles.num}>
                  {t("portal.gis.tableOpenExceptions")}
                </th>
                <th scope="col" className={styles.num}>
                  {t("portal.gis.tableReached")}
                </th>
                <th scope="col">{t("portal.gis.tableUpdated")}</th>
              </tr>
            </thead>
            <tbody>
              {[...rows]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((row) => {
                  const [tone, icon, labelKey] = alertBadge[row.alertLevel];
                  return (
                    <tr key={row.settlementId}>
                      <th scope="row">{row.name}</th>
                      <td>{row.region}</td>
                      <td>
                        <Badge tone={tone} icon={icon}>
                          {t(labelKey)}
                        </Badge>
                      </td>
                      <td className={styles.num}>{formatNumber(row.partners)}</td>
                      <td className={styles.num}>{formatNumber(row.interventions.total)}</td>
                      <td className={styles.num}>
                        {formatNumber(row.openCases)}
                        {row.overdueCases > 0 && (
                          <span className={styles.overdue}> · {t("portal.gis.overdueCount", { count: row.overdueCases })}</span>
                        )}
                      </td>
                      <td className={styles.num}>{formatNumber(row.openExceptions)}</td>
                      <td className={styles.num}>{formatNumber(row.peopleReached)}</td>
                      <td>{row.lastActivityAt ? formatDate(row.lastActivityAt) : t("portal.gis.noActivity")}</td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </Section>
    </>
  );
}
