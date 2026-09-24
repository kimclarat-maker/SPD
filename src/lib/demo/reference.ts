import type { Sector, Settlement } from "@/lib/types";

/**
 * Reference data. Settlement names are used for realism in the demonstration
 * portal; every figure attached to them is fictional. Map positions are
 * schematic (0–100 grid) and settlement-level only. `lat`/`lng` are
 * approximate, publicly known settlement locations (not exact camp
 * boundaries) for the GIS map — settlement-level only, never an individual
 * location.
 */
export const settlements: Settlement[] = [
  { id: "bidibidi", name: "Bidibidi", region: "West Nile", x: 42, y: 8, lat: 3.5333, lng: 31.3667 },
  { id: "rhino-camp", name: "Rhino Camp", region: "West Nile", x: 31, y: 20, lat: 3.0167, lng: 31.3833 },
  { id: "palorinya", name: "Palorinya", region: "West Nile", x: 57, y: 8, lat: 3.35, lng: 31.65 },
  { id: "adjumani", name: "Adjumani", region: "West Nile", x: 56, y: 22, lat: 3.3, lng: 31.7833 },
  { id: "palabek", name: "Palabek", region: "Acholi", x: 75, y: 15, lat: 3.35, lng: 32.65 },
  { id: "kiryandongo", name: "Kiryandongo", region: "Mid-West", x: 50, y: 40, lat: 1.95, lng: 32.1 },
  { id: "kyangwali", name: "Kyangwali", region: "Mid-West", x: 26, y: 46, lat: 1.15, lng: 30.65 },
  { id: "kyaka-ii", name: "Kyaka II", region: "South-West", x: 34, y: 64, lat: 0.85, lng: 30.55 },
  { id: "rwamwanja", name: "Rwamwanja", region: "South-West", x: 22, y: 68, lat: 0.6167, lng: 30.5833 },
  { id: "nakivale", name: "Nakivale", region: "South-West", x: 36, y: 88, lat: -0.75, lng: 30.9333 },
  { id: "kampala", name: "Kampala (urban)", region: "Central", x: 62, y: 66, lat: 0.3476, lng: 32.5825 },
];

export const sectors: Sector[] = ["health", "wash", "education", "livelihoods", "protection", "shelter"];

/** Sector names are record data (English) in this phase; translate when reference data moves to the API. */
export const sectorNames: Record<Sector, string> = {
  health: "Health",
  wash: "Water, sanitation and hygiene",
  education: "Education",
  livelihoods: "Livelihoods",
  protection: "Protection",
  shelter: "Shelter",
};

export function settlementName(id: string): string {
  return settlements.find((s) => s.id === id)?.name ?? id;
}
