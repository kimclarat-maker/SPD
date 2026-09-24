import type { Metadata } from "next";
import { getTranslator } from "@/i18n/server";
import { ContentPage, ContentSection, contentStyles } from "@/components/site/ContentPage";
import { Notice } from "@/components/ui/Notice";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.privacy.title") };
}

const sections = ["s1", "s2", "s3", "s4", "s5"] as const;

export default async function PrivacyPage() {
  const { t } = await getTranslator();
  return (
    <ContentPage title={t("pages.privacy.title")} intro={t("pages.privacy.intro")}>
      <Notice tone="warning" title={t("common.placeholder")}>
        {t("pages.privacy.draftBanner")}
      </Notice>
      {sections.map((key) => (
        <ContentSection key={key} title={t(`pages.privacy.${key}Title`)}>
          <p className={contentStyles.placeholderText}>{t(`pages.privacy.${key}Body`)}</p>
        </ContentSection>
      ))}
    </ContentPage>
  );
}
