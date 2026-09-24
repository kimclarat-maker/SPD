import type { Metadata } from "next";
import { getTranslator } from "@/i18n/server";
import { ButtonLink } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import styles from "../auth.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getTranslator();
  return { title: t("auth.expired.title") };
}

/**
 * The prototype issues no real reset tokens, so every reset link resolves to
 * the expired state. A live build would validate the token server-side here.
 */
export default async function ResetPasswordPage() {
  const { t } = await getTranslator();
  return (
    <div className={styles.stack}>
      <div className={styles.heading}>
        <Icon name="clock" size={32} />
        <h1 className={styles.title}>{t("auth.expired.title")}</h1>
        <p className={styles.intro}>{t("auth.expired.body")}</p>
      </div>
      <div className={styles.actions}>
        <ButtonLink href="/forgot-password" fullWidth>
          {t("auth.expired.requestNew")}
        </ButtonLink>
        <ButtonLink href="/sign-in" variant="secondary" icon="arrowLeft" fullWidth>
          {t("auth.expired.backToSignIn")}
        </ButtonLink>
      </div>
    </div>
  );
}
