"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { ExceptionReason, ExceptionStatus } from "@/lib/types";
import { settlementName } from "@/lib/demo/reference";
import { decideException, getException, listExceptions } from "@/lib/services/exceptions";
import { useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, statusLabelKey } from "@/components/portal/StatusBadge";
import { FieldGrid, RecordPage, RecordSection, type RecordAction } from "@/components/portal/RecordPage";
import { progressFor } from "@/components/portal/progress";
import { AuditTimeline } from "@/components/portal/AuditTimeline";
import { RecordNotFound } from "@/components/portal/RecordBits";
import { Notice } from "@/components/ui/Notice";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import styles from "@/components/portal/portal.module.css";

const statuses: ExceptionStatus[] = ["waiting", "open", "escalated", "cleared", "duplicate"];

const reasonKeys: Record<ExceptionReason, MessageKey> = {
  duplicate: "portal.exceptions.reasonDuplicate",
  mismatch: "portal.exceptions.reasonMismatch",
  missing: "portal.exceptions.reasonMissing",
};

export function ExceptionsListView() {
  const { t, formatDate } = useI18n();
  const { data, loading } = useServiceQuery(listExceptions);

  return (
    <>
      <PageHeader title={t("portal.exceptions.title")} intro={t("portal.exceptions.intro")} />
      <RecordTable
        rows={data}
        loading={loading}
        caption={t("portal.exceptions.title")}
        searchText={(e) => `${e.ref} ${e.householdRef} ${e.fieldReportRef}`}
        statusOptions={statuses.map((s) => ({ value: s, label: t(statusLabelKey("exception", s)) }))}
        columns={[
          {
            key: "ref",
            header: t("portal.table.reference"),
            primary: true,
            render: (e) => (
              <>
                <Link href={`/portal/exceptions/${e.id}`} className={styles.recordLink}>
                  {e.ref}
                </Link>
                <span className={styles.ref}>{e.householdRef}</span>
              </>
            ),
          },
          { key: "reason", header: t("portal.exceptions.reason"), render: (e) => t(reasonKeys[e.reason]) },
          {
            key: "source",
            header: t("portal.exceptions.source"),
            render: (e) => (
              <>
                {e.fieldReportRef}
                <span className={styles.ref}>{settlementName(e.settlementId)}</span>
              </>
            ),
          },
          { key: "status", header: t("portal.table.status"), render: (e) => <StatusBadge entity="exception" status={e.status} /> },
          { key: "updated", header: t("portal.table.updated"), render: (e) => formatDate(e.updatedAt) },
        ]}
      />
    </>
  );
}

export function ExceptionDetailView({ id }: { id: string }) {
  const { t, formatDate } = useI18n();
  const { data, notFound } = useServiceQuery(() => getException(id), [id]);

  if (notFound) return <RecordNotFound backHref="/portal/exceptions" />;
  if (!data) return <LoadingState label={t("common.loading")} />;

  const { exception, report, intervention } = data;
  const decidable = exception.status === "open" || exception.status === "escalated";
  const actions: RecordAction[] = decidable
    ? [
        { key: "clear", label: t("portal.exceptions.clear"), tone: "primary", icon: "check", requiresNote: true, run: (note) => decideException(exception.id, "cleared", note) },
        { key: "duplicate", label: t("portal.exceptions.withhold"), icon: "minusCircle", requiresNote: true, run: (note) => decideException(exception.id, "duplicate", note) },
        ...(exception.status === "open"
          ? [
              {
                key: "escalate",
                label: t("portal.exceptions.escalate"),
                tone: "warning" as const,
                icon: "alertTriangle" as const,
                requiresNote: true,
                run: (note: string) => decideException(exception.id, "escalated", note),
              },
            ]
          : []),
      ]
    : [];

  return (
    <RecordPage
      back={{ href: "/portal/exceptions", label: t("portal.detail.back") }}
      eyebrow={`${t("portal.entity.exception")} · ${report.ref}`}
      title={exception.ref}
      mono
      badges={<StatusBadge entity="exception" status={exception.status} />}
      meta={[t(reasonKeys[exception.reason]), settlementName(intervention.settlementId), `${t("portal.exceptions.detected")} ${formatDate(exception.detectedAt)}`].join(" · ")}
      progress={progressFor.exception(exception.status)}
      notices={
        exception.status === "waiting" ? (
          <Notice tone="warning">
            <p>{t("portal.exceptions.waitingReport", { name: report.ref })}</p>
            <Link href={`/portal/field-reports/${report.id}`} className={styles.inlineLink}>
              {t("portal.exceptions.openReport")}
              <Icon name="arrowRight" size={16} />
            </Link>
          </Notice>
        ) : undefined
      }
      actions={actions}
      tabs={[
        {
          id: "overview",
          label: t("portal.detail.overview"),
          content: (
            <RecordSection title={t("portal.detail.overview")}>
              <FieldGrid
                items={[
                  {
                    label: t("portal.exceptions.household"),
                    value: (
                      <>
                        <span dir="ltr" className={styles.ref} style={{ display: "inline", fontSize: 16 }}>
                          {exception.householdRef}
                        </span>{" "}
                        <Badge tone="neutral" icon="lock">
                          {t("portal.detail.restricted")}
                        </Badge>
                      </>
                    ),
                  },
                  { label: t("portal.exceptions.reason"), value: t(reasonKeys[exception.reason]) },
                  {
                    label: t("portal.exceptions.source"),
                    value: (
                      <>
                        <Link href={`/portal/field-reports/${report.id}`}>{report.ref}</Link> <StatusBadge entity="fieldReport" status={report.status} />
                      </>
                    ),
                  },
                  { label: t("portal.fieldReports.intervention"), value: <Link href={`/portal/interventions/${intervention.id}`}>{intervention.title}</Link> },
                  { label: t("portal.interventions.settlement"), value: settlementName(intervention.settlementId) },
                  { label: t("portal.exceptions.detected"), value: formatDate(exception.detectedAt) },
                ]}
              />
              <p className={`${styles.small} ${styles.muted}`}>
                <Icon name="lock" size={14} /> {t("portal.detail.restrictedNote")}
              </p>
            </RecordSection>
          ),
        },
        {
          id: "verification",
          label: t("portal.exceptions.verification"),
          content: (
            <RecordSection title={t("portal.exceptions.verification")}>
              <Notice tone="simulated" title={t("common.simulated")}>
                <p>{exception.verificationSummary}</p>
                <p className={styles.small}>{t("portal.exceptions.verificationSimulated")}</p>
              </Notice>
            </RecordSection>
          ),
        },
        {
          id: "assistance",
          label: t("portal.exceptions.history"),
          content: (
            <RecordSection title={t("portal.exceptions.history")}>
              <div className={styles.tableScroll} role="region" aria-label={t("portal.exceptions.history")} tabIndex={0}>
                <table className={styles.table} style={{ minWidth: 420 }}>
                  <thead>
                    <tr>
                      <th scope="col">{t("portal.exceptions.historyItem")}</th>
                      <th scope="col">{t("portal.exceptions.historyPartner")}</th>
                      <th scope="col">{t("portal.exceptions.historyDate")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {exception.history.map((h, index) => (
                      <tr key={index}>
                        <td>{h.item}</td>
                        <td>{h.partnerName}</td>
                        <td>{formatDate(h.date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </RecordSection>
          ),
        },
        {
          id: "history",
          label: t("portal.detail.timeline"),
          content: (
            <RecordSection title={t("portal.detail.timeline")}>
              <AuditTimeline entityId={exception.id} />
            </RecordSection>
          ),
        },
      ]}
    />
  );
}
