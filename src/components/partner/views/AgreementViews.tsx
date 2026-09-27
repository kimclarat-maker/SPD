"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import { getAgreement, listAgreements, respondToSignature } from "@/lib/services/partnerAccount";
import { useServiceAction } from "@/lib/services/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TextAreaField, TextField } from "@/components/ui/Field";
import { PageHeader } from "@/components/portal/PageHeader";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { FieldGrid, RecordPage, RecordSection } from "@/components/portal/RecordPage";
import { EmptyState, SimulatedTag, WorkflowStepper, type StageState } from "@/components/portal/RecordBits";
import { Gate, usePartnerQuery } from "@/components/partner/PartnerBits";
import portal from "@/components/portal/portal.module.css";
import styles from "@/components/partner/partner.module.css";

export function AgreementsListView() {
  const { t, formatDate } = useI18n();
  const q = usePartnerQuery(listAgreements);
  return (
    <>
      <PageHeader title={t("partner.agreements.title")} intro={t("partner.agreements.intro")} />
      <div className={portal.stack}>
        <Notice tone="simulated">{t("partner.agreements.simulated")}</Notice>
        <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner">
          {() =>
            q.data!.length === 0 ? (
              <EmptyState icon="pen" title={t("partner.agreements.empty")} body={t("partner.agreements.emptyBody")} />
            ) : (
              <ul className={portal.rowList}>
                {q.data!.map((d) => (
                  <li key={d.id} className={portal.rowItem}>
                    <span className={portal.rowMain}>
                      <Link href={`/partner/agreements/${d.id}`} className={portal.recordLink}>
                        {d.title}
                      </Link>
                      <span className={portal.ref}>
                        {d.ref} · {t(`portal.documents.categories.${d.category}` as MessageKey)} · v{d.currentVersion} · {formatDate(d.updatedAt)}
                      </span>
                    </span>
                    <span className={portal.buttonRow}>
                      <StatusBadge entity="document" status={d.status} />
                      <StatusBadge entity="signature" status={d.signature.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )
          }
        </Gate>
      </div>
    </>
  );
}

export function AgreementDetailView({ id }: { id: string }) {
  const { t, formatDate } = useI18n();
  const fid = useId();
  const q = usePartnerQuery(() => getAgreement(id), [id]);
  const [mode, setMode] = useState<"sign" | "decline" | null>(null);
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const action = useServiceAction();

  return (
    <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner/agreements">
      {() => {
        const { document: d, history, canSign } = q.data!;
        const stages: { key: string; label: string; state: StageState }[] = [
          ...d.route.map((s) => ({ key: s.id, label: s.role, state: (s.decision === "approved" ? "done" : s.decision ? "ended" : d.status === "in_review" && d.route.find((x) => !x.decision)?.id === s.id ? "current" : "upcoming") as StageState })),
          {
            key: "signature",
            label: t("partner.agreements.partnerSignature"),
            state: (d.signature.status === "signed" ? "done" : d.signature.status === "declined" ? "ended" : d.signature.status === "requested" ? "current" : "upcoming") as StageState,
          },
        ];
        const requested = d.signature.status === "requested";
        return (
          <RecordPage
            back={{ href: "/partner/agreements", label: t("partner.agreements.back") }}
            eyebrow={`${t(`portal.documents.categories.${d.category}` as MessageKey)} · ${d.ref}`}
            title={d.title}
            badges={
              <>
                <StatusBadge entity="document" status={d.status} />
                <StatusBadge entity="signature" status={d.signature.status} />
                <SimulatedTag />
              </>
            }
            meta={t("partner.documents.currentVersion", { version: d.currentVersion, date: formatDate(d.updatedAt) })}
            notices={
              <>
                {requested && canSign && <Notice tone="warning" title={t("partner.agreements.requestedTitle")}>{t("partner.agreements.requestedBody", { date: formatDate(d.signature.requestedAt!) })}</Notice>}
                {requested && !canSign && <Notice tone="info">{t("partner.agreements.notSignatory")}</Notice>}
                {d.signature.status === "signed" && <Notice tone="success">{t("partner.agreements.signedBody", { signer: d.signature.signer ?? "—", date: formatDate(d.signature.signedAt!) })}</Notice>}
                {d.signature.status === "declined" && <Notice tone="warning">{t("partner.agreements.declinedBody")}</Notice>}
                {d.signature.status === "not_requested" && d.status === "in_review" && <Notice tone="info">{t("partner.agreements.inOpmReview")}</Notice>}
              </>
            }
            timeline={{ entries: history }}
            tabs={[
              {
                id: "overview",
                label: t("portal.detail.overview"),
                content: (
                  <>
                    <RecordSection title={t("partner.agreements.stage")}>
                      <WorkflowStepper label={t("partner.agreements.stage")} stages={stages} />
                      <FieldGrid
                        items={[
                          { label: t("portal.documents.owner"), value: d.owner },
                          { label: t("partner.agreements.finalStatus"), value: <StatusBadge entity="signature" status={d.signature.status} /> },
                          { label: t("partner.agreements.signer"), value: d.signature.signer ?? "—" },
                          { label: t("partner.agreements.requestedOn"), value: d.signature.requestedAt ? formatDate(d.signature.requestedAt, true) : "—" },
                        ]}
                      />
                    </RecordSection>
                    <RecordSection title={t("partner.agreements.opmComments")}>
                      {d.opmComments.length === 0 ? (
                        <p className={portal.muted}>{t("portal.comments.empty")}</p>
                      ) : (
                        <ul className={portal.rowList}>
                          {d.opmComments.map((c, index) => (
                            <li key={index} className={portal.rowItem}>
                              <span className={portal.rowMain}>
                                <strong>{c.role}</strong>
                                <span className={portal.small}>{c.note}</span>
                                <span className={portal.ref}>
                                  {c.by} · {formatDate(c.at, true)}
                                </span>
                              </span>
                              <StatusBadge entity="document" status={c.decision} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </RecordSection>
                    {requested && canSign && (
                      <RecordSection title={t("partner.agreements.respond")}>
                        <div className={styles.signature}>
                          <p className={portal.small}>
                            <SimulatedTag /> {t("partner.agreements.signHint")}
                          </p>
                          <div className={portal.buttonRow}>
                            <Button icon="pen" variant={mode === "sign" ? "primary" : "secondary"} aria-pressed={mode === "sign"} onClick={() => (setMode("sign"), setErrors({}))}>
                              {t("partner.agreements.sign")}
                            </Button>
                            <Button icon="arrowLeft" variant={mode === "decline" ? "primary" : "secondary"} aria-pressed={mode === "decline"} onClick={() => (setMode("decline"), setErrors({}))}>
                              {t("partner.agreements.decline")}
                            </Button>
                          </div>
                          {mode === "sign" && (
                            <>
                              <TextField id={`${fid}-name`} label={t("partner.agreements.typedName")} hint={t("partner.agreements.typedNameHint")} requiredLabel={t("common.requiredMarker")} value={name} error={errors.name} onChange={(e) => setName(e.target.value)} />
                              <label className={portal.checkRow}>
                                <input type="checkbox" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} aria-describedby={errors.confirm ? `${fid}-cerr` : undefined} />
                                {t("partner.agreements.confirmAuthority")}
                              </label>
                              {errors.confirm && (
                                <p id={`${fid}-cerr`} className={portal.fieldError}>
                                  {errors.confirm}
                                </p>
                              )}
                            </>
                          )}
                          {mode && <TextAreaField id={`${fid}-note`} label={mode === "sign" ? t("partner.agreements.comment") : t("partner.agreements.declineReason")} requiredLabel={mode === "decline" ? t("common.requiredMarker") : t("common.optional")} value={note} error={errors.note} onChange={(e) => setNote(e.target.value)} />}
                          {mode && (
                            <div className={portal.buttonRow}>
                              <Button
                                icon={mode === "sign" ? "pen" : "send"}
                                disabled={Boolean(action.pending)}
                                aria-busy={Boolean(action.pending) || undefined}
                                onClick={async () => {
                                  const e: Record<string, string> = {};
                                  if (mode === "sign" && !name.trim()) e.name = t("portal.validation.required");
                                  if (mode === "sign" && !confirm) e.confirm = t("partner.agreements.confirmRequired");
                                  if (mode === "decline" && !note.trim()) e.note = t("portal.detail.noteRequired");
                                  setErrors(e);
                                  if (Object.keys(e).length) return;
                                  await action.run("respond", () => respondToSignature(d.id, mode, note, name), mode === "sign" ? t("partner.agreements.signedDone") : t("partner.agreements.declinedDone"));
                                }}
                              >
                                {action.pending ? t("common.loading") : mode === "sign" ? t("partner.agreements.signNow") : t("partner.agreements.sendDecline")}
                              </Button>
                            </div>
                          )}
                          {action.error && (
                            <Notice tone="error" role="alert">
                              {action.error}
                            </Notice>
                          )}
                        </div>
                      </RecordSection>
                    )}
                    <div aria-live="polite">{action.success && <Notice tone="success">{action.success}</Notice>}</div>
                  </>
                ),
              },
              {
                id: "versions",
                label: t("partner.documents.versions"),
                count: d.versions.length,
                content: (
                  <RecordSection title={t("partner.documents.versions")}>
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
                          {v.version === d.currentVersion && <Badge tone="success">{t("partner.documents.current")}</Badge>}
                        </li>
                      ))}
                    </ul>
                  </RecordSection>
                ),
              },
            ]}
          />
        );
      }}
    </Gate>
  );
}
