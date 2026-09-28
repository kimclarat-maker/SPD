import type { FieldPermission, PartnerPermission, Permission, RoleId, Sector, SectorDef, ServicePoint, Settlement } from "@/lib/types";

/**
 * Starting reference data. Settlement and district names are used for
 * realism; every figure attached to them is fictional. Map positions are
 * schematic (0–100 grid) and `lat`/`lng` are approximate, publicly known
 * settlement locations — settlement-level only, never an individual location.
 * Administrators can change this reference data in the portal; the live copy
 * lives in the demo state.
 */
export const baseSettlements: Settlement[] = [
  { id: "bidibidi", name: "Bidibidi", district: "Yumbe", region: "West Nile", x: 42, y: 8, lat: 3.5333, lng: 31.3667, active: true },
  { id: "rhino-camp", name: "Rhino Camp", district: "Terego", region: "West Nile", x: 31, y: 20, lat: 3.0167, lng: 31.3833, active: true },
  { id: "palorinya", name: "Palorinya", district: "Obongi", region: "West Nile", x: 57, y: 8, lat: 3.35, lng: 31.65, active: true },
  { id: "adjumani", name: "Adjumani", district: "Adjumani", region: "West Nile", x: 56, y: 22, lat: 3.3, lng: 31.7833, active: true },
  { id: "palabek", name: "Palabek", district: "Lamwo", region: "Acholi", x: 75, y: 15, lat: 3.35, lng: 32.65, active: true },
  { id: "kiryandongo", name: "Kiryandongo", district: "Kiryandongo", region: "Mid-West", x: 50, y: 40, lat: 1.95, lng: 32.1, active: true },
  { id: "kyangwali", name: "Kyangwali", district: "Kikuube", region: "Mid-West", x: 26, y: 46, lat: 1.15, lng: 30.65, active: true },
  { id: "kyaka-ii", name: "Kyaka II", district: "Kyegegwa", region: "South-West", x: 34, y: 64, lat: 0.85, lng: 30.55, active: true },
  { id: "rwamwanja", name: "Rwamwanja", district: "Kamwenge", region: "South-West", x: 22, y: 68, lat: 0.6167, lng: 30.5833, active: true },
  { id: "nakivale", name: "Nakivale", district: "Isingiro", region: "South-West", x: 36, y: 88, lat: -0.75, lng: 30.9333, active: true },
  { id: "kampala", name: "Kampala (urban)", district: "Kampala", region: "Central", x: 62, y: 66, lat: 0.3476, lng: 32.5825, active: true },
];

export const sectorIds: Sector[] = ["health", "wash", "education", "livelihoods", "protection", "shelter"];

/** Sector names are record data (English) in this phase; translate when reference data moves to the API. */
export const baseSectors: SectorDef[] = [
  { id: "health", name: "Health", active: true },
  { id: "wash", name: "Water, sanitation and hygiene", active: true },
  { id: "education", name: "Education", active: true },
  { id: "livelihoods", name: "Livelihoods", active: true },
  { id: "protection", name: "Protection", active: true },
  { id: "shelter", name: "Shelter", active: true },
];

/** Public facilities only. Offsets are small so points sit around the settlement centre. */
export const baseServicePoints: ServicePoint[] = [
  { id: "sp-nkv-hc", name: "Nakivale Base Camp Health Centre III", settlementId: "nakivale", type: "health_facility", lat: -0.765, lng: 30.925 },
  { id: "sp-nkv-juru", name: "Juru outreach point", settlementId: "nakivale", type: "distribution_point", lat: -0.79, lng: 30.97 },
  { id: "sp-nkv-rub", name: "Rubondo outreach point", settlementId: "nakivale", type: "distribution_point", lat: -0.71, lng: 30.9 },
  { id: "sp-nkv-wp", name: "Nakivale water point cluster B", settlementId: "nakivale", type: "water_point", lat: -0.74, lng: 30.95 },
  { id: "sp-nkv-rc", name: "Nakivale reception centre", settlementId: "nakivale", type: "reception_centre", lat: -0.755, lng: 30.94 },
  { id: "sp-bdb-wp", name: "Bidibidi zone 3 water points", settlementId: "bidibidi", type: "water_point", lat: 3.55, lng: 31.38 },
  { id: "sp-rhc-dp", name: "Rhino Camp Ocea distribution point", settlementId: "rhino-camp", type: "distribution_point", lat: 3.03, lng: 31.4 },
  { id: "sp-kyg-hc", name: "Kyangwali Health Centre IV", settlementId: "kyangwali", type: "health_facility", lat: 1.16, lng: 30.66 },
  { id: "sp-plb-hd", name: "Palabek protection desk", settlementId: "palabek", type: "help_desk", lat: 3.36, lng: 32.66 },
  { id: "sp-adj-sch", name: "Adjumani learning centre 4", settlementId: "adjumani", type: "school", lat: 3.31, lng: 31.79 },
  { id: "sp-kyk-sch", name: "Kyaka II learning centre 2", settlementId: "kyaka-ii", type: "school", lat: 0.86, lng: 30.56 },
  { id: "sp-kir-wp", name: "Kiryandongo borehole site 7", settlementId: "kiryandongo", type: "water_point", lat: 1.96, lng: 32.11 },
  { id: "sp-rwm-hc", name: "Rwamwanja Health Centre III", settlementId: "rwamwanja", type: "health_facility", lat: 0.62, lng: 30.59 },
  { id: "sp-kla-hd", name: "Kampala urban help desk", settlementId: "kampala", type: "help_desk", lat: 0.35, lng: 32.58 },
  { id: "sp-plr-dp", name: "Palorinya distribution point 2", settlementId: "palorinya", type: "distribution_point", lat: 3.36, lng: 31.66 },
];

/** Operational teams that refugee service cases can be assigned to. Fictional. */
export const baseTeams = [
  "Nakivale registration desk",
  "Nakivale protection desk",
  "Kampala RSD unit",
  "West Nile documentation team",
  "Kiryandongo settlement office",
  "National ID issuance unit",
];

export const allPermissions: Permission[] = [
  "partner.review",
  "partner.decide",
  "intervention.review",
  "intervention.decide",
  "field.review",
  "forms.manage",
  "beneficiary.aggregate",
  "beneficiary.review",
  "case.monitor",
  "case.assign",
  "document.review",
  "document.sign",
  "report.generate",
  "report.export",
  "report.submit",
  "integration.view",
  "integration.retry",
  "audit.view",
  "admin.users",
  "admin.reference",
  "admin.security",
];

/**
 * Operational roles. Technical security settings (admin.security) are kept
 * off the coordinator role on purpose. Case-level access to a requester's
 * personal details is never part of a role: it is granted per case, with a
 * recorded reason. Partner and field roles hold no OPM permission; their
 * access is set by partnerPermissions and fieldPermissions below. The
 * caseworker role works the same case.monitor/case.assign actions as OPM,
 * scoped to their own team's queue by the Caseworker Portal's service layer.
 */
export const rolePermissions: Record<RoleId, Permission[]> = {
  opm_coordinator: allPermissions.filter((p) => p !== "admin.security"),
  me_officer: [
    "beneficiary.aggregate",
    "forms.manage",
    "case.monitor",
    "report.generate",
    "report.export",
    "integration.view",
    "audit.view",
  ],
  system_admin: ["admin.users", "admin.reference", "admin.security", "integration.view", "integration.retry", "audit.view"],
  partner_focal: [],
  field_officer: [],
  field_supervisor: [],
  caseworker: ["case.monitor", "case.assign"],
  // Partner Portal roles hold no OPM permission; their access is set by partnerPermissions below.
  partner_admin: [],
  partner_staff: [],
};

/** Partner Portal roles. Their users belong to one organisation and see only its records. */
export const partnerRoles: RoleId[] = ["partner_admin", "partner_staff"];

/** Held by every partner administrator and never delegable to staff. */
export const partnerAdminOnly: PartnerPermission[] = ["profile.edit", "documents.manage", "proposals.manage", "team.manage"];

/** What an administrator can delegate to partner staff (and holds by default). */
export const partnerDelegable: PartnerPermission[] = [
  "progress.update",
  "fieldReports.submit",
  "surveys.collect",
  "beneficiaries.verify",
  "assistance.record",
  "finance.submit",
  "reports.export",
  "agreements.sign",
];

export const plannedRoles: RoleId[] = ["partner_focal"];

/** Caseworker Portal roles. Their users see only their own team's case queue and claimed cases. */
export const caseworkerRoles: RoleId[] = ["caseworker"];

/** Field Operations Portal roles. Their users see only assigned settlements, interventions and tasks. */
export const fieldRoles: RoleId[] = ["field_officer", "field_supervisor"];

/** Every field officer can report visits, collect surveys and raise issues and referrals. */
export const fieldOfficerBase: FieldPermission[] = ["visits.report", "surveys.collect", "issues.raise", "referrals.create"];

/** Granted only to officers authorised to deliver assistance under the approved process. */
export const fieldAssistancePermissions: FieldPermission[] = ["beneficiaries.verify", "assistance.record"];

/** Supervisors review and assign work within their settlement. */
export const fieldSupervisorPermissions: FieldPermission[] = ["work.assign", "work.review"];

export const allFieldPermissions: FieldPermission[] = [...fieldOfficerBase, ...fieldAssistancePermissions, ...fieldSupervisorPermissions];
