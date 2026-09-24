import Link from "next/link";
import { getTranslator } from "@/i18n/server";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { Logo } from "@/components/ui/Logo";
import styles from "./SiteFooter.module.css";

export async function SiteFooter() {
  const { t } = await getTranslator();
  const links = [
    { href: "/about", label: t("footer.about") },
    { href: "/privacy", label: t("footer.privacy") },
    { href: "/accessibility", label: t("footer.accessibility") },
    { href: "/#help", label: t("footer.help") },
    { href: "/sign-in", label: t("footer.signIn") },
  ];

  return (
    <footer className={styles.footer} aria-label={t("footer.label")}>
      <div className={`container ${styles.grid}`}>
        <div className={styles.about}>
          <Logo
            onDark
            shortName={t("common.shortName")}
            fullName={t("common.systemName")}
            homeLabel={t("common.homeLink")}
            showFullName={false}
          />
          <p className={styles.name}>{t("common.systemName")}</p>
          <p className={styles.summary}>{t("footer.summary")}</p>
        </div>
        <nav aria-labelledby="footer-links-heading">
          <h2 id="footer-links-heading" className={styles.heading}>
            {t("footer.linksHeading")}
          </h2>
          <ul className={styles.links}>
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={styles.link}>
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <h2 className={styles.heading}>{t("common.language")}</h2>
          <LanguageSwitcher onDark />
        </div>
      </div>
      <div className={`container ${styles.bottom}`}>
        <p>{t("footer.prototypeNote")}</p>
      </div>
    </footer>
  );
}
