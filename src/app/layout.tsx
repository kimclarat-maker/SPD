import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { I18nProvider } from "@/i18n/I18nProvider";
import { getLocale } from "@/i18n/server";
import { getMessages } from "@/i18n/catalog";
import { localeDirection } from "@/i18n/config";

// Latin subsets only; Arabic uses the system Arabic font stack defined in globals.css.
const inter = Inter({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

export async function generateMetadata(): Promise<Metadata> {
  const messages = getMessages(await getLocale());
  return {
    title: {
      default: `${messages.common.shortName} — ${messages.common.systemName}`,
      template: `%s · ${messages.common.shortName}`,
    },
    description: messages.landing.hero.body,
    robots: { index: false, follow: false },
  };
}

export const viewport: Viewport = {
  themeColor: "#142B3B",
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();
  return (
    <html lang={locale} dir={localeDirection[locale]} className={inter.variable}>
      <body>
        <I18nProvider locale={locale} messages={getMessages(locale)}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
