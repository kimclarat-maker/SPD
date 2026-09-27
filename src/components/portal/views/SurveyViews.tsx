"use client";

import Link from "next/link";
import { useCallback, useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { FormQuestion } from "@/lib/types";
import {
  addQuestion,
  createDraftVersion,
  discardDraft,
  getForm,
  getIndicator,
  listForms,
  listIndicators,
  publishVersion,
  removeQuestion,
  retireForm,
  type FormRow,
  type IndicatorRow,
} from "@/lib/services/surveys";
import type { RecordFilters } from "@/lib/services/filters";
import { sectorName, settlementName } from "@/lib/services/lookup";
import { getState } from "@/lib/demo/store";
import { useCan, useServiceAction, useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, useStatusOptions } from "@/components/portal/StatusBadge";
import { FilterBar, useRecordFilters } from "@/components/portal/FilterBar";
import { FieldGrid, PageTabs, RecordPage, RecordSection, type RecordAction } from "@/components/portal/RecordPage";
import { EmptyState, RecordNotFound } from "@/components/portal/RecordBits";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Badge } from "@/components/ui/Badge";
import { SelectField, TextField } from "@/components/ui/Field";
import styles from "@/components/portal/portal.module.css";

export function SurveysView({ initialTab, initialFilters }: { initialTab?: string; initialFilters: RecordFilters }) {
  const { t } = useI18n();
  const [tab, setTab] = useState(initialTab === "indicators" ? "indicators" : "forms");
  const extra = useCallback(() => ({ tab }), [tab]);
  const [filters, setFilters] = useRecordFilters(initialFilters, extra);

  return (
    <>
      <PageHeader title={t("portal.surveys.title")} intro={t("portal.surveys.intro")} />
      <PageTabs
        label={t("portal.surveys.title")}
        active={tab}
        onChange={(next) => {
          setTab(next);
          setFilters({ ...filters });
        }}
        tabs={[
          { id: "forms", label: t("portal.surveys.formsTab"), content: <FormsTable /> },
          { id: "indicators", label: t("portal.surveys.indicatorsTab"), content: <IndicatorsTable filters={filters} setFilters={setFilters} /> },
        ]}
      />
    </>
  );
}

function FormsTable() {
  const { t, formatDate, formatNumber } = useI18n();
  const { data, loading } = useServiceQuery(listForms);
  const statusOptions = useStatusOptions("form", ["published", "draft", "retired"]);
  return (
    <RecordTable<FormRow>
      rows={data}
      loading={loading}
      caption={t("portal.surveys.formsTab")}
      searchText={(f) => `${f.title} ${f.ref} ${f.purpose}`}
      statusOptions={statusOptions}
      columns={[
        {
          key: "title",
          header: t("portal.surveys.form"),
          primary: true,
          sortValue: (f) => f.title,
          render: (f) => (
            <>
              <Link href={`/portal/surveys/forms/${f.id}`} className={styles.recordLink}>
                {f.title}
              </Link>
              <span className={styles.ref}>
                {f.ref} · {t(`portal.fieldReports.kinds.${f.kind}` as MessageKey)}
              </span>
            </>
          ),
        },
        { key: "purpose", header: t("portal.surveys.purpose"), render: (f) => <span className={styles.clamp}>{f.purpose}</span> },
        {
          key: "version",
          header: t("portal.surveys.version"),
          render: (f) => (
            <>
              {f.currentVersion ? `v${f.currentVersion}` : "—"}
              {f.draftVersion && <span className={styles.ref}>{t("portal.surveys.draftPending", { version: f.draftVersion })}</span>}
            </>
          ),
        },
        {
          key: "period",
          header: t("portal.surveys.deployment"),
          sortValue: (f) => f.deploymentEnd,
          render: (f) => (
            <span className={styles.nowrap}>
              {formatDate(f.deploymentStart)} – {formatDate(f.deploymentEnd)}
            </span>
          ),
        },
        { key: "linked", header: t("portal.surveys.linked"), numeric: true, render: (f) => formatNumber(f.interventionIds.length) },
        { key: "responses", header: t("portal.surveys.responses"), numeric: true, sortValue: (f) => f.responses, render: (f) => formatNumber(f.responses) },
        { key: "status", header: t("portal.table.status"), render: (f) => <StatusBadge entity="form" status={f.status} /> },
      ]}
    />
  );
}

function IndicatorsTable({ filters, setFilters }: { filters: RecordFilters; setFilters: (f: RecordFilters) => void }) {
  const { t, formatDate, formatNumber } = useI18n();
  const { data, loading } = useServiceQuery(() => listIndicators(filters), [JSON.stringify(filters)]);
  const statusOptions = useStatusOptions("indicator", ["active", "inactive"]);
  return (
    <div className={styles.stack}>
      <FilterBar value={filters} onChange={setFilters} />
      <p className={`${styles.small} ${styles.muted}`}>{t("portal.surveys.indicatorsNote")}</p>
      <RecordTable<IndicatorRow>
        rows={data}
        loading={loading}
        caption={t("portal.surveys.indicatorsTab")}
        searchText={(i) => `${i.code} ${i.name} ${i.unit}`}
        statusOptions={statusOptions}
        filters={[
          {
            key: "freshness",
            label: t("portal.surveys.freshness"),
            options: ["fresh", "ageing", "stale", "none"].map((f) => ({ value: f, label: t(`portal.status.freshness.${f}` as MessageKey) })),
            test: (i, v) => i.freshness === v,
          },
        ]}
        columns={[
          {
            key: "name",
            header: t("portal.surveys.indicator"),
            primary: true,
            sortValue: (i) => i.code,
            render: (i) => (
              <>
                <Link href={`/portal/surveys/indicators/${i.id}`} className={styles.recordLink}>
                  {i.code} {i.name}
                </Link>
                <span className={styles.ref}>
                  {sectorName(i.sector)} · {i.unit} · {t(`portal.surveys.frequency.${i.frequency}` as MessageKey)}
                </span>
              </>
            ),
          },
          { key: "target", header: t("portal.surveys.target"), numeric: true, sortValue: (i) => i.target, render: (i) => formatNumber(i.target) },
          { key: "actual", header: t("portal.surveys.actual"), numeric: true, sortValue: (i) => i.actual, render: (i) => formatNumber(i.actual) },
          { key: "percent", header: t("portal.surveys.percentTarget"), numeric: true, sortValue: (i) => i.percent, render: (i) => `${i.percent}%` },
          { key: "sources", header: t("portal.surveys.contributing"), numeric: true, render: (i) => formatNumber(i.contributions) },
          {
            key: "missing",
            header: t("portal.surveys.missing"),
            numeric: true,
            sortValue: (i) => i.missing.length,
            render: (i) => (i.missing.length ? <Badge tone="warning">{formatNumber(i.missing.length)}</Badge> : "0"),
          },
          {
            key: "fresh",
            header: t("portal.surveys.freshness"),
            render: (i) => (
              <>
                <StatusBadge entity="freshness" status={i.freshness} />
                {i.lastAcceptedAt && <span className={styles.ref}>{formatDate(i.lastAcceptedAt)}</span>}
              </>
            ),
          },
        ]}
      />
    </div>
  );
}

const questionTypes: FormQuestion["type"][] = ["number", "text", "choice", "gps", "photo", "date"];

function QuestionPreview({ q, id }: { q: FormQuestion; id: string }) {
  const { t } = useI18n();
  const inputId = `${id}-${q.id}`;
  const label = (
    <>
      {q.label}
      {q.required && <span className={styles.muted}> {t("common.requiredMarker")}</span>}
      {q.indicatorId && (
        <Badge tone="info" icon="target">
          {getState().indicators.find((i) => i.id === q.indicatorId)?.code ?? q.indicatorId}
        </Badge>
      )}
    </>
  );
  return (
    <div className={styles.previewQuestion}>
      <label htmlFor={inputId} className={styles.previewLabel}>
        {label}
      </label>
      {q.type === "text" ? (
        <textarea id={inputId} disabled rows={2} className={styles.previewInput} />
      ) : q.type === "choice" ? (
        <select id={inputId} disabled className={styles.previewInput}>
          <option>{t("portal.common.choose")}</option>
        </select>
      ) : q.type === "photo" ? (
        <button id={inputId} type="button" disabled className={styles.previewInput}>
          {t("portal.surveys.types.photo")}
        </button>
      ) : q.type === "gps" ? (
        <input id={inputId} disabled className={styles.previewInput} value={t("portal.surveys.gpsCapture")} readOnly />
      ) : (
        <input id={inputId} disabled type={q.type === "number" ? "number" : "date"} className={styles.previewInput} />
      )}
    </div>
  );
}

export function FormDetailView({ id }: { id: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const fieldId = useId();
  const can = useCan();
  const { data, notFound } = useServiceQuery(() => getForm(id), [id]);
  const edit = useServiceAction();
  const [previewVersion, setPreviewVersion] = useState<number | null>(null);
  const [question, setQuestion] = useState<Omit<FormQuestion, "id">>({ label: "", type: "number", required: true });
  const [labelError, setLabelError] = useState<string>();

  if (notFound) return <RecordNotFound backHref="/portal/surveys" />;
  if (!data) return <LoadingState label={t("common.loading")} />;

  const { form, responses, interventions } = data;
  const canManage = can("forms.manage");
  const draft = form.versions.find((v) => v.status === "draft");
  const published = form.versions.find((v) => v.status === "published");
  const shown = form.versions.find((v) => v.version === (previewVersion ?? draft?.version ?? published?.version)) ?? form.versions[form.versions.length - 1];
  const indicators = getState().indicators.filter((i) => i.active);

  const actions: RecordAction[] = [];
  if (!draft) {
    actions.push({ key: "draft", label: t("portal.surveys.newDraft"), icon: "pen", requiresNote: true, denied: !canManage, noteLabel: t("portal.surveys.changeNote"), run: (note) => createDraftVersion(form.id, note) });
  } else {
    actions.push(
      { key: "publish", label: t("portal.surveys.publish", { version: draft.version }), tone: "primary", icon: "send", requiresNote: true, denied: !canManage, hint: t("portal.surveys.publishHint"), run: (note) => publishVersion(form.id, note) },
      { key: "discard", label: t("portal.surveys.discard"), tone: "danger", icon: "trash", noNote: true, denied: !canManage, run: () => discardDraft(form.id) },
    );
  }
  if (published) {
    actions.push({ key: "retire", label: t("portal.surveys.retire"), tone: "danger", icon: "minusCircle", requiresNote: true, denied: !canManage, hint: t("portal.surveys.retireHint"), run: (note) => retireForm(form.id, note) });
  }

  return (
    <RecordPage
      back={{ href: "/portal/surveys", label: t("portal.surveys.back") }}
      eyebrow={`${t("portal.entity.form")} · ${form.ref}`}
      title={form.title}
      badges={
        <>
          <StatusBadge entity="form" status={form.status} />
          {published && <Badge tone="info">{t("portal.surveys.liveVersion", { version: published.version })}</Badge>}
          {draft && <Badge tone="warning">{t("portal.surveys.draftPending", { version: draft.version })}</Badge>}
        </>
      }
      meta={[t(`portal.fieldReports.kinds.${form.kind}` as MessageKey), `${formatDate(form.deploymentStart)} – ${formatDate(form.deploymentEnd)}`, t("portal.surveys.responsesCount", { count: form.responses })].join(" · ")}
      actions={actions}
      timelineId={form.id}
      tabs={[
        {
          id: "overview",
          label: t("portal.detail.overview"),
          content: (
            <>
              <RecordSection title={t("portal.detail.overview")}>
                <FieldGrid
                  items={[
                    { label: t("portal.surveys.purpose"), value: form.purpose, wide: true },
                    { label: t("portal.fieldReports.kind"), value: t(`portal.fieldReports.kinds.${form.kind}` as MessageKey) },
                    { label: t("portal.filters.sector"), value: form.sector === "cross_sector" ? t("portal.surveys.crossSector") : sectorName(form.sector) },
                    { label: t("portal.surveys.deployment"), value: `${formatDate(form.deploymentStart)} – ${formatDate(form.deploymentEnd)}` },
                    { label: t("portal.surveys.responses"), value: formatNumber(form.responses) },
                  ]}
                />
              </RecordSection>
              <RecordSection title={t("portal.surveys.versions")}>
                <div className={styles.tableScroll} role="region" aria-label={t("portal.surveys.versions")} tabIndex={0}>
                  <table className={`${styles.table} ${styles.tableCompact}`}>
                    <thead>
                      <tr>
                        <th scope="col">{t("portal.surveys.version")}</th>
                        <th scope="col">{t("portal.table.status")}</th>
                        <th scope="col">{t("portal.surveys.published")}</th>
                        <th scope="col">{t("portal.surveys.retired")}</th>
                        <th scope="col" className={styles.num}>
                          {t("portal.surveys.responses")}
                        </th>
                        <th scope="col">{t("portal.surveys.changeNote")}</th>
                        <th scope="col">
                          <span className="visually-hidden">{t("portal.surveys.preview")}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...form.versions].reverse().map((v) => (
                        <tr key={v.version}>
                          <th scope="row">v{v.version}</th>
                          <td>
                            <StatusBadge entity="formVersion" status={v.status} />
                          </td>
                          <td>{v.publishedAt ? formatDate(v.publishedAt) : "—"}</td>
                          <td>{v.retiredAt ? formatDate(v.retiredAt) : "—"}</td>
                          <td className={styles.num}>{formatNumber(form.responsesByVersion[v.version] ?? 0)}</td>
                          <td>{v.changeNote}</td>
                          <td>
                            <Button size="sm" variant="ghost" icon="eye" onClick={() => setPreviewVersion(v.version)} aria-pressed={shown.version === v.version}>
                              {t("portal.surveys.preview")}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className={`${styles.small} ${styles.muted}`}>{t("portal.surveys.historyNote")}</p>
              </RecordSection>
            </>
          ),
        },
        {
          id: "preview",
          label: t("portal.surveys.previewTab"),
          content: (
            <RecordSection title={t("portal.surveys.previewTitle", { version: shown.version })} actions={<StatusBadge entity="formVersion" status={shown.status} />}>
              <div className={styles.phone} aria-label={t("portal.surveys.previewTitle", { version: shown.version })}>
                {shown.questions.map((q) => (
                  <div key={q.id} className={styles.previewRow}>
                    <QuestionPreview q={q} id={fieldId} />
                    {shown.status === "draft" && canManage && (
                      <Button size="sm" variant="ghost" icon="trash" aria-label={`${t("portal.surveys.removeQuestion")}: ${q.label}`} onClick={() => edit.run(q.id, () => removeQuestion(form.id, q.id))}>
                        <span className="visually-hidden">{t("portal.surveys.removeQuestion")}</span>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              {shown.status === "draft" && canManage && (
                <form
                  className={styles.inlineGrid}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!question.label.trim()) {
                      setLabelError(t("portal.validation.required"));
                      return;
                    }
                    setLabelError(undefined);
                    if (await edit.run("add", () => addQuestion(form.id, question))) setQuestion({ label: "", type: "number", required: true });
                  }}
                >
                  <p className={styles.subheading}>{t("portal.surveys.addQuestion")}</p>
                  <TextField id={`${fieldId}-ql`} label={t("portal.surveys.questionLabel")} value={question.label} error={labelError} onChange={(e) => setQuestion({ ...question, label: e.target.value })} />
                  <SelectField id={`${fieldId}-qt`} label={t("portal.surveys.questionType")} value={question.type} onChange={(e) => setQuestion({ ...question, type: e.target.value as FormQuestion["type"] })}>
                    {questionTypes.map((qt) => (
                      <option key={qt} value={qt}>
                        {t(`portal.surveys.types.${qt}` as MessageKey)}
                      </option>
                    ))}
                  </SelectField>
                  <SelectField
                    id={`${fieldId}-qi`}
                    label={t("portal.surveys.linkIndicator")}
                    requiredLabel={t("common.optional")}
                    value={question.indicatorId ?? ""}
                    onChange={(e) => setQuestion({ ...question, indicatorId: e.target.value || undefined })}
                  >
                    <option value="">{t("common.none")}</option>
                    {indicators.map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.code} {i.name}
                      </option>
                    ))}
                  </SelectField>
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={question.required} onChange={(e) => setQuestion({ ...question, required: e.target.checked })} />
                    <span>{t("portal.surveys.required")}</span>
                  </label>
                  <div>
                    <Button type="submit" variant="secondary" icon="plus" disabled={Boolean(edit.pending)}>
                      {t("portal.surveys.addQuestion")}
                    </Button>
                  </div>
                </form>
              )}
              {edit.error && (
                <Notice tone="error" role="alert">
                  {edit.error}
                </Notice>
              )}
            </RecordSection>
          ),
        },
        {
          id: "responses",
          label: t("portal.surveys.responses"),
          count: responses.length,
          content: (
            <RecordSection title={t("portal.surveys.responses")}>
              {responses.length === 0 ? (
                <EmptyState title={t("portal.surveys.noResponses")} />
              ) : (
                <ul className={styles.rowList}>
                  {responses.map((r) => (
                    <li key={r.id} className={styles.rowItem}>
                      <span className={styles.rowMain}>
                        <Link href={`/portal/field-reports/${r.id}`} className={styles.recordLink}>
                          {r.ref} {r.title}
                        </Link>
                        <span className={styles.ref}>{formatDate(r.collectedAt)}</span>
                      </span>
                      <Badge tone="neutral">v{r.formVersion}</Badge>
                      <StatusBadge entity="fieldReport" status={r.status} />
                    </li>
                  ))}
                </ul>
              )}
            </RecordSection>
          ),
        },
        {
          id: "interventions",
          label: t("portal.surveys.linked"),
          count: interventions.length,
          content: (
            <RecordSection title={t("portal.surveys.linked")}>
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
            </RecordSection>
          ),
        },
      ]}
    />
  );
}

export function IndicatorDetailView({ id }: { id: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const { data, notFound } = useServiceQuery(() => getIndicator(id), [id]);

  if (notFound) return <RecordNotFound backHref="/portal/surveys?tab=indicators" />;
  if (!data) return <LoadingState label={t("common.loading")} />;
  const { indicator: ind, contributions, byIntervention, forms } = data;

  return (
    <RecordPage
      back={{ href: "/portal/surveys?tab=indicators", label: t("portal.surveys.backIndicators") }}
      eyebrow={`${t("portal.entity.indicator")} · ${ind.code}`}
      title={ind.name}
      badges={
        <>
          <StatusBadge entity="indicator" status={ind.status} />
          <StatusBadge entity="freshness" status={ind.freshness} />
        </>
      }
      meta={[sectorName(ind.sector), ind.unit, t(`portal.surveys.frequency.${ind.frequency}` as MessageKey)].join(" · ")}
      progress={Math.min(100, ind.percent)}
      timelineId={ind.id}
      tabs={[
        {
          id: "summary",
          label: t("portal.detail.overview"),
          content: (
            <>
              <RecordSection title={t("portal.surveys.performance")}>
                <div className={styles.figureGrid}>
                  {(
                    [
                      [t("portal.surveys.target"), formatNumber(ind.target)],
                      [t("portal.surveys.actual"), formatNumber(ind.actual)],
                      [t("portal.surveys.percentTarget"), `${ind.percent}%`],
                      [t("portal.surveys.contributing"), formatNumber(ind.contributions)],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label} className={styles.figure}>
                      <span className={styles.figureValue}>{value}</span>
                      <span className={styles.figureLabel}>{label}</span>
                    </div>
                  ))}
                </div>
                <p className={`${styles.small} ${styles.muted}`}>
                  {ind.lastAcceptedAt ? t("portal.surveys.lastData", { date: formatDate(ind.lastAcceptedAt, true) }) : t("portal.surveys.noData")}
                </p>
              </RecordSection>
              {ind.missing.length > 0 && (
                <RecordSection title={t("portal.surveys.missingTitle")}>
                  <Notice tone="warning">{t("portal.surveys.missingIntro")}</Notice>
                  <ul className={styles.rowList}>
                    {ind.missing.map((i) => (
                      <li key={i.id} className={styles.rowItem}>
                        <span className={styles.rowMain}>
                          <Link href={`/portal/interventions/${i.id}`} className={styles.recordLink}>
                            {i.ref} {i.title}
                          </Link>
                          <span className={styles.ref}>{settlementName(i.settlementId)}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </RecordSection>
              )}
              <RecordSection title={t("portal.surveys.byIntervention")}>
                <div className={styles.tableScroll} role="region" aria-label={t("portal.surveys.byIntervention")} tabIndex={0}>
                  <table className={`${styles.table} ${styles.tableCompact}`}>
                    <thead>
                      <tr>
                        <th scope="col">{t("portal.interventions.intervention")}</th>
                        <th scope="col">{t("portal.table.status")}</th>
                        <th scope="col" className={styles.num}>
                          {t("portal.surveys.target")}
                        </th>
                        <th scope="col" className={styles.num}>
                          {t("portal.surveys.actual")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {byIntervention.map((row) => (
                        <tr key={row.intervention.id}>
                          <th scope="row">
                            <Link href={`/portal/interventions/${row.intervention.id}`}>{row.intervention.ref}</Link>
                            <span className={styles.ref}>{row.intervention.title}</span>
                          </th>
                          <td>
                            <StatusBadge entity="intervention" status={row.intervention.status} />
                          </td>
                          <td className={styles.num}>{formatNumber(row.target)}</td>
                          <td className={styles.num}>{formatNumber(row.actual)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </RecordSection>
            </>
          ),
        },
        {
          id: "trace",
          label: t("portal.surveys.trace"),
          count: contributions.length,
          content: (
            <RecordSection title={t("portal.surveys.trace")}>
              <p className={`${styles.small} ${styles.muted}`}>{t("portal.surveys.traceIntro")}</p>
              {contributions.length === 0 ? (
                <EmptyState title={t("portal.surveys.noData")} />
              ) : (
                <div className={styles.tableScroll} role="region" aria-label={t("portal.surveys.trace")} tabIndex={0}>
                  <table className={`${styles.table} ${styles.tableCompact}`}>
                    <thead>
                      <tr>
                        <th scope="col">{t("portal.fieldReports.submission")}</th>
                        <th scope="col">{t("portal.interventions.intervention")}</th>
                        <th scope="col">{t("portal.fieldReports.collected")}</th>
                        <th scope="col">{t("portal.surveys.formVersion")}</th>
                        <th scope="col" className={styles.num}>
                          {t("portal.surveys.value")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {contributions.map((c) => (
                        <tr key={c.report.id}>
                          <th scope="row">
                            <Link href={`/portal/field-reports/${c.report.id}`}>{c.report.ref}</Link>
                            <span className={styles.ref}>{c.report.title}</span>
                          </th>
                          <td>
                            <Link href={`/portal/interventions/${c.intervention.id}`}>{c.intervention.ref}</Link>
                            <span className={styles.ref}>{settlementName(c.intervention.settlementId)}</span>
                          </td>
                          <td>{formatDate(c.report.collectedAt)}</td>
                          <td>v{c.report.formVersion}</td>
                          <td className={styles.num}>{formatNumber(c.value)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <th scope="row" colSpan={4}>
                          {t("portal.surveys.total")}
                        </th>
                        <td className={styles.num}>
                          <strong>{formatNumber(ind.actual)}</strong>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </RecordSection>
          ),
        },
        {
          id: "forms",
          label: t("portal.surveys.collectedBy"),
          count: forms.length,
          content: (
            <RecordSection title={t("portal.surveys.collectedBy")}>
              {forms.length === 0 ? (
                <p className={styles.muted}>{t("portal.surveys.noFormLink")}</p>
              ) : (
                <ul className={styles.rowList}>
                  {forms.map((f) => (
                    <li key={f.id} className={styles.rowItem}>
                      <Link href={`/portal/surveys/forms/${f.id}`} className={styles.recordLink}>
                        {f.title}
                      </Link>
                      <span className={styles.ref}>{f.ref}</span>
                    </li>
                  ))}
                </ul>
              )}
            </RecordSection>
          ),
        },
      ]}
    />
  );
}
