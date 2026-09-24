import Link from "next/link";
import { getTranslator } from "@/i18n/server";
import { Logo } from "@/components/ui/Logo";
import { LanguagePills } from "@/components/ui/LanguagePills";
import styles from "./LandingFooter.module.css";

export async function LandingFooter() {
  const { t } = await getTranslator();
  const links = [
    { href: "/about", label: t("footer.about") },
    { href: "/privacy", label: t("footer.privacy") },
    { href: "/accessibility", label: t("footer.accessibility") },
    { href: "#help", label: t("footer.help") },
    { href: "/sign-in", label: t("footer.signIn") },
  ];

  return (
    <footer className={styles.footer} aria-label={t("footer.label")}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <div className={styles.brand}>
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
          <nav aria-labelledby="landing-footer-links" className={styles.column}>
            <h2 id="landing-footer-links" className={styles.heading}>
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
        </div>
        <div className={styles.bottom}>
          <p>{t("footer.prototypeNote")}</p>
          <LanguagePills onDark />
        </div>
      </div>
    </footer>
  );
}
