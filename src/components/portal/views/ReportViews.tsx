"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { ReportStatus } from "@/lib/types";
import { getReport, listReports, reopenReport, shareReport, signReport } from "@/lib/services/reports";
import { useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, statusLabelKey } from "@/components/portal/StatusBadge";
import { FieldGrid, RecordPage, RecordSection, type RecordAction } from "@/components/portal/RecordPage";
import { progressFor } from "@/components/portal/progress";
import { AuditTimeline } from "@/components/portal/AuditTimeline";
import { Checklist, RecordNotFound } from "@/components/portal/RecordBits";
import { TextField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import styles from "@/components/portal/portal.module.css";

const statuses: ReportStatus[] = ["draft", "signed", "shared"];

export function ReportsListView() {
  const { t, formatDate } = useI18n();
  const { data, loading } = useServiceQuery(listReports);
  return (
    <>
      <PageHeader title={t("portal.reports.title")} intro={t("portal.reports.intro")} />
      <RecordTable
        rows={data}
        loading={loading}
        caption={t("portal.reports.title")}
        searchText={(r) => `${r.title} ${r.ref} ${r.period}`}
        statusOptions={statuses.map((s) => ({ value: s, label: t(statusLabelKey("report", s)) }))}
        columns={[
          {
            key: "title",
            header: t("portal.table.name"),
            primary: true,
            render: (r) => (
              <>
                <Link href={`/portal/reports/${r.id}`} className={styles.recordLink}>
                  {r.title}
                </Link>
                <span className={styles.ref}>{r.ref}</span>
              </>
            ),
          },
          { key: "period", header: t("portal.reports.period"), render: (r) => r.period },
          { key: "status", header: t("portal.table.status"), render: (r) => <StatusBadge entity="report" status={r.status} /> },
          { key: "updated", header: t("portal.table.updated"), render: (r) => formatDate(r.updatedAt) },
        ]}
      />
    </>
  );
}

export function ReportDetailView({ id }: { id: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const fieldId = useId();
  const { data, notFound } = useServiceQuery(() => getReport(id), [id]);
  const [signer, setSigner] = useState("");
  const [signerError, setSignerError] = useState<string>();

  if (notFound) return <RecordNotFound backHref="/portal/reports" />;
  if (!data) return <LoadingState label={t("common.loading")} />;

  const { report, figures, readiness, frozen } = data;
  const checksPassed = [readiness.pendingFieldReports === 0, readiness.openExceptions === 0, readiness.unassignedHighPriority === 0].filter(Boolean).length;

  const actions: RecordAction[] = [];
  if (report.status === "draft") {
    actions.push({
      key: "sign",
      label: t("portal.reports.sign"),
      tone: "primary",
      icon: "pen",
      disabled: !readiness.ready,
      noNote: true,
      hint: t("common.simulatedLong"),
      fields: (
        <TextField
          id={`${fieldId}-signer`}
          label={t("portal.reports.signName")}
          autoComplete="name"
          value={signer}
          error={signerError}
          onChange={(e) => {
            setSigner(e.target.value);
            setSignerError(undefined);
          }}
        />
      ),
      validate: () => {
        if (signer.trim()) return true;
        setSignerError(t("portal.reports.signNameRequired"));
        document.getElementById(`${fieldId}-signer`)?.focus();
        return false;
      },
      success: t("common.simulatedLong"),
      run: async () => {
        await signReport(report.id, signer);
        setSigner("");
      },
    });
  }
  if (report.status === "signed") {
    actions.push(
      {
        key: "share",
        label: t("portal.reports.share"),
        tone: "primary",
        icon: "send",
        noNote: true,
        hint: t("common.simulatedLong"),
        success: t("common.simulatedLong"),
        run: () => shareReport(report.id),
      },
      { key: "reopen", label: t("portal.reports.reopen"), icon: "arrowLeft", requiresNote: true, run: (note) => reopenReport(report.id, note) },
    );
  }

  const figureRows: [string, string][] = [
    [t("portal.dashboard.kpiPartners"), formatNumber(figures.partnersApproved)],
    [t("portal.dashboard.kpiInterventions"), formatNumber(figures.interventionsApproved)],
    [t("portal.reports.figBudget"), formatNumber(figures.budgetApprovedUsd, { style: "currency", currency: "USD", maximumFractionDigits: 0 })],
    [t("portal.dashboard.kpiReports"), formatNumber(figures.fieldReportsAccepted)],
    [t("portal.dashboard.kpiReach"), formatNumber(figures.peopleReached)],
    [t("portal.reports.figExceptionsResolved"), formatNumber(figures.exceptionsResolved)],
    [t("portal.reports.figCasesResolved"), formatNumber(figures.casesResolved)],
    [t("portal.dashboard.kpiCases"), formatNumber(figures.casesOpen)],
  ];

  const signature =
    report.signedAt && report.signedBy ? (
      <p>
        <Badge tone="simulated" icon="pen">
          {t("common.simulated")}
        </Badge>{" "}
        {t("portal.reports.signedBy", { name: report.signedBy, date: formatDate(report.signedAt, true) })}
      </p>
    ) : null;

  return (
    <RecordPage
      back={{ href: "/portal/reports", label: t("portal.detail.back") }}
      eyebrow={`${t("portal.entity.report")} · ${report.ref}`}
      title={report.title}
      badges={<StatusBadge entity="report" status={report.status} />}
      meta={`${t("portal.reports.period")}: ${report.period}`}
      progress={progressFor.report(report.status, checksPassed)}
      notices={
        <>
          {report.status === "draft" && !readiness.ready && <Notice tone="warning">{t("portal.reports.signBlocked")}</Notice>}
          {report.status === "shared" && report.sharedAt && (
            <Notice tone="success" title={t("portal.status.report.shared")}>
              <p>{t("portal.reports.sharedWith", { count: report.sharedCount ?? 0, date: formatDate(report.sharedAt, true) })}</p>
              <Link href="/portal/integrations" className={styles.inlineLink}>
                {t("portal.integrations.outbox")}
                <Icon name="arrowRight" size={16} />
              </Link>
            </Notice>
          )}
        </>
      }
      actions={actions}
      tabs={[
        {
          id: "readiness",
          label: t("portal.reports.readiness"),
          content: (
            <RecordSection title={t("portal.reports.readiness")}>
              <Checklist
                items={[
                  {
                    label: <Link href="/portal/field-reports">{t("portal.reports.checkFieldReports", { pending: readiness.pendingFieldReports })}</Link>,
                    done: readiness.pendingFieldReports === 0,
                  },
                  {
                    label: <Link href="/portal/exceptions">{t("portal.reports.checkExceptions", { pending: readiness.openExceptions })}</Link>,
                    done: readiness.openExceptions === 0,
                  },
                  {
                    label: <Link href="/portal/cases">{t("portal.reports.checkCases", { pending: readiness.unassignedHighPriority })}</Link>,
                    done: readiness.unassignedHighPriority === 0,
                  },
                ]}
              />
              {signature}
            </RecordSection>
          ),
        },
        {
          id: "figures",
          label: t("portal.reports.figures"),
          content: (
            <RecordSection title={t("portal.reports.figures")}>
              <p className={`${styles.small} ${styles.muted}`}>
                {frozen && report.signedAt ? t("portal.reports.figuresFrozen", { date: formatDate(report.signedAt, true) }) : t("portal.reports.figuresLive")}
              </p>
              <div className={styles.figureGrid}>
                {figureRows.map(([label, value]) => (
                  <div key={label} className={styles.figure}>
                    <span className={styles.figureValue}>{value}</span>
                    <span className={styles.figureLabel}>{label}</span>
                  </div>
                ))}
              </div>
              <p className={`${styles.small} ${styles.muted}`}>{t("common.fictional")}</p>
            </RecordSection>
          ),
        },
        {
          id: "sections",
          label: t("portal.reports.sections"),
          content: (
            <RecordSection title={t("portal.reports.sections")}>
              <FieldGrid items={report.sections.map((section) => ({ label: section.title, value: section.body, wide: true }))} />
            </RecordSection>
          ),
        },
        {
          id: "history",
          label: t("portal.detail.timeline"),
          content: (
            <RecordSection title={t("portal.detail.timeline")}>
              <AuditTimeline entityId={report.id} />
            </RecordSection>
          ),
        },
      ]}
    />
  );
}
