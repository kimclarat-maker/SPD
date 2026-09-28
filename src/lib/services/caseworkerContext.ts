"use client";

import { CASEWORKER_ROLES, type UserAccount } from "@/lib/types";
import { getState } from "@/lib/demo/store";
import { getSession } from "./session";

/**
 * Access rules for the Caseworker Portal. Caseworkers use the same
 * case.monitor/case.assign actions as the OPM workspace (src/lib/services/cases.ts)
 * — the only thing specific to this portal is which cases are visible: a
 * caseworker's own team's unclaimed queue, and the cases they have claimed.
 */

export function isCaseworkerRole(role: UserAccount["role"] | undefined): boolean {
  return Boolean(role && CASEWORKER_ROLES.includes(role));
}

/** The team queue (matches ServiceCase.assignedTeam) the signed-in caseworker works from. */
export function caseworkerTeam(): string | undefined {
  const session = getSession();
  if (!session || !isCaseworkerRole(session.role)) return undefined;
  return getState().users.find((u) => u.id === session.userId)?.caseworkerTeam;
}
