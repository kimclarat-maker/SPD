"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { FieldPermission } from "@/lib/types";
import { getVersion, subscribe } from "@/lib/demo/store";
import { ServiceError } from "@/lib/services/core";
import { buildFieldSnapshot, type FieldSnapshot } from "@/lib/services/fieldWork";
import { useConnectivity } from "@/lib/field/connectivity";
import { getDevice, getDeviceVersion, mutateDevice, subscribeDevice, type DeviceState } from "@/lib/field/device";
import { isSyncRunning, subscribeSyncRun } from "@/lib/field/client";

/**
 * What the field screens read. Online, it is a live read of the central
 * system (and the device cache is refreshed from it). Offline, it is the
 * device cache as of `takenAt` — screens say so, and never present cached
 * data as current.
 */
interface FieldDataValue {
  snapshot?: FieldSnapshot;
  source: "live" | "device" | "none";
  takenAt?: string;
  online: boolean;
  error?: unknown;
}

const FieldDataContext = createContext<FieldDataValue | null>(null);

const BLANK: DeviceState = { version: 1, userId: "", records: [], settings: { autoSync: false, unstable: false }, walkthrough: {} };

export function useDevice(): DeviceState {
  const version = useSyncExternalStore(subscribeDevice, getDeviceVersion, () => -1);
  return useMemo(() => (version === -1 ? BLANK : getDevice()), [version]);
}

export function useSyncRunning(): boolean {
  return useSyncExternalStore(subscribeSyncRun, isSyncRunning, () => false);
}

/** The cache never holds supervisor team data: that is read live only. */
function forCache(s: FieldSnapshot): FieldSnapshot {
  const { team: _team, ...rest } = s;
  void _team;
  return rest;
}

export function FieldDataProvider({ children }: { children: ReactNode }) {
  const { online } = useConnectivity();
  const centralVersion = useSyncExternalStore(subscribe, getVersion, () => 0);
  const device = useDevice();
  const [live, setLive] = useState<FieldSnapshot | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);

  useEffect(() => {
    if (!online) {
      setLive(undefined);
      return;
    }
    let active = true;
    buildFieldSnapshot()
      .then((s) => {
        if (!active) return;
        setLive(s);
        setError(undefined);
        try {
          mutateDevice((d) => void (d.cache = forCache(s)));
        } catch {
          // Device storage full: the live view still works; the offline copy stays older.
        }
      })
      .catch((err: unknown) => active && setError(err));
    return () => {
      active = false;
    };
  }, [online, centralVersion]);

  const value = useMemo<FieldDataValue>(() => {
    if (online && live) return { snapshot: live, source: "live", takenAt: live.takenAt, online, error };
    if (device.cache) return { snapshot: device.cache, source: "device", takenAt: device.cache.takenAt, online, error };
    return { source: "none", online, error };
  }, [online, live, device.cache, error]);

  return <FieldDataContext.Provider value={value}>{children}</FieldDataContext.Provider>;
}

export function useFieldData(): FieldDataValue {
  const value = useContext(FieldDataContext);
  if (!value) throw new Error("useFieldData must be used inside FieldDataProvider");
  return value;
}

export function useFieldCan() {
  const { snapshot } = useFieldData();
  return useCallback((p: FieldPermission) => Boolean(snapshot?.account.permissions.includes(p)), [snapshot]);
}

/** Translated message for a service or device error. */
export function useFieldErrorMessage() {
  const { t } = useI18n();
  return useCallback(
    (err: unknown) => {
      const code = err instanceof ServiceError ? err.code : "UNKNOWN";
      return t(`portal.errors.${code}` as MessageKey);
    },
    [t],
  );
}

/** Runs an action, tracking pending state and a translated message. */
export function useFieldAction() {
  const toMessage = useFieldErrorMessage();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(name: string, action: () => Promise<T> | T, successMessage?: string | ((result: T) => string)): Promise<T | undefined> => {
      setPending(name);
      setError(null);
      setSuccess(null);
      try {
        const result = await action();
        if (successMessage) setSuccess(typeof successMessage === "function" ? successMessage(result) : successMessage);
        return result;
      } catch (err) {
        setError(toMessage(err));
        return undefined;
      } finally {
        setPending(null);
      }
    },
    [toMessage],
  );
  return { run, pending, error, success, setError, setSuccess };
}
