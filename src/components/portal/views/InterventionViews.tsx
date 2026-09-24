"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import type { InterventionStatus } from "@/lib/types";
import { sectorNames, settlementName } from "@/lib/demo/reference";
import {
  approveIntervention,
  completeIntervention,
  getIntervention,
  listInterventions,
  rejectIntervention,
  returnIntervention,
} from "@/lib/services/interventions";
import { useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, statusLabelKey } from "@/components/portal/StatusBadge";
import { FieldGrid, RecordPage, RecordSection, type RecordAction } from "@/components/portal/RecordPage";
import { progressFor } from "@/components/portal/progress";
import { AuditTimeline } from "@/components/portal/AuditTimeline";
import { RecordNotFound } from "@/components/portal/RecordBits";
import { Notice } from "@/components/ui/Notice";
import { Icon } from "@/components/ui/Icon";
import styles from "@/components/portal/portal.module.css";

const statuses: InterventionStatus[] = ["submitted", "approved", "returned", "rejected", "completed"];

export function InterventionsListView() {
  const { t, formatDate, formatNumber } = useI18n();
  const { data, loading } = useServiceQuery(listInterventions);

  return (
    <>
      <PageHeader title={t("portal.interventions.title")} intro={t("portal.interventions.intro")} />
      <RecordTable
        rows={data}
        loading={loading}
        caption={t("portal.interventions.title")}
        searchText={(i) => `${i.title} ${i.ref} ${i.partnerName} ${settlementName(i.settlementId)}`}
        statusOptions={statuses.map((s) => ({ value: s, label: t(statusLabelKey("intervention", s)) }))}
        columns={[
          {
            key: "title",
            header: t("portal.table.name"),
            primary: true,
            render: (i) => (
              <>
                <Link href={`/portal/interventions/${i.id}`} className={styles.recordLink}>
                  {i.title}
                </Link>
                <span className={styles.ref}>{i.ref}</span>
              </>
            ),
          },
          { key: "partner", header: t("portal.interventions.partner"), render: (i) => i.partnerName },
          { key: "settlement", header: t("portal.interventions.settlement"), render: (i) => settlementName(i.settlementId) },
          {
            key: "budget",
            header: t("portal.interventions.budget"),
            render: (i) => formatNumber(i.budgetUsd, { style: "currency", currency: "USD", maximumFractionDigits: 0 }),
          },
          { key: "status", header: t("portal.table.status"), render: (i) => <StatusBadge entity="intervention" status={i.status} /> },
          { key: "updated", header: t("portal.table.updated"), render: (i) => formatDate(i.updatedAt) },
        ]}
      />
    </>
  );
}

export function InterventionDetailView({ id }: { id: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const { data, notFound } = useServiceQuery(() => getIntervention(id), [id]);

  if (notFound) return <RecordNotFound backHref="/portal/interventions" />;
  if (!data) return <LoadingState label={t("common.loading")} />;

  const { intervention, partner, fieldReports } = data;
  const partnerApproved = partner.status === "approved";
  const actions: RecordAction[] = [];
  if (intervention.status === "submitted") {
    actions.push(
      { key: "approve", label: t("portal.interventions.approve"), tone: "primary", icon: "check", disabled: !partnerApproved, run: (note) => approveIntervention(intervention.id, note) },
      { key: "return", label: t("portal.interventions.return"), icon: "arrowLeft", requiresNote: true, run: (note) => returnIntervention(intervention.id, note) },
      { key: "reject", label: t("portal.interventions.reject"), tone: "danger", icon: "x", requiresNote: true, run: (note) => rejectIntervention(intervention.id, note) },
    );
  } else if (intervention.status === "approved") {
    actions.push({ key: "complete", label: t("portal.interventions.complete"), icon: "checkCircle", run: (note) => completeIntervention(intervention.id, note) });
  }

  const budget = formatNumber(intervention.budgetUsd, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <RecordPage
      back={{ href: "/portal/interventions", label: t("portal.detail.back") }}
      eyebrow={`${t("portal.entity.intervention")} · ${intervention.ref}`}
      title={intervention.title}
      badges={<StatusBadge entity="intervention" status={intervention.status} />}
      meta={[partner.name, settlementName(intervention.settlementId), sectorNames[intervention.sector], budget].join(" · ")}
      progress={progressFor.intervention(intervention.status)}
      notices={
        intervention.status === "submitted" && !partnerApproved ? (
          <Notice tone="warning">
            <p>{t("portal.interventions.partnerNotApproved", { name: partner.name })}</p>
            <Link href={`/portal/partners/${partner.id}`} className={styles.inlineLink}>
              {t("portal.interventions.openPartner")}
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
                    label: t("portal.interventions.partner"),
                    value: (
                      <>
                        <Link href={`/portal/partners/${partner.id}`}>{partner.name}</Link> <StatusBadge entity="partner" status={partner.status} />
                      </>
                    ),
                  },
                  { label: t("portal.interventions.sector"), value: sectorNames[intervention.sector] },
                  { label: t("portal.interventions.settlement"), value: settlementName(intervention.settlementId) },
                  { label: t("portal.interventions.period"), value: `${formatDate(intervention.startDate)} – ${formatDate(intervention.endDate)}` },
                  { label: t("portal.interventions.budget"), value: budget },
                  { label: t("portal.interventions.funding"), value: intervention.fundingSource },
                  { label: t("portal.interventions.target"), value: formatNumber(intervention.targetReach) },
                  { label: t("portal.interventions.objective"), value: intervention.objective, wide: true },
                  {
                    label: t("portal.interventions.activities"),
                    wide: true,
                    value: (
                      <ul style={{ margin: 0, paddingInlineStart: 20 }}>
                        {intervention.activities.map((a) => (
                          <li key={a}>{a}</li>
                        ))}
                      </ul>
                    ),
                  },
                ]}
              />
            </RecordSection>
          ),
        },
        {
          id: "reports",
          label: t("portal.interventions.reportsHeading"),
          content: (
            <RecordSection title={t("portal.interventions.reportsHeading")}>
              {fieldReports.length === 0 ? (
                <p className={styles.muted}>{t("portal.interventions.noReports")}</p>
              ) : (
                <ul className={styles.rowList}>
                  {fieldReports.map((r) => (
                    <li key={r.id} className={styles.rowItem}>
                      <span className={styles.rowMain}>
                        <Link href={`/portal/field-reports/${r.id}`} className={styles.recordLink}>
                          {r.title}
                        </Link>
                        <span className={styles.ref}>
                          {r.ref} · {formatDate(r.activityDate)}
                        </span>
                      </span>
                      <StatusBadge entity="fieldReport" status={r.status} />
                    </li>
                  ))}
                </ul>
              )}
            </RecordSection>
          ),
        },
        {
          id: "history",
          label: t("portal.detail.timeline"),
          content: (
            <RecordSection title={t("portal.detail.timeline")}>
              <AuditTimeline entityId={intervention.id} />
            </RecordSection>
          ),
        },
      ]}
    />
  );
}
