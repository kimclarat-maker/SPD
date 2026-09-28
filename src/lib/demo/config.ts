import type { RoleId } from "@/lib/types";
import { CASEWORKER_USERS, DEMO_USERS, FIELD_USERS, PARTNER_USERS } from "./seed";

/**
 * Demonstration mode is opt-in through NEXT_PUBLIC_RPCMS_DEMO=true (see .env).
 * When it is off, the demonstration accounts do not exist and sign-in is refused.
 */
export const DEMO_ENABLED = process.env.NEXT_PUBLIC_RPCMS_DEMO === "true";

export interface DemoAccount {
  userId: string;
  username: string;
  password: string;
  displayName: string;
  role: RoleId;
  /** Which workspace the account opens. Defaults to the OPM Oversight Portal. */
  portal?: "opm" | "partner" | "field" | "caseworker";
}

/** Fictional accounts for the prototype walkthrough. Not real credentials. */
export const demoAccounts: DemoAccount[] = DEMO_ENABLED
  ? [
      {
        userId: DEMO_USERS.coordinator,
        username: "coordinator.demo",
        password: "Demo-Coordinator-2026",
        displayName: "Demo Coordinator (fictional)",
        role: "opm_coordinator",
      },
      {
        userId: DEMO_USERS.analyst,
        username: "analyst.demo",
        password: "Demo-Analyst-2026",
        displayName: "Demo M&E Analyst (fictional)",
        role: "me_officer",
      },
      {
        userId: PARTNER_USERS.admin,
        username: "partner.admin.demo",
        password: "Demo-Partner-2026",
        displayName: "A. Nakato (fictional)",
        role: "partner_admin",
        portal: "partner",
      },
      {
        userId: PARTNER_USERS.staff,
        username: "partner.staff.demo",
        password: "Demo-Staff-2026",
        displayName: "D. Mugisha (fictional)",
        role: "partner_staff",
        portal: "partner",
      },
      {
        userId: PARTNER_USERS.suspended,
        username: "partner.suspended.demo",
        password: "Demo-Suspended-2026",
        displayName: "E. Draru (fictional)",
        role: "partner_admin",
        portal: "partner",
      },
      {
        userId: FIELD_USERS.officer,
        username: "field.officer.demo",
        password: "Demo-Field-2026",
        displayName: "P. Achan (fictional)",
        role: "field_officer",
        portal: "field",
      },
      {
        userId: FIELD_USERS.supervisor,
        username: "field.supervisor.demo",
        password: "Demo-Supervisor-2026",
        displayName: "S. Kato (fictional)",
        role: "field_supervisor",
        portal: "field",
      },
      {
        userId: CASEWORKER_USERS.registrar,
        username: "caseworker.demo",
        password: "Demo-Caseworker-2026",
        displayName: "Demo Caseworker (fictional)",
        role: "caseworker",
        portal: "caseworker",
      },
    ]
  : [];

/** The primary account, shown first on the sign-in screen. */
export const demoAccount = demoAccounts[0] ?? null;
