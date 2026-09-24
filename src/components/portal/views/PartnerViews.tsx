"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import type { Partner } from "@/lib/types";
import { sectorNames, settlementName } from "@/lib/demo/reference";
import {
  approvePartner,
  getPartner,
  listPartners,
  partnerChecks,
  reinstatePartner,
  rejectPartner,
  requestAgreementSignature,
  suspendPartner,
  verifyDocument,
} from "@/lib/services/partners";
import { useServiceAction, useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, statusLabelKey } from "@/components/portal/StatusBadge";
import { AuditTimeline } from "@/components/portal/AuditTimeline";
import { RecordNotFound, Checklist } from "@/components/portal/RecordBits";
import { FieldGrid, RecordPage, RecordSection, type RecordAction } from "@/components/portal/RecordPage";
import { progressFor } from "@/components/portal/progress";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import styles from "@/components/portal/portal.module.css";

const partnerStatuses: Partner["status"][] = ["pending", "approved", "suspended", "rejected"];

export function PartnersListView() {
  const { t, formatDate } = useI18n();
  const { data, loading } = useServiceQuery(listPartners);

  return (
    <>
      <PageHeader title={t("portal.partners.title")} intro={t("portal.partners.intro")} />
      <RecordTable
        rows={data}
        loading={loading}
        caption={t("portal.partners.title")}
        searchText={(p) => `${p.name} ${p.ref} ${p.registrationNo}`}
        statusOptions={partnerStatuses.map((s) => ({ value: s, label: t(statusLabelKey("partner", s)) }))}
        columns={[
          {
            key: "name",
            header: t("portal.table.name"),
            primary: true,
            render: (p) => (
              <>
                <Link href={`/portal/partners/${p.id}`} className={styles.recordLink}>
                  {p.name}
                </Link>
                <span className={styles.ref}>{p.ref}</span>
              </>
            ),
          },
          { key: "type", header: t("portal.partners.type"), render: (p) => p.type },
          { key: "sectors", header: t("portal.partners.sectors"), render: (p) => p.sectors.map((s) => sectorNames[s]).join(", ") },
          { key: "status", header: t("portal.table.status"), render: (p) => <StatusBadge entity="partner" status={p.status} /> },
          { key: "updated", header: t("portal.table.updated"), render: (p) => formatDate(p.updatedAt) },
        ]}
      />
    </>
  );
}

export function PartnerDetailView({ id }: { id: string }) {
  const { t, formatDate } = useI18n();
  const { data, notFound } = useServiceQuery(() => getPartner(id), [id]);
  const docAction = useServiceAction();

  if (notFound) return <RecordNotFound backHref="/portal/partners" />;
  if (!data) return <LoadingState label={t("common.loading")} />;

  const { partner, interventions } = data;
  const checks = partnerChecks(partner);
  const isPending = partner.status === "pending";

  const actions: RecordAction[] = [];
  if (isPending) {
    actions.push(
      { key: "approve", label: t("portal.partners.approve"), tone: "primary", icon: "check", disabled: !checks.ready, run: (note) => approvePartner(partner.id, note) },
      { key: "reject", label: t("portal.partners.reject"), tone: "danger", icon: "x", requiresNote: true, run: (note) => rejectPartner(partner.id, note) },
    );
  } else if (partner.status === "approved") {
    actions.push({ key: "suspend", label: t("portal.partners.suspend"), tone: "danger", icon: "pauseCircle", requiresNote: true, run: (note) => suspendPartner(partner.id, note) });
  } else if (partner.status === "suspended") {
    actions.push({ key: "reinstate", label: t("portal.partners.reinstate"), tone: "primary", icon: "refresh", requiresNote: true, run: (note) => reinstatePartner(partner.id, note) });
  }

  const docFeedback = (
    <>
      <div aria-live="polite">{docAction.success && <Notice tone="success">{docAction.success}</Notice>}</div>
      {docAction.error && (
        <Notice tone="error" role="alert">
          {docAction.error}
        </Notice>
      )}
    </>
  );

  return (
    <RecordPage
      back={{ href: "/portal/partners", label: t("portal.detail.back") }}
      eyebrow={`${t("portal.entity.partner")} · ${partner.ref}`}
      title={partner.name}
      badges={<StatusBadge entity="partner" status={partner.status} />}
      meta={[partner.type, `${t("portal.partners.registration")} ${partner.registrationNo}`, `${t("portal.partners.submitted")} ${formatDate(partner.submittedAt)}`].join(" · ")}
      progress={progressFor.partner(partner)}
      notices={isPending && !checks.ready ? <Notice tone="warning">{t("portal.partners.checksIncomplete")}</Notice> : undefined}
      actions={actions}
      tabs={[
        {
          id: "overview",
          label: t("portal.detail.overview"),
          content: (
            <>
              {isPending && (
                <RecordSection title={t("portal.partners.checks")}>
                  <Checklist
                    items={[
                      { label: t("portal.partners.checkDocs"), done: checks.documentsVerified },
                      { label: t("portal.partners.checkSignature"), done: checks.agreementSigned },
                    ]}
                  />
                </RecordSection>
              )}
              <RecordSection title={t("portal.detail.overview")}>
                <FieldGrid
                  items={[
                    { label: t("portal.partners.type"), value: partner.type },
                    { label: t("portal.partners.registration"), value: partner.registrationNo },
                    { label: t("portal.partners.sectors"), value: partner.sectors.map((s) => sectorNames[s]).join(", ") },
                    { label: t("portal.partners.settlements"), value: partner.settlementIds.map(settlementName).join(", ") },
                    { label: t("portal.partners.contactRole"), value: partner.focalRole },
                    { label: t("portal.partners.submitted"), value: formatDate(partner.submittedAt) },
                  ]}
                />
              </RecordSection>
            </>
          ),
        },
        {
          id: "documents",
          label: t("portal.partners.documents"),
          content: (
            <RecordSection title={t("portal.partners.documents")}>
              <ul className={styles.rowList}>
                {partner.documents.map((doc) => (
                  <li key={doc.id} className={styles.rowItem}>
                    <span className={styles.rowMain}>{doc.name}</span>
                    {doc.status === "verified" && <Badge tone="success">{t("portal.partners.docVerified")}</Badge>}
                    {doc.status === "missing" && <Badge tone="error">{t("portal.partners.docMissing")}</Badge>}
                    {doc.status === "pending" && (
                      <>
                        <Badge tone="warning">{t("portal.partners.docPending")}</Badge>
                        {isPending && (
                          <Button
                            size="sm"
                            variant="secondary"
                            icon="check"
                            disabled={Boolean(docAction.pending)}
                            aria-label={`${t("portal.partners.docApprove")}: ${doc.name}`}
                            onClick={() => docAction.run(doc.id, () => verifyDocument(partner.id, doc.id), t("portal.detail.decisionRecorded"))}
                          >
                            {docAction.pending === doc.id ? t("common.loading") : t("portal.partners.docApprove")}
                          </Button>
                        )}
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {docFeedback}
            </RecordSection>
          ),
        },
        {
          id: "agreement",
          label: t("portal.partners.signature"),
          content: (
            <RecordSection title={t("portal.partners.signature")}>
              {partner.agreement.status === "signed" && partner.agreement.signedAt ? (
                <p>
                  <Badge tone="simulated" icon="pen">
                    {t("common.simulated")}
                  </Badge>{" "}
                  {t("portal.partners.signatureSigned", { name: partner.agreement.signedBy ?? "—", date: formatDate(partner.agreement.signedAt) })}
                </p>
              ) : (
                <>
                  <p className={styles.muted}>{t("portal.partners.signatureRequested")}</p>
                  {isPending && (
                    <div>
                      <Button
                        variant="secondary"
                        icon="pen"
                        disabled={Boolean(docAction.pending)}
                        onClick={() => docAction.run("signature", () => requestAgreementSignature(partner.id), t("common.simulatedLong"))}
                      >
                        {docAction.pending === "signature" ? t("common.loading") : t("portal.partners.requestSignature")}
                      </Button>
                    </div>
                  )}
                </>
              )}
              {docFeedback}
            </RecordSection>
          ),
        },
        {
          id: "interventions",
          label: t("portal.partners.interventionsHeading"),
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
          id: "history",
          label: t("portal.detail.timeline"),
          content: (
            <RecordSection title={t("portal.detail.timeline")}>
              <AuditTimeline entityId={partner.id} />
            </RecordSection>
          ),
        },
      ]}
    />
  );
}
