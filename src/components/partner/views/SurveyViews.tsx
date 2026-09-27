"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { FormQuestion } from "@/lib/types";
import {
  getAssignedSurvey,
  getPartnerFieldReport,
  listAssignedSurveys,
  saveSurveyResponse,
  startSurveyResponse,
  submitFieldReport,
  type PartnerReportStatus,
} from "@/lib/services/partnerField";
import { useServiceAction } from "@/lib/services/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { PageHeader, Section } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, useStatusOptions } from "@/components/portal/StatusBadge";
import { FieldGrid, RecordPage, RecordSection } from "@/components/portal/RecordPage";
import { CommentThread, EmptyState } from "@/components/portal/RecordBits";
import { Gate, usePartnerQuery } from "@/components/partner/PartnerBits";
import portal from "@/components/portal/portal.module.css";
import styles from "@/components/partner/partner.module.css";

const statuses: PartnerReportStatus[] = ["draft", "saved_offline", "awaiting_sync", "submitted", "needs_correction", "accepted"];

export function SurveysListView() {
  const { t, formatDate } = useI18n();
  const q = usePartnerQuery(listAssignedSurveys);
  return (
    <>
      <PageHeader title={t("partner.surveys.title")} intro={t("partner.surveys.intro")} />
      <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner">
        {() =>
          q.data!.length === 0 ? (
            <EmptyState icon="target" title={t("partner.surveys.empty")} body={t("partner.surveys.emptyBody")} />
          ) : (
            <div className={portal.subCardGrid}>
              {q.data!.map((s) => (
                <section key={s.form.id} className={portal.subCard} aria-labelledby={`sv-${s.form.id}`}>
                  <div className={portal.subCardHead}>
                    <h2 id={`sv-${s.form.id}`} className={portal.subCardTitle}>
                      <Link href={`/partner/surveys/${s.form.id}`}>{s.form.title}</Link>
                    </h2>
                    {s.open ? <Badge tone="success">{t("partner.surveys.open")}</Badge> : <Badge tone="neutral">{t("partner.surveys.closed")}</Badge>}
                  </div>
                  <p className={portal.small}>{s.form.purpose}</p>
                  <p className={`${portal.small} ${portal.muted}`}>
                    {s.form.ref} · {t("partner.surveys.period", { from: formatDate(s.form.deploymentStart), to: formatDate(s.form.deploymentEnd) })}
                  </p>
                  <p className={portal.small}>
                    {s.published ? t("partner.surveys.currentVersion", { version: s.published.version }) : t("partner.surveys.noPublished")} · {t("partner.surveys.versionCount", { count: s.form.versions.length })}
                  </p>
                  <p className={portal.small}>{s.interventions.map((i) => i.ref).join(", ")}</p>
                  <div className={portal.buttonRow}>
                    {(["draft", "submitted", "needs_correction", "accepted"] as const).map((k) => (
                      <StatusBadgeCount key={k} status={k} count={s.counts[k] + (k === "submitted" ? s.counts.awaiting_sync + s.counts.saved_offline : 0)} />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )
        }
      </Gate>
    </>
  );
}

function StatusBadgeCount({ status, count }: { status: PartnerReportStatus; count: number }) {
  const { t } = useI18n();
  return (
    <span className={portal.small}>
      <StatusBadge entity="partnerReport" status={status} /> <span aria-label={t("partner.surveys.responsesCount", { count })}>{count}</span>
    </span>
  );
}

export function SurveyDetailView({ id }: { id: string }) {
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const fid = useId();
  const q = usePartnerQuery(() => getAssignedSurvey(id), [id]);
  const statusOptions = useStatusOptions("partnerReport", statuses);
  const [intervention, setIntervention] = useState("");
  const action = useServiceAction();

  return (
    <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner/surveys">
      {() => {
        const { survey, responses, canCollect } = q.data!;
        const chosen = intervention || survey.interventions[0]?.id || "";
        return (
          <>
            <PageHeader
              back={{ href: "/partner/surveys", label: t("partner.surveys.back") }}
              eyebrow={survey.form.ref}
              title={survey.form.title}
              intro={survey.form.purpose}
              meta={survey.open ? <Badge tone="success">{t("partner.surveys.open")}</Badge> : <Badge tone="neutral">{t("partner.surveys.closed")}</Badge>}
            />
            <div className={portal.stack}>
              <div className={portal.grid}>
                <Section title={t("partner.surveys.collect")}>
                  <p className={portal.small}>{t("partner.surveys.period", { from: formatDate(survey.form.deploymentStart), to: formatDate(survey.form.deploymentEnd) })}</p>
                  {!canCollect ? (
                    <Notice tone="info">{t("partner.surveys.noPermission")}</Notice>
                  ) : !survey.open ? (
                    <Notice tone="info">{t("partner.surveys.closedHint")}</Notice>
                  ) : (
                    <div className={styles.listRow}>
                      <SelectField id={`${fid}-int`} label={t("partner.workspace.intervention")} value={chosen} onChange={(e) => setIntervention(e.target.value)}>
                        {survey.interventions.map((i) => (
                          <option key={i.id} value={i.id}>
                            {i.ref} {i.title}
                          </option>
                        ))}
                      </SelectField>
                      <Button
                        icon="plus"
                        disabled={!chosen || Boolean(action.pending)}
                        onClick={async () => {
                          let newId = "";
                          if (await action.run("start", async () => (newId = await startSurveyResponse(survey.form.id, chosen)))) router.push(`/partner/surveys/responses/${newId}`);
                        }}
                      >
                        {action.pending ? t("common.loading") : t("partner.surveys.start")}
                      </Button>
                    </div>
                  )}
                  {action.error && (
                    <Notice tone="error" role="alert">
                      {action.error}
                    </Notice>
                  )}
                </Section>
                <Section title={t("partner.surveys.versions")}>
                  <ul className={portal.rowList}>
                    {[...survey.form.versions].reverse().map((v) => (
                      <li key={v.version} className={portal.rowItem}>
                        <span className={portal.rowMain}>
                          <strong>v{v.version}</strong>
                          <span className={portal.small}>{v.changeNote}</span>
                          <span className={portal.ref}>
                            {v.publishedAt ? t("partner.surveys.publishedOn", { date: formatDate(v.publishedAt) }) : "—"} · {t("partner.surveys.questionCount", { count: v.questions.length })}
                          </span>
                        </span>
                        <StatusBadge entity="formVersion" status={v.status} />
                      </li>
                    ))}
                  </ul>
                  <p className={`${portal.small} ${portal.muted}`}>{t("partner.surveys.versionRetained")}</p>
                </Section>
              </div>
              <RecordTable
                rows={responses.map((r) => ({ ...r, status: r.partnerStatus as string }))}
                loading={false}
                caption={t("partner.surveys.responses")}
                searchText={(r) => `${r.ref} ${r.interventionRef}`}
                statusOptions={statusOptions}
                emptyLabel={t("partner.surveys.noResponses")}
                columns={[
                  {
                    key: "ref",
                    header: t("partner.surveys.response"),
                    primary: true,
                    sortValue: (r) => r.ref,
                    render: (r) => (
                      <Link href={`/partner/surveys/responses/${r.id}`} className={portal.recordLink}>
                        {r.ref}
                      </Link>
                    ),
                  },
                  { key: "intervention", header: t("partner.workspace.intervention"), render: (r) => r.interventionRef },
                  { key: "version", header: t("partner.surveys.versionUsed"), render: (r) => `v${r.formVersion}` },
                  { key: "date", header: t("partner.fieldReports.activityDate"), sortValue: (r) => r.collectedAt, render: (r) => formatDate(r.collectedAt) },
                  { key: "status", header: t("partner.proposals.status"), render: (r) => <StatusBadge entity="partnerReport" status={r.partnerStatus} /> },
                ]}
              />
            </div>
          </>
        );
      }}
    </Gate>
  );
}

function QuestionInput({ q, value, onChange, error }: { q: FormQuestion; value: string; onChange: (v: string) => void; error?: string }) {
  const { t } = useI18n();
  const id = `q-${q.id}`;
  const required = q.required ? t("common.requiredMarker") : t("common.optional");
  if (q.type === "choice") {
    const options = q.options ?? [t("common.yes"), t("common.no")];
    return (
      <SelectField id={id} label={q.label} requiredLabel={required} value={value} error={error} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("portal.common.choose")}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </SelectField>
    );
  }
  if (q.type === "text") return <TextAreaField id={id} label={q.label} requiredLabel={required} value={value} error={error} onChange={(e) => onChange(e.target.value)} />;
  return (
    <TextField
      id={id}
      label={q.label}
      requiredLabel={required}
      type={q.type === "number" ? "number" : q.type === "date" ? "date" : "text"}
      inputMode={q.type === "number" ? "numeric" : undefined}
      hint={q.type === "gps" ? t("partner.surveys.gpsHint") : q.type === "photo" ? t("partner.surveys.photoHint") : q.indicatorId ? t("partner.surveys.indicatorHint") : undefined}
      value={value}
      error={error}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

export function SurveyResponseView({ id }: { id: string }) {
  const { t, formatDate } = useI18n();
  const q = usePartnerQuery(() => getPartnerFieldReport(id), [id]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string>();
  const action = useServiceAction();
  const key = q.data ? q.data.report.updatedAt : "";

  useEffect(() => {
    if (q.data) setAnswers(Object.fromEntries((q.data.report.answers ?? []).map((a) => [a.questionId, a.value])));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner/surveys">
      {() => {
        const { report: r, form, version, canEdit, intervention, history, orgLabel } = q.data!;
        const published = form?.versions.find((v) => v.status === "published");
        const lastOpm = [...r.comments].reverse().find((c) => !c.author.endsWith(`, ${orgLabel}`));
        const list = () => (version?.questions ?? []).map((qq) => ({ questionId: qq.id, value: answers[qq.id] ?? "" }));

        function validate() {
          const e: Record<string, string> = {};
          for (const qq of version?.questions ?? []) {
            const v = (answers[qq.id] ?? "").trim();
            if (qq.required && !v) e[qq.id] = t("portal.validation.required");
            else if (v && qq.type === "number" && !(Number.isFinite(Number(v)) && Number(v) >= 0)) e[qq.id] = t("partner.surveys.numberInvalid");
          }
          setErrors(e);
          return Object.keys(e).length === 0;
        }

        return (
          <RecordPage
            back={{ href: form ? `/partner/surveys/${form.id}` : "/partner/surveys", label: t("partner.surveys.backToSurvey") }}
            eyebrow={`${t("partner.surveys.response")} · ${r.ref}`}
            title={form?.title ?? r.title}
            badges={
              <>
                <StatusBadge entity="partnerReport" status={r.partnerStatus} />
                <Badge tone="neutral">{t("partner.surveys.versionBadge", { version: r.formVersion })}</Badge>
              </>
            }
            meta={`${intervention.ref} · ${formatDate(r.collectedAt)}`}
            notices={
              <>
                <div aria-live="polite">{action.success && <Notice tone="success">{action.success}</Notice>}</div>
                {published && published.version !== r.formVersion && <Notice tone="info">{t("partner.surveys.olderVersion", { used: r.formVersion, current: published.version })}</Notice>}
                {r.status === "returned" && (
                  <Notice tone="warning" title={t("partner.fieldReports.returnedTitle")}>
                    {lastOpm && (
                      <p>
                        <strong>{lastOpm.author}:</strong> “{lastOpm.text}”
                      </p>
                    )}
                  </Notice>
                )}
                {r.partnerStatus === "submitted" && <Notice tone="info">{t("partner.surveys.synced")}</Notice>}
                {r.status === "accepted" && <Notice tone="success">{t("partner.surveys.accepted")}</Notice>}
              </>
            }
            timeline={{ entries: history }}
            tabs={[
              {
                id: "answers",
                label: t("partner.surveys.answers"),
                content: canEdit ? (
                  <RecordSection title={t("partner.surveys.answers")}>
                    <div className={portal.inlineForm}>
                      {(version?.questions ?? []).map((qq) => (
                        <QuestionInput key={qq.id} q={qq} value={answers[qq.id] ?? ""} error={errors[qq.id]} onChange={(v) => setAnswers({ ...answers, [qq.id]: v })} />
                      ))}
                      {r.status === "returned" && <TextAreaField id="sv-correction" label={t("partner.fieldReports.correctionLabel")} requiredLabel={t("common.requiredMarker")} value={note} error={noteError} onChange={(e) => setNote(e.target.value)} />}
                      <div className={portal.buttonRow}>
                        <Button
                          icon="send"
                          disabled={Boolean(action.pending)}
                          onClick={async () => {
                            if (!validate()) return;
                            if (r.status === "returned" && !note.trim()) {
                              setNoteError(t("partner.fieldReports.correctionRequired"));
                              return;
                            }
                            setNoteError(undefined);
                            await action.run(
                              "submit",
                              async () => {
                                await saveSurveyResponse(r.id, list());
                                await submitFieldReport(r.id, note);
                              },
                              t("partner.surveys.submitted"),
                            );
                          }}
                        >
                          {action.pending === "submit" ? t("common.loading") : r.status === "returned" ? t("partner.fieldReports.resubmit") : t("partner.surveys.submit")}
                        </Button>
                        <Button variant="secondary" icon="check" disabled={Boolean(action.pending)} onClick={() => action.run("save", () => saveSurveyResponse(r.id, list()), t("partner.surveys.saved"))}>
                          {action.pending === "save" ? t("common.loading") : t("partner.fieldReports.saveDraft")}
                        </Button>
                      </div>
                      {action.error && (
                        <Notice tone="error" role="alert">
                          {action.error}
                        </Notice>
                      )}
                    </div>
                  </RecordSection>
                ) : (
                  <RecordSection title={t("partner.surveys.answers")}>
                    <FieldGrid items={(version?.questions ?? []).map((qq) => ({ label: qq.label, value: (r.answers ?? []).find((a) => a.questionId === qq.id)?.value || "—", wide: qq.type === "text" }))} />
                  </RecordSection>
                ),
              },
              {
                id: "versions",
                label: t("partner.fieldReports.versionsTab"),
                count: (r.history ?? []).length,
                content: (
                  <RecordSection title={t("partner.fieldReports.versionsTab")}>
                    {(r.history ?? []).length === 0 ? (
                      <p className={portal.muted}>{t("partner.fieldReports.noVersions")}</p>
                    ) : (
                      <ul className={portal.rowList}>
                        {[...(r.history ?? [])].reverse().map((h) => (
                          <li key={h.version} className={portal.rowItem}>
                            <span className={portal.rowMain}>
                              <strong>{t("partner.proposals.versionN", { version: h.version })}</strong>
                              <span className={portal.ref}>
                                {h.by} · {formatDate(h.at, true)}
                              </span>
                              <span className={portal.small}>{(h.answers ?? []).map((a) => `${a.questionId}: ${a.value || "—"}`).join(" · ")}</span>
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </RecordSection>
                ),
              },
              {
                id: "comments",
                label: t("partner.fieldReports.commentsTab"),
                count: r.comments.length,
                content: (
                  <RecordSection title={t("partner.messages.correspondence")}>
                    <CommentThread comments={r.comments} label={t("partner.messages.correspondence")} emptyLabel={t("partner.messages.noFormal")} />
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
