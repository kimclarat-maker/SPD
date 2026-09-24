import type { Metadata } from "next";
import Link from "next/link";
import { getTranslator } from "@/i18n/server";
import { Notice } from "@/components/ui/Notice";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import styles from "../../auth.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("auth.requested.title") };
}

export default async function ResetRequestedPage() {
  const { t } = await getTranslator();
  return (
    <div className={styles.stack}>
      <div className={styles.heading}>
        <Icon name="mail" size={32} />
        <h1 className={styles.title}>{t("auth.requested.title")}</h1>
        <p className={styles.intro}>{t("auth.requested.body")}</p>
      </div>
      <Notice tone="simulated" title={t("common.simulated")}>
        {t("auth.requested.simulatedNote")}
      </Notice>
      <div className={styles.actions}>
        <ButtonLink href="/sign-in" icon="arrowLeft" fullWidth>
          {t("auth.requested.backToSignIn")}
        </ButtonLink>
        <Link href="/reset-password?token=expired" className={styles.textLink}>
          {t("auth.requested.previewExpired")}
        </Link>
      </div>
    </div>
  );
}
