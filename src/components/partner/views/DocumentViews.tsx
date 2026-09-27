"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { DocumentStatus } from "@/lib/types";
import { getPartnerDocument, listPartnerDocuments, uploadPartnerDocument, type PartnerDocumentRow } from "@/lib/services/partnerAccount";
import { listProposals } from "@/lib/services/partnerWork";
import { useServiceAction } from "@/lib/services/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { PageHeader, Section } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, useStatusOptions } from "@/components/portal/StatusBadge";
import { FieldGrid, RecordPage, RecordSection } from "@/components/portal/RecordPage";
import { FilePicker, Gate, usePartnerQuery, type PickedFile } from "@/components/partner/PartnerBits";
import { usePartnerCan } from "@/components/partner/partnerHooks";
import portal from "@/components/portal/portal.module.css";
import styles from "@/components/partner/partner.module.css";

const statuses: DocumentStatus[] = ["missing", "draft", "in_review", "changes_requested", "approved", "rejected"];

function ExpiryBadge({ row }: { row: Pick<PartnerDocumentRow, "expiry" | "expiresAt"> }) {
  const { t, formatDate } = useI18n();
  if (!row.expiresAt || row.expiry === "none") return <span className={portal.muted}>—</span>;
  return (
    <span className={portal.stack} style={{ gap: 2 }}>
      <span>{formatDate(row.expiresAt)}</span>
      {row.expiry === "expired" && (
        <Badge tone="error" icon="alertTriangle">
          {t("partner.documents.expired")}
        </Badge>
      )}
      {row.expiry === "expiring" && (
        <Badge tone="warning" icon="clock">
          {t("partner.documents.expiring")}
        </Badge>
      )}
    </span>
  );
}

export function DocumentsListView() {
  const { t, formatDate } = useI18n();
  const q = usePartnerQuery(listPartnerDocuments);
  const can = usePartnerCan();
  const statusOptions = useStatusOptions("document", statuses);
  const [adding, setAdding] = useState(false);
  const warn = (q.data ?? []).filter((d) => d.required && (d.expiry === "expired" || d.expiry === "expiring"));

  return (
    <>
      <PageHeader
        title={t("partner.documents.title")}
        intro={t("partner.documents.intro")}
        actions={
          (can("documents.manage") || can("proposals.manage")) && (
            <Button icon="upload" onClick={() => setAdding((v) => !v)} aria-expanded={adding}>
              {t("partner.documents.addNew")}
            </Button>
          )
        }
      />
      <div className={portal.stack}>
        <Notice tone="simulated" title={t("partner.upload.notAuthenticatedTitle")}>
          {t("partner.upload.notAuthenticated")}
        </Notice>
        {warn.length > 0 && (
          <Notice tone="warning" title={t("partner.documents.expiryWarning", { count: warn.length })}>
            <ul className={portal.plainList}>
              {warn.map((d) => (
                <li key={d.id}>
                  <Link href={`/partner/documents/${d.id}`}>{d.title}</Link> — {d.expiry === "expired" ? t("partner.documents.expiredOn", { date: formatDate(d.expiresAt!) }) : t("partner.documents.expiresOn", { date: formatDate(d.expiresAt!) })}
                </li>
              ))}
            </ul>
          </Notice>
        )}
        {adding && <UploadForm onDone={() => setAdding(false)} />}
        <RecordTable<PartnerDocumentRow>
          rows={q.data}
          loading={q.loading}
          caption={t("partner.documents.title")}
          searchText={(d) => `${d.title} ${d.ref} ${d.relatedRef ?? ""}`}
          statusOptions={statusOptions}
          filters={[
            {
              key: "category",
              label: t("partner.documents.category"),
              options: [
                { value: "partner_document", label: t("partner.documents.categories.partner_document") },
                { value: "intervention_evidence", label: t("partner.documents.categories.intervention_evidence") },
              ],
              test: (d, v) => d.category === v,
            },
            {
              key: "expiry",
              label: t("partner.documents.expiry"),
              options: [
                { value: "expired", label: t("partner.documents.expired") },
                { value: "expiring", label: t("partner.documents.expiring") },
                { value: "valid", label: t("partner.documents.valid") },
              ],
              test: (d, v) => d.expiry === v,
            },
          ]}
          columns={[
            {
              key: "title",
              header: t("partner.documents.document"),
              primary: true,
              sortValue: (d) => d.title,
              render: (d) => (
                <>
                  <Link href={`/partner/documents/${d.id}`} className={portal.recordLink}>
                    {d.title}
                  </Link>
                  <span className={portal.ref}>
                    {d.ref} {d.required && `· ${t("partner.documents.required")}`}
                  </span>
                </>
              ),
            },
            { key: "type", header: t("partner.documents.category"), render: (d) => t(`partner.documents.categories.${d.category}` as MessageKey) },
            { key: "related", header: t("partner.documents.related"), render: (d) => d.relatedRef ?? "—" },
            { key: "version", header: t("partner.documents.version"), numeric: true, sortValue: (d) => d.currentVersion, render: (d) => (d.currentVersion ? `v${d.currentVersion}` : "—") },
            {
              key: "uploaded",
              header: t("partner.documents.uploaded"),
              sortValue: (d) => d.versions[d.versions.length - 1]?.at ?? "",
              render: (d) => (d.versions.length ? formatDate(d.versions[d.versions.length - 1].at) : <span className={portal.muted}>{t("partner.documents.notUploaded")}</span>),
            },
            { key: "expiry", header: t("partner.documents.expiry"), sortValue: (d) => d.expiresAt ?? "9999", render: (d) => <ExpiryBadge row={d} /> },
            { key: "status", header: t("partner.documents.reviewStatus"), sortValue: (d) => d.status, render: (d) => <StatusBadge entity="document" status={d.status} /> },
            { key: "comment", header: t("partner.common.opmComment"), render: (d) => (d.opmComments.length ? <span className={portal.small}>{d.opmComments[d.opmComments.length - 1].note}</span> : "—") },
          ]}
        />
      </div>
    </>
  );
}

/** New document (organisation or intervention evidence) — SIMULATED upload. */
function UploadForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const can = usePartnerCan();
  const interventions = usePartnerQuery(listProposals);
  const [title, setTitle] = useState("");
  const [related, setRelated] = useState(can("documents.manage") ? "" : "pick");
  const [file, setFile] = useState<PickedFile>();
  const [expiresAt, setExpiresAt] = useState("");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const action = useServiceAction();
  const options = (interventions.data ?? []).filter((i) => !["rejected", "closed"].includes(i.status));

  async function submit() {
    const e: Record<string, string> = {};
    if (!title.trim()) e.title = t("portal.validation.required");
    if (!file) e.file = t("partner.upload.chooseFile");
    if (!note.trim()) e.note = t("portal.validation.required");
    if (related === "pick") e.related = t("portal.validation.chooseOne");
    setErrors(e);
    if (Object.keys(e).length) return;
    let createdId = "";
    const ok = await action.run(
      "upload",
      async () => {
        createdId = await uploadPartnerDocument({ title, interventionId: related || undefined, fileName: file!.name, sizeKb: file!.sizeKb, expiresAt: expiresAt || undefined, note });
      },
      t("partner.upload.done"),
    );
    if (ok) {
      onDone();
      router.push(`/partner/documents/${createdId}`);
    }
  }

  return (
    <Section title={t("partner.documents.addNew")}>
      <div className={styles.formGrid}>
        <TextField id="doc-title" label={t("partner.documents.titleLabel")} requiredLabel={t("common.requiredMarker")} value={title} error={errors.title} onChange={(e) => setTitle(e.target.value)} />
        <SelectField id="doc-related" label={t("partner.documents.related")} value={related} error={errors.related} onChange={(e) => setRelated(e.target.value)}>
          {can("documents.manage") ? <option value="">{t("partner.documents.organisationDocument")}</option> : <option value="pick">{t("portal.common.choose")}</option>}
          {options.map((i) => (
            <option key={i.id} value={i.id}>
              {i.ref} {i.title}
            </option>
          ))}
        </SelectField>
        <TextField id="doc-expiry" type="date" label={t("partner.documents.expiryDate")} hint={t("partner.documents.expiryHint")} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
        <div className={styles.wide}>
          <FilePicker id="doc-file" label={t("partner.upload.file")} value={file} onChange={setFile} error={errors.file} required />
        </div>
        <div className={styles.wide}>
          <TextAreaField id="doc-note" label={t("partner.upload.note")} requiredLabel={t("common.requiredMarker")} value={note} error={errors.note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className={portal.buttonRow}>
        <Button icon="upload" disabled={Boolean(action.pending)} aria-busy={Boolean(action.pending) || undefined} onClick={submit}>
          {action.pending ? t("common.loading") : t("partner.upload.submit")}
        </Button>
        <Button variant="secondary" onClick={onDone}>
          {t("common.cancel")}
        </Button>
      </div>
      {action.error && (
        <Notice tone="error" role="alert">
          {action.error}
        </Notice>
      )}
    </Section>
  );
}

export function DocumentDetailView({ id }: { id: string }) {
  const { t, formatDate } = useI18n();
  const q = usePartnerQuery(() => getPartnerDocument(id), [id]);
  return (
    <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner/documents">
      {() => {
        const { document: d, history, canManage } = q.data!;
        return (
          <RecordPage
            back={{ href: "/partner/documents", label: t("partner.documents.back") }}
            eyebrow={`${t(`partner.documents.categories.${d.category}` as MessageKey)} · ${d.ref}`}
            title={d.title}
            badges={
              <>
                <StatusBadge entity="document" status={d.status} />
                {d.required && <Badge tone="info">{t("partner.documents.required")}</Badge>}
                {d.expiry === "expired" && (
                  <Badge tone="error" icon="alertTriangle">
                    {t("partner.documents.expired")}
                  </Badge>
                )}
                {d.expiry === "expiring" && (
                  <Badge tone="warning" icon="clock">
                    {t("partner.documents.expiring")}
                  </Badge>
                )}
              </>
            }
            meta={d.versions.length ? t("partner.documents.currentVersion", { version: d.currentVersion, date: formatDate(d.versions[d.versions.length - 1].at) }) : t("partner.documents.notUploaded")}
            notices={
              <>
                <Notice tone="simulated">{t("partner.upload.notAuthenticated")}</Notice>
                {d.status === "changes_requested" && <Notice tone="warning">{t("partner.documents.returnedHint")}</Notice>}
                {d.status === "missing" && <Notice tone="warning">{t("partner.documents.missingHint")}</Notice>}
              </>
            }
            timeline={{ entries: history }}
            tabs={[
              {
                id: "overview",
                label: t("portal.detail.overview"),
                content: (
                  <>
                    <RecordSection title={t("portal.detail.overview")}>
                      <FieldGrid
                        items={[
                          { label: t("partner.documents.category"), value: t(`partner.documents.categories.${d.category}` as MessageKey) },
                          { label: t("partner.documents.related"), value: d.relatedRef ? `${d.relatedRef} ${d.relatedTitle ?? ""}` : "—" },
                          { label: t("partner.documents.reviewStatus"), value: <StatusBadge entity="document" status={d.status} /> },
                          { label: t("partner.documents.expiry"), value: <ExpiryBadge row={d} /> },
                          { label: t("partner.documents.classification"), value: t(`portal.documents.classifications.${d.classification}` as MessageKey) },
                          { label: t("partner.documents.required"), value: d.required ? t("common.yes") : t("common.no") },
                        ]}
                      />
                    </RecordSection>
                    <RecordSection title={t("partner.documents.opmReview")}>
                      {d.route.length === 0 ? (
                        <p className={portal.muted}>{t("partner.documents.notRouted")}</p>
                      ) : (
                        <ul className={portal.rowList}>
                          {d.route.map((step) => (
                            <li key={step.id} className={portal.rowItem}>
                              <span className={portal.rowMain}>
                                <strong>{step.role}</strong>
                                {step.note && (
                                  <span className={portal.small}>
                                    <strong>{t("partner.common.opmComment")}:</strong> {step.note}
                                  </span>
                                )}
                                {step.at && <span className={portal.ref}>{`${step.by ?? ""} · ${formatDate(step.at, true)}`}</span>}
                              </span>
                              {step.decision ? <StatusBadge entity="document" status={step.decision} /> : <Badge tone="info">{t("partner.documents.awaitingOpm")}</Badge>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </RecordSection>
                  </>
                ),
              },
              {
                id: "versions",
                label: t("partner.documents.versions"),
                count: d.versions.length,
                content: (
                  <RecordSection title={t("partner.documents.versions")}>
                    <p className={`${portal.small} ${portal.muted}`}>{t("partner.documents.versionsHint")}</p>
                    {d.versions.length === 0 ? (
                      <p className={portal.muted}>{t("partner.documents.notUploaded")}</p>
                    ) : (
                      <ul className={portal.rowList}>
                        {[...d.versions].reverse().map((v) => (
                          <li key={v.version} className={portal.rowItem}>
                            <span className={portal.rowMain}>
                              <strong>v{v.version}</strong>
                              <span className={portal.small}>{v.note}</span>
                              <span className={portal.ref}>
                                {v.author} · {formatDate(v.at, true)} · {v.sizeKb} KB
                              </span>
                            </span>
                            {v.version === d.currentVersion ? <Badge tone="success">{t("partner.documents.current")}</Badge> : <Badge tone="neutral">{t("partner.documents.earlier")}</Badge>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </RecordSection>
                ),
              },
              ...(canManage
                ? [
                    {
                      id: "replace",
                      label: d.versions.length ? t("partner.documents.replace") : t("partner.documents.upload"),
                      content: <ReplaceForm id={d.id} hasVersion={d.versions.length > 0} expiresAt={d.expiresAt} />,
                    },
                  ]
                : []),
            ]}
          />
        );
      }}
    </Gate>
  );
}

function ReplaceForm({ id, hasVersion, expiresAt }: { id: string; hasVersion: boolean; expiresAt?: string }) {
  const { t } = useI18n();
  const fid = useId();
  const [file, setFile] = useState<PickedFile>();
  const [expiry, setExpiry] = useState(expiresAt ? expiresAt.slice(0, 10) : "");
  const [note, setNote] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const action = useServiceAction();

  return (
    <RecordSection title={hasVersion ? t("partner.documents.replace") : t("partner.documents.upload")}>
      <p className={portal.small}>{hasVersion ? t("partner.documents.replaceHint") : t("partner.documents.uploadHint")}</p>
      <div className={styles.formGrid}>
        <div className={styles.wide}>
          <FilePicker id={`${fid}-file`} label={t("partner.upload.file")} value={file} onChange={setFile} error={errors.file} required />
        </div>
        <TextField id={`${fid}-exp`} type="date" label={t("partner.documents.expiryDate")} hint={t("partner.documents.expiryHint")} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
        <div className={styles.wide}>
          <TextAreaField id={`${fid}-note`} label={t("partner.upload.note")} requiredLabel={t("common.requiredMarker")} value={note} error={errors.note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>
      <div className={portal.buttonRow}>
        <Button
          icon="upload"
          disabled={Boolean(action.pending)}
          aria-busy={Boolean(action.pending) || undefined}
          onClick={async () => {
            const e: Record<string, string> = {};
            if (!file) e.file = t("partner.upload.chooseFile");
            if (!note.trim()) e.note = t("portal.validation.required");
            setErrors(e);
            if (Object.keys(e).length) return;
            if (await action.run("upload", () => uploadPartnerDocument({ documentId: id, fileName: file!.name, sizeKb: file!.sizeKb, expiresAt: expiry || undefined, note }), t("partner.upload.done"))) {
              setFile(undefined);
              setNote("");
            }
          }}
        >
          {action.pending ? t("common.loading") : t("partner.upload.submit")}
        </Button>
      </div>
      <div aria-live="polite">{action.success && <Notice tone="success">{action.success}</Notice>}</div>
      {action.error && (
        <Notice tone="error" role="alert">
          {action.error}
        </Notice>
      )}
    </RecordSection>
  );
}
