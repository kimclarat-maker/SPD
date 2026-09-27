import type { Metadata, Viewport } from "next";
import { getTranslator } from "@/i18n/server";
import { FieldShell } from "@/components/field/FieldShell";
import { brandFontVariables } from "@/app/fonts";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return {
    title: { default: t("field.portalName"), template: `%s · ${t("common.shortName")}` },
    manifest: "/field.webmanifest",
    appleWebApp: { capable: true, title: t("field.portalShort"), statusBarStyle: "black-translucent" },
    icons: { apple: "/field-icons/icon-192.png" },
  };
}

export const viewport: Viewport = {
  themeColor: "#142B3B",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/**
 * Field Operations Portal. Client-rendered, mobile-first and installable. Its
 * screens read the device store first, so they keep working without a
 * connection once the service worker has cached them (production build).
 */
export default function FieldLayout({ children }: { children: React.ReactNode }) {
  return <FieldShell fontClassName={brandFontVariables}>{children}</FieldShell>;
}
