"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import type { FieldReportStatus } from "@/lib/types";
import { settlementName } from "@/lib/demo/reference";
import {
  acceptFieldReport,
  getFieldReport,
  listFieldReports,
  returnFieldReport,
  simulateResubmission,
  totalReached,
} from "@/lib/services/fieldReports";
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

const statuses: FieldReportStatus[] = ["held", "submitted", "accepted", "returned"];

export function FieldReportsListView() {
  const { t, formatDate, formatNumber } = useI18n();
  const { data, loading } = useServiceQuery(listFieldReports);

  return (
    <>
      <PageHeader title={t("portal.fieldReports.title")} intro={t("portal.fieldReports.intro")} />
      <RecordTable
        rows={data}
        loading={loading}
        caption={t("portal.fieldReports.title")}
        searchText={(r) => `${r.title} ${r.ref} ${r.interventionRef} ${r.submittedBy}`}
        statusOptions={statuses.map((s) => ({ value: s, label: t(statusLabelKey("fieldReport", s)) }))}
        columns={[
          {
            key: "title",
            header: t("portal.table.name"),
            primary: true,
            render: (r) => (
              <>
                <Link href={`/portal/field-reports/${r.id}`} className={styles.recordLink}>
                  {r.title}
                </Link>
                <span className={styles.ref}>{r.ref}</span>
              </>
            ),
          },
          {
            key: "intervention",
            header: t("portal.fieldReports.intervention"),
            render: (r) => (
              <>
                {r.interventionTitle}
                <span className={styles.ref}>
                  {r.interventionRef} · {settlementName(r.settlementId)}
                </span>
              </>
            ),
          },
          { key: "reached", header: t("portal.fieldReports.reached"), render: (r) => formatNumber(r.totalReached) },
          { key: "status", header: t("portal.table.status"), render: (r) => <StatusBadge entity="fieldReport" status={r.status} /> },
          { key: "updated", header: t("portal.table.updated"), render: (r) => formatDate(r.updatedAt) },
        ]}
      />
    </>
  );
}

export function FieldReportDetailView({ id }: { id: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const { data, notFound } = useServiceQuery(() => getFieldReport(id), [id]);

  if (notFound) return <RecordNotFound backHref="/portal/field-reports" />;
  if (!data) return <LoadingState label={t("common.loading")} />;

  const { report, intervention, partner, exceptions } = data;
  const actions: RecordAction[] = [];
  if (report.status === "submitted") {
    actions.push(
      {
        key: "accept",
        label: t("portal.fieldReports.accept"),
        tone: "primary",
        icon: "check",
        hint: (
          <>
            <Badge tone="simulated">{t("common.simulated")}</Badge> {t("portal.fieldReports.verificationNote")}
          </>
        ),
        run: (note) => acceptFieldReport(report.id, note),
      },
      { key: "return", label: t("portal.fieldReports.return"), icon: "arrowLeft", requiresNote: true, run: (note) => returnFieldReport(report.id, note) },
    );
  } else if (report.status === "returned") {
    actions.push({
      key: "resubmit",
      label: t("portal.fieldReports.resubmit"),
      icon: "upload",
      noNote: true,
      hint: t("common.simulatedLong"),
      run: () => simulateResubmission(report.id),
    });
  }

  const tabs = [
    {
      id: "overview",
      label: t("portal.detail.overview"),
      content: (
        <RecordSection title={t("portal.detail.overview")}>
          <FieldGrid
            items={[
              {
                label: t("portal.fieldReports.intervention"),
                value: (
                  <>
                    <Link href={`/portal/interventions/${intervention.id}`}>{intervention.title}</Link>{" "}
                    <StatusBadge entity="intervention" status={intervention.status} />
                  </>
                ),
              },
              { label: t("portal.interventions.partner"), value: <Link href={`/portal/partners/${partner.id}`}>{partner.name}</Link> },
              { label: t("portal.interventions.settlement"), value: settlementName(intervention.settlementId) },
              { label: t("portal.fieldReports.submittedBy"), value: report.submittedBy },
              {
                label: t("portal.fieldReports.channel"),
                value: report.channel === "offline" ? t("portal.fieldReports.channelOffline") : t("portal.fieldReports.channelOnline"),
              },
              { label: t("portal.fieldReports.activityDate"), value: formatDate(report.activityDate) },
            ]}
          />
        </RecordSection>
      ),
    },
    {
      id: "reach",
      label: t("portal.fieldReports.reached"),
      content: (
        <RecordSection title={t("portal.fieldReports.reached")}>
          <div className={styles.figureGrid}>
            {(
              [
                [t("portal.fieldReports.reached"), totalReached(report)],
                [t("portal.fieldReports.women"), report.reached.women],
                [t("portal.fieldReports.men"), report.reached.men],
                [t("portal.fieldReports.children"), report.reached.children],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className={styles.figure}>
                <span className={styles.figureValue}>{formatNumber(value)}</span>
                <span className={styles.figureLabel}>{label}</span>
              </div>
            ))}
          </div>
          {report.distributed.length > 0 && (
            <div>
              <p className={styles.subheading}>{t("portal.fieldReports.distributed")}</p>
              <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                {report.distributed.map((d) => (
                  <li key={d.item}>
                    {d.item}: {formatNumber(d.quantity)}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div>
            <p className={styles.subheading}>{t("portal.fieldReports.narrative")}</p>
            <p className={styles.quote}>{report.narrative}</p>
          </div>
        </RecordSection>
      ),
    },
    ...(exceptions.length > 0
      ? [
          {
            id: "exceptions",
            label: t("portal.fieldReports.exceptionsHeading"),
            content: (
              <RecordSection title={t("portal.fieldReports.exceptionsHeading")}>
                <ul className={styles.rowList}>
                  {exceptions.map((ex) => (
                    <li key={ex.id} className={styles.rowItem}>
                      <span className={styles.rowMain}>
                        <Link href={`/portal/exceptions/${ex.id}`} className={styles.recordLink}>
                          {ex.ref}
                        </Link>
                        <span className={styles.ref}>{ex.householdRef}</span>
                      </span>
                      <StatusBadge entity="exception" status={ex.status} />
                    </li>
                  ))}
                </ul>
              </RecordSection>
            ),
          },
        ]
      : []),
    {
      id: "history",
      label: t("portal.detail.timeline"),
      content: (
        <RecordSection title={t("portal.detail.timeline")}>
          <AuditTimeline entityId={report.id} />
        </RecordSection>
      ),
    },
  ];

  return (
    <RecordPage
      back={{ href: "/portal/field-reports", label: t("portal.detail.back") }}
      eyebrow={`${t("portal.entity.fieldReport")} · ${report.ref}`}
      title={report.title}
      badges={<StatusBadge entity="fieldReport" status={report.status} />}
      meta={[intervention.title, report.submittedBy, formatDate(report.activityDate)].join(" · ")}
      progress={progressFor.fieldReport(report.status)}
      notices={
        report.status === "held" ? (
          <Notice tone="warning">
            <p>{t("portal.fieldReports.heldNotice")}</p>
            <Link href={`/portal/interventions/${intervention.id}`} className={styles.inlineLink}>
              {t("portal.fieldReports.openIntervention")}
              <Icon name="arrowRight" size={16} />
            </Link>
          </Notice>
        ) : undefined
      }
      actions={actions}
      tabs={tabs}
    />
  );
}
