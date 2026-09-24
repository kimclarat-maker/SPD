"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  intlLocale,
  isLocale,
  localeDirection,
  LOCALE_COOKIE,
  LOCALE_STORAGE_KEY,
  type Locale,
} from "./config";
import { createTranslator, type Messages, type Translate } from "./core";

type I18nContextValue = {
  locale: Locale;
  dir: "ltr" | "rtl";
  t: Translate;
  setLocale: (next: Locale) => void;
  isSwitching: boolean;
  formatDate: (iso: string, withTime?: boolean) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function persistLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=31536000; samesite=lax`;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage can be unavailable (private mode); the cookie still carries the choice.
  }
}

export function I18nProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  const router = useRouter();
  const [isSwitching, setIsSwitching] = useState(false);

  // Restore a saved choice if the cookie was cleared but local storage survived.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (!document.cookie.includes(`${LOCALE_COOKIE}=`) && isLocale(stored) && stored !== locale) {
        persistLocale(stored);
        router.refresh();
      }
    } catch {
      // ignore
    }
  }, [locale, router]);

  useEffect(() => {
    setIsSwitching(false);
    document.documentElement.lang = locale;
    document.documentElement.dir = localeDirection[locale];
  }, [locale]);

  const setLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      persistLocale(next);
      setIsSwitching(true);
      // Server components re-render with the new cookie; client state is kept.
      router.refresh();
    },
    [locale, router],
  );

  const value = useMemo<I18nContextValue>(() => {
    const tag = intlLocale[locale];
    const dateFmt = new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: "numeric" });
    const dateTimeFmt = new Intl.DateTimeFormat(tag, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
    return {
      locale,
      dir: localeDirection[locale],
      t: createTranslator(messages),
      setLocale,
      isSwitching,
      formatDate: (iso, withTime) => (withTime ? dateTimeFmt : dateFmt).format(new Date(iso)),
      formatNumber: (n, options) => new Intl.NumberFormat(tag, options).format(n),
    };
  }, [locale, messages, setLocale, isSwitching]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}
