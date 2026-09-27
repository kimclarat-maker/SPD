"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { InterventionStatus } from "@/lib/types";
import {
  activateIntervention,
  addInterventionComment,
  approveIntervention,
  assignIntervention,
  closeIntervention,
  completeIntervention,
  getIntervention,
  listInterventions,
  rejectIntervention,
  requestInterventionChanges,
  resolveOverlap,
  startCoordinationReview,
  toggleMilestone,
  type InterventionRow,
} from "@/lib/services/interventions";
import type { RecordFilters } from "@/lib/services/filters";
import { indicatorLabel, sectorName, settlementName } from "@/lib/services/lookup";
import { useCan, useServiceAction, useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, statusLabelKey, useStatusOptions } from "@/components/portal/StatusBadge";
import { FilterBar, useRecordFilters } from "@/components/portal/FilterBar";
import { FieldGrid, RecordPage, RecordSection, type RecordAction } from "@/components/portal/RecordPage";
import { CommentThread, PermissionDenied, RecordNotFound, type StageState } from "@/components/portal/RecordBits";
import { InterventionPartnerUpdates } from "@/components/portal/PartnerSubmissions";
import { Notice } from "@/components/ui/Notice";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { SelectField } from "@/components/ui/Field";
import styles from "@/components/portal/portal.module.css";

const PointsMap = dynamic(() => import("@/components/portal/GisMap").then((m) => m.PointsMap), {
  ssr: false,
  loading: () => <div className={styles.mapPlaceholder} />,
});

const statuses: InterventionStatus[] = ["draft", "submitted", "coordination_review", "approved", "changes_requested", "rejected", "active", "completed", "closed"];

function Bar({ percent, label }: { percent: number; label: string }) {
  return (
    <span className={styles.miniProgress} role="img" aria-label={label}>
      <span className={styles.miniTrack} aria-hidden="true">
        <span className={styles.miniFill} style={{ width: `${Math.min(100, percent)}%` }} />
      </span>
      <span aria-hidden="true">{percent}%</span>
    </span>
  );
}

export function InterventionsListView({ initialFilters, initialStatus }: { initialFilters: RecordFilters; initialStatus?: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const [filters, setFilters] = useRecordFilters(initialFilters);
  const { data, loading } = useServiceQuery(() => listInterventions(filters), [JSON.stringify(filters)]);
  const statusOptions = useStatusOptions("intervention", statuses);
  const usd = (n: number) => formatNumber(n, { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  return (
    <>
      <PageHeader title={t("portal.interventions.title")} intro={t("portal.interventions.intro")} />
      <FilterBar value={filters} onChange={setFilters} />
      <RecordTable<InterventionRow>
        rows={data}
        loading={loading}
        caption={t("portal.interventions.title")}
        initialStatus={initialStatus}
        searchText={(i) => `${i.title} ${i.ref} ${i.partnerName} ${settlementName(i.settlementId)} ${i.fundingSource} ${i.targetGroup}`}
        statusOptions={statusOptions}
        filters={[
          {
            key: "warnings",
            label: t("portal.interventions.validation"),
            options: [
              { value: "blocking", label: t("portal.interventions.hasWarnings") },
              { value: "overlap", label: t("portal.interventions.hasOverlap") },
            ],
            test: (i, v) => (v === "overlap" ? i.validation.unresolvedOverlaps > 0 : i.validation.blocking),
          },
        ]}
        columns={[
          {
            key: "title",
            header: t("portal.interventions.intervention"),
            primary: true,
            sortValue: (i) => i.ref,
            render: (i) => (
              <>
                <Link href={`/portal/interventions/${i.id}`} className={styles.recordLink}>
                  {i.title}
                </Link>
                <span className={styles.ref}>{i.ref}</span>
              </>
            ),
          },
          { key: "partner", header: t("portal.interventions.partner"), sortValue: (i) => i.partnerName, render: (i) => i.partnerName },
          { key: "sector", header: t("portal.filters.sector"), render: (i) => sectorName(i.sector) },
          { key: "location", header: t("portal.interventions.location"), render: (i) => settlementName(i.settlementId) },
          {
            key: "dates",
            header: t("portal.interventions.dates"),
            sortValue: (i) => i.startDate,
            render: (i) => (
              <span className={styles.nowrap}>
                {formatDate(i.startDate)} – {formatDate(i.endDate)}
              </span>
            ),
          },
          { key: "group", header: t("portal.interventions.targetGroup"), render: (i) => i.targetGroup },
          { key: "funding", header: t("portal.interventions.funding"), render: (i) => i.fundingSource || <span className={styles.muted}>—</span> },
          { key: "budget", header: t("portal.interventions.budget"), numeric: true, sortValue: (i) => i.budgetUsd, render: (i) => usd(i.budgetUsd) },
          {
            key: "progress",
            header: t("portal.interventions.progress"),
            sortValue: (i) => i.progress.percent,
            render: (i) => <Bar percent={i.progress.percent} label={t("portal.detail.progress", { percent: i.progress.percent })} />,
          },
          {
            key: "status",
            header: t("portal.table.status"),
            sortValue: (i) => i.status,
            render: (i) => (
              <>
                <StatusBadge entity="intervention" status={i.status} />
                {i.validation.blocking && ["submitted", "coordination_review"].includes(i.status) && (
                  <span className={styles.warnLine}>
                    <Icon name="alertTriangle" size={14} /> {t("portal.interventions.hasWarnings")}
                  </span>
                )}
              </>
            ),
          },
        ]}
      />
    </>
  );
}

function interventionStages(status: InterventionStatus, t: (k: MessageKey) => string): { key: string; label: string; state: StageState }[] {
  const path: InterventionStatus[] = ["draft", "submitted", "coordination_review", "approved", "active", "completed", "closed"];
  let index = path.indexOf(status);
  const ended = status === "rejected";
  const returned = status === "changes_requested";
  if (ended || returned) index = 3;
  return path.map((s, i) => {
    let state: StageState = i < index ? "done" : i === index ? "current" : "upcoming";
    let label = t(statusLabelKey("intervention", s));
    if (s === "approved") {
      if (ended) {
        state = "ended";
        label = t(statusLabelKey("intervention", "rejected"));
      } else if (returned) {
        label = t(statusLabelKey("intervention", "changes_requested"));
      } else if (i === index) state = "done";
    }
    if (s === "closed" && status === "closed") state = "done";
    return { key: s, label, state };
  });
}

export function InterventionDetailView({ id }: { id: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const fieldId = useId();
  const can = useCan();
  const { data, notFound, forbidden } = useServiceQuery(() => getIntervention(id), [id]);
  const milestone = useServiceAction();
  const [assignee, setAssignee] = useState("");
  const [overlapId, setOverlapId] = useState("");
  const [fieldError, setFieldError] = useState<string>();

  if (forbidden) return <PermissionDenied />;
  if (notFound) return <RecordNotFound backHref="/portal/interventions" />;
  if (!data) return <LoadingState label={t("common.loading")} />;

  const { intervention: iv, partner, fieldReports, validation: v, progress, servicePoints, documents, assignees } = data;
  const inReview = iv.status === "submitted" || iv.status === "coordination_review";
  const canReview = can("intervention.review");
  const canDecide = can("intervention.decide");
  const usd = (n: number) => formatNumber(n, { style: "currency", currency: "USD", maximumFractionDigits: 0 });
  const unresolved = v.overlaps.filter((o) => !o.resolved);
  const chosenOverlap = overlapId || unresolved[0]?.intervention.id || "";
  const chosenAssignee = assignee || iv.assignedTo || "";

  const approveReasons = [
    !v.eligibility.eligible && t(`portal.partners.ineligible.${v.eligibility.reason}` as MessageKey),
    v.missing.length > 0 && t("portal.interventions.reasonMissing"),
    v.missingPermission && t("portal.interventions.reasonPermission"),
    v.unresolvedOverlaps > 0 && t("portal.interventions.reasonOverlap"),
    iv.status === "submitted" && t("portal.interventions.reasonStartReview"),
  ].filter(Boolean) as string[];

  const actions: RecordAction[] = [];
  if (inReview) {
    actions.push({
      key: "assign",
      label: iv.assignedTo ? t("portal.partners.reassign") : t("portal.partners.assign"),
      icon: "user",
      denied: !canReview,
      fields: (
        <SelectField id={`${fieldId}-assignee`} label={t("portal.interventions.assignedTo")} error={fieldError} value={chosenAssignee} onChange={(e) => (setAssignee(e.target.value), setFieldError(undefined))}>
          <option value="">{t("portal.common.choose")}</option>
          {assignees.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </SelectField>
      ),
      validate: () => (chosenAssignee ? true : (setFieldError(t("portal.validation.chooseOne")), false)),
      run: (note) => assignIntervention(iv.id, chosenAssignee, note),
    });
  }
  if (iv.status === "submitted") {
    actions.push({ key: "review", label: t("portal.interventions.startReview"), tone: "primary", icon: "clipboard", noNote: true, denied: !canReview, run: () => startCoordinationReview(iv.id) });
  }
  if (inReview && unresolved.length > 0) {
    actions.push({
      key: "overlap",
      label: t("portal.interventions.resolveOverlap"),
      tone: "warning",
      icon: "gitCompare",
      requiresNote: true,
      denied: !canReview,
      noteLabel: t("portal.interventions.overlapNote"),
      hint: t("portal.interventions.overlapHint"),
      fields: (
        <SelectField id={`${fieldId}-overlap`} label={t("portal.interventions.overlapWith")} value={chosenOverlap} onChange={(e) => setOverlapId(e.target.value)}>
          {unresolved.map((o) => (
            <option key={o.intervention.id} value={o.intervention.id}>
              {o.intervention.ref} — {o.partnerName}
            </option>
          ))}
        </SelectField>
      ),
      run: (note) => resolveOverlap(iv.id, chosenOverlap, note),
    });
  }
  if (inReview) {
    actions.push(
      {
        key: "approve",
        label: t("portal.interventions.approve"),
        tone: "primary",
        icon: "check",
        requiresNote: true,
        denied: !canDecide,
        disabled: approveReasons.length > 0,
        disabledReason: approveReasons.join(" "),
        hint: t("portal.interventions.approveHint"),
        run: (note) => approveIntervention(iv.id, note),
      },
      { key: "changes", label: t("portal.interventions.requestChanges"), icon: "arrowLeft", requiresNote: true, denied: !canDecide, run: (note) => requestInterventionChanges(iv.id, note) },
      { key: "reject", label: t("portal.interventions.reject"), tone: "danger", icon: "x", requiresNote: true, denied: !canDecide, run: (note) => rejectIntervention(iv.id, note) },
    );
  }
  if (iv.status === "approved") actions.push({ key: "activate", label: t("portal.interventions.activate"), tone: "primary", icon: "activity", denied: !canDecide, run: (note) => activateIntervention(iv.id, note) });
  if (iv.status === "active") actions.push({ key: "complete", label: t("portal.interventions.complete"), icon: "checkCircle", requiresNote: true, denied: !canDecide, run: (note) => completeIntervention(iv.id, note) });
  if (iv.status === "completed") actions.push({ key: "close", label: t("portal.interventions.close"), icon: "lock", requiresNote: true, denied: !canDecide, run: (note) => closeIntervention(iv.id, note) });

  const warnings = inReview && v.blocking;

  return (
    <RecordPage
      back={{ href: "/portal/interventions", label: t("portal.interventions.back") }}
      eyebrow={`${t("portal.entity.intervention")} · ${iv.ref}`}
      title={iv.title}
      badges={
        <>
          <StatusBadge entity="intervention" status={iv.status} />
          {warnings && (
            <Badge tone="warning" icon="alertTriangle">
              {t("portal.interventions.warningCount", { count: approveReasons.filter((r) => r !== t("portal.interventions.reasonStartReview")).length })}
            </Badge>
          )}
          {iv.assignedTo && (
            <Badge tone="info" icon="user">
              {iv.assignedTo}
            </Badge>
          )}
        </>
      }
      meta={[partner.name, settlementName(iv.settlementId), sectorName(iv.sector), usd(iv.budgetUsd)].join(" · ")}
      progress={["approved", "active", "completed", "closed"].includes(iv.status) ? progress.percent : undefined}
      stages={interventionStages(iv.status, t)}
      notices={
        inReview && (v.blocking || v.overlaps.length > 0) ? (
          <Notice tone={v.blocking ? "warning" : "info"} title={t("portal.interventions.validationTitle")}>
            <ul className={styles.plainList}>
              {!v.eligibility.eligible && (
                <li>
                  {t("portal.interventions.warnPartner", { name: partner.name, reason: t(`portal.partners.ineligible.${v.eligibility.reason}` as MessageKey) })}{" "}
                  <Link href={`/portal/partners/${partner.id}`}>{t("portal.interventions.openPartner")}</Link>
                </li>
              )}
              {v.missing.map((m) => (
                <li key={m}>{t(`portal.interventions.missing.${m}` as MessageKey)}</li>
              ))}
              {v.missingPermission && <li>{t("portal.interventions.warnPermission")}</li>}
              {v.overlaps.map((o) => (
                <li key={o.intervention.id}>
                  {t(o.resolved ? "portal.interventions.overlapResolved" : "portal.interventions.overlapOpen", {
                    ref: o.intervention.ref,
                    partner: o.partnerName,
                    points: o.sharedServicePoints.length,
                  })}{" "}
                  <Link href={`/portal/interventions/${o.intervention.id}`}>{t("portal.common.open")}</Link>
                </li>
              ))}
            </ul>
          </Notice>
        ) : undefined
      }
      actions={actions}
      timelineId={iv.id}
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
                  { label: t("portal.filters.sector"), value: sectorName(iv.sector) },
                  { label: t("portal.interventions.location"), value: settlementName(iv.settlementId) },
                  { label: t("portal.interventions.dates"), value: `${formatDate(iv.startDate)} – ${formatDate(iv.endDate)}` },
                  { label: t("portal.interventions.targetGroup"), value: iv.targetGroup },
                  { label: t("portal.interventions.targetReach"), value: formatNumber(iv.targetReach) },
                  { label: t("portal.interventions.budget"), value: usd(iv.budgetUsd) },
                  { label: t("portal.interventions.funding"), value: iv.fundingSource || t("portal.interventions.notStated") },
                  { label: t("portal.interventions.reached"), value: `${formatNumber(progress.reached)} (${t("portal.interventions.acceptedReports", { count: progress.acceptedReports })})` },
                  { label: t("portal.interventions.objective"), value: iv.objective, wide: true },
                ]}
              />
            </RecordSection>
          ),
        },
        {
          id: "plan",
          label: t("portal.interventions.plan"),
          content: (
            <>
              <RecordSection title={t("portal.interventions.activities")}>
                <ul className={styles.plainList}>
                  {iv.activities.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
              </RecordSection>
              <RecordSection title={t("portal.interventions.indicators")}>
                {progress.indicators.length === 0 ? (
                  <p className={styles.muted}>{t("portal.interventions.missing.indicators")}</p>
                ) : (
                  <ul className={styles.rowList}>
                    {progress.indicators.map((ind) => (
                      <li key={ind.indicatorId} className={styles.rowItem}>
                        <span className={styles.rowMain}>
                          <Link href={`/portal/surveys/indicators/${ind.indicatorId}`} className={styles.recordLink}>
                            {indicatorLabel(ind.indicatorId)}
                          </Link>
                          <span className={styles.ref}>{t("portal.interventions.indicatorLine", { actual: formatNumber(ind.actual), target: formatNumber(ind.target) })}</span>
                        </span>
                        <Bar percent={ind.percent} label={t("portal.detail.progress", { percent: ind.percent })} />
                      </li>
                    ))}
                  </ul>
                )}
              </RecordSection>
              <RecordSection title={t("portal.interventions.milestones")}>
                {iv.milestones.length === 0 ? (
                  <p className={styles.muted}>{t("portal.interventions.missing.milestones")}</p>
                ) : (
                  <ul className={styles.rowList}>
                    {iv.milestones.map((m) => {
                      const overdue = !m.done && new Date(m.dueAt) < new Date();
                      return (
                        <li key={m.id} className={styles.rowItem}>
                          <label className={styles.checkRow}>
                            <input
                              type="checkbox"
                              checked={m.done}
                              disabled={!canReview || Boolean(milestone.pending) || !["approved", "active"].includes(iv.status)}
                              onChange={() => milestone.run(m.id, () => toggleMilestone(iv.id, m.id))}
                            />
                            <span>{m.title}</span>
                          </label>
                          <span className={styles.nowrap}>{formatDate(m.dueAt)}</span>
                          {overdue && (
                            <Badge tone="error" icon="clock">
                              {t("portal.common.overdue")}
                            </Badge>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
                {milestone.error && (
                  <Notice tone="error" role="alert">
                    {milestone.error}
                  </Notice>
                )}
              </RecordSection>
            </>
          ),
        },
        {
          id: "location",
          label: t("portal.interventions.locationTab"),
          count: servicePoints.length,
          content: (
            <RecordSection title={t("portal.interventions.servicePoints")}>
              <PointsMap points={servicePoints.map((sp) => ({ id: sp.id, name: sp.name, lat: sp.lat, lng: sp.lng }))} />
              <ul className={styles.rowList}>
                {servicePoints.map((sp) => (
                  <li key={sp.id} className={styles.rowItem}>
                    <span className={styles.rowMain}>
                      <span>{sp.name}</span>
                      <span className={styles.ref}>
                        {t(`portal.servicePointTypes.${sp.type}` as MessageKey)} · {sp.lat.toFixed(3)}, {sp.lng.toFixed(3)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className={`${styles.small} ${styles.muted}`}>{t("portal.interventions.locationNote")}</p>
            </RecordSection>
          ),
        },
        {
          id: "overlaps",
          label: t("portal.interventions.overlaps"),
          count: v.overlaps.length,
          content: (
            <RecordSection title={t("portal.interventions.overlaps")}>
              {v.overlaps.length === 0 ? (
                <p className={styles.muted}>{t("portal.interventions.noOverlaps")}</p>
              ) : (
                <ul className={styles.rowList}>
                  {v.overlaps.map((o) => (
                    <li key={o.intervention.id} className={styles.rowItem}>
                      <span className={styles.rowMain}>
                        <Link href={`/portal/interventions/${o.intervention.id}`} className={styles.recordLink}>
                          {o.intervention.title}
                        </Link>
                        <span className={styles.ref}>
                          {o.intervention.ref} · {o.partnerName} · {formatDate(o.intervention.startDate)} – {formatDate(o.intervention.endDate)}
                        </span>
                        {o.sharedServicePoints.length > 0 && (
                          <span className={styles.small}>{t("portal.interventions.sharedPoints", { count: o.sharedServicePoints.length })}</span>
                        )}
                        {o.resolved && <span className={styles.quoteSmall}>“{o.resolved.note}” — {o.resolved.by}</span>}
                      </span>
                      {o.resolved ? (
                        <Badge tone="success">{t("portal.interventions.resolved")}</Badge>
                      ) : (
                        <Badge tone="warning" icon="gitCompare">
                          {t("portal.interventions.unresolved")}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </RecordSection>
          ),
        },
        {
          id: "documents",
          label: t("portal.interventions.documents"),
          count: documents.length,
          content: (
            <RecordSection title={t("portal.interventions.documents")}>
              {documents.length === 0 ? (
                <p className={styles.muted}>{t("portal.interventions.missing.evidence")}</p>
              ) : (
                <ul className={styles.rowList}>
                  {documents.map((d) => (
                    <li key={d.id} className={styles.rowItem}>
                      <span className={styles.rowMain}>
                        <Link href={`/portal/documents/${d.id}`} className={styles.recordLink}>
                          {d.title}
                        </Link>
                        <span className={styles.ref}>
                          {d.ref} · {t(`portal.documents.categories.${d.category}` as MessageKey)}
                        </span>
                      </span>
                      <StatusBadge entity="document" status={d.status} />
                    </li>
                  ))}
                </ul>
              )}
            </RecordSection>
          ),
        },
        {
          id: "reports",
          label: t("portal.interventions.reportsHeading"),
          count: fieldReports.length,
          content: (
            <RecordSection title={t("portal.interventions.reportsHeading")}>
              {!["approved", "active", "completed", "closed"].includes(iv.status) && <Notice tone="info">{t("portal.interventions.reportingClosed")}</Notice>}
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
                          {r.ref} · {formatDate(r.collectedAt)}
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
          id: "partnerUpdates",
          label: t("portal.partnerUpdates.tab"),
          count: (iv.changeRequests ?? []).filter((c) => c.status === "submitted").length + (iv.progressUpdates ?? []).filter((u) => u.status === "awaiting_review").length + (iv.risks ?? []).filter((r) => r.status === "open").length + (iv.financialUpdates ?? []).filter((f) => f.status === "submitted").length || undefined,
          content: <InterventionPartnerUpdates intervention={iv} />,
        },
        {
          id: "comments",
          label: t("portal.partners.comments"),
          count: iv.comments.length,
          content: (
            <RecordSection title={t("portal.partners.comments")}>
              <CommentThread
                comments={iv.comments}
                label={t("portal.partners.comments")}
                emptyLabel={t("portal.comments.empty")}
                placeholderLabel={t("portal.comments.addLabel")}
                canAdd={canReview}
                onAdd={(text) => addInterventionComment(iv.id, text)}
              />
            </RecordSection>
          ),
        },
      ]}
    />
  );
}
