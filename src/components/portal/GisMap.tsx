"use client";

import "leaflet/dist/leaflet.css";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup } from "react-leaflet";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { GisData, GisView } from "@/lib/services/gis";
import { filtersToQuery, type RecordFilters } from "@/lib/services/filters";
import styles from "./GisMap.module.css";

const UGANDA_CENTER: [number, number] = [1.4, 31.9];
const TEAL = "#087f78";
const STATUS_COLOR: Record<string, string> = {
  active: "#227a56",
  approved: "#087f78",
  completed: "#52656f",
  closed: "#8a9ba3",
  submitted: "#a66516",
  coordination_review: "#a66516",
  changes_requested: "#a66516",
};

function scale(value: number, stops: [number, string][]): string {
  for (const [limit, color] of stops) if (value <= limit) return color;
  return stops[stops.length - 1][1];
}

export interface Layers {
  settlements: boolean;
  interventions: boolean;
  activities: boolean;
  servicePoints: boolean;
}

/**
 * Settlement-level map. Every marker is a settlement centre or a public
 * facility; households and individuals are never plotted. Choosing a feature
 * opens its record; settlements open a summary with links.
 */
export function GisMap({ data, view, layers, filters }: { data: GisData; view: GisView; layers: Layers; filters: RecordFilters }) {
  const { t, formatNumber, formatDate } = useI18n();
  const router = useRouter();
  const maxCount = useMemo(() => Math.max(1, ...data.settlements.map((s) => s.interventions)), [data.settlements]);

  const settlementColor = (s: GisData["settlements"][number]) => {
    if (view === "gaps") return scale(s.sectorsMissing.length, [[0, "#227a56"], [2, "#d19a3e"], [4, "#b86b2e"], [99, "#b64545"]]);
    if (view === "progress") return s.interventions === 0 ? "#b7c7cc" : scale(s.progress, [[25, "#b64545"], [50, "#d19a3e"], [75, "#5aa58a"], [100, "#227a56"]]);
    return s.interventions === 0 ? "#b7c7cc" : TEAL;
  };

  return (
    <MapContainer center={UGANDA_CENTER} zoom={7} scrollWheelZoom={false} className={styles.map}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
      />
      {layers.settlements &&
        data.settlements.map((s) => {
          const radius = 9 + (s.interventions / maxCount) * 14;
          return (
            <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={radius} pathOptions={{ color: "#fff", weight: 1.5, fillColor: settlementColor(s), fillOpacity: 0.8 }}>
              <Tooltip direction="top" offset={[0, -radius]} opacity={1}>
                {s.name}
              </Tooltip>
              <Popup>
                <div className={styles.popup}>
                  <p className={styles.popupTitle}>{s.name}</p>
                  <p className={styles.popupRegion}>
                    {s.district} · {s.region}
                  </p>
                  <dl className={styles.popupStats}>
                    <div>
                      <dt>{t("portal.gis.interventions")}</dt>
                      <dd>{formatNumber(s.interventions)}</dd>
                    </div>
                    <div>
                      <dt>{t("portal.gis.partners")}</dt>
                      <dd>{formatNumber(s.partners)}</dd>
                    </div>
                    <div>
                      <dt>{t("portal.gis.progress")}</dt>
                      <dd>{s.progress}%</dd>
                    </div>
                    <div>
                      <dt>{t("portal.gis.reached")}</dt>
                      <dd>{formatNumber(s.peopleReached)}</dd>
                    </div>
                    <div>
                      <dt>{t("portal.gis.openCases")}</dt>
                      <dd>{formatNumber(s.openCases)}</dd>
                    </div>
                    <div>
                      <dt>{t("portal.gis.gaps")}</dt>
                      <dd>{s.sectorsMissing.length}</dd>
                    </div>
                  </dl>
                  {s.lastActivityAt && <p className={styles.popupUpdated}>{t("portal.gis.lastActivity", { date: formatDate(s.lastActivityAt) })}</p>}
                  <p className={styles.popupLinks}>
                    <Link href={`/portal/interventions${filtersToQuery({ ...filters, settlementId: s.id })}`}>{t("portal.gis.openInterventions")}</Link>
                    <Link href={`/portal/cases${filtersToQuery({ period: filters.period, settlementId: s.id })}`}>{t("portal.gis.openCasesLink")}</Link>
                  </p>
                </div>
              </Popup>
            </CircleMarker>
          );
        })}
      {layers.servicePoints &&
        data.servicePoints.map((sp) => (
          <CircleMarker key={sp.id} center={[sp.lat, sp.lng]} radius={4} pathOptions={{ color: "#142b3b", weight: 1, fillColor: "#fff", fillOpacity: 1 }}>
            <Tooltip direction="top" opacity={1}>
              {sp.name} · {t(`portal.servicePointTypes.${sp.type}` as MessageKey)}
            </Tooltip>
          </CircleMarker>
        ))}
      {layers.interventions &&
        data.interventions.map((i) => (
          <CircleMarker
            key={i.id}
            center={[i.lat + 0.01, i.lng + 0.01]}
            radius={7}
            pathOptions={{ color: "#fff", weight: 1.5, fillColor: STATUS_COLOR[i.status] ?? TEAL, fillOpacity: 1 }}
            eventHandlers={{ click: () => router.push(`/portal/interventions/${i.id}`) }}
          >
            <Tooltip direction="top" opacity={1}>
              {i.ref} · {i.title} · {i.progress}%
            </Tooltip>
          </CircleMarker>
        ))}
      {layers.activities &&
        data.activities.map((a) => (
          <CircleMarker
            key={a.id}
            center={[a.lat - 0.01, a.lng - 0.01]}
            radius={5}
            pathOptions={{ color: "#fff", weight: 1, fillColor: a.status === "accepted" ? "#447d9a" : "#a66516", fillOpacity: 1 }}
            eventHandlers={{ click: () => router.push(`/portal/field-reports/${a.id}`) }}
          >
            <Tooltip direction="top" opacity={1}>
              {a.ref} · {a.servicePointName} · {formatDate(a.collectedAt)}
            </Tooltip>
          </CircleMarker>
        ))}
    </MapContainer>
  );
}

/** Small map of an intervention's service points (public facilities only). */
export function PointsMap({ points }: { points: { id: string; name: string; lat: number; lng: number }[] }) {
  if (points.length === 0) return null;
  const lat = points.reduce((s, p) => s + p.lat, 0) / points.length;
  const lng = points.reduce((s, p) => s + p.lng, 0) / points.length;
  return (
    <MapContainer center={[lat, lng]} zoom={11} scrollWheelZoom={false} className={styles.mapSmall}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
      />
      {points.map((p) => (
        <CircleMarker key={p.id} center={[p.lat, p.lng]} radius={7} pathOptions={{ color: "#fff", weight: 1.5, fillColor: TEAL, fillOpacity: 0.9 }}>
          <Tooltip direction="top" opacity={1} permanent>
            {p.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
