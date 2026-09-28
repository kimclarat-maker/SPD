"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import { listMyCases, listMyQueue, isOverdue, type CaseRow } from "@/lib/services/cases";
import { useServiceQuery } from "@/lib/services/hooks";
import { caseworkerTeam } from "@/lib/services/caseworkerContext";
import { settlementName } from "@/lib/services/lookup";
import { PageHeader, Section, LoadingState } from "@/components/portal/PageHeader";
import { StatTile } from "@/components/portal/charts/Charts";
import { PriorityBadge, StatusBadge } from "@/components/portal/StatusBadge";
import portal from "@/components/portal/portal.module.css";
import styles from "./CaseworkerViews.module.css";

function Preview({ rows, emptyLabel }: { rows: CaseRow[]; emptyLabel: string }) {
  const { t, formatDate } = useI18n();
  if (rows.length === 0) return <p className={portal.muted}>{emptyLabel}</p>;
  return (
    <ul className={portal.rowList}>
      {rows.slice(0, 5).map((c) => (
        <li key={c.id} className={portal.rowItem}>
          <Link href={`/caseworker/cases/${c.id}`} className={`${portal.rowMain} ${portal.recordLink}`}>
            <span className={portal.monoInline}>{c.ref}</span> · {t(`portal.cases.types.${c.serviceType}` as never)} · {settlementName(c.settlementId)}
          </Link>
          <PriorityBadge priority={c.priority} />
          <StatusBadge entity="case" status={c.status} />
          {c.overdue && <span className={portal.small}>{t("portal.common.overdue")} · {formatDate(c.dueAt)}</span>}
        </li>
      ))}
    </ul>
  );
}

export function DashboardView() {
  const { t, formatNumber } = useI18n();
  const team = caseworkerTeam();
  const { data: queue, loading: loadingQueue } = useServiceQuery(listMyQueue);
  const { data: cases, loading: loadingCases } = useServiceQuery(listMyCases);

  if (loadingQueue || loadingCases || !queue || !cases) return <LoadingState label={t("common.loading")} />;

  const overdueCount = cases.filter((c) => isOverdue(c)).length;

  return (
    <>
      <PageHeader title={t("caseworker.dashboard.title")} intro={t("caseworker.dashboard.intro", { team: team ?? t("caseworker.noTeam") })} />

      <ul className={styles.tiles} aria-label={t("caseworker.dashboard.title")}>
        <li>
          <StatTile label={t("caseworker.dashboard.queueCount")} value={formatNumber(queue.length)} />
        </li>
        <li>
          <StatTile label={t("caseworker.dashboard.myCasesCount")} value={formatNumber(cases.length)} />
        </li>
        <li>
          <StatTile label={t("portal.common.overdue")} value={formatNumber(overdueCount)} />
        </li>
      </ul>

      <Section title={t("caseworker.nav.queue")} actions={<Link href="/caseworker/queue" className={portal.inlineLink}>{t("caseworker.dashboard.viewAll")}</Link>}>
        <Preview rows={queue} emptyLabel={t("caseworker.queue.empty")} />
      </Section>

      <Section title={t("caseworker.nav.myCases")} actions={<Link href="/caseworker/cases" className={portal.inlineLink}>{t("caseworker.dashboard.viewAll")}</Link>}>
        <Preview rows={cases} emptyLabel={t("caseworker.myCases.empty")} />
      </Section>
    </>
  );
}
