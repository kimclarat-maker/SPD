import type { Metadata } from "next";
import { getTranslator } from "@/i18n/server";
import { PortalShell } from "@/components/portal/PortalShell";
import { brandFontVariables } from "@/app/fonts";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: { default: t("portal.portalName"), template: `%s · ${t("common.shortName")}` } };
}

/** The coordinator portal is client-rendered: its data lives in the browser for this prototype. */
export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <PortalShell fontClassName={brandFontVariables}>{children}</PortalShell>;
}
