import "server-only";
import en from "./messages/en.json";
import sw from "./messages/sw.json";
import fr from "./messages/fr.json";
import ar from "./messages/ar.json";
import { defaultLocale, type Locale } from "./config";
import type { Messages } from "./core";

/**
 * Locale files are partial. A missing key, or a key listed under "_unreviewed"
 * (prefix match), falls back to English rather than showing unreviewed wording.
 * Remove a prefix from "_unreviewed" once a qualified translator has checked it.
 */
type LocaleFile = { _unreviewed?: string[] } & Record<string, unknown>;

const catalogs: Record<Locale, LocaleFile> = {
  en: en as LocaleFile,
  sw: sw as LocaleFile,
  fr: fr as LocaleFile,
  ar: ar as LocaleFile,
};

function isUnreviewed(file: LocaleFile, key: string): boolean {
  return (file._unreviewed ?? []).some((prefix) => key === prefix || key.startsWith(`${prefix}.`));
}

function merge(base: unknown, overlay: unknown, file: LocaleFile, path: string): unknown {
  if (typeof base === "string") {
    return typeof overlay === "string" && !isUnreviewed(file, path) ? overlay : base;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(base as Record<string, unknown>)) {
    const childPath = path ? `${path}.${key}` : key;
    const child = overlay && typeof overlay === "object" ? (overlay as Record<string, unknown>)[key] : undefined;
    result[key] = merge(value, child, file, childPath);
  }
  return result;
}

const cache = new Map<Locale, Messages>();

/** English-shaped dictionary with every reviewed translation for `locale` applied. */
export function getMessages(locale: Locale): Messages {
  const cached = cache.get(locale);
  if (cached) return cached;
  const messages = locale === defaultLocale ? en : (merge(en, catalogs[locale], catalogs[locale], "") as Messages);
  cache.set(locale, messages);
  return messages;
}
