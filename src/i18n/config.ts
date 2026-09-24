export const locales = ["en", "sw", "fr", "ar"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";
export const LOCALE_COOKIE = "rpcms-locale";
export const LOCALE_STORAGE_KEY = "rpcms-locale";

/** Names are always shown in their own language so a reader can find theirs. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  sw: "Kiswahili",
  fr: "Français",
  ar: "العربية",
};

export const localeDirection: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  sw: "ltr",
  fr: "ltr",
  ar: "rtl",
};

/** BCP 47 tags used for dates and numbers. Arabic keeps Latin digits so record IDs and figures read consistently. */
export const intlLocale: Record<Locale, string> = {
  en: "en-GB",
  sw: "sw-UG",
  fr: "fr-FR",
  ar: "ar-u-nu-latn",
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value);
}
