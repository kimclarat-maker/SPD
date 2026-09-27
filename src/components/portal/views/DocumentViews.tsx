"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { Classification, DocumentCategory, DocumentStatus, SignatureStatus } from "@/lib/types";
import {
  addVersion,
  currentStep,
  decideStep,
  getDocument,
  listDocuments,
  requestSignature,
  routeForApproval,
  simulateSignatureCompleted,
  type DocumentRow,
} from "@/lib/services/documents";
import { recordHref } from "@/lib/services/lookup";
import { useCan, useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, useStatusOptions } from "@/components/portal/StatusBadge";
import { FieldGrid, RecordPage, RecordSection, type RecordAction } from "@/components/portal/RecordPage";
import { RecordNotFound, SimulatedTag, type StageState } from "@/components/portal/RecordBits";
import { Badge, type Tone } from "@/components/ui/Badge";
import { Notice } from "@/components/ui/Notice";
import { SelectField, TextField } from "@/components/ui/Field";
import styles from "@/components/portal/portal.module.css";

const statuses: DocumentStatus[] = ["missing", "draft", "in_review", "changes_requested", "approved", "rejected"];
const categories: DocumentCategory[] = ["mou", "partner_document", "intervention_evidence", "approval", "correspondence"];
const classifications: Classification[] = ["public", "internal", "restricted", "confidential"];
const signatures: SignatureStatus[] = ["not_required", "not_requested", "requested", "signed", "declined"];
const classTone: Record<Classification, Tone> = { public: "success", internal: "neutral", restricted: "warning", confidential: "error" };

function ClassificationBadge({ value }: { value: Classification }) {
  const { t } = useI18n();
  return (
    <Badge tone={classTone[value]} icon={value === "public" ? "globe" : "lock"}>
      {t(`portal.documents.classifications.${value}` as MessageKey)}
    </Badge>
  );
}

export function DocumentsListView({ initialStatus }: { initialStatus?: string }) {
  const { t, formatDate } = useI18n();
  const { data, loading } = useServiceQuery(() => listDocuments());
  const statusOptions = useStatusOptions("document", statuses);
  const signatureOptions = useStatusOptions("signature", signatures);

  return (
    <>
      <PageHeader title={t("portal.documents.title")} intro={t("portal.documents.intro")} />
      <RecordTable<DocumentRow>
        rows={data}
        loading={loading}
        caption={t("portal.documents.title")}
        initialStatus={initialStatus}
        searchText={(d) => `${d.title} ${d.ref} ${d.owner} ${d.relatedRef ?? ""} ${d.relatedTitle ?? ""}`}
        statusOptions={statusOptions}
        filters={[
          { key: "category", label: t("portal.documents.category"), options: categories.map((c) => ({ value: c, label: t(`portal.documents.categories.${c}` as MessageKey) })), test: (d, v) => d.category === v },
          { key: "classification", label: t("portal.documents.classification"), options: classifications.map((c) => ({ value: c, label: t(`portal.documents.classifications.${c}` as MessageKey) })), test: (d, v) => d.classification === v },
          { key: "signature", label: t("portal.documents.signature"), options: signatureOptions, test: (d, v) => d.signature.status === v },
          {
            key: "expiry",
            label: t("portal.documents.expiry"),
            options: [
              { value: "expiring", label: t("portal.status.compliance.expiring") },
              { value: "expired", label: t("portal.status.compliance.expired") },
            ],
            test: (d, v) => d.expiry === v,
          },
        ]}
        columns={[
          {
            key: "title",
            header: t("portal.documents.document"),
            primary: true,
            sortValue: (d) => d.title,
            render: (d) => (
              <>
                <Link href={`/portal/documents/${d.id}`} className={styles.recordLink}>
                  {d.title}
                </Link>
                <span className={styles.ref}>
                  {d.ref} · {t(`portal.documents.categories.${d.category}` as MessageKey)}
                </span>
              </>
            ),
          },
          { key: "owner", header: t("portal.documents.owner"), sortValue: (d) => d.owner, render: (d) => d.owner },
          {
            key: "related",
            header: t("portal.documents.related"),
            render: (d) => {
              const href = d.related ? recordHref(d.related.entity, d.related.id) : null;
              return href && d.relatedRef ? (
                <>
                  <Link href={href}>{d.relatedRef}</Link>
                  <span className={styles.ref}>{d.relatedTitle}</span>
                </>
              ) : (
                "—"
              );
            },
          },
          { key: "version", header: t("portal.surveys.version"), render: (d) => (d.currentVersion ? `v${d.currentVersion}` : "—") },
          { key: "class", header: t("portal.documents.classification"), render: (d) => <ClassificationBadge value={d.classification} /> },
          {
            key: "status",
            header: t("portal.documents.approval"),
            sortValue: (d) => d.status,
            render: (d) => (
              <>
                <StatusBadge entity="document" status={d.status} />
                {d.expiry === "expired" || d.expiry === "expiring" ? (
                  <span className={styles.warnLine}>
                    <Badge tone={d.expiry === "expired" ? "error" : "warning"} icon="clock">
                      {t("portal.documents.expires", { date: formatDate(d.expiresAt!) })}
                    </Badge>
                  </span>
                ) : null}
              </>
            ),
          },
          { key: "signature", header: t("portal.documents.signature"), render: (d) => <StatusBadge entity="signature" status={d.signature.status} /> },
        ]}
      />
    </>
  );
}

export function DocumentDetailView({ id }: { id: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const fieldId = useId();
  const can = useCan();
  const { data, notFound } = useServiceQuery(() => getDocument(id), [id]);
  const [routeId, setRouteId] = useState("");
  const [signer, setSigner] = useState("");
  const [signerError, setSignerError] = useState<string>();

  if (notFound) return <RecordNotFound backHref="/portal/documents" />;
  if (!data) return <LoadingState label={t("common.loading")} />;
  const { document: d, routes } = data;
  const canReview = can("document.review");
  const step = currentStep(d);
  const defaultRoute = routes.find((r) => r.appliesTo === d.category) ?? routes[0];
  const chosenRoute = routeId || defaultRoute?.id || "";
  const relatedHref = d.related ? recordHref(d.related.entity, d.related.id) : null;

  const actions: RecordAction[] = [
    { key: "version", label: t("portal.documents.newVersion"), icon: "upload", requiresNote: true, denied: !canReview, noteLabel: t("portal.documents.versionNote"), hint: t("portal.documents.versionHint"), run: (note) => addVersion(d.id, note) },
  ];
  if (d.status === "draft" || d.status === "changes_requested") {
    actions.push({
      key: "route",
      label: t("portal.documents.route"),
      tone: "primary",
      icon: "route",
      denied: !canReview,
      disabled: d.versions.length === 0,
      disabledReason: t("portal.documents.reasonNoVersion"),
      fields: (
        <SelectField id={`${fieldId}-route`} label={t("portal.documents.approvalRoute")} value={chosenRoute} onChange={(e) => setRouteId(e.target.value)}>
          {routes.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name} ({r.steps.join(" → ")})
            </option>
          ))}
        </SelectField>
      ),
      run: (note) => routeForApproval(d.id, chosenRoute, note),
    });
  }
  if (d.status === "in_review" && step) {
    actions.push(
      { key: "approve", label: t("portal.documents.approveStep", { step: step.role }), tone: "primary", icon: "check", requiresNote: true, denied: !canReview, run: (note) => decideStep(d.id, "approved", note) },
      { key: "changes", label: t("portal.documents.requestChanges"), icon: "arrowLeft", requiresNote: true, denied: !canReview, run: (note) => decideStep(d.id, "changes_requested", note) },
      { key: "reject", label: t("portal.documents.reject"), tone: "danger", icon: "x", requiresNote: true, denied: !canReview, run: (note) => decideStep(d.id, "rejected", note) },
    );
  }
  if (d.status === "approved" && (d.signature.status === "not_requested" || d.signature.status === "declined")) {
    actions.push({
      key: "sign",
      label: t("portal.documents.requestSignature"),
      tone: "primary",
      icon: "pen",
      noNote: true,
      denied: !can("document.sign"),
      hint: (
        <>
          <SimulatedTag /> {t("portal.documents.signatureHint")}
        </>
      ),
      fields: <TextField id={`${fieldId}-signer`} label={t("portal.documents.signer")} error={signerError} value={signer} onChange={(e) => (setSigner(e.target.value), setSignerError(undefined))} />,
      validate: () => (signer.trim() ? true : (setSignerError(t("portal.validation.required")), false)),
      run: () => requestSignature(d.id, signer),
    });
  }
  if (d.signature.status === "requested") {
    actions.push(
      { key: "signed", label: t("portal.documents.simulateSigned"), icon: "check", noNote: true, hint: t("common.simulatedLong"), run: () => simulateSignatureCompleted(d.id) },
      { key: "declined", label: t("portal.documents.simulateDeclined"), icon: "x", noNote: true, hint: t("common.simulatedLong"), run: () => simulateSignatureCompleted(d.id, true) },
    );
  }

  const stages = d.route.map((s) => ({
    key: s.id,
    label: s.role,
    state: (s.decision === "approved" ? "done" : s.decision ? "ended" : step?.id === s.id && d.status === "in_review" ? "current" : "upcoming") as StageState,
  }));

  return (
    <RecordPage
      back={{ href: "/portal/documents", label: t("portal.documents.back") }}
      eyebrow={`${t(`portal.documents.categories.${d.category}` as MessageKey)} · ${d.ref}`}
      title={d.title}
      badges={
        <>
          <StatusBadge entity="document" status={d.status} />
          <ClassificationBadge value={d.classification} />
          {d.signature.status !== "not_required" && <StatusBadge entity="signature" status={d.signature.status} />}
        </>
      }
      meta={[d.owner, d.currentVersion ? `v${d.currentVersion}` : t("portal.documents.noVersion"), d.expiresAt ? t("portal.documents.expires", { date: formatDate(d.expiresAt) }) : null].filter(Boolean).join(" · ")}
      stages={stages.length ? stages : undefined}
      notices={
        <>
          {d.expiry === "expired" && <Notice tone="error">{t("portal.documents.expiredNotice")}</Notice>}
          {d.expiry === "expiring" && <Notice tone="warning">{t("portal.documents.expiringNotice", { date: formatDate(d.expiresAt!) })}</Notice>}
          {d.classification !== "public" && d.classification !== "internal" && <Notice tone="info">{t("portal.documents.classifiedNotice")}</Notice>}
        </>
      }
      actions={actions}
      timelineId={d.id}
      tabs={[
        {
          id: "overview",
          label: t("portal.detail.overview"),
          content: (
            <RecordSection title={t("portal.detail.overview")}>
              <FieldGrid
                items={[
                  { label: t("portal.documents.category"), value: t(`portal.documents.categories.${d.category}` as MessageKey) },
                  { label: t("portal.documents.owner"), value: d.owner },
                  { label: t("portal.documents.related"), value: relatedHref && d.relatedRef ? <Link href={relatedHref}>{`${d.relatedRef} ${d.relatedTitle ?? ""}`}</Link> : "—" },
                  { label: t("portal.documents.classification"), value: <ClassificationBadge value={d.classification} /> },
                  { label: t("portal.surveys.version"), value: d.currentVersion ? `v${d.currentVersion}` : t("portal.documents.noVersion") },
                  { label: t("portal.documents.expiry"), value: d.expiresAt ? formatDate(d.expiresAt) : "—" },
                  { label: t("portal.documents.approval"), value: <StatusBadge entity="document" status={d.status} /> },
                  { label: t("portal.documents.signature"), value: <StatusBadge entity="signature" status={d.signature.status} /> },
                ]}
              />
            </RecordSection>
          ),
        },
        {
          id: "versions",
          label: t("portal.documents.versions"),
          count: d.versions.length,
          content: (
            <RecordSection title={t("portal.documents.versions")}>
              {d.versions.length === 0 ? (
                <Notice tone="warning">{t("portal.documents.noVersion")}</Notice>
              ) : (
                <div className={styles.tableScroll} role="region" aria-label={t("portal.documents.versions")} tabIndex={0}>
                  <table className={`${styles.table} ${styles.tableCompact}`}>
                    <thead>
                      <tr>
                        <th scope="col">{t("portal.surveys.version")}</th>
                        <th scope="col">{t("portal.documents.uploaded")}</th>
                        <th scope="col">{t("portal.documents.author")}</th>
                        <th scope="col">{t("portal.documents.versionNote")}</th>
                        <th scope="col" className={styles.num}>
                          {t("portal.documents.size")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...d.versions].reverse().map((v) => (
                        <tr key={v.version}>
                          <th scope="row">
                            v{v.version}
                            {v.version === d.currentVersion && <span className={styles.ref}>{t("portal.documents.current")}</span>}
                          </th>
                          <td>{formatDate(v.at, true)}</td>
                          <td>{v.author}</td>
                          <td>{v.note}</td>
                          <td className={styles.num}>{formatNumber(v.sizeKb)} KB</td>
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
          id: "route",
          label: t("portal.documents.approvalRoute"),
          count: d.route.length,
          content: (
            <RecordSection title={t("portal.documents.approvalRoute")}>
              {d.route.length === 0 ? (
                <p className={styles.muted}>{t("portal.documents.notRouted")}</p>
              ) : (
                <ol className={styles.rowList}>
                  {d.route.map((s, index) => (
                    <li key={s.id} className={styles.rowItem}>
                      <span className={styles.rowMain}>
                        <span>
                          <strong>{index + 1}.</strong> {s.role}
                        </span>
                        <span className={styles.ref}>
                          {s.by ? `${s.by} · ${formatDate(s.at!, true)}` : s.assignee ?? t("portal.common.unassigned")}
                        </span>
                        {s.note && <span className={styles.quoteSmall}>“{s.note}”</span>}
                      </span>
                      {s.decision ? (
                        <Badge tone={s.decision === "approved" ? "success" : s.decision === "rejected" ? "error" : "warning"}>{t(`portal.documents.decisions.${s.decision}` as MessageKey)}</Badge>
                      ) : (
                        <Badge tone={step?.id === s.id && d.status === "in_review" ? "info" : "neutral"}>
                          {step?.id === s.id && d.status === "in_review" ? t("portal.documents.awaitingDecision") : t("portal.stage.upcoming")}
                        </Badge>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </RecordSection>
          ),
        },
        {
          id: "signature",
          label: t("portal.documents.signature"),
          content: (
            <RecordSection title={t("portal.documents.signature")} actions={<SimulatedTag />}>
              <Notice tone="simulated" title={t("common.simulated")}>
                {t("portal.documents.signatureSimulated")}
              </Notice>
              <FieldGrid
                items={[
                  { label: t("portal.table.status"), value: <StatusBadge entity="signature" status={d.signature.status} /> },
                  { label: t("portal.documents.signer"), value: d.signature.signer ?? "—" },
                  { label: t("portal.documents.requested"), value: d.signature.requestedAt ? formatDate(d.signature.requestedAt, true) : "—" },
                  { label: t("portal.documents.signed"), value: d.signature.signedAt ? formatDate(d.signature.signedAt, true) : "—" },
                ]}
              />
            </RecordSection>
          ),
        },
      ]}
    />
  );
}
