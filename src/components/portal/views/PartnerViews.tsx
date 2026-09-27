"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { DocumentRecord, PartnerStatus } from "@/lib/types";
import {
  addPartnerComment,
  approvePartner,
  assignReviewer,
  completeCompleteness,
  decideRenewal,
  getPartner,
  listPartners,
  recordVerificationOutcome,
  reinstatePartner,
  rejectPartner,
  requestPartnerChanges,
  runVerification,
  REQUESTABLE_DOCUMENTS,
  simulatePartnerResubmission,
  startCompletenessReview,
  suspendPartner,
  type PartnerRow,
} from "@/lib/services/partners";
import { decideStep } from "@/lib/services/documents";
import type { RecordFilters } from "@/lib/services/filters";
import { sectorName, settlementName } from "@/lib/services/lookup";
import { useCan, useServiceAction, useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, statusLabelKey, useStatusOptions } from "@/components/portal/StatusBadge";
import { FilterBar, useRecordFilters } from "@/components/portal/FilterBar";
import { Checklist, CommentThread, PermissionDenied, RecordNotFound, SimulatedTag, type StageState } from "@/components/portal/RecordBits";
import { FieldGrid, RecordPage, RecordSection, type RecordAction } from "@/components/portal/RecordPage";
import { ConfirmDialog } from "@/components/portal/ConfirmDialog";
import { PartnerProfileChanges } from "@/components/portal/PartnerSubmissions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SelectField } from "@/components/ui/Field";
import styles from "@/components/portal/portal.module.css";

const partnerStatuses: PartnerStatus[] = ["submitted", "completeness_review", "verification", "approved", "changes_requested", "rejected", "suspended"];
const complianceStatuses = ["compliant", "expiring", "expired", "incomplete"];

export function PartnersListView({ initialFilters, initialStatus }: { initialFilters: RecordFilters; initialStatus?: string }) {
  const { t, formatDate } = useI18n();
  const [filters, setFilters] = useRecordFilters(initialFilters);
  const { data, loading } = useServiceQuery(() => listPartners(filters), [JSON.stringify(filters)]);
  const statusOptions = useStatusOptions("partner", partnerStatuses);
  const complianceOptions = useStatusOptions("compliance", complianceStatuses);

  return (
    <>
      <PageHeader title={t("portal.partners.title")} intro={t("portal.partners.intro")} />
      <FilterBar value={filters} onChange={setFilters} fields={["district", "settlement", "sector"]} />
      <RecordTable<PartnerRow>
        rows={data}
        loading={loading}
        caption={t("portal.partners.title")}
        initialStatus={initialStatus}
        searchText={(p) => `${p.name} ${p.ref} ${p.registrationNo} ${p.assignedReviewer ?? ""}`}
        statusOptions={statusOptions}
        filters={[{ key: "compliance", label: t("portal.partners.compliance"), options: complianceOptions, test: (p, v) => p.compliance.status === v }]}
        columns={[
          {
            key: "name",
            header: t("portal.partners.organisation"),
            primary: true,
            sortValue: (p) => p.name,
            render: (p) => (
              <>
                <Link href={`/portal/partners/${p.id}`} className={styles.recordLink}>
                  {p.name}
                </Link>
                <span className={styles.ref}>{p.ref}</span>
              </>
            ),
          },
          { key: "sectors", header: t("portal.partners.sectors"), render: (p) => p.sectors.map(sectorName).join(", ") },
          { key: "areas", header: t("portal.partners.areas"), render: (p) => p.settlementIds.map(settlementName).join(", ") },
          { key: "status", header: t("portal.partners.accreditation"), sortValue: (p) => p.status, render: (p) => <StatusBadge entity="partner" status={p.status} /> },
          { key: "compliance", header: t("portal.partners.compliance"), render: (p) => <StatusBadge entity="compliance" status={p.compliance.status} /> },
          {
            key: "expiry",
            header: t("portal.partners.nextExpiry"),
            sortValue: (p) => p.compliance.nextExpiry?.at ?? "9999",
            render: (p) =>
              p.compliance.nextExpiry ? (
                <>
                  {formatDate(p.compliance.nextExpiry.at)}
                  <span className={styles.ref}>
                    {p.compliance.nextExpiry.label === "accreditation" ? t("portal.partners.accreditation") : p.compliance.nextExpiry.label}
                  </span>
                </>
              ) : (
                "—"
              ),
          },
          { key: "reviewer", header: t("portal.partners.reviewer"), render: (p) => p.assignedReviewer ?? <span className={styles.muted}>{t("portal.common.unassigned")}</span> },
          { key: "activity", header: t("portal.partners.lastActivity"), sortValue: (p) => p.lastActivityAt, render: (p) => formatDate(p.lastActivityAt) },
        ]}
      />
    </>
  );
}

function partnerStages(status: PartnerStatus, t: (k: MessageKey) => string): { key: string; label: string; state: StageState }[] {
  const order: PartnerStatus[] = ["submitted", "completeness_review", "verification"];
  const index = order.indexOf(status);
  const base = order.map((s, i) => ({
    key: s,
    label: t(statusLabelKey("partner", s)),
    state: (index === -1 ? "done" : i < index ? "done" : i === index ? "current" : "upcoming") as StageState,
  }));
  const decisionLabel =
    status === "approved" || status === "rejected" || status === "changes_requested" || status === "suspended"
      ? t(statusLabelKey("partner", status))
      : t("portal.partners.stageDecision");
  const decisionState: StageState =
    status === "approved" ? "done" : status === "rejected" || status === "suspended" ? "ended" : status === "changes_requested" ? "current" : "upcoming";
  if (status === "changes_requested") base[2].state = "skipped";
  return [...base, { key: "decision", label: decisionLabel, state: decisionState }];
}

export function PartnerDetailView({ id }: { id: string }) {
  const { t, formatDate } = useI18n();
  const fieldId = useId();
  const can = useCan();
  const { data, notFound, forbidden } = useServiceQuery(() => getPartner(id), [id]);
  const verify = useServiceAction();
  const [reviewer, setReviewer] = useState("");
  const [reviewerError, setReviewerError] = useState<string>();
  const [docDecision, setDocDecision] = useState<{ doc: DocumentRecord; decision: "approved" | "changes_requested" | "rejected" } | null>(null);
  const [manual, setManual] = useState<"ursb" | "ngoBureau" | null>(null);
  const [manualOutcome, setManualOutcome] = useState<"match" | "mismatch">("match");
  const [requestedDoc, setRequestedDoc] = useState("");

  if (forbidden) return <PermissionDenied />;
  if (notFound) return <RecordNotFound backHref="/portal/partners" />;
  if (!data) return <LoadingState label={t("common.loading")} />;

  const { partner, documents, interventions, compliance, eligibility, checks, reviewers } = data;
  const open = ["submitted", "completeness_review", "verification"].includes(partner.status);
  const canReview = can("partner.review");
  const canDecide = can("partner.decide");
  const chosenReviewer = reviewer || partner.assignedReviewer || "";

  const actions: RecordAction[] = [];
  if (open || partner.status === "changes_requested") {
    actions.push({
      key: "assign",
      label: partner.assignedReviewer ? t("portal.partners.reassign") : t("portal.partners.assign"),
      icon: "user",
      denied: !canReview,
      fields: (
        <SelectField
          id={`${fieldId}-reviewer`}
          label={t("portal.partners.reviewer")}
          error={reviewerError}
          value={chosenReviewer}
          onChange={(e) => {
            setReviewer(e.target.value);
            setReviewerError(undefined);
          }}
        >
          <option value="">{t("portal.common.choose")}</option>
          {reviewers.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </SelectField>
      ),
      validate: () => {
        if (chosenReviewer) return true;
        setReviewerError(t("portal.validation.chooseOne"));
        return false;
      },
      run: (note) => assignReviewer(partner.id, chosenReviewer, note),
    });
  }
  if (partner.status === "submitted") {
    actions.push({ key: "start", label: t("portal.partners.startCompleteness"), tone: "primary", icon: "clipboard", denied: !canReview, noNote: true, run: () => startCompletenessReview(partner.id) });
  }
  if (partner.status === "completeness_review") {
    actions.push({
      key: "complete",
      label: t("portal.partners.completeCompleteness"),
      tone: "primary",
      icon: "check",
      denied: !canReview,
      disabled: !checks.documentsUploaded,
      disabledReason: t("portal.partners.reasonDocsMissing"),
      run: (note) => completeCompleteness(partner.id, note),
    });
  }
  if (partner.status === "verification") {
    actions.push({
      key: "approve",
      label: t("portal.partners.approve"),
      tone: "primary",
      icon: "check",
      requiresNote: true,
      denied: !canDecide,
      disabled: !checks.ready,
      disabledReason: t("portal.partners.reasonChecks"),
      hint: t("portal.partners.approveHint"),
      run: (note) => approvePartner(partner.id, note),
    });
  }
  if (open) {
    actions.push({
      key: "changes",
      label: t("portal.partners.requestChanges"),
      icon: "arrowLeft",
      requiresNote: true,
      denied: !canDecide,
      fields: (
        <SelectField id={`${fieldId}-doc`} label={t("portal.partners.requestDocument")} hint={t("portal.partners.requestDocumentHint")} value={requestedDoc} onChange={(e) => setRequestedDoc(e.target.value)}>
          <option value="">{t("portal.partners.noDocumentRequest")}</option>
          {REQUESTABLE_DOCUMENTS.filter((title) => !documents.some((d) => d.title === title)).map((title) => (
            <option key={title} value={title}>
              {title}
            </option>
          ))}
        </SelectField>
      ),
      run: (note) => requestPartnerChanges(partner.id, note, requestedDoc || undefined),
    });
  }
  if (open || partner.status === "changes_requested") {
    actions.push({ key: "reject", label: t("portal.partners.reject"), tone: "danger", icon: "x", requiresNote: true, denied: !canDecide, run: (note) => rejectPartner(partner.id, note) });
  }
  if (partner.status === "changes_requested") {
    actions.push({
      key: "resubmit",
      label: t("portal.partners.simulateResubmission"),
      icon: "upload",
      noNote: true,
      hint: t("common.simulatedLong"),
      run: () => simulatePartnerResubmission(partner.id),
    });
  }
  if (partner.status === "approved") {
    if (partner.renewal?.status === "pending") {
      actions.push(
        { key: "renew", label: t("portal.partners.approveRenewal"), tone: "primary", icon: "refresh", requiresNote: true, denied: !canDecide, run: (note) => decideRenewal(partner.id, true, note) },
        { key: "declineRenewal", label: t("portal.partners.declineRenewal"), icon: "x", requiresNote: true, denied: !canDecide, run: (note) => decideRenewal(partner.id, false, note) },
      );
    }
    actions.push({ key: "suspend", label: t("portal.partners.suspend"), tone: "danger", icon: "pauseCircle", requiresNote: true, denied: !canDecide, run: (note) => suspendPartner(partner.id, note) });
  }
  if (partner.status === "suspended") {
    actions.push({ key: "reinstate", label: t("portal.partners.reinstate"), tone: "primary", icon: "refresh", requiresNote: true, denied: !canDecide, run: (note) => reinstatePartner(partner.id, note) });
  }

  const verificationCard = (service: "ursb" | "ngoBureau") => {
    const v = partner.verification[service];
    return (
      <div className={styles.subCard} key={service}>
        <div className={styles.subCardHead}>
          <h3 className={styles.subCardTitle}>{t(`portal.partners.${service}` as MessageKey)}</h3>
          <SimulatedTag />
        </div>
        <p>
          <StatusBadge entity="verification" status={v.outcome} />
        </p>
        {v.at && (
          <p className={`${styles.small} ${styles.muted}`}>
            {formatDate(v.at, true)}
            {v.reference && (
              <>
                {" "}
                · <span className={styles.monoInline}>{v.reference}</span>
              </>
            )}
          </p>
        )}
        {v.detail && <p className={styles.small}>{v.detail}</p>}
        {(partner.status === "verification" || partner.status === "approved") && canReview && (
          <div className={styles.buttonRow}>
            <Button
              size="sm"
              variant={v.outcome === "match" ? "secondary" : "primary"}
              icon="refresh"
              disabled={Boolean(verify.pending)}
              aria-busy={verify.pending === service || undefined}
              onClick={() =>
                verify.run(service, () => runVerification(partner.id, service), (outcome) =>
                  t("portal.partners.verificationDone", { outcome: t(statusLabelKey("verification", String(outcome))) }),
                )
              }
            >
              {verify.pending === service ? t("common.loading") : v.outcome === "not_run" ? t("portal.partners.runCheck") : t("portal.partners.runAgain")}
            </Button>
            {partner.status === "verification" && canDecide && v.outcome !== "match" && (
              <Button size="sm" variant="ghost" icon="pen" onClick={() => setManual(service)}>
                {t("portal.partners.recordManual")}
              </Button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <RecordPage
        back={{ href: "/portal/partners", label: t("portal.partners.back") }}
        eyebrow={`${t("portal.entity.partner")} · ${partner.ref}`}
        title={partner.name}
        badges={
          <>
            <StatusBadge entity="partner" status={partner.status} />
            <StatusBadge entity="compliance" status={compliance.status} />
            {eligibility.eligible ? (
              <Badge tone="success" icon="checkCircle">
                {t("portal.partners.eligible")}
              </Badge>
            ) : (
              <Badge tone="neutral" icon="lock">
                {t(`portal.partners.ineligible.${eligibility.reason}` as MessageKey)}
              </Badge>
            )}
          </>
        }
        meta={[partner.type, `${t("portal.partners.registration")} ${partner.registrationNo}`, `${t("portal.partners.submitted")} ${formatDate(partner.submittedAt)}`].join(" · ")}
        stages={partnerStages(partner.status, t)}
        notices={
          <>
            {!eligibility.eligible && partner.status !== "rejected" && !open && (
              <Notice tone="warning">{t("portal.partners.ineligibleNotice", { reason: t(`portal.partners.ineligible.${eligibility.reason}` as MessageKey) })}</Notice>
            )}
            {partner.renewal?.status === "pending" && <Notice tone="info">{t("portal.partners.renewalPending", { date: formatDate(partner.renewal.requestedAt) })}</Notice>}
            <div aria-live="polite">{verify.success && <Notice tone="success">{verify.success}</Notice>}</div>
            {verify.error && (
              <Notice tone="error" role="alert">
                {verify.error}
              </Notice>
            )}
          </>
        }
        actions={actions}
        timelineId={partner.id}
        tabs={[
          {
            id: "overview",
            label: t("portal.detail.overview"),
            content: (
              <>
                {(open || partner.status === "changes_requested") && (
                  <RecordSection title={t("portal.partners.checks")}>
                    <Checklist
                      items={[
                        { label: t("portal.partners.checkUploaded"), done: checks.documentsUploaded },
                        { label: t("portal.partners.checkVerified"), done: checks.documentsVerified },
                        { label: t("portal.partners.checkUrsb"), done: checks.ursb, extra: <SimulatedTag /> },
                        { label: t("portal.partners.checkNgoBureau"), done: checks.ngoBureau, extra: <SimulatedTag /> },
                      ]}
                    />
                  </RecordSection>
                )}
                <RecordSection title={t("portal.partners.profile")}>
                  <FieldGrid
                    items={[
                      { label: t("portal.partners.type"), value: partner.type },
                      { label: t("portal.partners.registration"), value: partner.registrationNo },
                      { label: t("portal.partners.sectors"), value: partner.sectors.map(sectorName).join(", ") },
                      { label: t("portal.partners.areas"), value: partner.settlementIds.map(settlementName).join(", ") },
                      { label: t("portal.partners.contactRole"), value: partner.focalRole },
                      { label: t("portal.partners.reviewer"), value: partner.assignedReviewer ?? t("portal.common.unassigned") },
                      { label: t("portal.partners.accreditedUntil"), value: partner.accreditedUntil ? formatDate(partner.accreditedUntil) : "—" },
                      {
                        label: t("portal.partners.nextExpiry"),
                        value: compliance.nextExpiry
                          ? `${formatDate(compliance.nextExpiry.at)} (${compliance.nextExpiry.label === "accreditation" ? t("portal.partners.accreditation") : compliance.nextExpiry.label})`
                          : "—",
                      },
                    ]}
                  />
                </RecordSection>
              </>
            ),
          },
          {
            id: "documents",
            label: t("portal.partners.documents"),
            count: documents.length,
            content: (
              <RecordSection title={t("portal.partners.documents")}>
                <ul className={styles.rowList}>
                  {documents.map((doc) => (
                    <li key={doc.id} className={styles.rowItem}>
                      <span className={styles.rowMain}>
                        <Link href={`/portal/documents/${doc.id}`} className={styles.recordLink}>
                          {doc.title}
                        </Link>
                        <span className={styles.ref}>
                          {doc.ref}
                          {doc.versions.length > 0 && ` · v${doc.versions[doc.versions.length - 1].version}`}
                          {doc.expiresAt && ` · ${t("portal.documents.expires", { date: formatDate(doc.expiresAt) })}`}
                        </span>
                      </span>
                      <StatusBadge entity="document" status={doc.status} />
                      {doc.status === "in_review" && doc.category === "partner_document" && can("document.review") && (
                        <span className={styles.buttonRow}>
                          <Button size="sm" variant="secondary" icon="check" aria-label={`${t("portal.partners.verifyDoc")}: ${doc.title}`} onClick={() => setDocDecision({ doc, decision: "approved" })}>
                            {t("portal.partners.verifyDoc")}
                          </Button>
                          <Button size="sm" variant="ghost" icon="arrowLeft" aria-label={`${t("portal.partners.returnDoc")}: ${doc.title}`} onClick={() => setDocDecision({ doc, decision: "changes_requested" })}>
                            {t("portal.partners.returnDoc")}
                          </Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </RecordSection>
            ),
          },
          {
            id: "verification",
            label: t("portal.partners.verification"),
            content: (
              <RecordSection title={t("portal.partners.verification")}>
                <Notice tone="simulated" title={t("common.simulated")}>
                  {t("portal.partners.verificationSimulated")}
                </Notice>
                <div className={styles.subCardGrid}>{(["ursb", "ngoBureau"] as const).map(verificationCard)}</div>
              </RecordSection>
            ),
          },
          {
            id: "permissions",
            label: t("portal.partners.permissions"),
            count: partner.permissions.length,
            content: (
              <RecordSection title={t("portal.partners.permissions")}>
                {partner.permissions.length === 0 ? (
                  <p className={styles.muted}>{t("portal.partners.noPermissions")}</p>
                ) : (
                  <div className={styles.tableScroll} role="region" aria-label={t("portal.partners.permissions")} tabIndex={0}>
                    <table className={`${styles.table} ${styles.tableCompact}`}>
                      <thead>
                        <tr>
                          <th scope="col">{t("portal.filters.settlement")}</th>
                          <th scope="col">{t("portal.filters.sector")}</th>
                          <th scope="col">{t("portal.partners.validUntil")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {partner.permissions.map((p) => (
                          <tr key={`${p.settlementId}-${p.sector}`}>
                            <td>{settlementName(p.settlementId)}</td>
                            <td>{sectorName(p.sector)}</td>
                            <td>
                              {formatDate(p.validUntil)}{" "}
                              {new Date(p.validUntil) < new Date() && (
                                <Badge tone="error" icon="alertTriangle">
                                  {t("portal.status.compliance.expired")}
                                </Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </RecordSection>
            ),
          },
          {
            id: "interventions",
            label: t("portal.partners.interventionsHeading"),
            count: interventions.length,
            content: (
              <RecordSection title={t("portal.partners.interventionsHeading")}>
                {interventions.length === 0 ? (
                  <p className={styles.muted}>{t("portal.partners.noInterventions")}</p>
                ) : (
                  <ul className={styles.rowList}>
                    {interventions.map((i) => (
                      <li key={i.id} className={styles.rowItem}>
                        <span className={styles.rowMain}>
                          <Link href={`/portal/interventions/${i.id}`} className={styles.recordLink}>
                            {i.title}
                          </Link>
                          <span className={styles.ref}>
                            {i.ref} · {settlementName(i.settlementId)}
                          </span>
                        </span>
                        <StatusBadge entity="intervention" status={i.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </RecordSection>
            ),
          },
          {
            id: "profileChanges",
            label: t("portal.partnerUpdates.profileChanges"),
            count: (partner.profileChanges ?? []).filter((c) => c.status === "under_review").length || undefined,
            content: <PartnerProfileChanges partner={partner} />,
          },
          {
            id: "comments",
            label: t("portal.partners.comments"),
            count: partner.comments.length,
            content: (
              <RecordSection title={t("portal.partners.comments")}>
                <CommentThread
                  comments={partner.comments}
                  label={t("portal.partners.comments")}
                  emptyLabel={t("portal.comments.empty")}
                  placeholderLabel={t("portal.comments.addLabel")}
                  canAdd={canReview}
                  onAdd={(text) => addPartnerComment(partner.id, text)}
                />
              </RecordSection>
            ),
          },
        ]}
      />

      <ConfirmDialog
        open={Boolean(docDecision)}
        title={docDecision ? `${docDecision.decision === "approved" ? t("portal.partners.verifyDoc") : t("portal.partners.returnDoc")}: ${docDecision.doc.title}` : ""}
        confirmLabel={docDecision?.decision === "approved" ? t("portal.partners.verifyDoc") : t("portal.partners.returnDoc")}
        onClose={() => setDocDecision(null)}
        onConfirm={(reason) => decideStep(docDecision!.doc.id, docDecision!.decision, reason)}
      />
      <ConfirmDialog
        open={Boolean(manual)}
        title={manual ? `${t("portal.partners.recordManual")}: ${t(`portal.partners.${manual}` as MessageKey)}` : ""}
        body={<p className={styles.small}>{t("portal.partners.recordManualHint")}</p>}
        confirmLabel={t("portal.partners.recordManual")}
        onClose={() => setManual(null)}
        onConfirm={(reason) => recordVerificationOutcome(partner.id, manual!, manualOutcome, reason)}
      >
        <SelectField id={`${fieldId}-outcome`} label={t("portal.partners.outcome")} value={manualOutcome} onChange={(e) => setManualOutcome(e.target.value as "match" | "mismatch")}>
          <option value="match">{t("portal.status.verification.match")}</option>
          <option value="mismatch">{t("portal.status.verification.mismatch")}</option>
        </SelectField>
      </ConfirmDialog>
    </>
  );
}
