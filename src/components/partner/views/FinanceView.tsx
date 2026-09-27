"use client";

import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { ExpenditureEntry, FinancialUpdate, Intervention } from "@/lib/types";
import { budgetLinesOf, listFinance, saveFinancialUpdate, type ExpenditureIssue, type FinanceSummary } from "@/lib/services/partnerWork";
import { uploadPartnerDocument } from "@/lib/services/partnerAccount";
import { useServiceAction } from "@/lib/services/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SelectField, TextField } from "@/components/ui/Field";
import { PageHeader, Section } from "@/components/portal/PageHeader";
import { StatusBadge } from "@/components/portal/StatusBadge";
import { FieldGrid } from "@/components/portal/RecordPage";
import { CommentThread, EmptyState, SimulatedTag } from "@/components/portal/RecordBits";
import { FilePicker, Gate, usePartnerQuery, type PickedFile } from "@/components/partner/PartnerBits";
import { usePartnerCan } from "@/components/partner/partnerHooks";
import { BudgetTable } from "./WorkspaceViews";
import portal from "@/components/portal/portal.module.css";
import styles from "@/components/partner/partner.module.css";

type EntryDraft = Omit<ExpenditureEntry, "id">;

export function FinanceView({ initialIntervention, initialUpdate }: { initialIntervention?: string; initialUpdate?: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const fid = useId();
  const q = usePartnerQuery(listFinance);
  const [selected, setSelected] = useState(initialIntervention ?? "");

  return (
    <>
      <PageHeader title={t("partner.finance.title")} intro={t("partner.finance.intro")} />
      <div className={portal.stack}>
        <Notice tone="simulated" title={t("partner.finance.ampTitle")}>
          <p>{t("partner.finance.ampBody")}</p>
        </Notice>
        <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner">
          {() => {
            if (q.data!.length === 0) return <EmptyState icon="barChart" title={t("partner.finance.empty")} body={t("partner.finance.emptyBody")} />;
            const current = q.data!.find((x) => x.intervention.id === selected) ?? q.data![0];
            return (
              <>
                <SelectField id={`${fid}-int`} label={t("partner.workspace.intervention")} value={current.intervention.id} onChange={(e) => setSelected(e.target.value)}>
                  {q.data!.map((x) => (
                    <option key={x.intervention.id} value={x.intervention.id}>
                      {x.intervention.ref} {x.intervention.title}
                    </option>
                  ))}
                </SelectField>
                <Section title={t("partner.finance.summary")} actions={<Link href={`/partner/interventions/${current.intervention.id}?tab=budget`} className={portal.inlineLink}>{t("partner.finance.openWorkspace")}</Link>}>
                  <FieldGrid
                    items={[
                      { label: t("partner.finance.approvedBudget"), value: `$${formatNumber(current.intervention.budgetUsd)}` },
                      { label: t("partner.proposals.fields.fundingSource"), value: current.intervention.fundingSource },
                      { label: t("partner.finance.period"), value: `${formatDate(current.intervention.startDate)} – ${formatDate(current.intervention.endDate)}` },
                      { label: t("partner.finance.acceptedToDate"), value: `$${formatNumber(current.finance.accepted)} (${current.finance.spentPercent}%)` },
                      { label: t("partner.finance.awaitingReview"), value: current.finance.submitted ? `$${formatNumber(current.finance.submitted)}` : "—" },
                      { label: t("partner.finance.ampStatus"), value: <><Badge tone="neutral">{t("partner.finance.ampNotConnected")}</Badge> <SimulatedTag /></> },
                    ]}
                  />
                  <BudgetTable finance={current.finance} />
                </Section>
                <Updates key={current.intervention.id} intervention={current.intervention} finance={current.finance} initialUpdate={initialUpdate} />
              </>
            );
          }}
        </Gate>
      </div>
    </>
  );
}

function Updates({ intervention: i, finance, initialUpdate }: { intervention: Intervention; finance: FinanceSummary; initialUpdate?: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const can = usePartnerCan();
  const updates = [...(i.financialUpdates ?? [])].reverse();
  const editableUpdate = updates.find((u) => u.id === initialUpdate && (u.status === "returned" || u.status === "draft"));
  const [editing, setEditing] = useState<FinancialUpdate | "new" | null>(editableUpdate ?? null);
  const [done, setDone] = useState<string>();
  void finance;

  return (
    <Section
      title={t("partner.finance.updates")}
      actions={
        can("finance.submit") &&
        editing === null && (
          <Button size="sm" icon="plus" onClick={() => setEditing("new")}>
            {t("partner.finance.newUpdate")}
          </Button>
        )
      }
    >
      {!can("finance.submit") && <p className={`${portal.small} ${portal.muted}`}>{t("partner.finance.noPermission")}</p>}
      <div aria-live="polite">{done && !editing && <Notice tone="success">{done}</Notice>}</div>
      {editing && (
        <UpdateForm
          intervention={i}
          update={editing === "new" ? undefined : editing}
          onClose={(message) => {
            setDone(message);
            setEditing(null);
          }}
        />
      )}
      {updates.length === 0 ? (
        <p className={portal.muted}>{t("partner.finance.noUpdates")}</p>
      ) : (
        <ul className={portal.rowList}>
          {updates.map((u) => {
            const total = u.entries.reduce((s, e) => s + e.amountUsd, 0);
            return (
              <li key={u.id} className={portal.rowItem} style={{ alignItems: "flex-start" }}>
                <span className={portal.rowMain}>
                  <strong>
                    {u.ref} · {u.period}
                  </strong>
                  <span className={portal.ref}>
                    ${formatNumber(total)} · {t("partner.finance.entryCount", { count: u.entries.length })}
                    {u.submittedAt && ` · ${t("partner.finance.submittedOn", { date: formatDate(u.submittedAt) })}`}
                  </span>
                  <ul className={portal.plainList}>
                    {u.entries.map((e) => (
                      <li key={e.id} className={portal.small}>
                        {formatDate(e.date)} · {budgetLinesOf(i).find((l) => l.id === e.budgetLineId)?.category ?? "—"} · {e.description} · ${formatNumber(e.amountUsd)}
                        {e.documentId && (
                          <>
                            {" "}
                            · <Link href={`/partner/documents/${e.documentId}`}>{t("partner.finance.supporting")}</Link>
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                  {u.comments.length > 0 && <CommentThread comments={u.comments} label={t("partner.common.opmComment")} emptyLabel="" />}
                </span>
                <span className={portal.buttonRow}>
                  <StatusBadge entity="finance" status={u.status} />
                  {can("finance.submit") && (u.status === "draft" || u.status === "returned") && editing === null && (
                    <Button size="sm" variant="secondary" icon="pen" onClick={() => setEditing(u)}>
                      {u.status === "returned" ? t("partner.finance.correct") : t("partner.finance.edit")}
                    </Button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function UpdateForm({ intervention: i, update, onClose }: { intervention: Intervention; update?: FinancialUpdate; onClose: (message?: string) => void }) {
  const { t } = useI18n();
  const fid = useId();
  const lines = budgetLinesOf(i);
  const month = new Date().toLocaleString("en-GB", { month: "long", year: "numeric" });
  const [period, setPeriod] = useState(update?.period ?? month);
  const [entries, setEntries] = useState<EntryDraft[]>(
    update?.entries.map(({ id: _id, ...e }) => ({ ...e, date: e.date.slice(0, 10) })) ?? [{ date: new Date().toISOString().slice(0, 10), budgetLineId: lines[0]?.id ?? "", description: "", amountUsd: 0 }],
  );
  const [file, setFile] = useState<PickedFile>();
  const [issues, setIssues] = useState<ExpenditureIssue[]>([]);
  const action = useServiceAction();

  useEffect(() => {
    setIssues([]);
  }, [period]);

  function check(): ExpenditureIssue[] {
    const found: ExpenditureIssue[] = [];
    if (!period.trim()) found.push("period");
    if (entries.length === 0) found.push("entries");
    for (const e of entries) {
      if (!e.date) found.push("entryDate");
      if (!(e.amountUsd > 0)) found.push("entryAmount");
      if (!lines.some((l) => l.id === e.budgetLineId)) found.push("entryLine");
      if (!e.description.trim()) found.push("entryDescription");
    }
    return [...new Set(found)];
  }

  async function save(submit: boolean) {
    const found = check();
    setIssues(found);
    if (found.length) return;
    const ok = await action.run(
      submit ? "submit" : "save",
      async () => {
        let documentId: string | undefined;
        if (file) documentId = await uploadPartnerDocument({ title: `Expenditure support — ${i.ref} ${period}`, interventionId: i.id, fileName: file.name, sizeKb: file.sizeKb, note: t("partner.finance.supportNote") });
        await saveFinancialUpdate(i.id, { id: update?.id, period, entries: entries.map((e) => ({ ...e, documentId: e.documentId ?? documentId })) }, submit);
      },
      submit ? t("partner.finance.submitted") : t("partner.finance.saved"),
    );
    if (ok) onClose(submit ? t("partner.finance.submitted") : t("partner.finance.saved"));
  }

  return (
    <div className={portal.stack}>
      <h3 className={portal.subheading}>{update ? `${update.ref} · ${update.period}` : t("partner.finance.newUpdate")}</h3>
      {update?.status === "returned" && <Notice tone="warning">{t("partner.finance.returnedHint")}</Notice>}
      {issues.length > 0 && (
        <Notice tone="error" role="alert" title={t("common.errorSummary")}>
          <ul className={portal.plainList}>
            {issues.map((x) => (
              <li key={x}>{t(`partner.finance.issues.${x}` as MessageKey)}</li>
            ))}
          </ul>
        </Notice>
      )}
      <TextField id={`${fid}-period`} label={t("partner.finance.reportingPeriod")} requiredLabel={t("common.requiredMarker")} value={period} onChange={(e) => setPeriod(e.target.value)} />
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{t("partner.finance.entries")}</legend>
        {entries.map((e, index) => (
          <div key={index} className={styles.listRowWide}>
            <TextField id={`${fid}-d-${index}`} type="date" label={t("partner.finance.date")} value={e.date} onChange={(ev) => setEntries(entries.map((x, k) => (k === index ? { ...x, date: ev.target.value } : x)))} />
            <SelectField id={`${fid}-l-${index}`} label={t("partner.finance.line")} value={e.budgetLineId} onChange={(ev) => setEntries(entries.map((x, k) => (k === index ? { ...x, budgetLineId: ev.target.value } : x)))}>
              {lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.category}
                </option>
              ))}
            </SelectField>
            <TextField id={`${fid}-desc-${index}`} label={t("partner.finance.description")} value={e.description} onChange={(ev) => setEntries(entries.map((x, k) => (k === index ? { ...x, description: ev.target.value } : x)))} />
            <TextField id={`${fid}-amt-${index}`} type="number" min={0} step="0.01" label={t("partner.finance.amount")} value={e.amountUsd || ""} onChange={(ev) => setEntries(entries.map((x, k) => (k === index ? { ...x, amountUsd: Number(ev.target.value) } : x)))} />
            <Button variant="ghost" size="sm" icon="trash" aria-label={`${t("partner.common.remove")}: ${e.description || index + 1}`} onClick={() => setEntries(entries.filter((_, k) => k !== index))}>
              {t("partner.common.remove")}
            </Button>
          </div>
        ))}
        <div className={portal.buttonRow}>
          <Button size="sm" variant="secondary" icon="plus" onClick={() => setEntries([...entries, { date: new Date().toISOString().slice(0, 10), budgetLineId: lines[0]?.id ?? "", description: "", amountUsd: 0 }])}>
            {t("partner.finance.addEntry")}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon="pen"
            onClick={() =>
              setEntries(
                lines.slice(0, 3).map((l, k) => ({
                  date: new Date(Math.max(Date.now() - k * 86400000, new Date(i.startDate).getTime())).toISOString().slice(0, 10),
                  budgetLineId: l.id,
                  description: ["Community health worker stipends", "Dignity kit procurement", "Vehicle hire for outreach"][k] ?? l.category,
                  amountUsd: [3200, 4800, 900][k] ?? 500,
                })),
              )
            }
          >
            {t("partner.finance.demoFill")}
          </Button>
        </div>
      </fieldset>
      <FilePicker id={`${fid}-file`} label={t("partner.finance.supportingDocument")} value={file} onChange={setFile} />
      <div className={portal.buttonRow}>
        <Button icon="send" disabled={Boolean(action.pending)} aria-busy={action.pending === "submit" || undefined} onClick={() => save(true)}>
          {action.pending === "submit" ? t("common.loading") : t("partner.finance.submit")}
        </Button>
        <Button variant="secondary" icon="check" disabled={Boolean(action.pending)} onClick={() => save(false)}>
          {action.pending === "save" ? t("common.loading") : t("partner.fieldReports.saveDraft")}
        </Button>
        <Button variant="ghost" onClick={() => onClose()}>
          {t("common.cancel")}
        </Button>
      </div>
      {action.error && (
        <Notice tone="error" role="alert">
          {action.error}
        </Notice>
      )}
    </div>
  );
}
