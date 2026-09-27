"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import { useConnectivity } from "@/lib/field/connectivity";
import { Notice } from "@/components/ui/Notice";
import type { MapPoint } from "../FieldMap";
import { useFieldData } from "../FieldData";
import { PageHead, SourceNote } from "../FieldBits";
import styles from "../field.module.css";

const FieldMap = dynamic(() => import("../FieldMap"), { ssr: false, loading: () => <div style={{ height: 360 }} /> });

/** Drawn from the cached coordinates alone, so it works with no connection and no map tiles. */
function Schematic({ points, label }: { points: MapPoint[]; label: string }) {
  const W = 600;
  const H = 360;
  const pad = 48;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const [minLat, maxLat, minLng, maxLng] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const sx = (lng: number) => pad + ((lng - minLng) / Math.max(1e-6, maxLng - minLng)) * (W - 2 * pad);
  const sy = (lat: number) => H - pad - ((lat - minLat) / Math.max(1e-6, maxLat - minLat)) * (H - 2 * pad);
  const color = { settlement: "#142b3b", servicePoint: "#087f78", visit: "#a66516" };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.schematic} role="img" aria-label={label}>
      <rect x="8" y="8" width={W - 16} height={H - 16} rx="12" fill="none" stroke="#b7c7cc" strokeDasharray="6 6" />
      {points.map((p) => {
        const x = sx(p.lng);
        const y = sy(p.lat);
        return (
          <g key={`${p.kind}-${p.id}`}>
            {p.kind === "visit" ? (
              <circle cx={x} cy={y} r="13" fill="none" stroke={color.visit} strokeWidth="3" />
            ) : (
              <circle cx={x} cy={y} r={p.kind === "settlement" ? 9 : 7} fill={color[p.kind]} stroke="#fff" strokeWidth="1.5" />
            )}
            {p.kind !== "visit" && (
              <text x={x} y={y - 14} textAnchor="middle" fontSize="13" fill="#142b3b" style={{ paintOrder: "stroke", stroke: "#eef4f2", strokeWidth: 4 }}>
                {p.name.length > 28 ? `${p.name.slice(0, 27)}…` : p.name}
              </text>
            )}
          </g>
        );
      })}
      <text x={W / 2} y={H - 14} textAnchor="middle" fontSize="12" fill="#52656f">
        ↑ N
      </text>
    </svg>
  );
}

export function MapView() {
  const { t, formatDate } = useI18n();
  const { snapshot } = useFieldData();
  const { online } = useConnectivity();
  const [view, setView] = useState<"map" | "list">("map");
  const [tilesFailed, setTilesFailed] = useState(false);
  if (!snapshot) return <SourceNote />;

  const openTasks = snapshot.tasks.filter((task) => task.assignedTo === snapshot.userId && !["completed", "cancelled"].includes(task.status));
  const points: MapPoint[] = [
    ...snapshot.settlements.map((s) => ({ id: s.id, name: t("field.map.settlementCentre", { name: s.name }), lat: s.lat, lng: s.lng, kind: "settlement" as const })),
    ...snapshot.servicePoints.map((sp) => ({ id: sp.id, name: sp.name, lat: sp.lat, lng: sp.lng, kind: "servicePoint" as const })),
    ...openTasks
      .map((task) => snapshot.servicePoints.find((sp) => sp.id === task.servicePointId))
      .filter((sp): sp is NonNullable<typeof sp> => Boolean(sp))
      .map((sp) => ({ id: sp.id, name: t("field.map.visitAt", { name: sp.name }), lat: sp.lat, lng: sp.lng, kind: "visit" as const })),
  ];
  const useSchematic = !online || tilesFailed;

  return (
    <div className={styles.stack}>
      <PageHead title={t("field.map.title")} intro={t("field.map.intro")} />
      <SourceNote />
      <Notice tone="info">{t("field.map.privacy")}</Notice>
      <div className={styles.filters} role="group" aria-label={t("field.map.viewLabel")}>
        <button type="button" className={styles.chip} aria-pressed={view === "map"} onClick={() => setView("map")}>
          {t("field.map.mapView")}
        </button>
        <button type="button" className={styles.chip} aria-pressed={view === "list"} onClick={() => setView("list")}>
          {t("field.map.listView")}
        </button>
      </div>

      {view === "map" && (
        <section className={styles.stack} style={{ gap: 8 }} aria-label={t("field.map.mapView")}>
          {useSchematic && <Notice tone="warning">{online ? t("field.map.tilesFailed") : t("field.map.offlineSchematic")}</Notice>}
          <div className={styles.mapWrap}>{useSchematic ? <Schematic points={points} label={t("field.map.schematicLabel", { count: points.length })} /> : <FieldMap points={points} onTilesFailed={() => setTilesFailed(true)} />}</div>
          <p className={styles.legendRow}>
            <span>
              <span className={styles.swatch} style={{ background: "#142b3b" }} />
              {t("field.map.legendSettlement")}
            </span>
            <span>
              <span className={styles.swatch} style={{ background: "#087f78" }} />
              {t("field.map.legendServicePoint")}
            </span>
            <span>
              <span className={styles.swatch} style={{ background: "transparent", border: "3px solid #a66516" }} />
              {t("field.map.legendVisit")}
            </span>
          </p>
          <p className={`${styles.small} ${styles.muted}`}>{t("field.map.listHint")}</p>
        </section>
      )}

      {(view === "list" || useSchematic) && (
        <section className={styles.stack} aria-labelledby="map-list">
          <h2 id="map-list" className={styles.cardTitle}>
            {t("field.map.listTitle")}
          </h2>
          {snapshot.settlements.map((s) => (
            <div key={s.id} className={styles.card}>
              <h3 className={styles.cardTitle}>
                {s.name} <span className={`${styles.small} ${styles.muted}`}>· {s.district}</span>
              </h3>
              <ul className={styles.list}>
                {snapshot.servicePoints
                  .filter((sp) => sp.settlementId === s.id)
                  .map((sp) => {
                    const interventions = snapshot.interventions.filter((i) => i.servicePointIds.includes(sp.id));
                    const visits = openTasks.filter((task) => task.servicePointId === sp.id);
                    return (
                      <li key={sp.id} className={styles.item}>
                        <span className={styles.itemTitle}>{sp.name}</span>
                        <span className={styles.itemMeta}>
                          <span>{t(`portal.servicePointTypes.${sp.type}` as MessageKey)}</span>
                          <span className={styles.ref} dir="ltr">
                            {sp.lat.toFixed(3)}, {sp.lng.toFixed(3)}
                          </span>
                        </span>
                        {interventions.length > 0 && (
                          <span className={styles.small}>
                            {t("field.map.interventionsHere")}:{" "}
                            {interventions.map((i, idx) => (
                              <span key={i.id}>
                                {idx > 0 && ", "}
                                <Link href={`/field/intervention?id=${i.id}`}>{i.ref}</Link>
                              </span>
                            ))}
                          </span>
                        )}
                        {visits.map((task) => (
                          <span key={task.id} className={styles.small}>
                            <Link href={`/field/task?id=${task.id}`}>{task.title}</Link> · {t("field.work.due", { date: formatDate(task.dueAt, true) })}
                          </span>
                        ))}
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </section>
      )}
      <p className={`${styles.small} ${styles.muted}`}>{t("field.map.cached", { points: snapshot.servicePoints.length, settlements: snapshot.settlements.length })}</p>
    </div>
  );
}
