"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getVersion, subscribe } from "@/lib/demo/store";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import { ServiceError } from "./core";

/**
 * Runs an async service read and re-runs it whenever demo data changes.
 * With a real API this becomes a fetch plus cache invalidation after writes.
 */
export function useServiceQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = []) {
  const version = useSyncExternalStore(subscribe, getVersion, () => 0);
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetcherRef
      .current()
      .then((result) => {
        if (!active) return;
        setData(result);
        setError(null);
      })
      .catch((err: unknown) => active && setError(err))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, ...deps]);

  return { data, error, loading, notFound: error instanceof ServiceError && error.code === "NOT_FOUND" };
}

export function useErrorMessage() {
  const { t } = useI18n();
  return useCallback(
    (err: unknown) => {
      const code = err instanceof ServiceError ? err.code : "UNKNOWN";
      return t(`portal.errors.${code}` as MessageKey);
    },
    [t],
  );
}

/** Runs a service write, tracking pending state and a translated error or success message. */
export function useServiceAction() {
  const toMessage = useErrorMessage();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const run = useCallback(
    async (name: string, action: () => Promise<unknown>, successMessage?: string): Promise<boolean> => {
      setPending(name);
      setError(null);
      setSuccess(null);
      try {
        await action();
        if (successMessage) setSuccess(successMessage);
        return true;
      } catch (err) {
        setError(toMessage(err));
        return false;
      } finally {
        setPending(null);
      }
    },
    [toMessage],
  );

  return { run, pending, error, success, clear: () => (setError(null), setSuccess(null)) };
}
