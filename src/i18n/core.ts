import type en from "./messages/en.json";

export type Messages = typeof en;

type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

/** Every valid translation key, e.g. "portal.nav.dashboard". */
export type MessageKey = Leaves<Messages>;

export type TranslateVars = Record<string, string | number>;
export type Translate = (key: MessageKey, vars?: TranslateVars) => string;

export function lookup(source: unknown, key: string): string | undefined {
  let node: unknown = source;
  for (const part of key.split(".")) {
    if (node && typeof node === "object" && part in (node as Record<string, unknown>)) {
      node = (node as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(template: string, vars?: TranslateVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

/** Messages are already resolved for one locale (see catalog.ts), so lookup never needs another file. */
export function createTranslator(messages: Messages): Translate {
  return (key, vars) => interpolate(lookup(messages, key) ?? key, vars);
}
