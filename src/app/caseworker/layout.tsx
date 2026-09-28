import type { Metadata } from "next";
import { getTranslator } from "@/i18n/server";
import { CaseworkerShell } from "@/components/caseworker/CaseworkerShell";
import { brandFontVariables } from "@/app/fonts";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: { default: t("caseworker.portalName"), template: `%s · ${t("common.shortName")}` } };
}

/** The Caseworker Portal is client-rendered: its data lives in the browser for this prototype. */
export default function CaseworkerLayout({ children }: { children: React.ReactNode }) {
  return <CaseworkerShell fontClassName={brandFontVariables}>{children}</CaseworkerShell>;
}
