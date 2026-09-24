import type { Metadata } from "next";
import { getTranslator } from "@/i18n/server";
import { ContentPage, ContentSection } from "@/components/site/ContentPage";
import { Notice } from "@/components/ui/Notice";
import { ButtonLink } from "@/components/ui/Button";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.about.title") };
}

export default async function AboutPage() {
  const { t } = await getTranslator();
  return (
    <ContentPage title={t("pages.about.title")} intro={t("pages.about.intro")}>
      <ContentSection title={t("pages.about.purposeTitle")}>
        <p>{t("pages.about.purposeBody")}</p>
      </ContentSection>
      <ContentSection title={t("pages.about.statusTitle")}>
        <Notice tone="simulated">{t("pages.about.statusBody")}</Notice>
        <p>{t("pages.about.noEndorsement")}</p>
      </ContentSection>
      <div>
        <ButtonLink href="/sign-in" icon="lock">
          {t("landing.hero.primary")}
        </ButtonLink>
      </div>
    </ContentPage>
  );
}
