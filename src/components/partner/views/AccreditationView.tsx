"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { PartnerStatus } from "@/lib/types";
import { getAccreditation, requestRenewal, resubmitApplication, submitApplication } from "@/lib/services/partnerAccount";
import { Badge } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Notice";
import { PageHeader, Section } from "@/components/portal/PageHeader";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { ActionBar, FieldGrid, type RecordAction } from "@/components/portal/RecordPage";
import { Checklist, CommentThread, SimulatedTag, WorkflowStepper, type StageState } from "@/components/portal/RecordBits";
import { AuditList } from "@/components/portal/AuditTimeline";
import { EligibilityNotice, Gate, usePartnerQuery } from "@/components/partner/PartnerBits";
import portal from "@/components/portal/portal.module.css";

type Stage = { key: string; label: string; state: StageState };

function stagesFor(status: PartnerStatus, t: (k: MessageKey) => string): Stage[] {
  const order = ["draft", "submit", "completeness", "checks"] as const;
  const position: Record<PartnerStatus, number> = {
    draft: 0,
    submitted: 2,
    completeness_review: 2,
    verification: 3,
    approved: 5,
    changes_requested: 4,
    rejected: 4,
    suspended: 5,
  };
  const at = position[status];
  const stages: Stage[] = order.map((key, index) => ({
    key,
    label: t(`partner.accreditation.stages.${key}` as MessageKey),
    state: index < at ? "done" : index === at ? "current" : "upcoming",
  }));
  if (status === "changes_requested") stages[3].state = "skipped";
  const decisionLabel = ["approved", "changes_requested", "rejected", "suspended"].includes(status) ? t(`portal.status.partner.${status}` as MessageKey) : t("partner.accreditation.stages.decision");
  const decisionState: StageState = status === "approved" ? "done" : status === "rejected" || status === "suspended" ? "ended" : status === "changes_requested" ? "current" : "upcoming";
  return [...stages, { key: "decision", label: decisionLabel, state: decisionState }];
}

export function AccreditationView() {
  const { t, formatDate } = useI18n();
  const q = usePartnerQuery(getAccreditation);

  return (
    <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner">
      {() => {
        const d = q.data!;
        const p = d.partner;
        const lastComment = [...d.comments].reverse().find((c) => !c.author.endsWith(`, ${p.acronym || p.name}`));
        const missing = d.checklist.items.filter((i) => !i.done);

        const actions: RecordAction[] = [];
        if (p.status === "draft") {
          actions.push({
            key: "submit",
            label: t("partner.accreditation.submit"),
            tone: "primary",
            icon: "send",
            noNote: true,
            denied: !d.canSubmit,
            disabled: !d.checklist.complete,
            disabledReason: t("partner.accreditation.completeFirst", { count: missing.length }),
            hint: t("partner.accreditation.submitHint"),
            run: () => submitApplication(),
            success: t("partner.accreditation.submitted"),
          });
        }
        if (p.status === "changes_requested") {
          actions.push({
            key: "resubmit",
            label: t("partner.accreditation.resubmit"),
            tone: "primary",
            icon: "send",
            requiresNote: true,
            noteLabel: t("partner.accreditation.responseLabel"),
            denied: !d.canSubmit,
            disabled: !d.checklist.complete,
            disabledReason: t("partner.accreditation.completeFirst", { count: missing.length }),
            hint: t("partner.accreditation.resubmitHint"),
            run: (note) => resubmitApplication(note),
            success: t("partner.accreditation.resubmitted"),
          });
        }
        if (d.renewalDue) {
          actions.push({ key: "renew", label: t("partner.accreditation.requestRenewal"), icon: "refresh", noNote: true, denied: !d.canSubmit, run: () => requestRenewal(), success: t("partner.accreditation.renewalRequested") });
        }

        return (
          <>
            <PageHeader eyebrow={`${p.name} · ${p.ref}`} title={t("partner.accreditation.title")} intro={t("partner.accreditation.intro")} meta={<StatusBadge entity="partner" status={p.status} />} />
            <div className={portal.stack}>
              <section className={portal.section} aria-label={t("portal.detail.workflow")}>
                <WorkflowStepper label={t("portal.detail.workflow")} stages={stagesFor(p.status, t)} />
              </section>

              {p.status === "suspended" && (
                <Notice tone="error" title={t("partner.accreditation.suspendedTitle")}>
                  <p>
                    <strong>{t("partner.accreditation.reason")}:</strong> {d.suspension?.reason ?? t("partner.accreditation.noReason")}
                    {d.suspension?.at && ` (${formatDate(d.suspension.at)})`}
                  </p>
                  <p>{t("partner.accreditation.suspendedNext")}</p>
                </Notice>
              )}
              {p.status !== "suspended" && <EligibilityNotice eligibility={d.eligibility} />}
              {p.status === "changes_requested" && (
                <Notice tone="warning" title={t("partner.accreditation.changesTitle")}>
                  {lastComment && (
                    <p>
                      <strong>{lastComment.author}:</strong> “{lastComment.text}”
                    </p>
                  )}
                  {missing.length > 0 && (
                    <>
                      <p>{t("partner.accreditation.stillNeeded")}</p>
                      <ul className={portal.plainList}>
                        {missing.map((m) => (
                          <li key={m.key}>{m.kind === "document" ? <Link href={`/partner/documents/${m.documentId}`}>{m.label}</Link> : <Link href="/partner/profile">{t(`partner.profile.issues.${m.label}` as MessageKey)}</Link>}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </Notice>
              )}
              {p.status === "rejected" && <Notice tone="error" title={t("partner.accreditation.rejectedTitle")}>{t("partner.accreditation.rejectedBody")}</Notice>}
              {OPEN(p.status) && <Notice tone="info">{t("partner.accreditation.inReview")}</Notice>}
              {p.renewal?.status === "pending" && <Notice tone="info">{t("partner.accreditation.renewalPending", { date: formatDate(p.renewal.requestedAt) })}</Notice>}

              <ActionBar actions={actions} />

              <div className={portal.grid}>
                <Section title={t("partner.accreditation.checklist")} actions={<span className={portal.muted}>{d.checklist.items.filter((i) => i.done).length}/{d.checklist.items.length}</span>}>
                  <Checklist
                    items={d.checklist.items.map((item) => ({
                      label:
                        item.kind === "document" ? (
                          <>
                            <Link href={`/partner/documents/${item.documentId}`}>{item.label}</Link> {item.requested && <Badge tone="warning">{t("partner.accreditation.requestedByOpm")}</Badge>}
                          </>
                        ) : (
                          <Link href="/partner/profile">{t(`partner.accreditation.fields.${item.label}` as MessageKey)}</Link>
                        ),
                      done: item.done,
                      stateLabel: item.done ? t("partner.accreditation.complete") : t("partner.accreditation.missing"),
                    }))}
                  />
                </Section>

                <div className={portal.stack}>
                  <Section title={t("partner.accreditation.summary")}>
                    <FieldGrid
                      items={[
                        { label: t("partner.accreditation.submittedOn"), value: p.status === "draft" ? t("partner.accreditation.notSubmitted") : formatDate(p.submittedAt) },
                        { label: t("partner.accreditation.reviewer"), value: p.assignedReviewer ?? t("portal.common.unassigned") },
                        { label: t("partner.accreditation.accreditedUntil"), value: p.accreditedUntil ? formatDate(p.accreditedUntil) : "—" },
                        { label: t("portal.partners.compliance"), value: <StatusBadge entity="compliance" status={d.compliance.status} /> },
                        {
                          label: t("portal.partners.nextExpiry"),
                          value: d.compliance.nextExpiry ? `${formatDate(d.compliance.nextExpiry.at)} (${d.compliance.nextExpiry.label === "accreditation" ? t("portal.partners.accreditation") : d.compliance.nextExpiry.label})` : "—",
                        },
                        { label: t("partner.accreditation.permissions"), value: p.permissions.length ? t("partner.accreditation.permissionCount", { count: p.permissions.length }) : "—" },
                      ]}
                    />
                  </Section>

                  <Section title={t("partner.accreditation.verification")} actions={<SimulatedTag />}>
                    <p className={portal.small}>{t("partner.accreditation.verificationHint")}</p>
                    <div className={portal.subCardGrid}>
                      {(["ursb", "ngoBureau"] as const).map((service) => {
                        const v = p.verification[service];
                        return (
                          <div key={service} className={portal.subCard}>
                            <div className={portal.subCardHead}>
                              <h3 className={portal.subCardTitle}>{t(`portal.partners.${service}` as MessageKey)}</h3>
                              <SimulatedTag />
                            </div>
                            <p>
                              <StatusBadge entity="verification" status={v.outcome} />
                            </p>
                            {v.at && (
                              <p className={`${portal.small} ${portal.muted}`}>
                                {formatDate(v.at, true)} {v.reference && <span className={portal.monoInline}>· {v.reference}</span>}
                              </p>
                            )}
                            {v.detail && <p className={portal.small}>{v.detail}</p>}
                          </div>
                        );
                      })}
                    </div>
                  </Section>
                </div>
              </div>

              <Section title={t("partner.accreditation.documents")} actions={<Link href="/partner/documents" className={portal.inlineLink}>{t("partner.accreditation.manageDocuments")}</Link>}>
                <ul className={portal.rowList}>
                  {d.documents.map((doc) => {
                    const opm = doc.route.filter((s) => s.decision && s.note);
                    return (
                      <li key={doc.id} className={portal.rowItem}>
                        <span className={portal.rowMain}>
                          <Link href={`/partner/documents/${doc.id}`} className={portal.recordLink}>
                            {doc.title}
                          </Link>
                          <span className={portal.ref}>
                            {doc.ref}
                            {doc.versions.length > 0 && ` · v${doc.versions[doc.versions.length - 1].version} · ${formatDate(doc.versions[doc.versions.length - 1].at)}`}
                            {doc.expiresAt && ` · ${t("portal.documents.expires", { date: formatDate(doc.expiresAt) })}`}
                          </span>
                          {opm.map((s) => (
                            <span key={s.id} className={portal.small}>
                              <strong>{t("partner.common.opmComment")}:</strong> {s.note}
                            </span>
                          ))}
                        </span>
                        <StatusBadge entity="document" status={doc.status} />
                      </li>
                    );
                  })}
                </ul>
              </Section>

              <div className={portal.grid}>
                <Section title={t("partner.accreditation.comments")}>
                  <CommentThread comments={d.comments} label={t("partner.accreditation.comments")} emptyLabel={t("portal.comments.empty")} />
                  <p className={`${portal.small} ${portal.muted}`}>
                    {t("partner.accreditation.replyWhere")} <Link href="/partner/messages?tab=correspondence">{t("partner.messages.correspondence")}</Link>
                  </p>
                </Section>
                <Section title={t("partner.accreditation.history")}>
                  <AuditList entries={d.history} emptyLabel={t("portal.detail.timelineEmpty")} />
                </Section>
              </div>
            </div>
          </>
        );
      }}
    </Gate>
  );
}

function OPEN(status: PartnerStatus) {
  return status === "submitted" || status === "completeness_review" || status === "verification";
}
