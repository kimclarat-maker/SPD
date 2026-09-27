"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { PartnerPermission, RoleId } from "@/lib/types";
import { getVersion, subscribe } from "@/lib/demo/store";
import { getSession } from "@/lib/services/session";
import { partnerCan, partnerContext } from "@/lib/services/partnerContext";
import { ServiceError } from "@/lib/services/core";

/** Partner permission check for showing or disabling controls. The partner services enforce the same rule. */
export function usePartnerCan() {
  const version = useSyncExternalStore(subscribe, getVersion, () => 0);
  return useCallback((permission: PartnerPermission) => {
    void version;
    return partnerCan(permission);
  }, [version]);
}

export interface PartnerIdentity {
  userId: string;
  name: string;
  role: RoleId;
  isAdmin: boolean;
  partnerId: string;
  organisation: string;
}

/**
 * The signed-in partner user. `undefined` while the session is being read,
 * `null` if the session no longer maps to an active user of the organisation.
 */
export function usePartnerIdentity(): PartnerIdentity | null | undefined {
  const version = useSyncExternalStore(subscribe, getVersion, () => 0);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return useMemo(() => {
    void version;
    if (!mounted) return undefined;
    const session = getSession();
    if (!session?.partnerId) return undefined;
    try {
      const ctx = partnerContext();
      return {
        userId: ctx.user.id,
        name: ctx.user.name,
        role: ctx.user.role,
        isAdmin: ctx.isAdmin,
        partnerId: ctx.partner.id,
        organisation: ctx.partner.acronym ? `${ctx.partner.name} (${ctx.partner.acronym})` : ctx.partner.name,
      };
    } catch {
      return null;
    }
  }, [version, mounted]);
}

/** Errors that mean "not yours" in the Partner Portal. */
export function isPartnerDenied(error: unknown): boolean {
  return error instanceof ServiceError && ["FORBIDDEN", "NOT_PARTNER_RECORD", "OUT_OF_SCOPE"].includes(error.code);
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ServiceError && error.code === "NOT_FOUND";
}
