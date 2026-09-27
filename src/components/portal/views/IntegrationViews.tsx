"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { IntegrationRun, RunOutcome } from "@/lib/types";
import { getIntegration, isRetryable, listIntegrations, retryRun, testConnection, type IntegrationRow } from "@/lib/services/integrations";
import { recordHref, recordLabel } from "@/lib/services/lookup";
import { getState } from "@/lib/demo/store";
import { useCan, useErrorMessage, useServiceAction, useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { FieldGrid, RecordPage, RecordSection } from "@/components/portal/RecordPage";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, statusLabelKey, useStatusOptions } from "@/components/portal/StatusBadge";
import { ErrorState, PermissionDenied, RecordNotFound, SimulatedTag } from "@/components/portal/RecordBits";
import { Notice } from "@/components/ui/Notice";
import { Button } from "@/components/ui/Button";
import styles from "@/components/portal/portal.module.css";

const outcomes: RunOutcome[] = ["success", "timeout", "mismatch", "partial", "unavailable", "inconclusive"];

export function IntegrationsListView() {
  const { t, formatDate, formatNumber } = useI18n();
  const toMessage = useErrorMessage();
  const { data, loading, error, forbidden } = useServiceQuery(listIntegrations);
  const statusOptions = useStatusOptions("integration", ["healthy", "degraded", "failing", "paused"]);

  if (forbidden) {
    return (
      <>
        <PageHeader title={t("portal.integrations.title")} />
        <PermissionDenied />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("portal.integrations.title")} intro={t("portal.integrations.intro")} meta={<SimulatedTag />} />
      <Notice tone="simulated" title={t("common.simulated")}>
        {t("portal.integrations.simulatedNotice")}
      </Notice>
      <RecordTable<IntegrationRow>
        rows={data}
        loading={loading}
        error={error ? toMessage(error) : null}
        caption={t("portal.integrations.title")}
        searchText={(i) => `${i.name} ${i.owner} ${i.purpose}`}
        statusOptions={statusOptions}
        columns={[
          {
            key: "name",
            header: t("portal.integrations.integration"),
            primary: true,
            render: (i) => (
              <>
                <Link href={`/portal/integrations/${i.id}`} className={styles.recordLink}>
                  {i.name}
                </Link>
                <span className={styles.ref}>{i.owner}</span>
              </>
            ),
          },
          { key: "purpose", header: t("portal.integrations.purpose"), render: (i) => <span className={styles.clamp}>{i.purpose}</span> },
          {
            key: "attempt",
            header: t("portal.integrations.lastAttempt"),
            sortValue: (i) => i.lastAttempt?.at ?? "",
            render: (i) =>
              i.lastAttempt ? (
                <>
                  <StatusBadge entity="run" status={i.lastAttempt.outcome} />
                  <span className={styles.ref}>{formatDate(i.lastAttempt.at, true)}</span>
                </>
              ) : (
                "—"
              ),
          },
          { key: "success", header: t("portal.integrations.lastSuccess"), sortValue: (i) => i.lastSuccess?.at ?? "", render: (i) => (i.lastSuccess ? formatDate(i.lastSuccess.at, true) : "—") },
          { key: "records", header: t("portal.integrations.records30"), numeric: true, sortValue: (i) => i.recordsProcessed, render: (i) => formatNumber(i.recordsProcessed) },
          { key: "errors", header: t("portal.integrations.errors30"), numeric: true, sortValue: (i) => i.errors30d, render: (i) => formatNumber(i.errors30d) },
          { key: "status", header: t("portal.integrations.health"), sortValue: (i) => i.status, render: (i) => <StatusBadge entity="integration" status={i.status} /> },
        ]}
      />
    </>
  );
}

function RunsTable({ runs, canRetry }: { runs: IntegrationRun[]; canRetry: boolean }) {
  const { t, formatDate, formatNumber } = useI18n();
  const retry = useServiceAction();
  const state = getState();
  const statusOptions = useStatusOptions("run", outcomes);
  return (
    <div className={styles.stack}>
      <RecordTable<IntegrationRun & { status: string }>
        rows={runs.map((r) => ({ ...r, status: r.outcome }))}
        caption={t("portal.integrations.history")}
        searchText={(r) => `${r.operation} ${r.message}`}
        statusOptions={statusOptions}
        columns={[
          {
            key: "at",
            header: t("portal.integrations.when"),
            primary: true,
            sortValue: (r) => r.at,
            render: (r) => (
              <>
                <span className={styles.nowrap}>{formatDate(r.at, true)}</span>
                <span className={styles.ref}>{t(`portal.integrations.triggers.${r.trigger}` as MessageKey)}</span>
              </>
            ),
          },
          {
            key: "op",
            header: t("portal.integrations.operation"),
            render: (r) => {
              const href = r.related ? recordHref(r.related.entity, r.related.id) : null;
              const label = r.related ? recordLabel(r.related.entity, r.related.id) : null;
              return (
                <>
                  {r.operation}
                  <span className={styles.ref}>{r.message}</span>
                  {href && label && (
                    <Link href={href} className={styles.small}>
                      {label.ref}
                    </Link>
                  )}
                  {r.retryOf && <span className={styles.ref}>{t("portal.integrations.retryOfLabel")}</span>}
                </>
              );
            },
          },
          { key: "records", header: t("portal.integrations.records"), numeric: true, render: (r) => formatNumber(r.records) },
          { key: "errors", header: t("portal.integrations.errors"), numeric: true, render: (r) => formatNumber(r.errors) },
          { key: "duration", header: t("portal.integrations.duration"), numeric: true, render: (r) => `${(r.durationMs / 1000).toFixed(1)} s` },
          {
            key: "outcome",
            header: t("portal.integrations.outcome"),
            sortValue: (r) => r.outcome,
            render: (r) => (
              <>
                <StatusBadge entity="run" status={r.outcome} />
                {canRetry && isRetryable(state, r) && (
                  <span className={styles.warnLine}>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon="refresh"
                      disabled={Boolean(retry.pending)}
                      aria-busy={retry.pending === r.id || undefined}
                      onClick={() => retry.run(r.id, () => retryRun(r.id), (o) => t("portal.integrations.retryDone", { outcome: t(statusLabelKey("run", String(o))) }))}
                    >
                      {retry.pending === r.id ? t("common.loading") : t("portal.integrations.retry")}
                    </Button>
                  </span>
                )}
              </>
            ),
          },
        ]}
      />
      <div aria-live="polite">{retry.success && <Notice tone="success">{retry.success}</Notice>}</div>
      {retry.error && (
        <Notice tone="error" role="alert">
          {retry.error}
        </Notice>
      )}
    </div>
  );
}

export function IntegrationDetailView({ id }: { id: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const can = useCan();
  const toMessage = useErrorMessage();
  const { data, notFound, forbidden, error } = useServiceQuery(() => getIntegration(id), [id]);

  if (forbidden) return <PermissionDenied />;
  if (notFound) return <RecordNotFound backHref="/portal/integrations" />;
  if (error) return <ErrorState message={toMessage(error)} />;
  if (!data) return <LoadingState label={t("common.loading")} />;
  const { integration: i, runs, exchanges } = data;
  const failures = runs.filter((r) => r.outcome !== "success");

  return (
    <RecordPage
      back={{ href: "/portal/integrations", label: t("portal.integrations.back") }}
      eyebrow={`${t("portal.entity.integration")} · ${i.owner}`}
      title={i.name}
      badges={
        <>
          <StatusBadge entity="integration" status={i.status} />
          <SimulatedTag />
        </>
      }
      meta={[t(`portal.integrations.directions.${i.direction}` as MessageKey), i.lastAttempt ? `${t("portal.integrations.lastAttempt")} ${formatDate(i.lastAttempt.at, true)}` : null].filter(Boolean).join(" · ")}
      notices={<Notice tone="simulated" title={t("common.simulated")}>{t("portal.integrations.simulatedNotice")}</Notice>}
      actions={[
        {
          key: "test",
          label: t("portal.integrations.test"),
          icon: "activity",
          noNote: true,
          denied: !can("integration.retry"),
          hint: t("common.simulatedLong"),
          success: t("portal.integrations.testDone"),
          run: () => testConnection(i.id),
        },
      ]}
      timelineId={i.id}
      tabs={[
        {
          id: "health",
          label: t("portal.integrations.healthTab"),
          content: (
            <RecordSection title={t("portal.integrations.healthTab")}>
              <p>{i.purpose}</p>
              <FieldGrid
                items={[
                  { label: t("portal.integrations.owner"), value: i.owner },
                  { label: t("portal.integrations.direction"), value: t(`portal.integrations.directions.${i.direction}` as MessageKey) },
                  { label: t("portal.integrations.health"), value: <StatusBadge entity="integration" status={i.status} /> },
                  { label: t("portal.integrations.lastAttempt"), value: i.lastAttempt ? `${formatDate(i.lastAttempt.at, true)} — ${t(statusLabelKey("run", i.lastAttempt.outcome))}` : "—" },
                  { label: t("portal.integrations.lastSuccess"), value: i.lastSuccess ? formatDate(i.lastSuccess.at, true) : "—" },
                  { label: t("portal.integrations.records30"), value: formatNumber(i.recordsProcessed) },
                  { label: t("portal.integrations.errors30"), value: formatNumber(i.errors30d) },
                  { label: t("portal.integrations.failedRuns"), value: formatNumber(i.failedRuns) },
                ]}
              />
            </RecordSection>
          ),
        },
        {
          id: "history",
          label: t("portal.integrations.history"),
          count: runs.length,
          content: (
            <RecordSection title={t("portal.integrations.history")}>
              <RunsTable runs={runs} canRetry={can("integration.retry")} />
            </RecordSection>
          ),
        },
        {
          id: "errors",
          label: t("portal.integrations.errorsTab"),
          count: failures.length,
          content: (
            <RecordSection title={t("portal.integrations.errorsTab")}>
              {failures.length === 0 ? (
                <p className={styles.muted}>{t("portal.integrations.noErrors")}</p>
              ) : (
                <ul className={styles.rowList}>
                  {failures.map((r) => (
                    <li key={r.id} className={styles.rowItem}>
                      <span className={styles.rowMain}>
                        <span>{r.operation}</span>
                        <span className={styles.ref}>
                          {formatDate(r.at, true)} · {r.message}
                        </span>
                      </span>
                      <StatusBadge entity="run" status={r.outcome} />
                    </li>
                  ))}
                </ul>
              )}
            </RecordSection>
          ),
        },
        ...(i.id === "amp" || i.id === "nimes"
          ? [
              {
                id: "exchanges",
                label: t("portal.integrations.exchanges"),
                count: exchanges.length,
                content: (
                  <RecordSection title={t("portal.integrations.exchanges")}>
                    {exchanges.length === 0 ? (
                      <p className={styles.muted}>{t("portal.integrations.noExchanges")}</p>
                    ) : (
                      <ul className={styles.rowList}>
                        {exchanges.map((e) => (
                          <li key={e.id} className={styles.rowItem}>
                            <span className={styles.rowMain}>
                              <Link href={`/portal/reports/${e.reportId}`} className={styles.recordLink}>
                                {recordLabel("report", e.reportId)?.ref ?? e.reportId}
                              </Link>
                              <span className={styles.ref}>
                                {e.period} · {t("portal.integrations.recordsCount", { count: e.records })}
                                {e.submittedAt && ` · ${formatDate(e.submittedAt, true)}`}
                              </span>
                            </span>
                            <StatusBadge entity="exchange" status={e.status} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </RecordSection>
                ),
              },
            ]
          : []),
      ]}
    />
  );
}
