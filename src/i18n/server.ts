import "server-only";
import { cookies } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";
import { getMessages } from "./catalog";
import { createTranslator, type Translate } from "./core";

export async function getLocale(): Promise<Locale> {
  const value = (await cookies()).get(LOCALE_COOKIE)?.value;
  return isLocale(value) ? value : defaultLocale;
}

/** For server components: translate in the visitor's saved language. */
export async function getTranslator(): Promise<{ locale: Locale; t: Translate }> {
  const locale = await getLocale();
  return { locale, t: createTranslator(getMessages(locale)) };
}
