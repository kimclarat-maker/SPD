"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { FieldReportField, FieldReportKind, FieldReportStatus } from "@/lib/types";
import {
  acceptFieldReport,
  addFieldReportComment,
  escalateFieldReport,
  getFieldReport,
  listFieldReports,
  reopenFieldReport,
  resolveConflict,
  RETURNABLE_FIELDS,
  returnFieldReport,
  simulateDeviceSync,
  simulateResubmission,
  totalReached,
  type FieldReportRow,
} from "@/lib/services/fieldReports";
import type { RecordFilters } from "@/lib/services/filters";
import { indicatorLabel, sectorName, settlementName } from "@/lib/services/lookup";
import { useCan, useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, statusLabelKey, useStatusOptions } from "@/components/portal/StatusBadge";
import { FilterBar, useRecordFilters } from "@/components/portal/FilterBar";
import { FieldGrid, RecordPage, RecordSection, type RecordAction } from "@/components/portal/RecordPage";
import { CommentThread, PermissionDenied, RecordNotFound, SimulatedTag, type StageState } from "@/components/portal/RecordBits";
import { Notice } from "@/components/ui/Notice";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import styles from "@/components/portal/portal.module.css";

const statuses: FieldReportStatus[] = ["saved_offline", "awaiting_sync", "synced", "needs_review", "conflict", "accepted", "returned", "escalated"];
const kinds: FieldReportKind[] = ["site_visit", "activity_update", "survey", "distribution"];

export function FieldReportsListView({ initialFilters, initialStatus }: { initialFilters: RecordFilters; initialStatus?: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const [filters, setFilters] = useRecordFilters(initialFilters);
  const { data, loading } = useServiceQuery(() => listFieldReports(filters), [JSON.stringify(filters)]);
  const statusOptions = useStatusOptions("fieldReport", statuses);
  const counts = statuses.map((s) => ({ s, n: (data ?? []).filter((r) => r.status === s).length }));

  return (
    <>
      <PageHeader title={t("portal.fieldReports.title")} intro={t("portal.fieldReports.intro")} />
      <FilterBar value={filters} onChange={setFilters} />
      <ul className={styles.pipeline} aria-label={t("portal.fieldReports.pipeline")}>
        {counts.map(({ s, n }) => (
          <li key={s} className={styles.pipelineItem}>
            <StatusBadge entity="fieldReport" status={s} />
            <span className={styles.pipelineCount}>{formatNumber(n)}</span>
          </li>
        ))}
      </ul>
      <RecordTable<FieldReportRow>
        rows={data}
        loading={loading}
        caption={t("portal.fieldReports.title")}
        initialStatus={initialStatus}
        searchText={(r) => `${r.title} ${r.ref} ${r.interventionRef} ${r.submittedBy} ${r.partnerName}`}
        statusOptions={statusOptions}
        filters={[
          { key: "kind", label: t("portal.fieldReports.kind"), options: kinds.map((k) => ({ value: k, label: t(`portal.fieldReports.kinds.${k}` as MessageKey) })), test: (r, v) => r.kind === v },
          {
            key: "channel",
            label: t("portal.fieldReports.channel"),
            options: [
              { value: "offline", label: t("portal.fieldReports.channelOffline") },
              { value: "online", label: t("portal.fieldReports.channelOnline") },
            ],
            test: (r, v) => r.channel === v,
          },
        ]}
        columns={[
          {
            key: "title",
            header: t("portal.fieldReports.submission"),
            primary: true,
            sortValue: (r) => r.ref,
            render: (r) => (
              <>
                <Link href={`/portal/field-reports/${r.id}`} className={styles.recordLink}>
                  {r.title}
                </Link>
                <span className={styles.ref}>
                  {r.ref} · {t(`portal.fieldReports.kinds.${r.kind}` as MessageKey)}
                </span>
              </>
            ),
          },
          {
            key: "intervention",
            header: t("portal.fieldReports.intervention"),
            render: (r) => (
              <>
                {r.interventionRef}
                <span className={styles.ref}>{r.partnerName}</span>
              </>
            ),
          },
          { key: "place", header: t("portal.interventions.location"), render: (r) => settlementName(r.settlementId) },
          {
            key: "collected",
            header: t("portal.fieldReports.collected"),
            sortValue: (r) => r.collectedAt,
            render: (r) => (
              <>
                {formatDate(r.collectedAt, true)}
                <span className={styles.ref}>{r.channel === "offline" ? t("portal.fieldReports.channelOffline") : t("portal.fieldReports.channelOnline")}</span>
              </>
            ),
          },
          { key: "synced", header: t("portal.fieldReports.synced"), sortValue: (r) => r.syncedAt ?? "", render: (r) => (r.syncedAt ? formatDate(r.syncedAt, true) : <span className={styles.muted}>{t("portal.fieldReports.notSynced")}</span>) },
          { key: "reached", header: t("portal.fieldReports.reached"), numeric: true, sortValue: (r) => r.totalReached, render: (r) => formatNumber(r.totalReached) },
          {
            key: "status",
            header: t("portal.table.status"),
            sortValue: (r) => r.status,
            render: (r) => (
              <>
                <StatusBadge entity="fieldReport" status={r.status} />
                {r.issues.length > 0 && r.status !== "accepted" && (
                  <span className={styles.warnLine}>
                    <Icon name="alertTriangle" size={14} /> {t("portal.fieldReports.issueCount", { count: r.issues.length })}
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

function stagesFor(status: FieldReportStatus, t: (k: MessageKey) => string): { key: string; label: string; state: StageState }[] {
  const collected: StageState = status === "saved_offline" ? "current" : "done";
  const synced: StageState = status === "saved_offline" ? "upcoming" : status === "awaiting_sync" || status === "conflict" ? "current" : "done";
  const reviewDone = status === "accepted";
  const reviewState: StageState = reviewDone ? "done" : ["synced", "needs_review", "returned", "escalated"].includes(status) ? "current" : "upcoming";
  const reviewLabel = ["accepted", "returned", "escalated", "needs_review"].includes(status) ? t(statusLabelKey("fieldReport", status)) : t("portal.fieldReports.stageReview");
  return [
    { key: "collected", label: t("portal.fieldReports.stageCollected"), state: collected },
    { key: "synced", label: status === "conflict" ? t(statusLabelKey("fieldReport", "conflict")) : t("portal.fieldReports.stageSynced"), state: synced },
    { key: "review", label: reviewLabel, state: reviewState },
  ];
}

export function FieldReportDetailView({ id }: { id: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const fieldId = useId();
  const can = useCan();
  const { data, notFound, forbidden } = useServiceQuery(() => getFieldReport(id), [id]);
  const [versionId, setVersionId] = useState("");
  const [returnField, setReturnField] = useState<FieldReportField | "">("");

  if (forbidden) return <PermissionDenied />;
  if (notFound) return <RecordNotFound backHref="/portal/field-reports" />;
  if (!data) return <LoadingState label={t("common.loading")} />;

  const { report: r, intervention, partner, form, servicePoint, reviews, issues, indicatorChanges } = data;
  const canReview = can("field.review");
  const reviewable = r.status === "synced" || r.status === "needs_review";
  const interventionLive = ["approved", "active", "completed"].includes(intervention.status);
  const version = form?.versions.find((v) => v.version === r.formVersion);
  // Reports from the Field Operations Portal can be returned with a comment tied to one field.
  const fieldReturn: Partial<RecordAction> =
    r.kind !== "survey" && r.clientRecordId
      ? {
          fields: (
            <label className={styles.toolbarField}>
              <span className={styles.toolbarLabel}>{t("portal.fieldReports.returnField")}</span>
              <select className={styles.toolbarSelect} value={returnField} onChange={(e) => setReturnField(e.target.value as FieldReportField | "")}>
                <option value="">{t("portal.fieldReports.returnFieldNone")}</option>
                {RETURNABLE_FIELDS.map((f) => (
                  <option key={f} value={f}>
                    {t(`field.fieldNames.${f}` as MessageKey)}
                  </option>
                ))}
              </select>
            </label>
          ),
        }
      : {};

  const actions: RecordAction[] = [];
  if (r.status === "saved_offline" || r.status === "awaiting_sync") {
    actions.push({
      key: "sync",
      label: r.status === "saved_offline" ? t("portal.fieldReports.simulateConnect") : t("portal.fieldReports.simulateSync"),
      tone: "primary",
      icon: "cloud",
      noNote: true,
      denied: !canReview,
      hint: (
        <>
          <SimulatedTag /> {t("portal.fieldReports.syncHint")}
        </>
      ),
      success: (s) => t("portal.fieldReports.syncDone", { status: t(statusLabelKey("fieldReport", String(s))) }),
      run: () => simulateDeviceSync(r.id),
    });
  }
  if (reviewable) {
    actions.push({
      key: "accept",
      label: t("portal.fieldReports.accept"),
      tone: "primary",
      icon: "check",
      requiresNote: issues.length > 0,
      denied: !canReview,
      disabled: !interventionLive,
      disabledReason: t("portal.fieldReports.reasonIntervention"),
      hint: (
        <>
          {t("portal.fieldReports.acceptHint")} <SimulatedTag /> {t("portal.fieldReports.duplicateCheckHint")}
        </>
      ),
      success: (res) => {
        const flagged = (res as { flagged: number }).flagged;
        return flagged ? t("portal.fieldReports.acceptedFlagged", { count: flagged }) : t("portal.fieldReports.acceptedClean");
      },
      run: (note) => acceptFieldReport(r.id, note),
    });
    actions.push(
      { key: "return", label: t("portal.fieldReports.return"), icon: "arrowLeft", requiresNote: true, denied: !canReview, ...fieldReturn, run: (note) => returnFieldReport(r.id, note, returnField || undefined) },
      { key: "escalate", label: t("portal.fieldReports.escalate"), tone: "warning", icon: "flag", requiresNote: true, denied: !canReview, run: (note) => escalateFieldReport(r.id, note) },
    );
  }
  if (r.status === "escalated") {
    actions.push(
      { key: "reopen", label: t("portal.fieldReports.reopen"), icon: "refresh", requiresNote: true, denied: !canReview, run: (note) => reopenFieldReport(r.id, note) },
      { key: "return", label: t("portal.fieldReports.return"), icon: "arrowLeft", requiresNote: true, denied: !canReview, ...fieldReturn, run: (note) => returnFieldReport(r.id, note, returnField || undefined) },
    );
  }
  if (r.status === "conflict" && r.conflict) {
    const chosen = versionId || r.conflict.versions[0].id;
    actions.push({
      key: "conflict",
      label: t("portal.fieldReports.resolveConflict"),
      tone: "primary",
      icon: "gitCompare",
      requiresNote: true,
      denied: !canReview,
      hint: t("portal.fieldReports.conflictHint"),
      fields: (
        <fieldset className={styles.radioGroup}>
          <legend>{t("portal.fieldReports.chooseVersion")}</legend>
          {r.conflict.versions.map((v) => (
            <label key={v.id} className={styles.radio}>
              <input type="radio" name={`${fieldId}-v`} value={v.id} checked={chosen === v.id} onChange={() => setVersionId(v.id)} />
              <span>
                {v.device} · {formatDate(v.savedAt, true)}
              </span>
            </label>
          ))}
        </fieldset>
      ),
      run: (note) => resolveConflict(r.id, chosen, note),
    });
  }
  if (r.status === "returned") {
    actions.push({ key: "resubmit", label: t("portal.fieldReports.simulateResubmission"), icon: "upload", noNote: true, hint: t("common.simulatedLong"), run: () => simulateResubmission(r.id) });
  }

  const tabs = [
    {
      id: "submission",
      label: t("portal.fieldReports.submission"),
      content: (
        <RecordSection title={t("portal.fieldReports.submission")}>
          <FieldGrid
            items={[
              {
                label: t("portal.fieldReports.intervention"),
                value: (
                  <>
                    <Link href={`/portal/interventions/${intervention.id}`}>
                      {intervention.ref} {intervention.title}
                    </Link>{" "}
                    <StatusBadge entity="intervention" status={intervention.status} />
                  </>
                ),
              },
              { label: t("portal.interventions.partner"), value: <Link href={`/portal/partners/${partner.id}`}>{partner.name}</Link> },
              {
                label: t("portal.fieldReports.form"),
                value: form ? (
                  <>
                    <Link href={`/portal/surveys/forms/${form.id}`}>{form.title}</Link> · v{r.formVersion} {version && <StatusBadge entity="formVersion" status={version.status} />}
                  </>
                ) : (
                  "—"
                ),
              },
              { label: t("portal.fieldReports.kind"), value: t(`portal.fieldReports.kinds.${r.kind}` as MessageKey) },
              { label: t("portal.fieldReports.submittedBy"), value: r.submittedBy },
              { label: t("portal.fieldReports.channel"), value: r.channel === "offline" ? t("portal.fieldReports.channelOffline") : t("portal.fieldReports.channelOnline") },
              { label: t("portal.fieldReports.collected"), value: formatDate(r.collectedAt, true) },
              { label: t("portal.fieldReports.synced"), value: r.syncedAt ? formatDate(r.syncedAt, true) : t("portal.fieldReports.notSynced") },
              { label: t("portal.fieldReports.servicePoint"), value: servicePoint ? `${servicePoint.name} (${settlementName(servicePoint.settlementId)})` : settlementName(intervention.settlementId) },
              {
                label: t("portal.fieldReports.gps"),
                value: r.gps ? (
                  <span dir="ltr" className={styles.monoInline}>
                    {r.gps.lat.toFixed(4)}, {r.gps.lng.toFixed(4)} ± {r.gps.accuracyM} m
                  </span>
                ) : (
                  t("portal.fieldReports.noGps")
                ),
              },
              { label: t("portal.filters.sector"), value: sectorName(intervention.sector) },
            ]}
          />
          <p className={`${styles.small} ${styles.muted}`}>{t("portal.fieldReports.gpsNote")}</p>
        </RecordSection>
      ),
    },
    {
      id: "reach",
      label: t("portal.fieldReports.reachTab"),
      content: (
        <RecordSection title={t("portal.fieldReports.reachTab")}>
          <div className={styles.figureGrid}>
            {(
              [
                [t("portal.fieldReports.reached"), totalReached(r)],
                [t("portal.fieldReports.women"), r.reached.women],
                [t("portal.fieldReports.men"), r.reached.men],
                [t("portal.fieldReports.children"), r.reached.children],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className={styles.figure}>
                <span className={styles.figureValue}>{formatNumber(value)}</span>
                <span className={styles.figureLabel}>{label}</span>
              </div>
            ))}
          </div>
          {r.distributed.length > 0 && (
            <div className={styles.tableScroll} role="region" aria-label={t("portal.fieldReports.distributed")} tabIndex={0}>
              <table className={`${styles.table} ${styles.tableCompact}`}>
                <caption className={styles.tableCaption}>{t("portal.fieldReports.distributed")}</caption>
                <thead>
                  <tr>
                    <th scope="col">{t("portal.beneficiaries.item")}</th>
                    <th scope="col" className={styles.num}>
                      {t("portal.beneficiaries.quantity")}
                    </th>
                    <th scope="col" className={styles.num}>
                      {t("portal.beneficiaries.households")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {r.distributed.map((d) => (
                    <tr key={d.item}>
                      <td>{d.item}</td>
                      <td className={styles.num}>{formatNumber(d.quantity)}</td>
                      <td className={styles.num}>{formatNumber(d.households)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div>
            <p className={styles.subheading}>{t("portal.fieldReports.narrative")}</p>
            <p className={styles.quote}>{r.narrative}</p>
          </div>
        </RecordSection>
      ),
    },
    {
      id: "evidence",
      label: t("portal.fieldReports.evidence"),
      count: r.attachments.length,
      content: (
        <RecordSection title={t("portal.fieldReports.evidence")}>
          {r.attachments.length === 0 ? (
            <Notice tone="warning">{t("portal.fieldReports.noAttachments")}</Notice>
          ) : (
            <ul className={styles.rowList}>
              {r.attachments.map((a) => (
                <li key={a.id} className={styles.rowItem}>
                  <span className={styles.rowMain}>
                    <span>
                      <Icon name="paperclip" size={16} /> {a.name}
                    </span>
                    <span className={styles.ref}>
                      {t(`portal.fieldReports.attachmentKinds.${a.kind}` as MessageKey)} · {formatNumber(a.sizeKb)} KB
                    </span>
                  </span>
                  <Badge tone="neutral" icon="lock">
                    {t("portal.fieldReports.storedPrototype")}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </RecordSection>
      ),
    },
    {
      id: "validation",
      label: t("portal.fieldReports.validation"),
      count: issues.length,
      content: (
        <RecordSection title={t("portal.fieldReports.validation")}>
          {issues.length === 0 ? (
            <p className={styles.muted}>{r.syncedAt ? t("portal.fieldReports.noIssues") : t("portal.fieldReports.notValidated")}</p>
          ) : (
            <ul className={styles.issueList}>
              {issues.map((code) => (
                <li key={code}>
                  <Icon name="alertTriangle" size={18} />
                  <span>
                    <strong>{t(`portal.fieldReports.issues.${code}.title` as MessageKey)}</strong>
                    <span className={styles.small}> — {t(`portal.fieldReports.issues.${code}.body` as MessageKey)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </RecordSection>
      ),
    },
    {
      id: "indicators",
      label: t("portal.fieldReports.indicatorChanges"),
      count: indicatorChanges.length,
      content: (
        <RecordSection title={t("portal.fieldReports.indicatorChanges")}>
          <p className={`${styles.small} ${styles.muted}`}>{r.status === "accepted" ? t("portal.fieldReports.indicatorsCounted") : t("portal.fieldReports.indicatorsPending")}</p>
          <div className={styles.tableScroll} role="region" aria-label={t("portal.fieldReports.indicatorChanges")} tabIndex={0}>
            <table className={`${styles.table} ${styles.tableCompact}`}>
              <thead>
                <tr>
                  <th scope="col">{t("portal.surveys.indicator")}</th>
                  <th scope="col" className={styles.num}>
                    {t("portal.fieldReports.thisReport")}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t("portal.fieldReports.before")}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t("portal.fieldReports.after")}
                  </th>
                  <th scope="col" className={styles.num}>
                    {t("portal.surveys.target")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {indicatorChanges.map((c) => (
                  <tr key={c.indicatorId}>
                    <td>
                      <Link href={`/portal/surveys/indicators/${c.indicatorId}`}>{indicatorLabel(c.indicatorId)}</Link>
                    </td>
                    <td className={styles.num}>+{formatNumber(c.value)}</td>
                    <td className={styles.num}>{formatNumber(c.before)}</td>
                    <td className={styles.num}>
                      <strong>{formatNumber(c.after)}</strong>
                      {!c.counted && <span className={styles.ref}>{t("portal.fieldReports.ifAccepted")}</span>}
                    </td>
                    <td className={styles.num}>{c.target !== undefined ? formatNumber(c.target) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </RecordSection>
      ),
    },
    ...(r.conflict
      ? [
          {
            id: "conflict",
            label: t("portal.fieldReports.conflictTab"),
            content: (
              <RecordSection title={t("portal.fieldReports.conflictTab")}>
                <Notice tone={r.conflict.resolvedVersionId ? "success" : "warning"}>
                  {r.conflict.resolvedVersionId
                    ? t("portal.fieldReports.conflictResolved", {
                        device: r.conflict.versions.find((v) => v.id === r.conflict!.resolvedVersionId)?.device ?? "—",
                        by: r.conflict.resolvedBy ?? "—",
                      })
                    : t("portal.fieldReports.conflictOpen")}
                </Notice>
                <div className={styles.compare}>
                  {r.conflict.versions.map((v) => (
                    <section key={v.id} className={`${styles.subCard} ${r.conflict!.resolvedVersionId === v.id ? styles.subCardChosen : ""}`} aria-label={v.device}>
                      <div className={styles.subCardHead}>
                        <h3 className={styles.subCardTitle}>{v.device}</h3>
                        {r.conflict!.resolvedVersionId === v.id && <Badge tone="success">{t("portal.fieldReports.chosen")}</Badge>}
                      </div>
                      <FieldGrid
                        items={[
                          { label: t("portal.fieldReports.collectedBy"), value: v.collectedBy },
                          { label: t("portal.fieldReports.savedAt"), value: formatDate(v.savedAt, true) },
                          ...v.indicatorValues.map((iv) => ({ label: indicatorLabel(iv.indicatorId), value: formatNumber(iv.value) })),
                          { label: t("portal.fieldReports.narrative"), value: v.narrative, wide: true },
                        ]}
                      />
                    </section>
                  ))}
                </div>
                {r.conflict.note && <p className={styles.quote}>“{r.conflict.note}”</p>}
              </RecordSection>
            ),
          },
        ]
      : []),
    ...(reviews.length > 0
      ? [
          {
            id: "reviews",
            label: t("portal.fieldReports.reviewsRaised"),
            count: reviews.length,
            content: (
              <RecordSection title={t("portal.fieldReports.reviewsRaised")}>
                <Notice tone="info">{t("portal.beneficiaries.notBlocking")}</Notice>
                <ul className={styles.rowList}>
                  {reviews.map((rv) => (
                    <li key={rv.id} className={styles.rowItem}>
                      <span className={styles.rowMain}>
                        {can("beneficiary.review") ? (
                          <Link href={`/portal/beneficiaries/reviews/${rv.id}`} className={styles.recordLink}>
                            {rv.ref}
                          </Link>
                        ) : (
                          <span>{rv.ref}</span>
                        )}
                        <span className={styles.ref}>{rv.householdMasked}</span>
                      </span>
                      <StatusBadge entity="review" status={rv.status} />
                    </li>
                  ))}
                </ul>
              </RecordSection>
            ),
          },
        ]
      : []),
    ...(r.activityType || r.outputs || r.answers?.length || r.history?.length
      ? [
          {
            id: "partner",
            label: t("portal.partnerUpdates.fieldTab"),
            count: r.history?.length || undefined,
            content: (
              <>
                <RecordSection title={t("portal.partnerUpdates.fieldTab")}>
                  <FieldGrid
                    items={[
                      { label: t("portal.partnerUpdates.activityType"), value: r.activityType ?? "—" },
                      { label: t("portal.partnerUpdates.locationNote"), value: r.locationNote ?? "—" },
                      { label: t("portal.partnerUpdates.outputs"), value: r.outputs ?? "—", wide: true },
                      { label: t("portal.partnerUpdates.challenges"), value: r.challenges ?? "—", wide: true },
                      ...(r.followUpActions ? [{ label: t("portal.fieldReports.followUp"), value: r.followUpActions, wide: true }] : []),
                      ...(r.gpsUnavailableReason ? [{ label: t("portal.fieldReports.gpsReason"), value: r.gpsUnavailableReason, wide: true }] : []),
                      ...(form && r.answers?.length
                        ? (form.versions.find((v) => v.version === r.formVersion)?.questions ?? []).map((q) => ({ label: `${q.label} (v${r.formVersion})`, value: r.answers!.find((a) => a.questionId === q.id)?.value || "—" }))
                        : []),
                    ]}
                  />
                </RecordSection>
                {(r.history ?? []).length > 0 && (
                  <RecordSection title={t("portal.partnerUpdates.versions")}>
                    <ul className={styles.rowList}>
                      {[...(r.history ?? [])].reverse().map((h) => (
                        <li key={h.version} className={styles.rowItem}>
                          <span className={styles.rowMain}>
                            <strong>v{h.version}</strong>
                            <span className={styles.ref}>
                              {h.by} · {formatDate(h.at, true)}
                            </span>
                            <span className={styles.small}>“{h.note}”</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </RecordSection>
                )}
              </>
            ),
          },
        ]
      : []),
    {
      id: "comments",
      label: t("portal.fieldReports.reviewerComments"),
      count: r.comments.length,
      content: (
        <RecordSection title={t("portal.fieldReports.reviewerComments")}>
          <CommentThread
            comments={r.comments}
            label={t("portal.fieldReports.reviewerComments")}
            emptyLabel={t("portal.comments.empty")}
            placeholderLabel={t("portal.comments.addLabel")}
            canAdd={canReview}
            onAdd={(text) => addFieldReportComment(r.id, text)}
          />
        </RecordSection>
      ),
    },
  ];

  return (
    <RecordPage
      back={{ href: "/portal/field-reports", label: t("portal.fieldReports.back") }}
      eyebrow={`${t("portal.entity.fieldReport")} · ${r.ref}`}
      title={r.title}
      badges={
        <>
          <StatusBadge entity="fieldReport" status={r.status} />
          <Badge tone="neutral" icon={r.channel === "offline" ? "wifiOff" : "cloud"}>
            {r.channel === "offline" ? t("portal.fieldReports.channelOffline") : t("portal.fieldReports.channelOnline")}
          </Badge>
          {issues.length > 0 && r.status !== "accepted" && (
            <Badge tone="warning" icon="alertTriangle">
              {t("portal.fieldReports.issueCount", { count: issues.length })}
            </Badge>
          )}
        </>
      }
      meta={[`${intervention.ref} ${intervention.title}`, r.submittedBy, formatDate(r.collectedAt, true)].join(" · ")}
      stages={stagesFor(r.status, t)}
      notices={
        <>
          {r.status === "accepted" && <Notice tone="success">{t("portal.fieldReports.acceptedEffect")}</Notice>}
          {reviewable && !interventionLive && (
            <Notice tone="warning">
              <p>{t("portal.fieldReports.interventionNotLive")}</p>
              <Link href={`/portal/interventions/${intervention.id}`} className={styles.inlineLink}>
                {t("portal.fieldReports.openIntervention")}
                <Icon name="arrowRight" size={16} />
              </Link>
            </Notice>
          )}
          {r.status === "conflict" && <Notice tone="warning">{t("portal.fieldReports.conflictOpen")}</Notice>}
          {(r.status === "saved_offline" || r.status === "awaiting_sync") && <Notice tone="info">{t(`portal.fieldReports.pending.${r.status}` as MessageKey)}</Notice>}
        </>
      }
      actions={actions}
      timelineId={r.id}
      tabs={tabs}
    />
  );
}
