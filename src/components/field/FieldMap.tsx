"use client";

import "leaflet/dist/leaflet.css";
import { useState } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip } from "react-leaflet";

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kind: "settlement" | "servicePoint" | "visit";
}

const COLOR: Record<MapPoint["kind"], string> = { settlement: "#142b3b", servicePoint: "#087f78", visit: "#a66516" };

/**
 * Online map of the assigned settlement. Only settlement centres and public
 * facilities are plotted; households and individuals never are. Tiles come
 * from OpenStreetMap and are not cached for offline use.
 */
export default function FieldMap({ points, onTilesFailed }: { points: MapPoint[]; onTilesFailed: () => void }) {
  const [failed, setFailed] = useState(false);
  const lat = points.reduce((s, p) => s + p.lat, 0) / Math.max(1, points.length);
  const lng = points.reduce((s, p) => s + p.lng, 0) / Math.max(1, points.length);
  return (
    <MapContainer center={[lat, lng]} zoom={12} scrollWheelZoom={false} style={{ height: 360, width: "100%" }}>
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
        eventHandlers={{
          tileerror: () => {
            if (!failed) {
              setFailed(true);
              onTilesFailed();
            }
          },
        }}
      />
      {points.map((p) => (
        <CircleMarker
          key={`${p.kind}-${p.id}`}
          center={[p.lat, p.lng]}
          radius={p.kind === "settlement" ? 10 : p.kind === "visit" ? 11 : 7}
          pathOptions={{ color: p.kind === "visit" ? COLOR.visit : "#fff", weight: p.kind === "visit" ? 3 : 1.5, fillColor: COLOR[p.kind], fillOpacity: p.kind === "visit" ? 0 : 0.9 }}
        >
          <Tooltip direction="top" opacity={1}>
            {p.name}
          </Tooltip>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}
