"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { IntegrationStatus } from "@/lib/types";
import { getIntegration, listIntegrations, listOutbox, retryIntegration } from "@/lib/services/integrations";
import { recordHref } from "@/lib/services/audit";
import { useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, Section, LoadingState } from "@/components/portal/PageHeader";
import { FieldGrid, RecordPage, RecordSection } from "@/components/portal/RecordPage";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, statusLabelKey } from "@/components/portal/StatusBadge";
import { AuditTimeline } from "@/components/portal/AuditTimeline";
import { RecordNotFound } from "@/components/portal/RecordBits";
import { Notice } from "@/components/ui/Notice";
import { Badge } from "@/components/ui/Badge";
import styles from "@/components/portal/portal.module.css";

const statuses: IntegrationStatus[] = ["healthy", "delayed", "paused"];

function Outbox() {
  const { t, formatDate } = useI18n();
  const { data } = useServiceQuery(listOutbox);
  const rows = data ?? [];
  return (
    <Section title={t("portal.integrations.outbox")} actions={<Badge tone="simulated">{t("common.simulated")}</Badge>}>
      <p className={styles.muted}>{t("portal.integrations.outboxIntro")}</p>
      {rows.length === 0 ? (
        <p className={styles.muted}>{t("portal.integrations.outboxEmpty")}</p>
      ) : (
        <div className={styles.tableScroll} role="region" aria-label={t("portal.integrations.outbox")} tabIndex={0}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col">{t("portal.audit.time")}</th>
                <th scope="col">{t("portal.integrations.kind")}</th>
                <th scope="col">{t("portal.integrations.recipient")}</th>
                <th scope="col">{t("portal.integrations.message")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((m) => {
                const href = recordHref(m.entity, m.entityId);
                return (
                  <tr key={m.id}>
                    <td>{formatDate(m.at, true)}</td>
                    <td>{t(`portal.outboxKinds.${m.kind}` as MessageKey)}</td>
                    <td>{m.recipient}</td>
                    <td>{href ? <Link href={href}>{m.message}</Link> : m.message}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

export function IntegrationsListView() {
  const { t, formatDate } = useI18n();
  const { data, loading } = useServiceQuery(listIntegrations);
  return (
    <>
      <PageHeader title={t("portal.integrations.title")} intro={t("portal.integrations.intro")} meta={<Badge tone="simulated">{t("common.simulated")}</Badge>} />
      <div className={styles.stack}>
        <RecordTable
          rows={data}
          loading={loading}
          caption={t("portal.integrations.title")}
          searchText={(i) => `${i.name} ${i.ref}`}
          statusOptions={statuses.map((s) => ({ value: s, label: t(statusLabelKey("integration", s)) }))}
          columns={[
            {
              key: "name",
              header: t("portal.table.name"),
              primary: true,
              render: (i) => (
                <>
                  <Link href={`/portal/integrations/${i.id}`} className={styles.recordLink}>
                    {i.name}
                  </Link>
                  <span className={styles.ref}>{i.ref}</span>
                </>
              ),
            },
            { key: "direction", header: t("portal.integrations.direction"), render: (i) => i.direction },
            { key: "status", header: t("portal.table.status"), render: (i) => <StatusBadge entity="integration" status={i.status} /> },
            { key: "sync", header: t("portal.integrations.lastSync"), render: (i) => formatDate(i.lastSyncAt, true) },
          ]}
        />
        <Outbox />
      </div>
    </>
  );
}

export function IntegrationDetailView({ id }: { id: string }) {
  const { t, formatDate } = useI18n();
  const { data, notFound } = useServiceQuery(() => getIntegration(id), [id]);

  if (notFound) return <RecordNotFound backHref="/portal/integrations" />;
  if (!data) return <LoadingState label={t("common.loading")} />;
  const { integration } = data;

  return (
    <RecordPage
      back={{ href: "/portal/integrations", label: t("portal.detail.back") }}
      eyebrow={`${t("portal.entity.integration")} · ${integration.ref}`}
      title={integration.name}
      badges={
        <>
          <StatusBadge entity="integration" status={integration.status} />
          <Badge tone="simulated">{t("common.simulated")}</Badge>
        </>
      }
      meta={[integration.direction, `${t("portal.integrations.lastSync")} ${formatDate(integration.lastSyncAt, true)}`].join(" · ")}
      actions={[
        {
          key: "retry",
          label: t("portal.integrations.retry"),
          tone: integration.status === "delayed" ? "primary" : "neutral",
          icon: "refresh",
          noNote: true,
          hint: t("common.simulatedLong"),
          success: t("portal.integrations.retryDone"),
          run: () => retryIntegration(integration.id),
        },
      ]}
      tabs={[
        {
          id: "overview",
          label: t("portal.detail.overview"),
          content: (
            <RecordSection title={t("portal.detail.overview")}>
              <p>{integration.description}</p>
              <FieldGrid
                items={[
                  { label: t("portal.integrations.direction"), value: integration.direction },
                  { label: t("portal.integrations.lastSync"), value: formatDate(integration.lastSyncAt, true) },
                ]}
              />
              <Notice tone="simulated">{t("common.simulatedLong")}</Notice>
            </RecordSection>
          ),
        },
        {
          id: "history",
          label: t("portal.detail.timeline"),
          content: (
            <RecordSection title={t("portal.detail.timeline")}>
              <AuditTimeline entityId={integration.id} />
            </RecordSection>
          ),
        },
      ]}
    />
  );
}
