"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import { getDashboard, type AttentionKind } from "@/lib/services/dashboard";
import type { RecordFilters } from "@/lib/services/filters";
import { sectorName } from "@/lib/services/lookup";
import { useServiceQuery } from "@/lib/services/hooks";
import { Icon, type IconName } from "@/components/ui/Icon";
import { PageHeader, LoadingState, Section } from "@/components/portal/PageHeader";
import { PriorityBadge } from "@/components/portal/StatusBadge";
import { AuditList } from "@/components/portal/AuditTimeline";
import { CoverageMap } from "@/components/portal/CoverageMap";
import { FilterBar, useRecordFilters } from "@/components/portal/FilterBar";
import { EmptyState, ErrorState, UpdatedAt } from "@/components/portal/RecordBits";
import { ProgressList } from "@/components/portal/charts/Charts";
import { useErrorMessage } from "@/lib/services/hooks";
import styles from "./DashboardView.module.css";
import portal from "@/components/portal/portal.module.css";

const entityIcons: Record<string, IconName> = {
  partner: "handshake",
  intervention: "clipboard",
  fieldReport: "smartphone",
  review: "users",
  case: "inbox",
  document: "fileText",
  report: "fileCheck",
  integration: "link",
};

const metricIcons: Record<string, IconName> = {
  partners: "handshake",
  interventions: "activity",
  fieldReports: "smartphone",
  flagged: "flag",
  cases: "inbox",
  overdue: "clock",
  completeness: "checkCircle",
};

type AttentionFilter = "all" | "overdue" | AttentionKind;
const attentionFilters: AttentionFilter[] = ["all", "overdue", "application", "proposal", "partnerUpdate", "expiry", "lateReport", "fieldReview", "duplicate", "overdueCase", "milestone", "exchange"];

export function DashboardView({ initialFilters, initialAttention }: { initialFilters: RecordFilters; initialAttention?: string }) {
  const { t, formatNumber } = useI18n();
  const toMessage = useErrorMessage();
  const [kind, setKind] = useState<AttentionFilter>(attentionFilters.includes(initialAttention as AttentionFilter) ? (initialAttention as AttentionFilter) : "all");
  const extra = useCallback(() => ({ attention: kind === "all" ? undefined : kind }), [kind]);
  const [filters, setFilters] = useRecordFilters(initialFilters, extra);
  const { data, error } = useServiceQuery(() => getDashboard(filters), [JSON.stringify(filters)]);

  const header = (
    <PageHeader
      title={t("portal.dashboard.title")}
      intro={t("portal.dashboard.intro")}
      meta={
        <>
          <span className={portal.muted}>{t("common.fictional")}</span>
          {data && <UpdatedAt at={data.generatedAt} />}
        </>
      }
    />
  );

  if (error) {
    return (
      <>
        {header}
        <ErrorState message={toMessage(error)} onRetry={() => setFilters({ ...filters })} />
      </>
    );
  }

  const attention = (data?.attention ?? []).filter((a) => kind === "all" || (kind === "overdue" ? a.overdue : a.kind === kind));
  const kindCount = (k: AttentionFilter) => (data?.attention ?? []).filter((a) => k === "all" || (k === "overdue" ? a.overdue : a.kind === k)).length;

  return (
    <>
      {header}
      <FilterBar value={filters} onChange={setFilters} />

      {!data ? (
        <LoadingState label={t("common.loading")} />
      ) : (
        <>
          <ul className={styles.kpis} aria-label={t("portal.dashboard.metricsLabel")}>
            {data.metrics.map((m) => (
              <li key={m.key}>
                <Link href={m.href} className={styles.kpi}>
                  <span className={styles.kpiTop}>
                    <span className={styles.kpiLabel}>{t(`portal.dashboard.metrics.${m.key}` as MessageKey)}</span>
                    <Icon name={metricIcons[m.key]} size={18} className={styles.kpiIcon} />
                  </span>
                  <span className={styles.kpiValue}>
                    {formatNumber(m.value)}
                    {m.percent && "%"}
                  </span>
                  {m.key === "overdue" && m.detail && (
                    <span className={styles.kpiDetail}>{t("portal.dashboard.overdueDetail", m.detail)}</span>
                  )}
                  {m.key === "completeness" && m.detail && (
                    <span className={styles.kpiDetail}>{t("portal.dashboard.completenessDetail", m.detail)}</span>
                  )}
                  <UpdatedAt at={m.updatedAt} />
                </Link>
              </li>
            ))}
          </ul>

          <div className={styles.grid}>
            <Section
              id="attention"
              title={t("portal.dashboard.attentionTitle")}
              actions={<span className={portal.muted}>{t("portal.dashboard.attentionCount", { count: attention.length })}</span>}
            >
              <div className={styles.chips} role="group" aria-label={t("portal.dashboard.attentionFilter")}>
                {attentionFilters
                  .filter((k) => k === "all" || kindCount(k) > 0 || k === kind)
                  .map((k) => (
                    <button
                      key={k}
                      type="button"
                      className={styles.chip}
                      aria-pressed={kind === k}
                      onClick={() => {
                        setKind(k);
                        setFilters({ ...filters });
                      }}
                    >
                      {t(`portal.dashboard.attentionKinds.${k}` as MessageKey)}
                      <span className={styles.chipCount}>{kindCount(k)}</span>
                    </button>
                  ))}
              </div>
              {attention.length === 0 ? (
                <EmptyState icon="checkCircle" title={t("portal.dashboard.attentionEmpty")} />
              ) : (
                <ul className={styles.alerts}>
                  {attention.map((item) => (
                    <li key={item.id}>
                      <Link href={item.href} className={styles.alert}>
                        <span className={styles.alertIcon} aria-hidden="true">
                          <Icon name={entityIcons[item.entity] ?? "alertCircle"} size={18} />
                        </span>
                        <span className={styles.alertBody}>
                          <span className={styles.alertEntity}>{t(`portal.dashboard.attentionKinds.${item.kind}` as MessageKey)}</span>
                          <span className={styles.alertText}>{t(`portal.attention.${item.message}` as MessageKey, item.params)}</span>
                        </span>
                        <PriorityBadge priority={item.priority} />
                        <Icon name="chevronRight" size={18} className={styles.alertChevron} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              title={t("portal.dashboard.walkthroughTitle")}
              actions={
                <span className={portal.muted}>
                  {data.walkthrough.filter((s) => s.done).length}/{data.walkthrough.length}
                </span>
              }
            >
              <p className={`${portal.muted} ${portal.small}`}>{t("portal.dashboard.walkthroughIntro")}</p>
              <ol className={styles.journey}>
                {data.walkthrough.map((step, index) => (
                  <li key={step.key} className={step.done ? styles.stepDone : styles.stepPending}>
                    <span className={styles.stepMark} aria-hidden="true">
                      {step.done ? <Icon name="check" size={14} /> : index + 1}
                    </span>
                    <Link href={step.href} className={styles.stepLink}>
                      {t(`portal.dashboard.walkthrough.${step.key}` as MessageKey)}
                    </Link>
                    <span className={styles.stepState}>{step.done ? t("portal.checks.done") : t("portal.checks.pending")}</span>
                  </li>
                ))}
              </ol>
            </Section>
          </div>

          <div className={styles.lower}>
            <Section title={t("portal.dashboard.mapTitle")} actions={<Link href="/portal/gis" className={portal.inlineLink}>{t("portal.dashboard.openGis")}</Link>}>
              <CoverageMap filters={filters} compact />
            </Section>

            <Section title={t("portal.dashboard.sectorTitle")}>
              {data.sectors.length === 0 ? (
                <p className={portal.muted}>{t("portal.table.empty")}</p>
              ) : (
                <ProgressList
                  targetLabel={t("portal.dashboard.sectorTarget")}
                  rows={data.sectors.map((s) => ({
                    key: s.sector,
                    label: sectorName(s.sector),
                    sub: t("portal.dashboard.sectorSub", { count: s.interventions, reached: formatNumber(s.reached) }),
                    value: s.percent,
                    target: 100,
                    valueLabel: `${s.percent}%`,
                  }))}
                />
              )}
              <p className={`${portal.small} ${portal.muted}`}>{t("portal.dashboard.sectorNote")}</p>
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
              <AuditList entries={data.recent} emptyLabel={t("portal.detail.timelineEmpty")} showRecord />
            </Section>
          </div>
        </>
      )}
    </>
  );
}
