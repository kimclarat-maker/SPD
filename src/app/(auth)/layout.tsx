import Link from "next/link";
import { getTranslator } from "@/i18n/server";
import { Logo } from "@/components/ui/Logo";
import { Icon } from "@/components/ui/Icon";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import styles from "./auth.module.css";

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  const { t } = await getTranslator();
  return (
    <div className={styles.shell}>
      <a href="#main" className="skip-link">
        {t("common.skipToContent")}
      </a>
      <header className={styles.top}>
        <Logo shortName={t("common.shortName")} fullName={t("common.systemName")} homeLabel={t("common.homeLink")} />
        <LanguageSwitcher />
      </header>
      <main id="main" tabIndex={-1} className={styles.main}>
        <div className={styles.panel}>{children}</div>
        <Link href="/" className={styles.back}>
          <Icon name="arrowLeft" size={18} />
          {t("auth.backToSite")}
        </Link>
        <p className={styles.authorised}>
          <Icon name="lock" size={16} />
          {t("auth.authorisedOnly")}
        </p>
      </main>
    </div>
  );
}
