import { getTranslator } from "@/i18n/server";
import { ButtonLink } from "@/components/ui/Button";
import styles from "./not-found.module.css";

export default async function NotFound() {
  const { t } = await getTranslator();
  return (
    <main id="main" className={styles.wrap}>
      <p className={styles.code}>404</p>
      <h1>{t("common.notFoundTitle")}</h1>
      <p className={styles.body}>{t("common.notFoundBody")}</p>
      <ButtonLink href="/" icon="arrowLeft" variant="secondary">
        {t("common.backToHome")}
      </ButtonLink>
    </main>
  );
}
