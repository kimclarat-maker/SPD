"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { CaseStatus } from "@/lib/types";
import { listMyCases, listMyQueue, claimCase, type CaseRow } from "@/lib/services/cases";
import { settlementName } from "@/lib/services/lookup";
import { useServiceAction, useServiceQuery } from "@/lib/services/hooks";
import { PageHeader } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { PriorityBadge, StatusBadge, useStatusOptions } from "@/components/portal/StatusBadge";
import { Button } from "@/components/ui/Button";
import styles from "@/components/portal/portal.module.css";

const queueStatuses: CaseStatus[] = ["received", "assigned"];
const myCaseStatuses: CaseStatus[] = ["received", "assigned", "in_progress", "awaiting_info", "resolved", "closed"];

function QueueClaimButton({ id }: { id: string }) {
  const { t } = useI18n();
  const { run, pending } = useServiceAction();
  return (
    <Button variant="secondary" size="sm" icon="user" disabled={Boolean(pending)} onClick={() => run("claim", () => claimCase(id))}>
      {t("portal.cases.claim")}
    </Button>
  );
}

export function QueueView() {
  const { t, formatDate } = useI18n();
  const { data, loading } = useServiceQuery(listMyQueue);
  const statusOptions = useStatusOptions("case", queueStatuses);

  return (
    <>
      <PageHeader title={t("caseworker.queue.title")} intro={t("caseworker.queue.intro")} />
      <RecordTable<CaseRow>
        rows={data}
        loading={loading}
        caption={t("caseworker.queue.title")}
        emptyLabel={t("caseworker.queue.empty")}
        searchText={(c) => `${c.ref} ${t(`portal.cases.types.${c.serviceType}` as MessageKey)} ${settlementName(c.settlementId)}`}
        statusOptions={statusOptions}
        columns={[
          {
            key: "ref",
            header: t("portal.table.reference"),
            primary: true,
            sortValue: (c) => c.ref,
            render: (c) => (
              <Link href={`/caseworker/cases/${c.id}`} className={`${styles.recordLink} ${styles.monoInline}`}>
                {c.ref}
              </Link>
            ),
          },
          { key: "type", header: t("portal.cases.serviceType"), sortValue: (c) => c.serviceType, render: (c) => t(`portal.cases.types.${c.serviceType}` as MessageKey) },
          { key: "settlement", header: t("portal.filters.settlement"), render: (c) => settlementName(c.settlementId) },
          { key: "priority", header: t("portal.cases.priority"), sortValue: (c) => ({ high: 0, medium: 1, low: 2 })[c.priority], render: (c) => <PriorityBadge priority={c.priority} /> },
          { key: "received", header: t("portal.cases.received"), sortValue: (c) => c.receivedAt, render: (c) => formatDate(c.receivedAt) },
          { key: "due", header: t("portal.cases.due"), sortValue: (c) => c.dueAt, render: (c) => formatDate(c.dueAt) },
          { key: "claim", header: "", render: (c) => <QueueClaimButton id={c.id} /> },
        ]}
      />
    </>
  );
}

export function MyCasesView() {
  const { t, formatDate } = useI18n();
  const { data, loading } = useServiceQuery(listMyCases);
  const statusOptions = useStatusOptions("case", myCaseStatuses);

  return (
    <>
      <PageHeader title={t("caseworker.myCases.title")} intro={t("caseworker.myCases.intro")} />
      <RecordTable<CaseRow>
        rows={data}
        loading={loading}
        caption={t("caseworker.myCases.title")}
        emptyLabel={t("caseworker.myCases.empty")}
        searchText={(c) => `${c.ref} ${t(`portal.cases.types.${c.serviceType}` as MessageKey)} ${settlementName(c.settlementId)}`}
        statusOptions={statusOptions}
        columns={[
          {
            key: "ref",
            header: t("portal.table.reference"),
            primary: true,
            sortValue: (c) => c.ref,
            render: (c) => (
              <Link href={`/caseworker/cases/${c.id}`} className={`${styles.recordLink} ${styles.monoInline}`}>
                {c.ref}
              </Link>
            ),
          },
          { key: "type", header: t("portal.cases.serviceType"), sortValue: (c) => c.serviceType, render: (c) => t(`portal.cases.types.${c.serviceType}` as MessageKey) },
          { key: "settlement", header: t("portal.filters.settlement"), render: (c) => settlementName(c.settlementId) },
          { key: "priority", header: t("portal.cases.priority"), sortValue: (c) => ({ high: 0, medium: 1, low: 2 })[c.priority], render: (c) => <PriorityBadge priority={c.priority} /> },
          {
            key: "due",
            header: t("portal.cases.due"),
            sortValue: (c) => c.dueAt,
            render: (c) => (
              <>
                {formatDate(c.dueAt)}
                {c.overdue && <span className={styles.warnLine}>{t("portal.common.overdue")}</span>}
              </>
            ),
          },
          { key: "status", header: t("portal.table.status"), sortValue: (c) => myCaseStatuses.indexOf(c.status), render: (c) => <StatusBadge entity="case" status={c.status} /> },
        ]}
      />
    </>
  );
}
