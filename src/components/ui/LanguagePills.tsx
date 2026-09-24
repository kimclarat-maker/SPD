"use client";

import { useI18n } from "@/i18n/I18nProvider";
import { localeNames, locales } from "@/i18n/config";
import styles from "./LanguagePills.module.css";

/**
 * Segmented language toggle used on the landing page. Each option shows a
 * short code and is announced with the language's own name.
 */
export function LanguagePills({ onDark = false, stretch = false }: { onDark?: boolean; stretch?: boolean }) {
  const { locale, setLocale, t, isSwitching } = useI18n();

  return (
    <div
      role="group"
      aria-label={t("common.language")}
      aria-busy={isSwitching || undefined}
      className={`${styles.pills} ${onDark ? styles.onDark : ""} ${stretch ? styles.stretch : ""}`}
    >
      {locales.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          className={styles.pill}
          aria-pressed={code === locale}
          aria-label={localeNames[code]}
          onClick={() => setLocale(code)}
        >
          {code.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
