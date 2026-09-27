import type { Metadata } from "next";
import { getTranslator } from "@/i18n/server";
import { PartnerShell } from "@/components/partner/PartnerShell";
import { brandFontVariables } from "@/app/fonts";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: { default: t("partner.portalName"), template: `%s · ${t("common.shortName")}` } };
}

/** The Partner Portal is client-rendered: its data lives in the browser for this prototype. */
export default function PartnerLayout({ children }: { children: React.ReactNode }) {
  return <PartnerShell fontClassName={brandFontVariables}>{children}</PartnerShell>;
}
