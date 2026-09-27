"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { Notice } from "@/components/ui/Notice";
import type { MessageKey } from "@/i18n/core";
import { getPartnerDashboard, type NextActionKind } from "@/lib/services/partnerInsights";
import { getWalkthrough } from "@/lib/services/partnerDemo";
import { useErrorMessage } from "@/lib/services/hooks";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { PageHeader, Section } from "@/components/portal/PageHeader";
import { PriorityBadge, StatusBadge } from "@/components/portal/StatusBadge";
import { EmptyState, ErrorState, UpdatedAt } from "@/components/portal/RecordBits";
import { ProgressList } from "@/components/portal/charts/Charts";
import { DemoControl, EligibilityNotice, Gate, usePartnerQuery } from "@/components/partner/PartnerBits";
import { InboxLine } from "./MessagesView";
import styles from "@/components/portal/views/DashboardView.module.css";
import portal from "@/components/portal/portal.module.css";

const actionIcons: Record<NextActionKind, IconName> = {
  completeProfile: "building",
  submitApplication: "send",
  respondAccreditation: "arrowLeft",
  suspended: "pauseCircle",
  accreditationExpired: "alertTriangle",
  renewal: "refresh",
  documentMissing: "fileText",
  documentExpiring: "clock",
  documentReturned: "arrowLeft",
  proposalReturned: "arrowLeft",
  proposalDraft: "pen",
  reportReturned: "arrowLeft",
  reportDraft: "pen",
  surveyReturned: "arrowLeft",
  syncPending: "cloud",
  reportDue: "calendar",
  financeReturned: "arrowLeft",
  progressReturned: "arrowLeft",
  profileChangeReturned: "arrowLeft",
  signMou: "pen",
  verificationPending: "shield",
  assistanceFlagged: "flag",
};

export function PartnerDashboardView() {
  const { t, formatNumber, formatDate } = useI18n();
  const toMessage = useErrorMessage();
  const q = usePartnerQuery(getPartnerDashboard);
  const walk = usePartnerQuery(getWalkthrough);
  const [simulated, setSimulated] = useState<string>();

  if (q.error && !q.denied && !q.notFound) return <ErrorState message={toMessage(q.error)} />;

  return (
    <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner">
      {() => {
        const d = q.data!;
        const p = d.partner;
        const tiles: { key: string; value: number | string; href: string; icon: IconName; badge?: React.ReactNode }[] = [
          { key: "accreditation", value: "", href: "/partner/accreditation", icon: "shield", badge: <StatusBadge entity="partner" status={p.status} /> },
          { key: "active", value: d.counts.active, href: "/partner/interventions", icon: "activity" },
          { key: "awaitingReview", value: d.counts.awaitingReview, href: "/partner/proposals", icon: "eye" },
          { key: "reportsDue", value: d.counts.reportsDue, href: "/partner/field-reports", icon: "calendar" },
          { key: "returned", value: d.counts.returned, href: "#next-actions", icon: "arrowLeft" },
          { key: "expiringDocuments", value: d.counts.expiringDocuments, href: "/partner/documents", icon: "clock" },
          { key: "openAssistanceReviews", value: d.counts.openAssistanceReviews, href: "/partner/beneficiaries", icon: "flag" },
          { key: "unread", value: d.counts.unread, href: "/partner/messages", icon: "mail" },
        ];
        return (
          <>
            <PageHeader
              eyebrow={p.acronym ? `${p.name} (${p.acronym})` : p.name}
              title={t("partner.dashboard.title")}
              intro={t("partner.dashboard.intro")}
              meta={
                <>
                  <span className={portal.muted}>{t("common.fictional")}</span>
                  <UpdatedAt at={d.generatedAt} />
                </>
              }
            />
            <div className={portal.stack}>
              <EligibilityNotice eligibility={d.eligibility} />

              <ul className={styles.kpis} aria-label={t("partner.dashboard.metricsLabel")}>
                {tiles.map((tile) => (
                  <li key={tile.key}>
                    <Link href={tile.href} className={styles.kpi}>
                      <span className={styles.kpiTop}>
                        <span className={styles.kpiLabel}>{t(`partner.dashboard.metrics.${tile.key}` as MessageKey)}</span>
                        <Icon name={tile.icon} size={18} className={styles.kpiIcon} />
                      </span>
                      {tile.badge ? <span>{tile.badge}</span> : <span className={styles.kpiValue}>{formatNumber(Number(tile.value))}</span>}
                      {tile.key === "accreditation" && p.accreditedUntil && (
                        <span className={styles.kpiDetail}>{t("partner.dashboard.accreditedUntil", { date: formatDate(p.accreditedUntil) })}</span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>

              <div className={styles.grid}>
                <Section id="next-actions" title={t("partner.dashboard.nextActions")} actions={<span className={portal.muted}>{t("portal.dashboard.attentionCount", { count: d.nextActions.length })}</span>}>
                  {d.nextActions.length === 0 ? (
                    <EmptyState icon="checkCircle" title={t("partner.dashboard.nothingToDo")} />
                  ) : (
                    <ul className={styles.alerts}>
                      {d.nextActions.map((a) => (
                        <li key={a.id}>
                          <Link href={a.href} className={styles.alert}>
                            <span className={styles.alertIcon} aria-hidden="true">
                              <Icon name={actionIcons[a.kind]} size={18} />
                            </span>
                            <span className={styles.alertBody}>
                              <span className={styles.alertEntity}>{t(`partner.nextActions.kinds.${a.kind}` as MessageKey)}</span>
                              <span className={styles.alertText}>
                                {t(`partner.nextActions.text.${a.kind}` as MessageKey, { ...a.params, date: typeof a.params.date === "string" ? formatDate(a.params.date) : "" })}
                              </span>
                            </span>
                            <PriorityBadge priority={a.priority} />
                            <Icon name="chevronRight" size={18} className={styles.alertChevron} />
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>

                <div className={portal.stack}>
                  {walk.data?.isJourneyPartner && walk.data.enabled && (
                    <Section
                      title={t("partner.walkthrough.title")}
                      actions={
                        <span className={portal.muted}>
                          {walk.data.steps.filter((s) => s.done).length}/{walk.data.steps.length}
                        </span>
                      }
                    >
                      <p className={`${portal.muted} ${portal.small}`}>{t("partner.walkthrough.intro")}</p>
                      <div aria-live="polite">{simulated && <Notice tone="success">{simulated}</Notice>}</div>
                      <ol className={styles.journey}>
                        {walk.data.steps.map((step, index) => (
                          <li key={step.key} className={step.done ? styles.stepDone : styles.stepPending}>
                            <span className={styles.stepMark} aria-hidden="true">
                              {step.done ? <Icon name="check" size={14} /> : index + 1}
                            </span>
                            <Link href={step.href} className={styles.stepLink}>
                              {t(`partner.walkthrough.steps.${step.key}` as MessageKey)}
                            </Link>
                            <span className={styles.stepState}>{step.done ? t("portal.checks.done") : step.opm ? t("partner.walkthrough.waitingOpm") : t("portal.checks.pending")}</span>
                            {step.opm && (
                              <div style={{ flexBasis: "100%" }}>
                                <DemoControl step={step.opm} compact onDone={setSimulated} />
                              </div>
                            )}
                          </li>
                        ))}
                      </ol>
                      <p className={`${portal.small} ${portal.muted}`}>{t("partner.demo.orReal")}</p>
                    </Section>
                  )}

                  <Section title={t("partner.dashboard.messages")} actions={<Link href="/partner/messages" className={portal.inlineLink}>{t("partner.dashboard.openInbox")}</Link>}>
                    {d.messages.length === 0 ? (
                      <p className={portal.muted}>{t("partner.messages.empty")}</p>
                    ) : (
                      <ul className={portal.rowList}>
                        {d.messages.map((m) => (
                          <li key={m.id} className={portal.rowItem}>
                            <InboxLine item={m} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </Section>
                </div>
              </div>

              <Section title={t("partner.dashboard.progressTitle")} actions={<Link href="/partner/interventions" className={portal.inlineLink}>{t("partner.dashboard.openInterventions")}</Link>}>
                {d.interventions.length === 0 ? (
                  <p className={portal.muted}>{t("partner.dashboard.noInterventions")}</p>
                ) : (
                  <>
                    <ProgressList
                      targetLabel={t("portal.dashboard.sectorTarget")}
                      rows={d.interventions.map(({ intervention, percent, awaiting }) => ({
                        key: intervention.id,
                        label: `${intervention.ref} ${intervention.title}`,
                        sub: awaiting ? t("partner.dashboard.awaitingCount", { count: awaiting }) : t("partner.dashboard.noneAwaiting"),
                        value: percent,
                        target: 100,
                        valueLabel: `${percent}%`,
                      }))}
                    />
                    <p className={`${portal.small} ${portal.muted}`}>{t("partner.dashboard.progressNote")}</p>
                  </>
                )}
              </Section>
              {!d.isAdmin && (
                <p className={`${portal.small} ${portal.muted}`}>
                  <Badge tone="info">{t("portal.roles.partner_staff")}</Badge> {t("partner.dashboard.staffNote")}
                </p>
              )}
            </div>
          </>
        );
      }}
    </Gate>
  );
}
