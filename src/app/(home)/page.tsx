import Link from "next/link";
import { getTranslator } from "@/i18n/server";
import type { MessageKey } from "@/i18n/core";
import { ButtonLink } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ProductPreview } from "@/components/site/ProductPreview";
import { HeroVideo } from "@/components/landing/HeroVideo";
import styles from "./landing.module.css";

const steps: { n: "1" | "2" | "3" | "4" | "5" | "6" | "7"; icon: IconName }[] = [
  { n: "1", icon: "handshake" },
  { n: "2", icon: "clipboard" },
  { n: "3", icon: "smartphone" },
  { n: "4", icon: "shield" },
  { n: "5", icon: "inbox" },
  { n: "6", icon: "barChart" },
  { n: "7", icon: "fileCheck" },
];

const capabilities: { key: "partners" | "gis" | "forms" | "assistance" | "services" | "reporting"; icon: IconName }[] = [
  { key: "partners", icon: "handshake" },
  { key: "gis", icon: "map" },
  { key: "forms", icon: "smartphone" },
  { key: "assistance", icon: "layers" },
  { key: "services", icon: "inbox" },
  { key: "reporting", icon: "barChart" },
];

const audiences: { key: "opm" | "partners" | "field" | "refugees"; icon: IconName; available: boolean }[] = [
  { key: "opm", icon: "building", available: true },
  { key: "partners", icon: "handshake", available: false },
  { key: "field", icon: "smartphone", available: false },
  { key: "refugees", icon: "users", available: false },
];

const privacyPoints: { key: "body1" | "body2" | "body3"; icon: IconName }[] = [
  { key: "body1", icon: "lock" },
  { key: "body2", icon: "eyeOff" },
  { key: "body3", icon: "shield" },
];

const faqs = ["1", "2", "3", "4"] as const;

export default async function LandingPage() {
  const { t } = await getTranslator();

  return (
    <>
      <div className={styles.heroWrap}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <HeroVideo src="/media/hero-background.mp4" />
          <div className={`${styles.container} ${styles.heroGrid}`}>
            <div className={styles.heroText}>
              <p className={styles.heroEyebrow}>{t("landing.hero.eyebrow")}</p>
              <h1 id="hero-title" className={styles.heroTitle}>
                {t("landing.hero.title")}
              </h1>
              <p className={styles.lead}>{t("landing.hero.body")}</p>
              <div className={styles.heroActions}>
                <ButtonLink href="/sign-in" className={styles.heroPrimary}>
                  {t("landing.hero.primary")}
                </ButtonLink>
                <ButtonLink href="#how-it-works" variant="onDark" className={styles.heroSecondary}>
                  {t("landing.hero.secondary")}
                </ButtonLink>
              </div>
            </div>
            <div className={styles.heroPreview}>
              <ProductPreview t={t} />
            </div>
          </div>
        </section>
      </div>

      <section id="how-it-works" className={styles.section} aria-labelledby="process-title">
        <div className={styles.container}>
          <SectionHeading
            centered
            eyebrow={t("landing.process.eyebrow")}
            title={t("landing.process.title")}
            intro={t("landing.process.intro")}
            id="process-title"
          />
          <ol className={styles.steps}>
            {steps.map((step) => (
              <li key={step.n} className={styles.step}>
                <span className={styles.stepIcon} aria-hidden="true">
                  <Icon name={step.icon} size={22} />
                </span>
                <p className={styles.stepNumber}>{step.n.padStart(2, "0")}</p>
                <h3 className={styles.stepTitle}>{t(`landing.process.steps.${step.n}.title` as MessageKey)}</h3>
                <p className={styles.stepText}>{t(`landing.process.steps.${step.n}.body` as MessageKey)}</p>
                <p className={styles.handoff}>
                  <Icon name="arrowRight" size={14} />
                  <span>
                    <span className="visually-hidden">{t("landing.process.handoff")}: </span>
                    {t(`landing.process.steps.${step.n}.next` as MessageKey)}
                  </span>
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="capabilities" className={styles.section} aria-labelledby="capabilities-title">
        <div className={styles.container}>
          <SectionHeading
            eyebrow={t("landing.capabilities.eyebrow")}
            title={t("landing.capabilities.title")}
            id="capabilities-title"
          />
          <ul className={styles.cardGrid}>
            {capabilities.map((item) => (
              <li key={item.key} className={styles.card}>
                <span className={styles.cardIcon} aria-hidden="true">
                  <Icon name={item.icon} size={22} />
                </span>
                <h3 className={styles.cardTitle}>{t(`landing.capabilities.items.${item.key}.title`)}</h3>
                <p className={styles.cardText}>{t(`landing.capabilities.items.${item.key}.body`)}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="who-it-serves" className={styles.section} aria-labelledby="audiences-title">
        <div className={styles.container}>
          <SectionHeading
            centered
            eyebrow={t("landing.audiences.eyebrow")}
            title={t("landing.audiences.title")}
            intro={t("landing.audiences.intro")}
            id="audiences-title"
          />
          <p className={styles.releaseNote}>
            <Icon name="info" size={20} />
            <span>{t("landing.audiences.firstRelease")}</span>
          </p>
          <ul className={styles.audienceGrid}>
            {audiences.map((audience) => (
              <li
                key={audience.key}
                className={`${styles.audience} ${audience.available ? styles.audienceAvailable : styles.audiencePlanned}`}
              >
                <div className={styles.audienceHead}>
                  <span className={styles.cardIcon} aria-hidden="true">
                    <Icon name={audience.icon} size={22} />
                  </span>
                  {audience.available ? (
                    <Badge tone="success">{t("common.available")}</Badge>
                  ) : (
                    <Badge tone="planned">{t("common.planned")}</Badge>
                  )}
                </div>
                <h3 className={styles.audienceTitle}>{t(`landing.audiences.${audience.key}.title`)}</h3>
                <p className={styles.cardText}>{t(`landing.audiences.${audience.key}.body`)}</p>
                {audience.available && (
                  <Link href="/sign-in" className={styles.audienceLink}>
                    {t("landing.audiences.signInOpm")}
                    <Icon name="arrowRight" size={18} />
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <div className={styles.bandWrap}>
        <section id="privacy" className={styles.band} aria-labelledby="privacy-title">
          <div className={styles.container}>
            <p className={styles.bandEyebrow}>{t("landing.privacy.eyebrow")}</p>
            <h2 id="privacy-title" className={styles.bandTitle}>
              {t("landing.privacy.title")}
            </h2>
            <ul className={styles.bandGrid}>
              {privacyPoints.map((point) => (
                <li key={point.key} className={styles.bandItem}>
                  <span className={styles.bandIcon} aria-hidden="true">
                    <Icon name={point.icon} size={18} />
                  </span>
                  <span>{t(`landing.privacy.${point.key}`)}</span>
                </li>
              ))}
            </ul>
            <Link href="/privacy" className={styles.bandLink}>
              {t("landing.privacy.link")}
              <Icon name="arrowRight" size={18} />
            </Link>
          </div>
        </section>
      </div>

      <section id="help" className={`${styles.section} ${styles.sectionLast}`} aria-labelledby="faq-title">
        <div className={styles.container}>
          <SectionHeading centered small eyebrow={t("landing.faq.eyebrow")} title={t("landing.faq.title")} id="faq-title" />
          <div className={styles.faqGrid}>
            {faqs.map((n) => (
              <details key={n} className={styles.faq}>
                <summary>
                  <span>{t(`landing.faq.q${n}`)}</span>
                  <Icon name="chevronDown" size={20} className={styles.faqChevron} />
                </summary>
                <p>{t(`landing.faq.a${n}`)}</p>
              </details>
            ))}
            <div className={styles.contact}>
              <h3 className={styles.cardTitle}>{t("landing.faq.contactTitle")}</h3>
              <p className={styles.cardText}>{t("landing.faq.contactBody")}</p>
              <p className={styles.placeholder}>
                <Badge tone="warning" icon="pen">
                  {t("common.placeholder")}
                </Badge>
                <span>{t("landing.faq.contactPlaceholder")}</span>
              </p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function SectionHeading({
  eyebrow,
  title,
  intro,
  id,
  centered = false,
  small = false,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  id: string;
  centered?: boolean;
  small?: boolean;
}) {
  return (
    <div className={`${styles.heading} ${centered ? styles.headingCentered : ""}`}>
      <p className={styles.eyebrow}>{eyebrow}</p>
      <h2 id={id} className={`${styles.sectionTitle} ${small ? styles.sectionTitleSmall : ""}`}>
        {title}
      </h2>
      {intro && <p className={styles.sectionIntro}>{intro}</p>}
    </div>
  );
}
