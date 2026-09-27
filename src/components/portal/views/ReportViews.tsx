"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { DataExchange, ExchangeTarget, ReportFilters, ReportLevel, ReportSectionKey, SavedReport, Sector } from "@/lib/types";
import {
  allSections,
  generateReport,
  getReport,
  listReports,
  prepareExchange,
  recordExport,
  reopenReport,
  reportLevels,
  saveReport,
  submitExchange,
  type ReportResult,
} from "@/lib/services/reports";
import { getFilterOptions, recordHref } from "@/lib/services/lookup";
import { getState } from "@/lib/demo/store";
import { periodRange, type PeriodKey } from "@/lib/services/filters";
import { useCan, useServiceAction, useServiceQuery } from "@/lib/services/hooks";
import { exportCsv, exportPdfViaPrint, exportXlsx, type ExportSheet } from "@/lib/export";
import { PageHeader, LoadingState, Section } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, useStatusOptions } from "@/components/portal/StatusBadge";
import { ActionBar, type RecordAction } from "@/components/portal/RecordPage";
import { AuditTimeline } from "@/components/portal/AuditTimeline";
import { PermissionDenied, RecordNotFound, SimulatedTag } from "@/components/portal/RecordBits";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { Badge } from "@/components/ui/Badge";
import { SelectField, TextField } from "@/components/ui/Field";
import styles from "@/components/portal/portal.module.css";

export function ReportsListView() {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const { data, loading } = useServiceQuery(listReports);
  const statusOptions = useStatusOptions("report", ["draft", "generated", "submitted"]);
  const exchanges = getState().exchanges;
  const exchangeBadge = (r: SavedReport, target: ExchangeTarget) => {
    const e = exchanges.find((x) => x.reportId === r.id && x.target === target);
    return <StatusBadge entity="exchange" status={e?.status ?? "not_prepared"} />;
  };

  return (
    <>
      <PageHeader
        title={t("portal.reports.title")}
        intro={t("portal.reports.intro")}
        actions={can("report.generate") ? <ButtonLink href="/portal/reports/new" icon="plus">{t("portal.reports.new")}</ButtonLink> : undefined}
      />
      <RecordTable<SavedReport>
        rows={data}
        loading={loading}
        caption={t("portal.reports.title")}
        searchText={(r) => `${r.title} ${r.ref} ${r.period}`}
        statusOptions={statusOptions}
        filters={[{ key: "level", label: t("portal.reports.level"), options: reportLevels.map((l) => ({ value: l, label: t(`portal.reports.levels.${l}` as MessageKey) })), test: (r, v) => r.level === v }]}
        columns={[
          {
            key: "title",
            header: t("portal.reports.report"),
            primary: true,
            sortValue: (r) => r.title,
            render: (r) => (
              <>
                <Link href={`/portal/reports/${r.id}`} className={styles.recordLink}>
                  {r.title}
                </Link>
                <span className={styles.ref}>{r.ref}</span>
              </>
            ),
          },
          { key: "level", header: t("portal.reports.level"), render: (r) => t(`portal.reports.levels.${r.level}` as MessageKey) },
          { key: "period", header: t("portal.reports.period"), render: (r) => r.period },
          { key: "generated", header: t("portal.reports.generated"), sortValue: (r) => r.generatedAt ?? "", render: (r) => (r.generatedAt ? formatDate(r.generatedAt) : "—") },
          { key: "amp", header: "AMP", render: (r) => (r.level === "national" ? exchangeBadge(r, "amp") : <span className={styles.muted}>—</span>) },
          { key: "nimes", header: "NIMES", render: (r) => (r.level === "national" ? exchangeBadge(r, "nimes") : <span className={styles.muted}>—</span>) },
          { key: "status", header: t("portal.table.status"), render: (r) => <StatusBadge entity="report" status={r.status} /> },
        ]}
      />
    </>
  );
}

type PeriodChoice = PeriodKey | "custom";

function toDateInput(iso?: string) {
  return iso ? iso.slice(0, 10) : "";
}

function Builder({ report, onSaved }: { report?: SavedReport; onSaved: (id: string) => void }) {
  const { t } = useI18n();
  const id = useId();
  const options = getFilterOptions();
  const interventions = getState().interventions.filter((i) => ["approved", "active", "completed", "closed"].includes(i.status));
  const [title, setTitle] = useState(report?.title ?? "");
  const [level, setLevel] = useState<ReportLevel>(report?.level ?? "national");
  const [period, setPeriod] = useState<PeriodChoice>(report ? "custom" : "quarter");
  const [from, setFrom] = useState(toDateInput(report?.filters.from));
  const [to, setTo] = useState(toDateInput(report?.filters.to));
  const [filters, setFilters] = useState<ReportFilters>(report?.filters ?? {});
  const [sections, setSections] = useState<ReportSectionKey[]>(report?.sections ?? allSections);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const save = useServiceAction();

  const requiredFilter: Partial<Record<ReportLevel, keyof ReportFilters>> = { district: "district", settlement: "settlementId", sector: "sector", partner: "partnerId", intervention: "interventionId" };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!title.trim()) next.title = t("portal.validation.required");
    const req = requiredFilter[level];
    if (req && !filters[req]) next.scope = t("portal.reports.scopeRequired", { level: t(`portal.reports.levels.${level}` as MessageKey) });
    if (sections.length === 0) next.sections = t("portal.validation.chooseOne");
    if (period === "custom" && (!from || !to || from > to)) next.period = t("portal.reports.periodInvalid");
    setErrors(next);
    if (Object.keys(next).length) return;
    const range = period === "custom" ? { from: new Date(from), to: new Date(`${to}T23:59:59`) } : periodRange(period);
    const periodLabel = period === "custom" ? `${from} – ${to}` : t(`portal.filters.periods.${period}` as MessageKey);
    let savedId = "";
    const ok = await save.run(
      "save",
      async () => {
        savedId = await saveReport({
          id: report?.id,
          title,
          level,
          period: periodLabel,
          filters: { ...filters, from: range.from?.toISOString(), to: range.to?.toISOString() },
          sections,
        });
      },
      t("portal.reports.saved"),
    );
    if (ok) onSaved(savedId);
  }

  const scopeField = () => {
    switch (level) {
      case "district":
        return (
          <SelectField id={`${id}-d`} label={t("portal.filters.district")} error={errors.scope} value={filters.district ?? ""} onChange={(e) => setFilters({ ...filters, district: e.target.value || undefined })}>
            <option value="">{t("portal.common.choose")}</option>
            {options.districts.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </SelectField>
        );
      case "settlement":
        return (
          <SelectField id={`${id}-s`} label={t("portal.filters.settlement")} error={errors.scope} value={filters.settlementId ?? ""} onChange={(e) => setFilters({ ...filters, settlementId: e.target.value || undefined })}>
            <option value="">{t("portal.common.choose")}</option>
            {options.settlements.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        );
      case "sector":
        return (
          <SelectField id={`${id}-sec`} label={t("portal.filters.sector")} error={errors.scope} value={filters.sector ?? ""} onChange={(e) => setFilters({ ...filters, sector: (e.target.value || undefined) as Sector | undefined })}>
            <option value="">{t("portal.common.choose")}</option>
            {options.sectors.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </SelectField>
        );
      case "partner":
        return (
          <SelectField id={`${id}-p`} label={t("portal.filters.partner")} error={errors.scope} value={filters.partnerId ?? ""} onChange={(e) => setFilters({ ...filters, partnerId: e.target.value || undefined })}>
            <option value="">{t("portal.common.choose")}</option>
            {options.partners.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
        );
      case "intervention":
        return (
          <SelectField id={`${id}-i`} label={t("portal.interventions.intervention")} error={errors.scope} value={filters.interventionId ?? ""} onChange={(e) => setFilters({ ...filters, interventionId: e.target.value || undefined })}>
            <option value="">{t("portal.common.choose")}</option>
            {interventions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.ref} {i.title}
              </option>
            ))}
          </SelectField>
        );
      default:
        return null;
    }
  };

  return (
    <form className={styles.builder} onSubmit={submit} noValidate>
      <TextField id={`${id}-title`} label={t("portal.reports.titleField")} value={title} error={errors.title} onChange={(e) => setTitle(e.target.value)} />
      <SelectField
        id={`${id}-level`}
        label={t("portal.reports.level")}
        value={level}
        onChange={(e) => {
          setLevel(e.target.value as ReportLevel);
          setFilters({});
        }}
      >
        {reportLevels.map((l) => (
          <option key={l} value={l}>
            {t(`portal.reports.levels.${l}` as MessageKey)}
          </option>
        ))}
      </SelectField>
      {scopeField()}
      <SelectField id={`${id}-period`} label={t("portal.reports.period")} error={errors.period} value={period} onChange={(e) => setPeriod(e.target.value as PeriodChoice)}>
        {(["quarter", "30d", "90d", "year", "all"] as PeriodKey[]).map((p) => (
          <option key={p} value={p}>
            {t(`portal.filters.periods.${p}` as MessageKey)}
          </option>
        ))}
        <option value="custom">{t("portal.reports.custom")}</option>
      </SelectField>
      {period === "custom" && (
        <div className={styles.inlineGrid}>
          <TextField id={`${id}-from`} type="date" label={t("portal.reports.from")} value={from} onChange={(e) => setFrom(e.target.value)} />
          <TextField id={`${id}-to`} type="date" label={t("portal.reports.to")} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      )}
      <fieldset className={styles.checkGroup} aria-describedby={errors.sections ? `${id}-sec-err` : undefined}>
        <legend className={styles.subheading}>{t("portal.reports.sections")}</legend>
        {errors.sections && (
          <p id={`${id}-sec-err`} className={styles.fieldError}>
            {errors.sections}
          </p>
        )}
        {allSections.map((s) => (
          <label key={s} className={styles.checkRow}>
            <input type="checkbox" checked={sections.includes(s)} onChange={(e) => setSections(e.target.checked ? [...sections, s] : sections.filter((x) => x !== s))} />
            <span>{t(`portal.reports.sectionNames.${s}` as MessageKey)}</span>
          </label>
        ))}
      </fieldset>
      <div className={styles.buttonRow}>
        <Button type="submit" icon="check" disabled={Boolean(save.pending)}>
          {save.pending ? t("common.loading") : t("portal.reports.save")}
        </Button>
      </div>
      <div aria-live="polite">{save.success && <Notice tone="success">{save.success}</Notice>}</div>
      {save.error && (
        <Notice tone="error" role="alert">
          {save.error}
        </Notice>
      )}
    </form>
  );
}

/** Coded values (statuses, service types) are shown translated in the preview; exports keep the codes. */
const codedColumns: Record<string, Record<number, string>> = {
  interventionProgress: { 5: "portal.status.intervention" },
  partnerActivity: { 2: "portal.status.partner" },
  assistanceReviews: { 0: "portal.status.review" },
  casesByType: { 0: "portal.cases.types" },
};

function tableTitle(t: (k: MessageKey) => string, key: string) {
  return t(`portal.reports.tables.${key}` as MessageKey);
}

function Preview({ report, result }: { report: SavedReport; result: ReportResult }) {
  const { t, formatNumber, formatDate } = useI18n();
  const figures = report.snapshot ?? result.figures;
  const figureKeys = Object.keys(result.figures) as (keyof ReportResult["figures"])[];
  const [showAll, setShowAll] = useState(false);
  const contributors = showAll ? result.contributors : result.contributors.slice(0, 12);

  return (
    <div className={`${styles.stack} print-area`}>
      <div className={styles.printHeader}>
        <p className={styles.eyebrowText}>{t("portal.reports.printHeader")}</p>
        <h2 className={styles.sectionTitle}>{report.title}</h2>
        <p className={styles.muted}>
          {report.ref} · {t(`portal.reports.levels.${report.level}` as MessageKey)} · {report.period}
          {report.generatedAt && ` · ${t("portal.reports.generatedOn", { date: formatDate(report.generatedAt, true) })}`}
        </p>
        <p className={styles.small}>{t("portal.reports.classificationLine")}</p>
      </div>
      {report.snapshot && <Notice tone="info">{t("portal.reports.frozen")}</Notice>}
      <div className={styles.figureGrid}>
        {figureKeys.map((k) => (
          <div key={k} className={styles.figure}>
            <span className={styles.figureValue}>{k === "budgetUsd" ? formatNumber(figures[k] ?? 0, { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : formatNumber(figures[k] ?? 0)}</span>
            <span className={styles.figureLabel}>{t(`portal.reports.figures.${k}` as MessageKey)}</span>
          </div>
        ))}
      </div>
      {result.tables.map((table) => (
        <section key={table.key} className={styles.reportTable} aria-label={tableTitle(t, table.key)}>
          <h3 className={styles.subCardTitle}>{tableTitle(t, table.key)}</h3>
          {table.rows.length === 0 ? (
            <p className={styles.muted}>{t("portal.table.empty")}</p>
          ) : (
            <div className={styles.tableScroll} role="region" aria-label={tableTitle(t, table.key)} tabIndex={0}>
              <table className={`${styles.table} ${styles.tableCompact}`}>
                <thead>
                  <tr>
                    {table.columns.map((c, i) => (
                      <th key={c} scope="col" className={typeof table.rows[0]?.[i] === "number" ? styles.num : undefined}>
                        {t(`portal.reports.columns.${c.replace(/[^a-zA-Z]/g, "")}` as MessageKey)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, r) => (
                    <tr key={r}>
                      {row.map((cell, c) => {
                        const prefix = codedColumns[table.key]?.[c];
                        return (
                          <td key={c} className={typeof cell === "number" ? styles.num : undefined}>
                            {typeof cell === "number" ? formatNumber(cell) : prefix ? t(`${prefix}.${cell}` as MessageKey) : cell}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ))}
      {report.sections.includes("cases") && result.caseTrend.length > 0 && (
        <section className={styles.reportTable} aria-label={t("portal.reports.caseTrend")}>
          <h3 className={styles.subCardTitle}>{t("portal.reports.caseTrend")}</h3>
          <ul className={styles.trend}>
            {result.caseTrend.map((m) => (
              <li key={m.month}>
                <span className={styles.monoInline}>{m.month}</span>
                <span>{t("portal.reports.trendLine", { received: m.received, resolved: m.resolved })}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className={`${styles.reportTable} no-print`} aria-label={t("portal.reports.contributors")}>
        <h3 className={styles.subCardTitle}>{t("portal.reports.contributors")}</h3>
        <p className={`${styles.small} ${styles.muted}`}>{t("portal.reports.contributorsIntro", { count: result.contributors.length })}</p>
        <ul className={styles.chipList}>
          {contributors.map((c) => {
            const href = recordHref(c.entity, c.id);
            return (
              <li key={`${c.entity}-${c.id}`}>
                {href ? (
                  <Link href={href} className={styles.recordChip}>
                    {c.ref}
                  </Link>
                ) : (
                  c.ref
                )}
              </li>
            );
          })}
        </ul>
        {result.contributors.length > 12 && (
          <Button size="sm" variant="ghost" onClick={() => setShowAll((v) => !v)}>
            {showAll ? t("portal.reports.showFewer") : t("portal.reports.showAll", { count: result.contributors.length })}
          </Button>
        )}
      </section>
    </div>
  );
}

function ExchangePanel({ report, exchanges }: { report: SavedReport; exchanges: DataExchange[] }) {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const action = useServiceAction();
  const canSubmit = can("report.submit");
  const row = (target: ExchangeTarget) => {
    const e = exchanges.find((x) => x.target === target);
    const status = e?.status ?? "not_prepared";
    return (
      <div className={styles.subCard} key={target}>
        <div className={styles.subCardHead}>
          <h3 className={styles.subCardTitle}>{t(`portal.reports.exchange.${target}` as MessageKey)}</h3>
          <SimulatedTag />
        </div>
        <p>
          <StatusBadge entity="exchange" status={status} />
        </p>
        <p className={`${styles.small} ${styles.muted}`}>
          {e?.preparedAt && t("portal.reports.exchange.prepared", { date: formatDate(e.preparedAt, true), records: e.records })}
          {e?.submittedAt && ` · ${t("portal.reports.exchange.submitted", { date: formatDate(e.submittedAt, true) })}`}
        </p>
        {e && e.errors.length > 0 && (
          <ul className={styles.issueList}>
            {e.errors.map((err) => (
              <li key={err.field}>
                <span>
                  <strong>{err.field}</strong> — {err.message}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.buttonRow}>
          {(status === "not_prepared" || status === "prepared") && (
            <Button
              size="sm"
              variant="secondary"
              icon="clipboard"
              disabled={!canSubmit || report.status === "draft" || Boolean(action.pending)}
              onClick={() => action.run(`prep-${target}`, () => prepareExchange(report.id, target), t("portal.reports.exchange.preparedDone"))}
            >
              {status === "prepared" ? t("portal.reports.exchange.reprepare") : t("portal.reports.exchange.prepare")}
            </Button>
          )}
          {(status === "prepared" || status === "partial" || status === "failed") && (
            <Button
              size="sm"
              icon="send"
              disabled={!canSubmit || Boolean(action.pending)}
              aria-busy={action.pending === `sub-${target}` || undefined}
              onClick={() =>
                action.run(`sub-${target}`, () => submitExchange(report.id, target), (s) => t("portal.reports.exchange.result", { status: t(`portal.status.exchange.${String(s)}` as MessageKey) }))
              }
            >
              {action.pending === `sub-${target}` ? t("common.loading") : status === "prepared" ? t("portal.reports.exchange.submit") : t("portal.reports.exchange.resubmit")}
            </Button>
          )}
          <Link href={`/portal/integrations/${target}`} className={styles.inlineLink}>
            {t("portal.reports.exchange.history")}
          </Link>
        </div>
      </div>
    );
  };
  return (
    <Section title={t("portal.reports.exchange.title")} actions={<SimulatedTag />}>
      <p className={`${styles.small} ${styles.muted}`}>{report.status === "draft" ? t("portal.reports.exchange.needsGenerate") : t("portal.reports.exchange.intro")}</p>
      {!canSubmit && <Notice tone="info">{t("portal.denied.actions")}</Notice>}
      <div className={styles.subCardGrid}>{(["amp", "nimes"] as const).map(row)}</div>
      <div aria-live="polite">{action.success && <Notice tone="success">{action.success}</Notice>}</div>
      {action.error && (
        <Notice tone="error" role="alert">
          {action.error}
        </Notice>
      )}
    </Section>
  );
}

function ExportBar({ report, result }: { report: SavedReport; result: ReportResult }) {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const action = useServiceAction();
  const watermark = getState().security.exportWatermark;
  const header = [
    `${report.ref} — ${report.title}`,
    `${t(`portal.reports.levels.${report.level}` as MessageKey)} · ${report.period}`,
    t("portal.reports.classificationLine"),
    `${t("portal.reports.exportedOn")}: ${formatDate(new Date().toISOString(), true)}`,
    ...(watermark ? [t("portal.reports.watermark")] : []),
  ];
  const sheets: ExportSheet[] = [
    { name: t("portal.reports.headline"), columns: ["Figure", "Value"], rows: Object.entries(report.snapshot ?? result.figures).map(([k, v]) => [k, v]) },
    ...result.tables.map((tb) => ({ name: tableTitle(t, tb.key), columns: tb.columns, rows: tb.rows })),
  ];
  const file = report.ref.replace(/[^A-Za-z0-9-]/g, "_");

  if (!can("report.export")) return <Notice tone="info">{t("portal.reports.exportDenied")}</Notice>;
  return (
    <div className={styles.exportBar} role="group" aria-label={t("portal.reports.export")}>
      <span className={styles.toolbarLabel}>{t("portal.reports.export")}</span>
      <Button size="sm" variant="secondary" icon="printer" onClick={() => action.run("pdf", async () => { await recordExport(report.id, "PDF", result.contributors.length); exportPdfViaPrint(); }, t("portal.reports.exported", { format: "PDF" }))}>
        PDF
      </Button>
      <Button size="sm" variant="secondary" icon="download" onClick={() => action.run("xlsx", async () => { const n = exportXlsx(`${file}.xlsx`, header, sheets); await recordExport(report.id, "Excel", n); }, t("portal.reports.exported", { format: "Excel" }))}>
        Excel
      </Button>
      <Button size="sm" variant="secondary" icon="download" onClick={() => action.run("csv", async () => { const n = exportCsv(`${file}.csv`, header, sheets); await recordExport(report.id, "CSV", n); }, t("portal.reports.exported", { format: "CSV" }))}>
        CSV
      </Button>
      <span className={`${styles.small} ${styles.muted}`}>{t("portal.reports.exportNote")}</span>
      <div aria-live="polite">{action.success && <Notice tone="success">{action.success}</Notice>}</div>
      {action.error && (
        <Notice tone="error" role="alert">
          {action.error}
        </Notice>
      )}
    </div>
  );
}

export function ReportDetailView({ id }: { id: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const can = useCan();
  const isNew = id === "new";
  const { data, notFound } = useServiceQuery(() => (isNew ? Promise.resolve(null) : getReport(id)), [id]);
  const [editing, setEditing] = useState(false);

  useEffect(() => setEditing(false), [id]);

  if (isNew) {
    if (!can("report.generate")) return <PermissionDenied />;
    return (
      <>
        <PageHeader back={{ href: "/portal/reports", label: t("portal.reports.back") }} title={t("portal.reports.new")} intro={t("portal.reports.newIntro")} />
        <Section title={t("portal.reports.builder")}>
          <Builder onSaved={(newId) => router.push(`/portal/reports/${newId}`)} />
        </Section>
      </>
    );
  }
  if (notFound) return <RecordNotFound backHref="/portal/reports" />;
  if (!data) return <LoadingState label={t("common.loading")} />;
  const { report, result, exchanges } = data;

  const actions: RecordAction[] = [];
  if (report.status === "draft") {
    actions.push(
      { key: "generate", label: t("portal.reports.generate"), tone: "primary", icon: "fileCheck", noNote: true, denied: !can("report.generate"), hint: t("portal.reports.generateHint"), run: () => generateReport(report.id) },
    );
  }
  if (report.status === "generated") {
    actions.push({ key: "reopen", label: t("portal.reports.reopen"), icon: "refresh", requiresNote: true, denied: !can("report.generate"), hint: t("portal.reports.reopenHint"), run: (note) => reopenReport(report.id, note) });
  }

  return (
    <>
      <PageHeader
        back={{ href: "/portal/reports", label: t("portal.reports.back") }}
        eyebrow={`${t(`portal.reports.levels.${report.level}` as MessageKey)} · ${report.ref}`}
        title={report.title}
        meta={
          <>
            <StatusBadge entity="report" status={report.status} />
            <Badge tone="neutral">{report.period}</Badge>
          </>
        }
        actions={
          report.status === "draft" && can("report.generate") ? (
            <Button variant="secondary" icon="pen" aria-expanded={editing} onClick={() => setEditing((v) => !v)}>
              {editing ? t("portal.reports.closeEditor") : t("portal.reports.edit")}
            </Button>
          ) : undefined
        }
      />
      <div className={styles.stack}>
        {actions.length > 0 && <ActionBar actions={actions} />}
        {editing && report.status === "draft" && (
          <Section title={t("portal.reports.builder")}>
            <Builder report={report} onSaved={() => setEditing(false)} />
          </Section>
        )}
        <ExportBar report={report} result={result} />
        <Section title={t("portal.reports.preview")}>
          <Preview report={report} result={result} />
        </Section>
        {report.level === "national" && <ExchangePanel report={report} exchanges={exchanges} />}
        <Section title={t("portal.detail.timeline")}>
          <AuditTimeline entityId={report.id} limit={15} />
        </Section>
      </div>
    </>
  );
}
