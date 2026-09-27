"use client";

import { useId, useMemo, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { PartnerReport, PartnerReportSection } from "@/lib/types";
import {
  generatePartnerReport,
  listPartnerReports,
  partnerSections,
  previewPartnerReport,
  recordPartnerExport,
  reportRows,
  type PartnerReportFilters,
  type PartnerReportResult,
} from "@/lib/services/partnerInsights";
import { useServiceAction, useServiceQuery } from "@/lib/services/hooks";
import { exportCsv, exportPdfViaPrint, exportXlsx, type ExportSheet } from "@/lib/export";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SelectField, TextField } from "@/components/ui/Field";
import { PageHeader, Section } from "@/components/portal/PageHeader";
import { EmptyState } from "@/components/portal/RecordBits";
import { BarList } from "@/components/portal/charts/Charts";
import { Gate, usePartnerQuery } from "@/components/partner/PartnerBits";
import portal from "@/components/portal/portal.module.css";
import styles from "@/components/partner/partner.module.css";

const figureKeys = ["interventions", "activeInterventions", "acceptedReports", "peopleReached", "assistanceEntries", "assistanceQuantity", "settlements", "budgetUsd", "acceptedExpenditureUsd"] as const;

export function PartnerReportsView() {
  const { t, formatDate } = useI18n();
  const fid = useId();
  const q = usePartnerQuery(listPartnerReports);
  const [title, setTitle] = useState("");
  const [filters, setFilters] = useState<PartnerReportFilters>({});
  const [sections, setSections] = useState<PartnerReportSection[]>([...partnerSections]);
  const [titleError, setTitleError] = useState<string>();
  const [open, setOpen] = useState<string | null>(null);
  const generate = useServiceAction();
  const key = JSON.stringify({ filters, sections });
  const preview = useServiceQuery(() => previewPartnerReport(filters, sections), [key]);

  return (
    <>
      <PageHeader title={t("partner.reports.title")} intro={t("partner.reports.intro")} />
      <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner">
        {() => {
          const d = q.data!;
          const openReport = d.reports.find((r) => r.id === open);
          return (
            <div className={portal.stack}>
              <Notice tone="info">{t("partner.reports.scopeNote")}</Notice>
              <div className={styles.split}>
                <Section title={t("partner.reports.builder")}>
                  <div className={styles.formGrid}>
                    <div className={styles.wide}>
                      <TextField id={`${fid}-title`} label={t("partner.reports.reportTitle")} requiredLabel={t("common.requiredMarker")} value={title} error={titleError} onChange={(e) => setTitle(e.target.value)} placeholder={t("partner.reports.titlePlaceholder")} />
                    </div>
                    <SelectField id={`${fid}-int`} label={t("partner.workspace.intervention")} value={filters.interventionId ?? ""} onChange={(e) => setFilters({ ...filters, interventionId: e.target.value || undefined })}>
                      <option value="">{t("partner.reports.allInterventions")}</option>
                      {d.interventions.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.ref} {i.title}
                        </option>
                      ))}
                    </SelectField>
                    <TextField id={`${fid}-from`} type="date" label={t("partner.reports.from")} value={filters.from ?? ""} onChange={(e) => setFilters({ ...filters, from: e.target.value || undefined })} />
                    <TextField id={`${fid}-to`} type="date" label={t("partner.reports.to")} value={filters.to ?? ""} onChange={(e) => setFilters({ ...filters, to: e.target.value || undefined })} />
                    <fieldset className={`${styles.fieldset} ${styles.wide}`}>
                      <legend className={styles.legend}>{t("partner.reports.sections")}</legend>
                      <div className={styles.checkGrid}>
                        {partnerSections.map((s) => (
                          <label key={s} className={portal.checkRow}>
                            <input type="checkbox" checked={sections.includes(s)} onChange={(e) => setSections(e.target.checked ? [...sections, s] : sections.filter((x) => x !== s))} />
                            {t(`partner.reports.sectionNames.${s}` as MessageKey)}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  </div>
                  <div className={portal.buttonRow}>
                    <Button
                      icon="fileCheck"
                      disabled={Boolean(generate.pending) || sections.length === 0}
                      onClick={async () => {
                        if (!title.trim()) {
                          setTitleError(t("portal.validation.required"));
                          return;
                        }
                        setTitleError(undefined);
                        let id = "";
                        if (await generate.run("gen", async () => (id = await generatePartnerReport(title, filters, sections)), t("partner.reports.generated"))) {
                          setOpen(id);
                          setTitle("");
                        }
                      }}
                    >
                      {generate.pending ? t("common.loading") : t("partner.reports.generate")}
                    </Button>
                    <span className={`${portal.small} ${portal.muted}`}>{t("partner.reports.freezeNote")}</span>
                  </div>
                  <div aria-live="polite">{generate.success && <Notice tone="success">{generate.success}</Notice>}</div>
                  {generate.error && (
                    <Notice tone="error" role="alert">
                      {generate.error}
                    </Notice>
                  )}
                </Section>

                <Section title={t("partner.reports.saved")}>
                  {d.reports.length === 0 ? (
                    <p className={portal.muted}>{t("partner.reports.noneSaved")}</p>
                  ) : (
                    <ul className={portal.rowList}>
                      {d.reports.map((r) => (
                        <li key={r.id} className={portal.rowItem}>
                          <span className={portal.rowMain}>
                            <strong>{r.title}</strong>
                            <span className={portal.ref}>
                              {r.ref} · {formatDate(r.generatedAt, true)} · {r.generatedBy}
                              {r.exports.length > 0 && ` · ${t("partner.reports.exportedTimes", { count: r.exports.length })}`}
                            </span>
                          </span>
                          <Button size="sm" variant={open === r.id ? "primary" : "secondary"} icon="eye" aria-pressed={open === r.id} onClick={() => setOpen(open === r.id ? null : r.id)}>
                            {t("partner.reports.open")}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Section>
              </div>

              {openReport ? (
                <SavedReport report={openReport} canExport={d.canExport} onClose={() => setOpen(null)} />
              ) : (
                <Section title={t("partner.reports.preview")} actions={<Badge tone="info">{t("partner.reports.livePreview")}</Badge>}>
                  {preview.data ? <Preview result={preview.data} /> : <p className={portal.muted}>{t("common.loading")}</p>}
                </Section>
              )}
            </div>
          );
        }}
      </Gate>
    </>
  );
}

function SavedReport({ report, canExport, onClose }: { report: PartnerReport; canExport: boolean; onClose: () => void }) {
  const { t, formatDate } = useI18n();
  const filters = useMemo<PartnerReportFilters>(() => ({ interventionId: report.interventionId, from: report.from, to: report.to }), [report]);
  const q = useServiceQuery(() => previewPartnerReport(filters, report.sections), [report.id]);
  const action = useServiceAction();

  const header = [
    `${report.title} (${report.ref})`,
    t("partner.reports.fileHeader", { date: formatDate(report.generatedAt, true), by: report.generatedBy }),
    t("partner.reports.fileClassification"),
  ];
  const sheets = (result: PartnerReportResult): ExportSheet[] => [
    { name: t("partner.reports.figures"), columns: [t("partner.reports.figure"), t("partner.reports.valueAtGeneration")], rows: figureKeys.map((k) => [t(`partner.reports.figureNames.${k}` as MessageKey), report.snapshot[k] ?? 0]) },
    ...result.tables.map((tb) => ({ name: t(`partner.reports.sectionNames.${tb.section}` as MessageKey), columns: tb.columns, rows: tb.rows })),
  ];
  const file = `${report.ref}`.replace(/[^A-Za-z0-9-]/g, "_");

  return (
    <Section
      title={report.title}
      actions={
        <Button size="sm" variant="ghost" icon="x" onClick={onClose}>
          {t("common.close")}
        </Button>
      }
    >
      {!q.data ? (
        <p className={portal.muted}>{t("common.loading")}</p>
      ) : (
        <>
          <div className={portal.exportBar} role="group" aria-label={t("partner.reports.export")}>
            {canExport ? (
              <>
                <Button size="sm" variant="secondary" icon="printer" disabled={Boolean(action.pending)} onClick={() => action.run("pdf", async () => { await recordPartnerExport(report.id, "PDF", reportRows(q.data!)); exportPdfViaPrint(); }, t("partner.reports.exported", { format: "PDF" }))}>
                  PDF
                </Button>
                <Button size="sm" variant="secondary" icon="download" disabled={Boolean(action.pending)} onClick={() => action.run("xlsx", async () => { const n = exportXlsx(`${file}.xlsx`, header, sheets(q.data!)); await recordPartnerExport(report.id, "Excel", n); }, t("partner.reports.exported", { format: "Excel" }))}>
                  Excel
                </Button>
                <Button size="sm" variant="secondary" icon="download" disabled={Boolean(action.pending)} onClick={() => action.run("csv", async () => { const n = exportCsv(`${file}.csv`, header, sheets(q.data!)); await recordPartnerExport(report.id, "CSV", n); }, t("partner.reports.exported", { format: "CSV" }))}>
                  CSV
                </Button>
              </>
            ) : (
              <span className={`${portal.small} ${portal.muted}`}>{t("partner.reports.noExport")}</span>
            )}
          </div>
          <div aria-live="polite">{action.success && <Notice tone="success">{action.success}</Notice>}</div>
          {action.error && (
            <Notice tone="error" role="alert">
              {action.error}
            </Notice>
          )}
          <div className="print-area">
            <div className={portal.printHeader}>
              <p className={portal.eyebrowText}>{t("partner.reports.printHeader")}</p>
              <h2 className={portal.sectionTitle}>{report.title}</h2>
              <p className={portal.muted}>
                {report.ref} · {t("partner.reports.fileHeader", { date: formatDate(report.generatedAt, true), by: report.generatedBy })}
              </p>
              <p className={portal.small}>{t("partner.reports.fileClassification")}</p>
            </div>
            <Notice tone="info">{t("partner.reports.frozen")}</Notice>
            <Preview result={q.data} snapshot={report.snapshot} />
          </div>
        </>
      )}
    </Section>
  );
}

function Preview({ result, snapshot }: { result: PartnerReportResult; snapshot?: Record<string, number> }) {
  const { t, formatNumber } = useI18n();
  const figures = snapshot ?? (result.figures as unknown as Record<string, number>);
  const assistance = result.tables.find((x) => x.section === "assistance");
  return (
    <div className={portal.stack}>
      <div className={portal.figureGrid}>
        {figureKeys.map((k) => (
          <div key={k} className={portal.figure}>
            <span className={portal.figureLabel}>{t(`partner.reports.figureNames.${k}` as MessageKey)}</span>
            <span className={portal.figureValue}>{k.endsWith("Usd") ? `$${formatNumber(figures[k] ?? 0)}` : formatNumber(figures[k] ?? 0)}</span>
          </div>
        ))}
      </div>
      {assistance && assistance.rows.length > 0 && (
        <div>
          <h3 className={portal.subheading}>{t("partner.reports.assistanceChart")}</h3>
          <BarList
            emptyLabel={t("portal.table.empty")}
            rows={assistance.rows.map((r) => ({ key: String(r[0]), label: String(r[0]), value: Number(r[2]) + Number(r[5]), valueLabel: formatNumber(Number(r[2]) + Number(r[5])) }))}
          />
        </div>
      )}
      {result.tables.length === 0 ? (
        <EmptyState icon="fileCheck" title={t("partner.reports.noSections")} />
      ) : (
        result.tables.map((tb) => (
          <div key={tb.key}>
            <h3 className={portal.subheading}>{t(`partner.reports.sectionNames.${tb.section}` as MessageKey)}</h3>
            {tb.rows.length === 0 ? (
              <p className={portal.muted}>{t("portal.table.empty")}</p>
            ) : (
              <div className={portal.tableScroll} role="region" aria-label={t(`partner.reports.sectionNames.${tb.section}` as MessageKey)} tabIndex={0}>
                <table className={`${portal.table} ${portal.tableCompact}`}>
                  <thead>
                    <tr>
                      {tb.columns.map((c, index) => (
                        <th key={c} scope="col" className={index > 0 ? portal.num : undefined}>
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tb.rows.map((row, r) => (
                      <tr key={r}>
                        {row.map((cell, c) =>
                          c === 0 ? (
                            <th key={c} scope="row">
                              {cell}
                            </th>
                          ) : (
                            <td key={c} className={portal.num}>
                              {typeof cell === "number" ? formatNumber(cell) : cell}
                            </td>
                          ),
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))
      )}
      <p className={`${portal.small} ${portal.muted}`}>{t("partner.reports.privacyNote")}</p>
    </div>
  );
}
