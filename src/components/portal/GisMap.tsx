"use client";

import "leaflet/dist/leaflet.css";
import { useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup } from "react-leaflet";
import { useI18n } from "@/i18n/I18nProvider";
import type { SettlementMonitoring } from "@/lib/services/gis";
import styles from "./GisMap.module.css";

const ALERT_COLOR: Record<SettlementMonitoring["alertLevel"], string> = {
  attention: "#b64545",
  watch: "#a66516",
  clear: "#227a56",
};

const UGANDA_CENTER: [number, number] = [1.4, 31.9];

export function GisMap({ rows }: { rows: SettlementMonitoring[] }) {
  const { t, formatNumber, formatDate } = useI18n();
  const maxCount = useMemo(() => Math.max(1, ...rows.map((r) => r.interventions.total)), [rows]);

  return (
    <MapContainer center={UGANDA_CENTER} zoom={7} scrollWheelZoom={false} className={styles.map}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
      />
      {rows.map((row) => {
        const radius = 8 + (row.interventions.total / maxCount) * 14;
        return (
          <CircleMarker
            key={row.settlementId}
            center={[row.lat, row.lng]}
            radius={radius}
            pathOptions={{ color: "#fff", weight: 1.5, fillColor: ALERT_COLOR[row.alertLevel], fillOpacity: 0.85 }}
          >
            <Tooltip direction="top" offset={[0, -radius]} opacity={1}>
              {row.name}
            </Tooltip>
            <Popup>
              <div className={styles.popup}>
                <p className={styles.popupTitle}>{row.name}</p>
                <p className={styles.popupRegion}>{row.region}</p>
                <dl className={styles.popupStats}>
                  <div>
                    <dt>{t("portal.gis.popupPartners")}</dt>
                    <dd>{formatNumber(row.partners)}</dd>
                  </div>
                  <div>
                    <dt>{t("portal.gis.popupInterventions")}</dt>
                    <dd>{formatNumber(row.interventions.total)}</dd>
                  </div>
                  <div>
                    <dt>{t("portal.gis.popupReached")}</dt>
                    <dd>{formatNumber(row.peopleReached)}</dd>
                  </div>
                  <div>
                    <dt>{t("portal.gis.popupOpenCases")}</dt>
                    <dd>{formatNumber(row.openCases)}</dd>
                  </div>
                  {row.overdueCases > 0 && (
                    <div>
                      <dt>{t("portal.gis.popupOverdueCases")}</dt>
                      <dd className={styles.popupOverdue}>{formatNumber(row.overdueCases)}</dd>
                    </div>
                  )}
                  <div>
                    <dt>{t("portal.gis.popupOpenExceptions")}</dt>
                    <dd>{formatNumber(row.openExceptions)}</dd>
                  </div>
                </dl>
                {row.lastActivityAt && <p className={styles.popupUpdated}>{t("portal.gis.popupUpdated", { date: formatDate(row.lastActivityAt) })}</p>}
              </div>
            </Popup>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
