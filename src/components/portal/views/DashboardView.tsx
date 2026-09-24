"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import { getDashboard } from "@/lib/services/dashboard";
import { useServiceQuery } from "@/lib/services/hooks";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader, LoadingState, Section } from "@/components/portal/PageHeader";
import { PriorityBadge } from "@/components/portal/StatusBadge";
import { AuditList } from "@/components/portal/AuditTimeline";
import { CoverageMap } from "@/components/portal/CoverageMap";
import styles from "./DashboardView.module.css";
import portal from "@/components/portal/portal.module.css";

const entityIcons: Record<string, IconName> = {
  partner: "handshake",
  intervention: "clipboard",
  fieldReport: "smartphone",
  exception: "layers",
  case: "inbox",
  report: "fileCheck",
  integration: "link",
};

export function DashboardView() {
  const { t, formatNumber } = useI18n();
  const { data } = useServiceQuery(getDashboard);

  if (!data) {
    return (
      <>
        <PageHeader title={t("portal.dashboard.title")} intro={t("portal.dashboard.intro")} />
        <LoadingState label={t("common.loading")} />
      </>
    );
  }

  const { figures, alerts, journey, recent, openExceptions } = data;
  const kpis: { label: string; value: number; href: string; icon: IconName }[] = [
    { label: t("portal.dashboard.kpiPartners"), value: figures.partnersApproved, href: "/portal/partners", icon: "handshake" },
    { label: t("portal.dashboard.kpiInterventions"), value: figures.interventionsApproved, href: "/portal/interventions", icon: "clipboard" },
    { label: t("portal.dashboard.kpiReports"), value: figures.fieldReportsAccepted, href: "/portal/field-reports", icon: "smartphone" },
    { label: t("portal.dashboard.kpiReach"), value: figures.peopleReached, href: "/portal/field-reports", icon: "users" },
    { label: t("portal.dashboard.kpiExceptions"), value: openExceptions, href: "/portal/exceptions", icon: "layers" },
    { label: t("portal.dashboard.kpiCases"), value: figures.casesOpen, href: "/portal/cases", icon: "inbox" },
  ];
  const doneCount = journey.filter((s) => s.done).length;

  return (
    <>
      <PageHeader
        title={t("portal.dashboard.title")}
        intro={t("portal.dashboard.intro")}
        meta={<span className={portal.muted}>{t("common.fictional")}</span>}
      />

      <ul className={styles.kpis} aria-label={t("portal.dashboard.title")}>
        {kpis.map((kpi) => (
          <li key={kpi.label}>
            <Link href={kpi.href} className={styles.kpi}>
              <span className={styles.kpiIcon} aria-hidden="true">
                <Icon name={kpi.icon} size={20} />
              </span>
              <span className={styles.kpiValue}>{formatNumber(kpi.value)}</span>
              <span className={styles.kpiLabel}>{kpi.label}</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className={styles.grid}>
        <Section
          title={t("portal.dashboard.alertsTitle")}
          actions={<span className={portal.muted}>{t("portal.dashboard.alertsCount", { count: alerts.length })}</span>}
        >
          {alerts.length === 0 ? (
            <p className={styles.allClear}>
              <Icon name="checkCircle" size={20} />
              {t("portal.dashboard.alertsEmpty")}
            </p>
          ) : (
            <ul className={styles.alerts}>
              {alerts.map((alert) => (
                <li key={alert.id}>
                  <Link href={alert.href} className={styles.alert}>
                    <span className={styles.alertIcon} aria-hidden="true">
                      <Icon name={entityIcons[alert.entity] ?? "alertCircle"} size={20} />
                    </span>
                    <span className={styles.alertBody}>
                      <span className={styles.alertEntity}>{t(`portal.entity.${alert.entity}` as MessageKey)}</span>
                      <span className={styles.alertText}>{t(alert.message, alert.params)}</span>
                    </span>
                    <PriorityBadge priority={alert.priority} />
                    <Icon name="chevronRight" size={18} className={styles.alertChevron} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          title={t("portal.dashboard.journeyTitle")}
          actions={
            <span className={portal.muted}>
              {doneCount}/{journey.length}
            </span>
          }
        >
          <p className={portal.muted}>{t("portal.dashboard.journeyIntro")}</p>
          <ol className={styles.journey}>
            {journey.map((step, index) => (
              <li key={step.key} className={step.done ? styles.stepDone : styles.stepPending}>
                <span className={styles.stepMark} aria-hidden="true">
                  {step.done ? <Icon name="check" size={16} /> : index + 1}
                </span>
                <Link href={step.href} className={styles.stepLink}>
                  {t(`portal.dashboard.journeySteps.${step.key}` as MessageKey)}
                </Link>
                <span className={styles.stepState}>
                  {step.done ? t("portal.dashboard.journeyDone") : t("portal.dashboard.journeyPending")}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      </div>

      <div className={styles.stackGap}>
        <Section title={t("portal.dashboard.mapTitle")}>
          <p className={portal.muted}>{t("portal.dashboard.mapIntro")}</p>
          <CoverageMap />
        </Section>

        <Section
          title={t("portal.dashboard.activityTitle")}
          actions={
            <Link href="/portal/audit" className={portal.inlineLink}>
              {t("portal.dashboard.viewAudit")}
              <Icon name="arrowRight" size={16} />
            </Link>
          }
        >
          <AuditList entries={recent} emptyLabel={t("portal.detail.timelineEmpty")} showRecord />
        </Section>
      </div>
    </>
  );
}
