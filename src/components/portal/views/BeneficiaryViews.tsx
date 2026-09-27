"use client";

import Link from "next/link";
import { useCallback, useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { BeneficiaryReview, ReviewStatus } from "@/lib/types";
import {
  addReviewNote,
  assignReview,
  decideReview,
  escalateReview,
  getAssistanceSummary,
  getReview,
  listReviews,
  requestProgresVerification,
  revealRestricted,
  type AssistanceGroup,
  type ReviewRow,
} from "@/lib/services/beneficiaries";
import type { RecordFilters } from "@/lib/services/filters";
import { partnerName, sectorName, settlementName } from "@/lib/services/lookup";
import { useCan, useErrorMessage, useServiceAction, useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, statusLabelKey, useStatusOptions } from "@/components/portal/StatusBadge";
import { FilterBar, useRecordFilters } from "@/components/portal/FilterBar";
import { FieldGrid, PageTabs, RecordPage, RecordSection, type RecordAction } from "@/components/portal/RecordPage";
import { CommentThread, EmptyState, ErrorState, Masked, PermissionDenied, RecordNotFound, SimulatedTag } from "@/components/portal/RecordBits";
import { Notice } from "@/components/ui/Notice";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SelectField, TextAreaField } from "@/components/ui/Field";
import styles from "@/components/portal/portal.module.css";

const reviewStatuses: ReviewStatus[] = ["open", "in_review", "escalated", "resolved_valid", "resolved_duplicate"];
const groups: AssistanceGroup[] = ["settlement", "sector", "partner", "item", "period"];

export function BeneficiariesView({ initialTab, initialFilters, initialStatus }: { initialTab?: string; initialFilters: RecordFilters; initialStatus?: string }) {
  const { t } = useI18n();
  const can = useCan();
  const [tab, setTab] = useState(initialTab === "reviews" ? "reviews" : "summary");
  const extra = useCallback(() => ({ tab }), [tab]);
  const [filters, setFilters] = useRecordFilters(initialFilters, extra);

  if (!can("beneficiary.aggregate") && !can("beneficiary.review")) {
    return (
      <>
        <PageHeader title={t("portal.beneficiaries.title")} />
        <PermissionDenied />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("portal.beneficiaries.title")} intro={t("portal.beneficiaries.intro")} />
      <FilterBar value={filters} onChange={setFilters} />
      <PageTabs
        label={t("portal.beneficiaries.title")}
        active={tab}
        onChange={(next) => {
          setTab(next);
          setFilters({ ...filters });
        }}
        tabs={[
          { id: "summary", label: t("portal.beneficiaries.summaryTab"), content: can("beneficiary.aggregate") ? <Summary filters={filters} /> : <PermissionDenied /> },
          {
            id: "reviews",
            label: t("portal.beneficiaries.queueTab"),
            content: can("beneficiary.review") ? <Queue filters={filters} initialStatus={initialStatus} /> : <PermissionDenied body={t("portal.beneficiaries.queueDenied")} />,
          },
        ]}
      />
    </>
  );
}

function Summary({ filters }: { filters: RecordFilters }) {
  const { t, formatNumber } = useI18n();
  const id = useId();
  const toMessage = useErrorMessage();
  const [group, setGroup] = useState<AssistanceGroup>("settlement");
  const { data, error } = useServiceQuery(() => getAssistanceSummary(filters, group), [JSON.stringify(filters), group]);
  if (error) return <ErrorState message={toMessage(error)} />;
  if (!data) return <LoadingState label={t("common.loading")} />;

  const label = (key: string) => {
    switch (group) {
      case "settlement":
        return settlementName(key);
      case "sector":
        return sectorName(key);
      case "partner":
        return partnerName(key);
      default:
        return key;
    }
  };

  return (
    <div className={styles.stack}>
      <Notice tone="info">{t("portal.beneficiaries.aggregateNote")}</Notice>
      <div className={styles.figureGrid}>
        {(
          [
            [t("portal.beneficiaries.quantity"), data.totals.quantity],
            [t("portal.beneficiaries.households"), data.totals.households],
            [t("portal.beneficiaries.records"), data.totals.records],
            [t("portal.beneficiaries.flagged"), data.totals.flagged],
          ] as const
        ).map(([l, v]) => (
          <div key={l} className={styles.figure}>
            <span className={styles.figureValue}>{formatNumber(v)}</span>
            <span className={styles.figureLabel}>{l}</span>
          </div>
        ))}
      </div>
      <div className={styles.toolbar}>
        <div className={styles.toolbarField}>
          <label htmlFor={`${id}-g`} className={styles.toolbarLabel}>
            {t("portal.beneficiaries.groupBy")}
          </label>
          <select id={`${id}-g`} className={styles.toolbarSelect} value={group} onChange={(e) => setGroup(e.target.value as AssistanceGroup)}>
            {groups.map((g) => (
              <option key={g} value={g}>
                {t(`portal.beneficiaries.groups.${g}` as MessageKey)}
              </option>
            ))}
          </select>
        </div>
      </div>
      {data.lines.length === 0 ? (
        <EmptyState title={t("portal.table.empty")} />
      ) : (
        <div className={styles.tableScroll} role="region" aria-label={t("portal.beneficiaries.summaryTab")} tabIndex={0}>
          <table className={`${styles.table} ${styles.tableCompact}`}>
            <caption className="visually-hidden">{t("portal.beneficiaries.summaryTab")}</caption>
            <thead>
              <tr>
                <th scope="col">{t(`portal.beneficiaries.groups.${group}` as MessageKey)}</th>
                <th scope="col" className={styles.num}>
                  {t("portal.beneficiaries.quantity")}
                </th>
                <th scope="col" className={styles.num}>
                  {t("portal.beneficiaries.households")}
                </th>
                <th scope="col" className={styles.num}>
                  {t("portal.beneficiaries.records")}
                </th>
              </tr>
            </thead>
            <tbody>
              {data.lines.map((l) => (
                <tr key={l.key}>
                  <th scope="row">{label(l.key)}</th>
                  <td className={styles.num}>{formatNumber(l.quantity)}</td>
                  <td className={styles.num}>{formatNumber(l.households)}</td>
                  <td className={styles.num}>{formatNumber(l.records)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Queue({ filters, initialStatus }: { filters: RecordFilters; initialStatus?: string }) {
  const { t, formatDate } = useI18n();
  const toMessage = useErrorMessage();
  const { data, loading, error } = useServiceQuery(() => listReviews(filters), [JSON.stringify(filters)]);
  const statusOptions = useStatusOptions("review", reviewStatuses);
  return (
    <div className={styles.stack}>
      <Notice tone="info">{t("portal.beneficiaries.notBlocking")}</Notice>
      <RecordTable<ReviewRow>
        rows={data}
        loading={loading}
        error={error ? toMessage(error) : null}
        caption={t("portal.beneficiaries.queueTab")}
        initialStatus={initialStatus}
        searchText={(r) => `${r.ref} ${r.householdMasked} ${r.fieldReportRef} ${r.partnerName}`}
        statusOptions={statusOptions}
        filters={[
          {
            key: "kind",
            label: t("portal.beneficiaries.kind"),
            options: ["possible_duplicate", "verification_issue"].map((k) => ({ value: k, label: t(`portal.beneficiaries.kinds.${k}` as MessageKey) })),
            test: (r, v) => r.kind === v,
          },
        ]}
        columns={[
          {
            key: "ref",
            header: t("portal.table.reference"),
            primary: true,
            sortValue: (r) => r.ref,
            render: (r) => (
              <>
                <Link href={`/portal/beneficiaries/reviews/${r.id}`} className={styles.recordLink}>
                  {r.ref}
                </Link>
                <span className={styles.ref}>{t(`portal.beneficiaries.kinds.${r.kind}` as MessageKey)}</span>
              </>
            ),
          },
          { key: "household", header: t("portal.beneficiaries.household"), render: (r) => <Masked value={r.householdMasked} masked /> },
          {
            key: "source",
            header: t("portal.beneficiaries.source"),
            render: (r) => (
              <>
                {r.fieldReportRef}
                <span className={styles.ref}>
                  {settlementName(r.settlementId)} · {r.partnerName}
                </span>
              </>
            ),
          },
          {
            key: "progres",
            header: t("portal.beneficiaries.progres"),
            render: (r) => <StatusBadge entity="progres" status={r.progres.outcome} />,
          },
          { key: "assigned", header: t("portal.beneficiaries.assignedTo"), render: (r) => r.assignedTo ?? <span className={styles.muted}>{t("portal.common.unassigned")}</span> },
          { key: "detected", header: t("portal.beneficiaries.detected"), sortValue: (r) => r.detectedAt, render: (r) => formatDate(r.detectedAt) },
          { key: "status", header: t("portal.table.status"), sortValue: (r) => r.status, render: (r) => <StatusBadge entity="review" status={r.status} /> },
        ]}
      />
    </div>
  );
}

export function ReviewDetailView({ id }: { id: string }) {
  const { t, formatDate } = useI18n();
  const fieldId = useId();
  const can = useCan();
  const { data, notFound, forbidden } = useServiceQuery(() => getReview(id), [id]);
  const reveal = useServiceAction();
  const progres = useServiceAction();
  const [restricted, setRestricted] = useState<BeneficiaryReview["restricted"] | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string>();
  const [reviewer, setReviewer] = useState("");
  const [reviewerError, setReviewerError] = useState<string>();

  if (forbidden) return <PermissionDenied body={t("portal.beneficiaries.queueDenied")} />;
  if (notFound) return <RecordNotFound backHref="/portal/beneficiaries?tab=reviews" />;
  if (!data) return <LoadingState label={t("common.loading")} />;

  const { review: rv, report, assistance, intervention, reviewers } = data;
  const openStatus = ["open", "in_review", "escalated"].includes(rv.status);
  const chosenReviewer = reviewer || rv.assignedTo || "";
  const overrideNeeded = rv.progres.outcome !== "success";

  const actions: RecordAction[] = [];
  if (openStatus) {
    actions.push({
      key: "assign",
      label: rv.assignedTo ? t("portal.partners.reassign") : t("portal.partners.assign"),
      icon: "user",
      noNote: true,
      fields: (
        <SelectField id={`${fieldId}-r`} label={t("portal.beneficiaries.assignedTo")} error={reviewerError} value={chosenReviewer} onChange={(e) => (setReviewer(e.target.value), setReviewerError(undefined))}>
          <option value="">{t("portal.common.choose")}</option>
          {reviewers.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </SelectField>
      ),
      validate: () => (chosenReviewer ? true : (setReviewerError(t("portal.validation.chooseOne")), false)),
      run: () => assignReview(rv.id, chosenReviewer),
    });
    const decisionHint = overrideNeeded ? t("portal.beneficiaries.overrideHint", { outcome: t(statusLabelKey("progres", rv.progres.outcome)) }) : t("portal.beneficiaries.decisionHint");
    actions.push(
      { key: "valid", label: t("portal.beneficiaries.confirmValid"), tone: "primary", icon: "check", requiresNote: true, hint: decisionHint, run: (note) => decideReview(rv.id, "valid", note) },
      { key: "duplicate", label: t("portal.beneficiaries.confirmDuplicate"), icon: "minusCircle", requiresNote: true, hint: `${decisionHint} ${t("portal.beneficiaries.duplicateHint")}`, run: (note) => decideReview(rv.id, "duplicate", note) },
    );
    if (rv.status !== "escalated") actions.push({ key: "escalate", label: t("portal.beneficiaries.escalate"), tone: "warning", icon: "alertTriangle", requiresNote: true, run: (note) => escalateReview(rv.id, note) });
  }

  return (
    <RecordPage
      back={{ href: "/portal/beneficiaries?tab=reviews", label: t("portal.beneficiaries.back") }}
      eyebrow={`${t("portal.entity.review")} · ${t(`portal.beneficiaries.kinds.${rv.kind}` as MessageKey)}`}
      title={rv.ref}
      mono
      badges={
        <>
          <StatusBadge entity="review" status={rv.status} />
          <StatusBadge entity="progres" status={rv.progres.outcome} />
          <SimulatedTag />
        </>
      }
      meta={[settlementName(intervention.settlementId), rv.partnerName, `${t("portal.beneficiaries.detected")} ${formatDate(rv.detectedAt)}`].join(" · ")}
      notices={
        <>
          <Notice tone="info" title={t("portal.beneficiaries.humanReview")}>
            {t("portal.beneficiaries.notBlocking")}
          </Notice>
          {rv.status === "waiting" && report && <Notice tone="warning">{t("portal.beneficiaries.waiting", { ref: report.ref })}</Notice>}
          <div aria-live="polite">{progres.success && <Notice tone="success">{progres.success}</Notice>}</div>
          {progres.error && (
            <Notice tone="error" role="alert">
              {progres.error}
            </Notice>
          )}
        </>
      }
      actions={actions}
      timelineId={rv.id}
      tabs={[
        {
          id: "summary",
          label: t("portal.detail.overview"),
          content: (
            <>
              <RecordSection title={t("portal.detail.overview")}>
                <p>{rv.summary}</p>
                <FieldGrid
                  items={[
                    { label: t("portal.beneficiaries.household"), value: <Masked value={restricted?.householdRef ?? rv.householdMasked} masked={!restricted} /> },
                    { label: t("portal.beneficiaries.kind"), value: t(`portal.beneficiaries.kinds.${rv.kind}` as MessageKey) },
                    {
                      label: t("portal.beneficiaries.source"),
                      value: (
                        <>
                          {report ? (
                            <>
                              <Link href={`/portal/field-reports/${report.id}`}>{report.ref}</Link> <StatusBadge entity="fieldReport" status={report.status} />
                            </>
                          ) : (
                            <>
                              {assistance?.ref} · {t("portal.beneficiaries.partnerAssistanceEntry")} <SimulatedTag />
                            </>
                          )}
                        </>
                      ),
                    },
                    { label: t("portal.fieldReports.intervention"), value: <Link href={`/portal/interventions/${intervention.id}`}>{intervention.ref}</Link> },
                    { label: t("portal.beneficiaries.assignedTo"), value: rv.assignedTo ?? t("portal.common.unassigned") },
                    { label: t("portal.beneficiaries.assistanceStatus"), value: <Badge tone="success">{t("portal.beneficiaries.assistanceContinues")}</Badge> },
                  ]}
                />
              </RecordSection>
              <RecordSection title={t("portal.beneficiaries.restrictedTitle")} actions={<Badge tone="neutral" icon="lock">{t("portal.detail.restricted")}</Badge>}>
                {restricted ? (
                  <>
                    <FieldGrid
                      items={[
                        { label: t("portal.beneficiaries.householdRef"), value: <span className={styles.monoInline}>{restricted.householdRef}</span> },
                        { label: t("portal.beneficiaries.householdSize"), value: restricted.householdSize },
                        { label: t("portal.beneficiaries.progresId"), value: <span className={styles.monoInline}>{restricted.progresId}</span> },
                        { label: t("portal.beneficiaries.association"), value: restricted.association, wide: true },
                      ]}
                    />
                    <div>
                      <Button size="sm" variant="secondary" icon="eyeOff" onClick={() => setRestricted(null)}>
                        {t("portal.beneficiaries.hide")}
                      </Button>
                    </div>
                  </>
                ) : (
                  <form
                    className={styles.inlineForm}
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!reason.trim()) {
                        setReasonError(t("portal.detail.noteRequired"));
                        return;
                      }
                      setReasonError(undefined);
                      let result: BeneficiaryReview["restricted"] | null = null;
                      const ok = await reveal.run("reveal", async () => {
                        result = await revealRestricted(rv.id, reason);
                      });
                      if (ok && result) {
                        setRestricted(result);
                        setReason("");
                      }
                    }}
                  >
                    <p className={styles.small}>{t("portal.beneficiaries.revealIntro")}</p>
                    <TextAreaField
                      id={`${fieldId}-why`}
                      label={t("portal.beneficiaries.revealReason")}
                      hint={t("portal.beneficiaries.revealHint")}
                      requiredLabel={t("common.requiredMarker")}
                      value={reason}
                      error={reasonError}
                      onChange={(e) => setReason(e.target.value)}
                    />
                    <div>
                      <Button type="submit" variant="secondary" icon="eye" disabled={Boolean(reveal.pending) || !can("beneficiary.review")}>
                        {reveal.pending ? t("common.loading") : t("portal.beneficiaries.reveal")}
                      </Button>
                    </div>
                    {reveal.error && (
                      <Notice tone="error" role="alert">
                        {reveal.error}
                      </Notice>
                    )}
                  </form>
                )}
              </RecordSection>
            </>
          ),
        },
        {
          id: "history",
          label: t("portal.beneficiaries.assistanceHistory"),
          count: rv.history.length,
          content: (
            <RecordSection title={t("portal.beneficiaries.assistanceHistory")}>
              <div className={styles.tableScroll} role="region" aria-label={t("portal.beneficiaries.assistanceHistory")} tabIndex={0}>
                <table className={`${styles.table} ${styles.tableCompact}`}>
                  <thead>
                    <tr>
                      <th scope="col">{t("portal.beneficiaries.item")}</th>
                      <th scope="col">{t("portal.interventions.partner")}</th>
                      <th scope="col">{t("portal.beneficiaries.date")}</th>
                      <th scope="col">{t("portal.beneficiaries.sourceRecord")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rv.history.map((h, index) => (
                      <tr key={index}>
                        <td>{h.item}</td>
                        <td>{h.partnerName}</td>
                        <td>{formatDate(h.date)}</td>
                        <td className={styles.monoInline}>{h.source}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </RecordSection>
          ),
        },
        {
          id: "progres",
          label: t("portal.beneficiaries.progres"),
          content: (
            <RecordSection title={t("portal.beneficiaries.progresTitle")} actions={<SimulatedTag />}>
              <Notice tone="simulated" title={t("common.simulated")}>
                {t("portal.beneficiaries.progresSimulated")}
              </Notice>
              <FieldGrid
                items={[
                  { label: t("portal.beneficiaries.progresOutcome"), value: <StatusBadge entity="progres" status={rv.progres.outcome} /> },
                  { label: t("portal.beneficiaries.attempts"), value: rv.progres.attempts },
                  { label: t("portal.beneficiaries.lastAttempt"), value: rv.progres.at ? formatDate(rv.progres.at, true) : "—" },
                  { label: t("portal.beneficiaries.progresDetail"), value: rv.progres.detail ?? "—", wide: true },
                ]}
              />
              {openStatus && (
                <div className={styles.buttonRow}>
                  <Button
                    variant={rv.progres.outcome === "success" ? "secondary" : "primary"}
                    icon="refresh"
                    disabled={Boolean(progres.pending) || !can("beneficiary.review")}
                    aria-busy={Boolean(progres.pending) || undefined}
                    onClick={() =>
                      progres.run("progres", () => requestProgresVerification(rv.id), (o) =>
                        t("portal.beneficiaries.progresDone", { outcome: t(statusLabelKey("progres", String(o))) }),
                      )
                    }
                  >
                    {progres.pending ? t("common.loading") : rv.progres.attempts ? t("portal.beneficiaries.progresRetry") : t("portal.beneficiaries.progresRequest")}
                  </Button>
                  <Link href="/portal/integrations/progres" className={styles.inlineLink}>
                    {t("portal.beneficiaries.progresHistory")}
                  </Link>
                </div>
              )}
            </RecordSection>
          ),
        },
        {
          id: "notes",
          label: t("portal.beneficiaries.notes"),
          count: rv.notes.length,
          content: (
            <RecordSection title={t("portal.beneficiaries.notes")}>
              <CommentThread comments={rv.notes} label={t("portal.beneficiaries.notes")} emptyLabel={t("portal.comments.empty")} placeholderLabel={t("portal.comments.addLabel")} onAdd={(text) => addReviewNote(rv.id, text)} />
              {rv.overrides.length > 0 && (
                <div>
                  <p className={styles.subheading}>{t("portal.beneficiaries.overrides")}</p>
                  <ul className={styles.commentList}>
                    {rv.overrides.map((o, index) => (
                      <li key={index} className={styles.comment}>
                        <p className={styles.commentMeta}>
                          <strong>{o.by}</strong> · {formatDate(o.at, true)}
                        </p>
                        <p>{o.note}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </RecordSection>
          ),
        },
      ]}
    />
  );
}
