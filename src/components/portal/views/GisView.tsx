"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import { getGisData, type GisView as ViewKey, type StatusFilter } from "@/lib/services/gis";
import type { RecordFilters } from "@/lib/services/filters";
import { sectorName, settlementName } from "@/lib/services/lookup";
import { useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { FilterBar, useRecordFilters } from "@/components/portal/FilterBar";
import { PageTabs } from "@/components/portal/RecordPage";
import { StatusBadge } from "@/components/portal/StatusBadge";
import type { Layers } from "@/components/portal/GisMap";
import { Notice } from "@/components/ui/Notice";
import portal from "@/components/portal/portal.module.css";
import styles from "./GisView.module.css";

const GisMap = dynamic(() => import("@/components/portal/GisMap").then((m) => m.GisMap), {
  ssr: false,
  loading: () => <div className={styles.mapLoading} />,
});

const views: ViewKey[] = ["coverage", "gaps", "progress"];
const statusFilters: StatusFilter[] = ["all", "live", "pipeline", "closed"];

export function GisView({ initialFilters, initialView, initialStatus }: { initialFilters: RecordFilters; initialView?: string; initialStatus?: string }) {
  const { t, formatNumber, formatDate } = useI18n();
  const id = useId();
  const [view, setView] = useState<ViewKey>(views.includes(initialView as ViewKey) ? (initialView as ViewKey) : "coverage");
  const [status, setStatus] = useState<StatusFilter>(statusFilters.includes(initialStatus as StatusFilter) ? (initialStatus as StatusFilter) : "live");
  const [layers, setLayers] = useState<Layers>({ settlements: true, interventions: true, activities: false, servicePoints: false });
  const [listTab, setListTab] = useState("settlements");
  const extra = useCallback(() => ({ view, status }), [view, status]);
  const [filters, setFilters] = useRecordFilters(initialFilters, extra);
  const { data } = useServiceQuery(() => getGisData(filters, status), [JSON.stringify(filters), status]);

  return (
    <>
      <PageHeader title={t("portal.gis.title")} intro={t("portal.gis.intro")} meta={<span className={portal.muted}>{t("common.fictional")}</span>} />
      <FilterBar value={filters} onChange={setFilters} />
      <div className={styles.controls}>
        <div className={styles.segmented} role="radiogroup" aria-label={t("portal.gis.viewLabel")}>
          {views.map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              className={styles.segment}
              onClick={() => {
                setView(v);
                setFilters({ ...filters });
              }}
            >
              {t(`portal.gis.views.${v}` as MessageKey)}
            </button>
          ))}
        </div>
        <div className={portal.filterField}>
          <label htmlFor={`${id}-status`} className={portal.toolbarLabel}>
            {t("portal.gis.statusFilter")}
          </label>
          <select id={`${id}-status`} className={portal.toolbarSelect} value={status} onChange={(e) => setStatus(e.target.value as StatusFilter)}>
            {statusFilters.map((s) => (
              <option key={s} value={s}>
                {t(`portal.gis.statusFilters.${s}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
        <fieldset className={styles.layers}>
          <legend className={portal.toolbarLabel}>{t("portal.gis.layers")}</legend>
          {(Object.keys(layers) as (keyof Layers)[]).map((key) => (
            <label key={key} className={styles.layer}>
              <input type="checkbox" checked={layers[key]} onChange={(e) => setLayers({ ...layers, [key]: e.target.checked })} />
              {t(`portal.gis.layerNames.${key}` as MessageKey)}
            </label>
          ))}
        </fieldset>
      </div>

      {!data ? (
        <LoadingState label={t("common.loading")} />
      ) : (
        <>
          <div role="region" aria-label={t("portal.gis.mapRegion")} className={styles.mapWrap}>
            <GisMap data={data} view={view} layers={layers} filters={filters} />
          </div>
          <p className={styles.caption}>{t(`portal.gis.legend.${view}` as MessageKey)}</p>
          <Notice tone="info">{t("portal.gis.privacy")}</Notice>

          <PageTabs
            label={t("portal.gis.listTitle")}
            active={listTab}
            onChange={setListTab}
            tabs={[
              {
                id: "settlements",
                label: t("portal.gis.layerNames.settlements"),
                count: data.settlements.length,
                content: (
                  <div className={portal.tableScroll} role="region" aria-label={t("portal.gis.layerNames.settlements")} tabIndex={0}>
                    <table className={`${portal.table} ${portal.tableCompact}`}>
                      <caption className="visually-hidden">{t("portal.gis.layerNames.settlements")}</caption>
                      <thead>
                        <tr>
                          <th scope="col">{t("portal.filters.settlement")}</th>
                          <th scope="col">{t("portal.filters.district")}</th>
                          <th scope="col" className={portal.num}>
                            {t("portal.gis.interventions")}
                          </th>
                          <th scope="col" className={portal.num}>
                            {t("portal.gis.progress")}
                          </th>
                          <th scope="col">{t("portal.gis.gaps")}</th>
                          <th scope="col" className={portal.num}>
                            {t("portal.gis.reached")}
                          </th>
                          <th scope="col" className={portal.num}>
                            {t("portal.gis.openCases")}
                          </th>
                          <th scope="col">{t("portal.gis.lastActivityCol")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...data.settlements]
                          .sort((a, b) => a.name.localeCompare(b.name))
                          .map((s) => (
                            <tr key={s.id}>
                              <th scope="row">
                                <Link href={`/portal/interventions${`?settlement=${s.id}`}`}>{s.name}</Link>
                              </th>
                              <td>{s.district}</td>
                              <td className={portal.num}>{formatNumber(s.interventions)}</td>
                              <td className={portal.num}>{s.interventions ? `${s.progress}%` : "—"}</td>
                              <td>{s.sectorsMissing.length ? s.sectorsMissing.map(sectorName).join(", ") : t("portal.gis.noGaps")}</td>
                              <td className={portal.num}>{formatNumber(s.peopleReached)}</td>
                              <td className={portal.num}>
                                {formatNumber(s.openCases)}
                                {s.overdueCases > 0 && <span className={portal.ref}>{t("portal.gis.overdueCount", { count: s.overdueCases })}</span>}
                              </td>
                              <td>{s.lastActivityAt ? formatDate(s.lastActivityAt) : "—"}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ),
              },
              {
                id: "interventions",
                label: t("portal.gis.layerNames.interventions"),
                count: data.interventions.length,
                content: (
                  <ul className={portal.rowList}>
                    {data.interventions.map((i) => (
                      <li key={i.id} className={portal.rowItem}>
                        <span className={portal.rowMain}>
                          <Link href={`/portal/interventions/${i.id}`} className={portal.recordLink}>
                            {i.ref} {i.title}
                          </Link>
                          <span className={portal.ref}>
                            {i.partnerName} · {settlementName(i.settlementId)} · {sectorName(i.sector)} · {i.progress}%
                          </span>
                        </span>
                        <StatusBadge entity="intervention" status={i.status} />
                      </li>
                    ))}
                  </ul>
                ),
              },
              {
                id: "activities",
                label: t("portal.gis.layerNames.activities"),
                count: data.activities.length,
                content: (
                  <ul className={portal.rowList}>
                    {data.activities.map((a) => (
                      <li key={a.id} className={portal.rowItem}>
                        <span className={portal.rowMain}>
                          <Link href={`/portal/field-reports/${a.id}`} className={portal.recordLink}>
                            {a.ref} {a.title}
                          </Link>
                          <span className={portal.ref}>
                            {a.interventionRef} · {a.servicePointName} · {formatDate(a.collectedAt)}
                          </span>
                        </span>
                        <StatusBadge entity="fieldReport" status={a.status} />
                      </li>
                    ))}
                  </ul>
                ),
              },
              {
                id: "points",
                label: t("portal.gis.layerNames.servicePoints"),
                count: data.servicePoints.length,
                content: (
                  <ul className={portal.rowList}>
                    {data.servicePoints.map((sp) => (
                      <li key={sp.id} className={portal.rowItem}>
                        <span className={portal.rowMain}>
                          <span>{sp.name}</span>
                          <span className={portal.ref}>
                            {t(`portal.servicePointTypes.${sp.type}` as MessageKey)} · {settlementName(sp.settlementId)}
                          </span>
                        </span>
                        <span className={portal.small}>{t("portal.gis.pointInterventions", { count: sp.interventions })}</span>
                      </li>
                    ))}
                  </ul>
                ),
              },
            ]}
          />
        </>
      )}
    </>
  );
}
