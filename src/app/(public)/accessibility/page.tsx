import type { Metadata } from "next";
import { getTranslator } from "@/i18n/server";
import { ContentPage, ContentSection, contentStyles } from "@/components/site/ContentPage";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("pages.accessibility.title") };
}

const measures = ["m1", "m2", "m3", "m4", "m5"] as const;

export default async function AccessibilityPage() {
  const { t } = await getTranslator();
  return (
    <ContentPage title={t("pages.accessibility.title")} intro={t("pages.accessibility.intro")}>
      <ContentSection title={t("pages.accessibility.measuresTitle")}>
        <ul className={contentStyles.list}>
          {measures.map((key) => (
            <li key={key}>{t(`pages.accessibility.${key}`)}</li>
          ))}
        </ul>
      </ContentSection>
      <ContentSection title={t("pages.accessibility.limitsTitle")}>
        <p>{t("pages.accessibility.limitsBody")}</p>
      </ContentSection>
      <ContentSection title={t("pages.accessibility.feedbackTitle")}>
        <p>{t("pages.accessibility.feedbackBody")}</p>
      </ContentSection>
    </ContentPage>
  );
}
