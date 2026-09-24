"use client";

import { useI18n } from "@/i18n/I18nProvider";
import { intlLocale } from "@/i18n/config";
import type { MessageKey } from "@/i18n/core";
import { sectorNames } from "@/lib/demo/reference";
import { getAnalytics } from "@/lib/services/analytics";
import { useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { statusLabelKey } from "@/components/portal/StatusBadge";
import { BarList, ChartCard, ColumnChart, ProgressList, StatTile, TipBody } from "@/components/portal/charts/Charts";
import { Badge } from "@/components/ui/Badge";
import styles from "./AnalyticsView.module.css";

export function AnalyticsView() {
  const { t, formatNumber, formatDate, locale } = useI18n();
  const axisDate = new Intl.DateTimeFormat(intlLocale[locale], { day: "numeric", month: "short" });
  const { data } = useServiceQuery(() => getAnalytics(30));

  const header = (
    <PageHeader
      title={t("portal.analytics.title")}
      intro={t("portal.analytics.intro")}
      meta={<Badge tone="neutral">{t("common.fictional")}</Badge>}
    />
  );
  if (!data) {
    return (
      <>
        {header}
        <LoadingState label={t("common.loading")} />
      </>
    );
  }

  const usd = (n: number) => formatNumber(n, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const usdCompact = (n: number) => formatNumber(n, { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
  const num = (n: number) => formatNumber(n);
  const groupLabel = (g: "women" | "men" | "children") => t(`portal.fieldReports.${g}` as MessageKey);
  const noData = t("portal.analytics.noData");

  return (
    <>
      {header}

      <div className={styles.tiles}>
        <StatTile label={t("portal.analytics.tileBudget")} value={usdCompact(data.totals.budgetApprovedUsd)} note={usd(data.totals.budgetApprovedUsd)} />
        <StatTile label={t("portal.analytics.tileReach")} value={num(data.totals.peopleReached)} />
        <StatTile
          label={t("portal.analytics.tileReports")}
          value={num(data.totals.reportsAccepted)}
          note={t("portal.analytics.reportsOf", { accepted: data.totals.reportsAccepted, total: data.totals.reportsTotal })}
        />
        <StatTile label={t("portal.analytics.tileCases")} value={num(data.totals.casesOpen)} />
      </div>

      <div className={styles.grid}>
        <ChartCard
          title={t("portal.analytics.budgetBySector")}
          subtitle={t("portal.analytics.budgetBySectorSub")}
          table={{
            caption: t("portal.analytics.budgetBySector"),
            columns: [t("portal.interventions.sector"), t("portal.interventions.budget"), t("portal.analytics.interventionsCount")],
            rows: data.budgetBySector.map((r) => [sectorNames[r.sector], usd(r.value), num(r.interventions)]),
          }}
        >
          <BarList
            emptyLabel={noData}
            rows={data.budgetBySector.map((r) => ({
              key: r.sector,
              label: sectorNames[r.sector],
              value: r.value,
              valueLabel: usdCompact(r.value),
              tip: (
                <TipBody
                  value={usd(r.value)}
                  label={sectorNames[r.sector]}
                  rows={[{ label: t("portal.analytics.interventionsCount"), value: num(r.interventions) }]}
                />
              ),
            }))}
          />
        </ChartCard>

        <ChartCard
          title={t("portal.analytics.reachBySettlement")}
          subtitle={t("portal.analytics.reachBySettlementSub")}
          table={{
            caption: t("portal.analytics.reachBySettlement"),
            columns: [
              t("portal.dashboard.mapSettlement"),
              groupLabel("women"),
              groupLabel("men"),
              groupLabel("children"),
              t("portal.analytics.total"),
            ],
            rows: data.reachBySettlement.map((r) => [r.name, num(r.women), num(r.men), num(r.children), num(r.total)]),
          }}
        >
          <BarList
            emptyLabel={noData}
            rows={data.reachBySettlement.map((r) => ({
              key: r.settlementId,
              label: r.name,
              value: r.total,
              valueLabel: num(r.total),
              tip: (
                <TipBody
                  value={num(r.total)}
                  label={r.name}
                  rows={(["women", "men", "children"] as const).map((g) => ({ label: groupLabel(g), value: num(r[g]) }))}
                />
              ),
            }))}
          />
        </ChartCard>

        <ChartCard
          title={t("portal.analytics.reachByGroup")}
          subtitle={t("portal.analytics.reachByGroupSub")}
          table={{
            caption: t("portal.analytics.reachByGroup"),
            columns: [t("portal.analytics.group"), t("portal.fieldReports.reached")],
            rows: data.reachByGroup.map((r) => [groupLabel(r.group), num(r.value)]),
          }}
        >
          <BarList
            emptyLabel={noData}
            rows={data.reachByGroup.map((r) => ({ key: r.group, label: groupLabel(r.group), value: r.value, valueLabel: num(r.value) }))}
          />
        </ChartCard>

        <ChartCard
          title={t("portal.analytics.casesByStatus")}
          subtitle={t("portal.analytics.casesByStatusSub")}
          table={{
            caption: t("portal.analytics.casesByStatus"),
            columns: [t("portal.table.status"), t("portal.analytics.count")],
            rows: data.casesByStatus.map((r) => [t(statusLabelKey("case", r.status)), num(r.value)]),
          }}
        >
          <BarList
            emptyLabel={noData}
            rows={data.casesByStatus.map((r) => ({
              key: r.status,
              label: t(statusLabelKey("case", r.status)),
              value: r.value,
              valueLabel: num(r.value),
            }))}
          />
        </ChartCard>

        <ChartCard
          wide
          title={t("portal.analytics.reachVsTarget")}
          subtitle={t("portal.analytics.reachVsTargetSub")}
          table={{
            caption: t("portal.analytics.reachVsTarget"),
            columns: [t("portal.fieldReports.intervention"), t("portal.fieldReports.reached"), t("portal.analytics.target"), "%"],
            rows: data.reachVsTarget.map((r) => [
              `${r.title} (${r.ref})`,
              num(r.reached),
              num(r.target),
              formatNumber(r.target ? r.reached / r.target : 0, { style: "percent", maximumFractionDigits: 0 }),
            ]),
          }}
        >
          <ProgressList
            targetLabel={t("portal.analytics.targetMarker")}
            rows={data.reachVsTarget.map((r) => ({
              key: r.id,
              label: r.title,
              sub: r.ref,
              value: r.reached,
              target: r.target,
              valueLabel: t("portal.analytics.ofTarget", {
                reached: num(r.reached),
                target: num(r.target),
                percent: formatNumber(r.target ? r.reached / r.target : 0, { style: "percent", maximumFractionDigits: 0 }),
              }),
            }))}
          />
        </ChartCard>

        <ChartCard
          wide
          title={t("portal.analytics.activity")}
          subtitle={t("portal.analytics.activitySub")}
          table={{
            caption: t("portal.analytics.activity"),
            columns: [t("portal.analytics.day"), t("portal.analytics.events")],
            rows: data.activityByDay.map((p) => [formatDate(p.day), num(p.value)]),
          }}
        >
          <ColumnChart
            ariaLabel={t("portal.analytics.activityAria", {
              total: num(data.activityByDay.reduce((sum, p) => sum + p.value, 0)),
              days: data.activityByDay.length,
            })}
            points={data.activityByDay.map((p) => ({ key: p.day, label: formatDate(p.day), value: p.value }))}
            formatX={(key) => axisDate.format(new Date(key))}
            tipLabel={(value) => t("portal.analytics.eventsCount", { count: num(value) })}
          />
        </ChartCard>
      </div>
    </>
  );
}
