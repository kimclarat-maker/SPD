"use client";

import { useId } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { isLocale, localeNames, locales } from "@/i18n/config";
import { Icon } from "./Icon";
import styles from "./LanguageSwitcher.module.css";

export function LanguageSwitcher({ onDark = false, showLabel = false }: { onDark?: boolean; showLabel?: boolean }) {
  const { locale, setLocale, t, isSwitching } = useI18n();
  const id = useId();

  return (
    <div className={`${styles.wrap} ${onDark ? styles.onDark : ""}`}>
      <label htmlFor={id} className={showLabel ? styles.label : "visually-hidden"}>
        {t("common.language")}
      </label>
      <div className={styles.control}>
        <Icon name="globe" size={18} className={styles.globe} />
        <select
          id={id}
          className={styles.select}
          value={locale}
          aria-busy={isSwitching || undefined}
          onChange={(event) => {
            const next = event.target.value;
            if (isLocale(next)) setLocale(next);
          }}
        >
          {locales.map((code) => (
            <option key={code} value={code} lang={code}>
              {localeNames[code]}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={16} className={styles.chevron} />
      </div>
    </div>
  );
}
