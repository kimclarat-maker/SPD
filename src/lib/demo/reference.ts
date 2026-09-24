import type { Sector, Settlement } from "@/lib/types";

/**
 * Reference data. Settlement names are used for realism in the demonstration
 * portal; every figure attached to them is fictional. Map positions are
 * schematic (0–100 grid) and settlement-level only.
 */
export const settlements: Settlement[] = [
  { id: "bidibidi", name: "Bidibidi", region: "West Nile", x: 42, y: 8 },
  { id: "rhino-camp", name: "Rhino Camp", region: "West Nile", x: 31, y: 20 },
  { id: "palorinya", name: "Palorinya", region: "West Nile", x: 57, y: 8 },
  { id: "adjumani", name: "Adjumani", region: "West Nile", x: 56, y: 22 },
  { id: "palabek", name: "Palabek", region: "Acholi", x: 75, y: 15 },
  { id: "kiryandongo", name: "Kiryandongo", region: "Mid-West", x: 50, y: 40 },
  { id: "kyangwali", name: "Kyangwali", region: "Mid-West", x: 26, y: 46 },
  { id: "kyaka-ii", name: "Kyaka II", region: "South-West", x: 34, y: 64 },
  { id: "rwamwanja", name: "Rwamwanja", region: "South-West", x: 22, y: 68 },
  { id: "nakivale", name: "Nakivale", region: "South-West", x: 36, y: 88 },
  { id: "kampala", name: "Kampala (urban)", region: "Central", x: 62, y: 66 },
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
