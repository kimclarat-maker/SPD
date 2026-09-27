"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { Intervention, InterventionStatus, ScopeValues, Sector } from "@/lib/types";
import {
  createProposal,
  deleteDraftProposal,
  getProposal,
  getProposalOptions,
  listProposals,
  requestInterventionChange,
  saveProposal,
  scopeOf,
  submitProposal,
  type ProposalInput,
  type ProposalIssue,
  type ProposalOptions,
  type ProposalRow,
} from "@/lib/services/partnerWork";
import { uploadPartnerDocument } from "@/lib/services/partnerAccount";
import { indicatorLabel, sectorName, servicePointName, settlementName } from "@/lib/services/lookup";
import { useServiceAction } from "@/lib/services/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { PageHeader, Section } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, useStatusOptions } from "@/components/portal/StatusBadge";
import { FieldGrid, RecordPage, RecordSection, type RecordAction } from "@/components/portal/RecordPage";
import { CommentThread, type StageState } from "@/components/portal/RecordBits";
import { AuditList } from "@/components/portal/AuditTimeline";
import { EligibilityNotice, ErrorSummary, FilePicker, Gate, ListEditor, usePartnerQuery, type PickedFile } from "@/components/partner/PartnerBits";
import portal from "@/components/portal/portal.module.css";
import styles from "@/components/partner/partner.module.css";

const statuses: InterventionStatus[] = ["draft", "submitted", "coordination_review", "changes_requested", "approved", "rejected", "active", "completed", "closed"];

const dateInput = (iso?: string) => (iso ? iso.slice(0, 10) : "");
const addDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

export function ProposalsListView() {
  const { t, formatDate, formatNumber } = useI18n();
  const q = usePartnerQuery(listProposals);
  const options = usePartnerQuery(getProposalOptions);
  const statusOptions = useStatusOptions("proposal", statuses);

  return (
    <>
      <PageHeader
        title={t("partner.proposals.title")}
        intro={t("partner.proposals.intro")}
        actions={
          options.data?.canManage && (
            <ButtonLink href="/partner/proposals/new" icon="plus">
              {t("partner.proposals.new")}
            </ButtonLink>
          )
        }
      />
      <div className={portal.stack}>
        {options.data && <EligibilityNotice eligibility={options.data.eligibility} />}
        <RecordTable<ProposalRow>
          rows={q.data}
          loading={q.loading}
          caption={t("partner.proposals.title")}
          searchText={(i) => `${i.ref} ${i.title} ${i.fundingSource}`}
          statusOptions={statusOptions}
          emptyLabel={t("partner.proposals.empty")}
          columns={[
            {
              key: "title",
              header: t("partner.proposals.proposal"),
              primary: true,
              sortValue: (i) => i.title,
              render: (i) => (
                <>
                  <Link href={`/partner/proposals/${i.id}`} className={portal.recordLink}>
                    {i.title || t("partner.proposals.untitled")}
                  </Link>
                  <span className={portal.ref}>{i.ref}</span>
                </>
              ),
            },
            { key: "sector", header: t("portal.filters.sector"), render: (i) => sectorName(i.sector) },
            { key: "settlement", header: t("portal.filters.settlement"), render: (i) => settlementName(i.settlementId) },
            { key: "dates", header: t("partner.proposals.dates"), sortValue: (i) => i.startDate, render: (i) => (i.startDate && i.endDate ? `${formatDate(i.startDate)} – ${formatDate(i.endDate)}` : "—") },
            { key: "budget", header: t("partner.proposals.budget"), numeric: true, sortValue: (i) => i.budgetUsd, render: (i) => (i.budgetUsd ? `$${formatNumber(i.budgetUsd)}` : "—") },
            {
              key: "status",
              header: t("partner.proposals.status"),
              sortValue: (i) => i.status,
              render: (i) => (
                <>
                  <StatusBadge entity="proposal" status={i.status} />
                  {i.pendingChangeRequest && (
                    <span className={portal.ref}>
                      <Badge tone="info">{t("partner.proposals.changeRequestOpen")}</Badge>
                    </span>
                  )}
                </>
              ),
            },
            {
              key: "overlaps",
              header: t("partner.proposals.overlaps"),
              numeric: true,
              sortValue: (i) => i.overlapCount,
              render: (i) =>
                i.overlapCount ? (
                  <Badge tone="warning" icon="alertTriangle">
                    {i.overlapCount}
                  </Badge>
                ) : (
                  "—"
                ),
            },
            {
              key: "ready",
              header: t("partner.proposals.readiness"),
              render: (i) =>
                i.status === "draft" || i.status === "changes_requested" ? (
                  i.issues.length ? (
                    <span className={portal.small}>{t("partner.proposals.itemsMissing", { count: i.issues.length })}</span>
                  ) : (
                    <Badge tone="success">{t("partner.proposals.readyToSubmit")}</Badge>
                  )
                ) : (
                  "—"
                ),
            },
            { key: "updated", header: t("partner.common.updated"), sortValue: (i) => i.updatedAt, render: (i) => formatDate(i.updatedAt) },
          ]}
        />
      </div>
    </>
  );
}

function emptyInput(options: ProposalOptions): ProposalInput {
  return {
    title: "",
    objective: "",
    sector: options.sectors[0],
    targetGroup: "",
    targetReach: 0,
    settlementId: options.settlementIds[0] ?? "",
    location: "",
    servicePointIds: [],
    activities: [""],
    startDate: "",
    endDate: "",
    milestones: [{ title: "", dueAt: "" }],
    budgetUsd: 0,
    budgetLines: [{ category: "", amountUsd: 0 }],
    fundingSource: "",
    expectedOutputs: [""],
    indicatorTargets: [{ indicatorId: "", target: 0 }],
    overlapResponse: "",
  };
}

function inputFrom(i: Intervention): ProposalInput {
  return {
    title: i.title,
    objective: i.objective,
    sector: i.sector,
    targetGroup: i.targetGroup,
    targetReach: i.targetReach,
    settlementId: i.settlementId,
    location: i.location ?? "",
    servicePointIds: [...i.servicePointIds],
    activities: i.activities.length ? [...i.activities] : [""],
    startDate: dateInput(i.startDate),
    endDate: dateInput(i.endDate),
    milestones: i.milestones.length ? i.milestones.map((m) => ({ id: m.id, title: m.title, dueAt: dateInput(m.dueAt) })) : [{ title: "", dueAt: "" }],
    budgetUsd: i.budgetUsd,
    budgetLines: i.budgetLines?.length ? i.budgetLines.map((l) => ({ ...l })) : [{ category: "", amountUsd: 0 }],
    fundingSource: i.fundingSource,
    expectedOutputs: i.expectedOutputs?.length ? [...i.expectedOutputs] : [""],
    indicatorTargets: i.indicatorTargets.length ? i.indicatorTargets.map((x) => ({ ...x })) : [{ indicatorId: "", target: 0 }],
    overlapResponse: i.overlapResponse ?? "",
  };
}

/** Fictional example that meets every rule, for the demonstration. */
function exampleInput(options: ProposalOptions): ProposalInput {
  const settlement = options.settlementIds.includes("nakivale") ? "nakivale" : options.settlementIds[0];
  const points = options.servicePoints.filter((sp) => sp.settlementId === settlement);
  const chosen = ["sp-nkv-rub", "sp-nkv-hc"].filter((id) => points.some((p) => p.id === id));
  const sector = options.sectors.includes("health") ? "health" : options.sectors[0];
  const indicators = options.indicators.filter((i) => i.sector === sector).slice(0, 2);
  return {
    title: "Community maternal health outreach — Rubondo zone",
    objective: "Increase antenatal care attendance and safe referrals for pregnant and lactating women in the Rubondo zone of Nakivale.",
    sector,
    targetGroup: "Pregnant and lactating women",
    targetReach: 2400,
    settlementId: settlement,
    location: "Rubondo zone villages 3 to 7, with referrals to Base Camp Health Centre III",
    servicePointIds: chosen.length ? chosen : points.slice(0, 2).map((p) => p.id),
    activities: ["Twice-weekly outreach sessions with community health workers", "Antenatal referral and follow-up", "Dignity kit distribution at outreach points"],
    // Starts today so the demonstration can report on it as soon as OPM approves.
    startDate: addDays(0),
    endDate: addDays(180),
    milestones: [
      { title: "Community health workers trained", dueAt: addDays(30) },
      { title: "First outreach round completed", dueAt: addDays(90) },
      { title: "Final review with the health centre", dueAt: addDays(170) },
    ],
    budgetUsd: 62000,
    budgetLines: [
      { category: "Staff and community health workers", amountUsd: 24000 },
      { category: "Supplies and dignity kits", amountUsd: 22000 },
      { category: "Transport", amountUsd: 9000 },
      { category: "Monitoring and reporting", amountUsd: 7000 },
    ],
    fundingSource: "Health response grant (fictional)",
    expectedOutputs: ["1,200 antenatal referrals completed", "900 dignity kits distributed", "24 community health workers trained"],
    indicatorTargets: indicators.map((ind, index) => ({ indicatorId: ind.id, target: index === 0 ? 180 : 900 })),
    overlapResponse: "",
  };
}

const issueTarget: Record<ProposalIssue, string> = {
  title: "pp-title",
  objective: "pp-objective",
  sector: "pp-sector",
  targetGroup: "pp-target-group",
  targetReach: "pp-reach",
  settlement: "pp-settlement",
  location: "pp-location",
  activities: "pp-activities-0",
  dates: "pp-start",
  milestones: "pp-ms-0-title",
  budget: "pp-budget",
  budgetLines: "pp-line-0-cat",
  fundingSource: "pp-funding",
  outputs: "pp-outputs-0",
  indicators: "pp-ind-0",
  servicePoints: "pp-points",
  attachments: "pp-attach",
  permission: "pp-settlement",
};

/** New proposal: the guided form, saved as a private draft first. */
export function ProposalFormView() {
  const { t } = useI18n();
  const options = usePartnerQuery(getProposalOptions);
  return (
    <>
      <PageHeader back={{ href: "/partner/proposals", label: t("partner.proposals.back") }} title={t("partner.proposals.new")} intro={t("partner.proposals.newIntro")} />
      <Gate loading={!options.data} denied={options.denied} notFound={options.notFound} backHref="/partner/proposals">
        {() =>
          options.data!.canManage ? (
            <ProposalForm options={options.data!} />
          ) : (
            <Notice tone="warning" title={t("partner.denied.permissionTitle")}>
              {t("partner.proposals.noPermission")}
            </Notice>
          )
        }
      </Gate>
    </>
  );
}

function ProposalForm({ options, intervention, issues = [], documents = [] }: { options: ProposalOptions; intervention?: Intervention; issues?: ProposalIssue[]; documents?: { id: string; title: string; status: string }[] }) {
  const { t } = useI18n();
  const router = useRouter();
  const [form, setForm] = useState<ProposalInput>(() => (intervention ? inputFrom(intervention) : emptyInput(options)));
  const [showIssues, setShowIssues] = useState(false);
  const [titleError, setTitleError] = useState<string>();
  const [file, setFile] = useState<PickedFile>();
  const [attachTitle, setAttachTitle] = useState("");
  const summaryRef = useRef<HTMLDivElement>(null);
  const action = useServiceAction();
  const upload = useServiceAction();
  const set = (patch: Partial<ProposalInput>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (showIssues) summaryRef.current?.focus();
  }, [showIssues, issues.length]);

  const permittedSettlements = options.partnerStatus === "approved" ? [...new Set(options.permitted.filter((p) => p.sector === form.sector).map((p) => p.settlementId))] : options.settlementIds;
  const points = options.servicePoints.filter((sp) => sp.settlementId === form.settlementId);
  const indicatorOptions = options.indicators.filter((i) => i.sector === form.sector);
  const linesTotal = form.budgetLines.reduce((s, l) => s + (Number(l.amountUsd) || 0), 0);
  const err = (k: ProposalIssue) => (showIssues && issues.includes(k) ? t(`partner.proposals.issues.${k}` as MessageKey) : undefined);

  async function save(): Promise<string | null> {
    if (!form.title.trim()) {
      setTitleError(t("partner.proposals.issues.title"));
      document.getElementById("pp-title")?.focus();
      return null;
    }
    setTitleError(undefined);
    let id = intervention?.id ?? "";
    const ok = await action.run(
      "save",
      async () => {
        if (intervention) await saveProposal(intervention.id, form);
        else id = await createProposal(form);
      },
      t("partner.proposals.saved"),
    );
    if (!ok) return null;
    if (!intervention) router.replace(`/partner/proposals/${id}`);
    return id;
  }

  const step = (n: number, key: string) => (
    <span className={styles.fieldHead}>
      <span>
        <span className={portal.muted}>{n}.</span> {t(`partner.proposals.sections.${key}` as MessageKey)}
      </span>
    </span>
  );

  return (
    <div className={portal.stack}>
      {!intervention && (
        <Notice tone="info">
          {t("partner.proposals.draftPrivate")}{" "}
          <Button size="sm" variant="ghost" icon="pen" onClick={() => setForm(exampleInput(options))}>
            {t("partner.proposals.demoFill")}
          </Button>
        </Notice>
      )}
      {intervention && showIssues && issues.length > 0 && (
        <ErrorSummary focusRef={summaryRef} items={issues.map((i) => ({ id: issueTarget[i], message: t(`partner.proposals.issues.${i}` as MessageKey) }))} />
      )}

      <Section title={step(1, "basics")}>
        <div className={styles.formGrid}>
          <div className={styles.wide}>
            <TextField id="pp-title" label={t("partner.proposals.fields.title")} requiredLabel={t("common.requiredMarker")} value={form.title} error={titleError ?? err("title")} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className={styles.wide}>
            <TextAreaField id="pp-objective" label={t("partner.proposals.fields.objective")} requiredLabel={t("common.requiredMarker")} value={form.objective} error={err("objective")} onChange={(e) => set({ objective: e.target.value })} />
          </div>
          <SelectField id="pp-sector" label={t("portal.filters.sector")} requiredLabel={t("common.requiredMarker")} value={form.sector} error={err("sector")} onChange={(e) => set({ sector: e.target.value as Sector, indicatorTargets: [{ indicatorId: "", target: 0 }] })}>
            {options.sectors.map((s) => (
              <option key={s} value={s}>
                {sectorName(s)}
              </option>
            ))}
          </SelectField>
          <TextField id="pp-target-group" label={t("partner.proposals.fields.targetGroup")} requiredLabel={t("common.requiredMarker")} value={form.targetGroup} error={err("targetGroup")} onChange={(e) => set({ targetGroup: e.target.value })} />
          <TextField id="pp-reach" type="number" min={0} inputMode="numeric" label={t("partner.proposals.fields.targetReach")} requiredLabel={t("common.requiredMarker")} value={form.targetReach || ""} error={err("targetReach")} onChange={(e) => set({ targetReach: Number(e.target.value) })} />
        </div>
      </Section>

      <Section title={step(2, "location")}>
        <div className={styles.formGrid}>
          <SelectField
            id="pp-settlement"
            label={t("portal.filters.settlement")}
            requiredLabel={t("common.requiredMarker")}
            hint={options.partnerStatus === "approved" ? t("partner.proposals.permittedOnly") : undefined}
            value={form.settlementId}
            error={err("settlement") ?? err("permission")}
            onChange={(e) => set({ settlementId: e.target.value, servicePointIds: [] })}
          >
            <option value="">{t("portal.common.choose")}</option>
            {permittedSettlements.map((s) => (
              <option key={s} value={s}>
                {settlementName(s)}
              </option>
            ))}
          </SelectField>
          <div className={styles.wide}>
            <TextField id="pp-location" label={t("partner.proposals.fields.location")} requiredLabel={t("common.requiredMarker")} hint={t("partner.proposals.locationHint")} value={form.location} error={err("location")} onChange={(e) => set({ location: e.target.value })} />
          </div>
          <fieldset className={`${styles.fieldset} ${styles.wide}`} id="pp-points">
            <legend className={styles.legend}>
              {t("partner.proposals.fields.servicePoints")} <span className={portal.muted}>{t("common.requiredMarker")}</span>
            </legend>
            {err("servicePoints") && <p className={portal.fieldError}>{err("servicePoints")}</p>}
            {points.length === 0 ? (
              <p className={portal.muted}>{t("partner.proposals.chooseSettlement")}</p>
            ) : (
              <div className={styles.checkGrid}>
                {points.map((sp) => (
                  <label key={sp.id} className={portal.checkRow}>
                    <input
                      type="checkbox"
                      checked={form.servicePointIds.includes(sp.id)}
                      onChange={(e) => set({ servicePointIds: e.target.checked ? [...form.servicePointIds, sp.id] : form.servicePointIds.filter((x) => x !== sp.id) })}
                    />
                    {sp.name}
                  </label>
                ))}
              </div>
            )}
            <p className={`${portal.small} ${portal.muted}`}>{t("partner.proposals.servicePointsHint")}</p>
          </fieldset>
        </div>
      </Section>

      <Section title={step(3, "plan")}>
        <div className={styles.formGrid}>
          <TextField id="pp-start" type="date" label={t("partner.proposals.fields.startDate")} requiredLabel={t("common.requiredMarker")} value={form.startDate} error={err("dates")} onChange={(e) => set({ startDate: e.target.value })} />
          <TextField id="pp-end" type="date" label={t("partner.proposals.fields.endDate")} requiredLabel={t("common.requiredMarker")} value={form.endDate} onChange={(e) => set({ endDate: e.target.value })} />
          <div className={styles.wide}>
            <ListEditor id="pp-activities" label={t("partner.proposals.fields.activities")} values={form.activities} onChange={(v) => set({ activities: v })} addLabel={t("partner.proposals.addActivity")} error={err("activities")} />
          </div>
          <fieldset className={`${styles.fieldset} ${styles.wide}`}>
            <legend className={styles.legend}>
              {t("partner.proposals.fields.milestones")} <span className={portal.muted}>{t("common.requiredMarker")}</span>
            </legend>
            {err("milestones") && <p className={portal.fieldError}>{err("milestones")}</p>}
            {form.milestones.map((m, index) => (
              <div key={index} className={styles.listRowWide}>
                <TextField id={`pp-ms-${index}-title`} label={t("partner.proposals.fields.milestoneTitle")} value={m.title} onChange={(e) => set({ milestones: form.milestones.map((x, i) => (i === index ? { ...x, title: e.target.value } : x)) })} />
                <TextField id={`pp-ms-${index}-due`} type="date" label={t("partner.proposals.fields.milestoneDue")} value={m.dueAt} onChange={(e) => set({ milestones: form.milestones.map((x, i) => (i === index ? { ...x, dueAt: e.target.value } : x)) })} />
                <Button variant="ghost" size="sm" icon="trash" aria-label={`${t("partner.common.remove")}: ${m.title || index + 1}`} onClick={() => set({ milestones: form.milestones.filter((_, i) => i !== index) })}>
                  {t("partner.common.remove")}
                </Button>
              </div>
            ))}
            <div>
              <Button size="sm" variant="secondary" icon="plus" onClick={() => set({ milestones: [...form.milestones, { title: "", dueAt: "" }] })}>
                {t("partner.proposals.addMilestone")}
              </Button>
            </div>
          </fieldset>
        </div>
      </Section>

      <Section title={step(4, "budget")}>
        <div className={styles.formGrid}>
          <TextField id="pp-budget" type="number" min={0} inputMode="numeric" label={t("partner.proposals.fields.budget")} requiredLabel={t("common.requiredMarker")} value={form.budgetUsd || ""} error={err("budget")} onChange={(e) => set({ budgetUsd: Number(e.target.value) })} />
          <TextField id="pp-funding" label={t("partner.proposals.fields.fundingSource")} requiredLabel={t("common.requiredMarker")} value={form.fundingSource} error={err("fundingSource")} onChange={(e) => set({ fundingSource: e.target.value })} />
          <fieldset className={`${styles.fieldset} ${styles.wide}`}>
            <legend className={styles.legend}>
              {t("partner.proposals.fields.budgetLines")} <span className={portal.muted}>{t("common.requiredMarker")}</span>
            </legend>
            {err("budgetLines") && <p className={portal.fieldError}>{err("budgetLines")}</p>}
            {form.budgetLines.map((l, index) => (
              <div key={index} className={styles.listRowWide}>
                <TextField id={`pp-line-${index}-cat`} label={t("partner.proposals.fields.lineCategory")} value={l.category} onChange={(e) => set({ budgetLines: form.budgetLines.map((x, i) => (i === index ? { ...x, category: e.target.value } : x)) })} />
                <TextField id={`pp-line-${index}-amt`} type="number" min={0} inputMode="numeric" label={t("partner.proposals.fields.lineAmount")} value={l.amountUsd || ""} onChange={(e) => set({ budgetLines: form.budgetLines.map((x, i) => (i === index ? { ...x, amountUsd: Number(e.target.value) } : x)) })} />
                <Button variant="ghost" size="sm" icon="trash" aria-label={`${t("partner.common.remove")}: ${l.category || index + 1}`} onClick={() => set({ budgetLines: form.budgetLines.filter((_, i) => i !== index) })}>
                  {t("partner.common.remove")}
                </Button>
              </div>
            ))}
            <div className={portal.buttonRow}>
              <Button size="sm" variant="secondary" icon="plus" onClick={() => set({ budgetLines: [...form.budgetLines, { category: "", amountUsd: 0 }] })}>
                {t("partner.proposals.addLine")}
              </Button>
              <span className={portal.small} aria-live="polite">
                {t("partner.proposals.linesTotal", { total: linesTotal.toLocaleString(), budget: (form.budgetUsd || 0).toLocaleString() })}{" "}
                {linesTotal === form.budgetUsd && form.budgetUsd > 0 ? <Badge tone="success">{t("partner.proposals.balanced")}</Badge> : <Badge tone="warning">{t("partner.proposals.unbalanced")}</Badge>}
              </span>
            </div>
          </fieldset>
        </div>
      </Section>

      <Section title={step(5, "results")}>
        <div className={styles.formGrid}>
          <div className={styles.wide}>
            <ListEditor id="pp-outputs" label={t("partner.proposals.fields.outputs")} values={form.expectedOutputs} onChange={(v) => set({ expectedOutputs: v })} addLabel={t("partner.proposals.addOutput")} error={err("outputs")} />
          </div>
          <fieldset className={`${styles.fieldset} ${styles.wide}`}>
            <legend className={styles.legend}>
              {t("partner.proposals.fields.indicators")} <span className={portal.muted}>{t("common.requiredMarker")}</span>
            </legend>
            {err("indicators") && <p className={portal.fieldError}>{err("indicators")}</p>}
            {form.indicatorTargets.map((x, index) => (
              <div key={index} className={styles.listRowWide}>
                <SelectField id={`pp-ind-${index}`} label={t("partner.proposals.fields.indicator")} value={x.indicatorId} onChange={(e) => set({ indicatorTargets: form.indicatorTargets.map((y, i) => (i === index ? { ...y, indicatorId: e.target.value } : y)) })}>
                  <option value="">{t("portal.common.choose")}</option>
                  {indicatorOptions.map((ind) => (
                    <option key={ind.id} value={ind.id}>
                      {ind.code} {ind.name} ({ind.unit})
                    </option>
                  ))}
                </SelectField>
                <TextField id={`pp-ind-${index}-target`} type="number" min={0} inputMode="numeric" label={t("partner.proposals.fields.target")} value={x.target || ""} onChange={(e) => set({ indicatorTargets: form.indicatorTargets.map((y, i) => (i === index ? { ...y, target: Number(e.target.value) } : y)) })} />
                <Button variant="ghost" size="sm" icon="trash" aria-label={`${t("partner.common.remove")}: ${index + 1}`} onClick={() => set({ indicatorTargets: form.indicatorTargets.filter((_, i) => i !== index) })}>
                  {t("partner.common.remove")}
                </Button>
              </div>
            ))}
            <div>
              <Button size="sm" variant="secondary" icon="plus" onClick={() => set({ indicatorTargets: [...form.indicatorTargets, { indicatorId: "", target: 0 }] })}>
                {t("partner.proposals.addIndicator")}
              </Button>
            </div>
          </fieldset>
        </div>
      </Section>

      <Section title={step(6, "attachments")}>
        <div id="pp-attach" tabIndex={-1} className={portal.stack}>
          {err("attachments") && <p className={portal.fieldError}>{err("attachments")}</p>}
          {!intervention ? (
            <p className={portal.muted}>{t("partner.proposals.saveToAttach")}</p>
          ) : (
            <>
              {documents.length > 0 && (
                <ul className={portal.rowList}>
                  {documents.map((d) => (
                    <li key={d.id} className={portal.rowItem}>
                      <Link href={`/partner/documents/${d.id}`} className={portal.recordLink}>
                        <Icon name="paperclip" size={16} /> {d.title}
                      </Link>
                      <StatusBadge entity="document" status={d.status} />
                    </li>
                  ))}
                </ul>
              )}
              <div className={styles.formGrid}>
                <TextField id="pp-attach-title" label={t("partner.proposals.attachmentTitle")} value={attachTitle} onChange={(e) => setAttachTitle(e.target.value)} placeholder={t("partner.proposals.attachmentPlaceholder")} />
                <FilePicker id="pp-attach-file" label={t("partner.upload.file")} value={file} onChange={setFile} />
              </div>
              <div className={portal.buttonRow}>
                <Button
                  size="sm"
                  variant="secondary"
                  icon="upload"
                  disabled={!file || !attachTitle.trim() || Boolean(upload.pending)}
                  onClick={async () => {
                    if (await upload.run("up", () => uploadPartnerDocument({ title: attachTitle, interventionId: intervention.id, fileName: file!.name, sizeKb: file!.sizeKb, note: t("partner.proposals.attachmentNote") }), t("partner.upload.done"))) {
                      setFile(undefined);
                      setAttachTitle("");
                    }
                  }}
                >
                  {upload.pending ? t("common.loading") : t("partner.proposals.attach")}
                </Button>
                <div aria-live="polite">{upload.success && <span className={portal.small}>{upload.success}</span>}</div>
              </div>
              {upload.error && (
                <Notice tone="error" role="alert">
                  {upload.error}
                </Notice>
              )}
            </>
          )}
        </div>
      </Section>

      {intervention && (intervention.status === "changes_requested" || form.overlapResponse) && (
        <Section title={step(7, "coordination")}>
          <TextAreaField id="pp-overlap" label={t("partner.proposals.fields.overlapResponse")} hint={t("partner.proposals.overlapResponseHint")} value={form.overlapResponse} onChange={(e) => set({ overlapResponse: e.target.value })} />
        </Section>
      )}

      <div className={styles.formActions}>
        <Button icon="check" disabled={Boolean(action.pending)} aria-busy={action.pending === "save" || undefined} onClick={save}>
          {action.pending === "save" ? t("common.loading") : t("partner.proposals.saveDraft")}
        </Button>
        {intervention && (
          <Button variant="secondary" icon="clipboard" onClick={() => setShowIssues(true)}>
            {t("partner.proposals.checkReady", { count: issues.length })}
          </Button>
        )}
        <div aria-live="polite">{action.success && <Notice tone="success">{action.success}</Notice>}</div>
        {action.error && (
          <Notice tone="error" role="alert">
            {action.error}
          </Notice>
        )}
      </div>
    </div>
  );
}

function proposalStages(status: InterventionStatus, t: (k: MessageKey) => string): { key: string; label: string; state: StageState }[] {
  const index: Record<InterventionStatus, number> = { draft: 0, submitted: 1, coordination_review: 2, changes_requested: 3, rejected: 3, approved: 4, active: 5, completed: 6, closed: 7 };
  const keys = ["draft", "submitted", "coordination_review", "decision", "approved", "active", "completed", "closed"] as const;
  const at = index[status];
  return keys.map((key, i) => {
    let label = key === "decision" ? t("partner.proposals.stageDecision") : t(`portal.status.proposal.${key}` as MessageKey);
    let state: StageState = i < at ? "done" : i === at ? "current" : "upcoming";
    if (key === "decision" && (status === "changes_requested" || status === "rejected")) {
      label = t(`portal.status.proposal.${status}` as MessageKey);
      state = status === "rejected" ? "ended" : "current";
    }
    if (key === "decision" && at > 3) state = "done";
    return { key, label, state };
  });
}

export function ProposalDetailView({ id, initialTab }: { id: string; initialTab?: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const router = useRouter();
  const q = usePartnerQuery(() => getProposal(id), [id]);
  const options = usePartnerQuery(getProposalOptions);

  return (
    <Gate loading={!q.data || !options.data} denied={q.denied} notFound={q.notFound} backHref="/partner/proposals">
      {() => {
        const { intervention: i, issues, overlaps, eligibility, documents, history, canEdit, canManage, orgLabel } = q.data!;
        const approvedWork = ["approved", "active", "completed", "closed"].includes(i.status);
        const lastOpm = [...i.comments].reverse().find((c) => !c.author.endsWith(`, ${orgLabel}`));
        const unresolved = overlaps.filter((o) => !o.resolved);
        const actions: RecordAction[] = [];
        if (i.status === "draft") {
          actions.push({
            key: "submit",
            label: t("partner.proposals.submit"),
            tone: "primary",
            icon: "send",
            denied: !canManage,
            disabled: !eligibility.eligible || issues.length > 0,
            disabledReason: !eligibility.eligible ? t("partner.proposals.notEligible") : t("partner.proposals.itemsMissing", { count: issues.length }),
            noteLabel: t("partner.proposals.submitNote"),
            hint: t("partner.proposals.submitHint"),
            run: (note) => submitProposal(i.id, note),
            success: t("partner.proposals.submitted"),
          });
          actions.push({
            key: "delete",
            label: t("partner.proposals.deleteDraft"),
            tone: "danger",
            icon: "trash",
            noNote: true,
            denied: !canManage,
            disabled: (i.revisions ?? []).length > 0,
            run: async () => {
              await deleteDraftProposal(i.id);
              router.push("/partner/proposals");
            },
          });
        }
        if (i.status === "changes_requested") {
          actions.push({
            key: "resubmit",
            label: t("partner.proposals.resubmit"),
            tone: "primary",
            icon: "send",
            requiresNote: true,
            noteLabel: t("partner.proposals.responseLabel"),
            denied: !canManage,
            disabled: !eligibility.eligible || issues.length > 0,
            disabledReason: !eligibility.eligible ? t("partner.proposals.notEligible") : t("partner.proposals.itemsMissing", { count: issues.length }),
            hint: t("partner.proposals.resubmitHint"),
            run: (note) => submitProposal(i.id, note),
            success: t("partner.proposals.resubmitted"),
          });
        }

        return (
          <RecordPage
            initialTab={initialTab}
            back={{ href: "/partner/proposals", label: t("partner.proposals.back") }}
            eyebrow={`${t("partner.proposals.proposal")} · ${i.ref}`}
            title={i.title || t("partner.proposals.untitled")}
            badges={
              <>
                <StatusBadge entity="proposal" status={i.status} />
                {unresolved.length > 0 && !approvedWork && (
                  <Badge tone="warning" icon="alertTriangle">
                    {t("partner.proposals.overlapCount", { count: unresolved.length })}
                  </Badge>
                )}
                {(i.revisions ?? []).length > 0 && <Badge tone="neutral">{t("partner.proposals.versionN", { version: (i.revisions ?? []).length })}</Badge>}
              </>
            }
            meta={[sectorName(i.sector), settlementName(i.settlementId), i.budgetUsd ? `$${formatNumber(i.budgetUsd)}` : null, i.startDate ? `${formatDate(i.startDate)} – ${formatDate(i.endDate)}` : null].filter(Boolean).join(" · ")}
            stages={proposalStages(i.status, t)}
            notices={
              <>
                {(i.status === "draft" || i.status === "changes_requested") && <EligibilityNotice eligibility={eligibility} />}
                {i.status === "changes_requested" && lastOpm && (
                  <Notice tone="warning" title={t("partner.proposals.changesRequestedTitle")}>
                    <p>
                      <strong>{lastOpm.author}:</strong> “{lastOpm.text}”
                    </p>
                    <p>{t("partner.proposals.changesRequestedNext")}</p>
                  </Notice>
                )}
                {(i.status === "submitted" || i.status === "coordination_review") && <Notice tone="info">{t("partner.proposals.underReviewNotice")}</Notice>}
                {i.status === "rejected" && lastOpm && (
                  <Notice tone="error" title={t("partner.proposals.rejectedTitle")}>
                    “{lastOpm.text}”
                  </Notice>
                )}
                {approvedWork && (
                  <Notice tone="success" title={t("partner.proposals.approvedTitle")}>
                    <p>{t("partner.proposals.approvedBody")}</p>
                    <p>
                      <Link href={`/partner/interventions/${i.id}`}>{t("partner.proposals.openWorkspace")}</Link>
                    </p>
                  </Notice>
                )}
              </>
            }
            actions={actions}
            timeline={{ entries: history }}
            tabs={[
              {
                id: "proposal",
                label: canEdit ? t("partner.proposals.editTab") : t("partner.proposals.detailsTab"),
                content: canEdit ? (
                  <ProposalForm key={`${i.id}-${i.status}-${(i.revisions ?? []).length}`} options={options.data!} intervention={i} issues={issues} documents={documents} />
                ) : (
                  <ProposalSummary intervention={i} />
                ),
              },
              {
                id: "review",
                label: t("partner.proposals.reviewTab"),
                count: unresolved.length || undefined,
                content: (
                  <>
                    <RecordSection title={t("partner.proposals.overlapWarnings")}>
                      {i.status === "draft" && overlaps.length === 0 ? (
                        <p className={portal.muted}>{t("partner.proposals.overlapsAfterSubmit")}</p>
                      ) : overlaps.length === 0 ? (
                        <p className={portal.muted}>{t("partner.proposals.noOverlaps")}</p>
                      ) : (
                        <>
                          <p className={portal.small}>{t("partner.proposals.overlapExplain")}</p>
                          <ul className={portal.rowList}>
                            {overlaps.map((o) => (
                              <li key={o.id} className={portal.rowItem}>
                                <span className={portal.rowMain}>
                                  <strong>{o.approved || o.own ? `${o.ref} ${o.title}` : t("partner.proposals.otherProposal")}</strong>
                                  <span className={portal.ref}>
                                    {o.partnerName ?? t("partner.proposals.otherPartner")} · {formatDate(o.startDate)} – {formatDate(o.endDate)}
                                    {o.sharedServicePoints.length > 0 && ` · ${t("partner.proposals.shared", { points: o.sharedServicePoints.map(servicePointName).join(", ") })}`}
                                  </span>
                                  {o.resolved && (
                                    <span className={portal.small}>
                                      <strong>{t("partner.proposals.resolvedByOpm")}:</strong> {o.resolved.note}
                                    </span>
                                  )}
                                </span>
                                {o.resolved ? <Badge tone="success">{t("partner.proposals.overlapResolved")}</Badge> : <Badge tone="warning" icon="alertTriangle">{t("partner.proposals.overlapOpen")}</Badge>}
                              </li>
                            ))}
                          </ul>
                          {i.overlapResponse && (
                            <p className={portal.quote}>
                              <strong>{t("partner.proposals.yourResponse")}:</strong> {i.overlapResponse}
                            </p>
                          )}
                        </>
                      )}
                    </RecordSection>
                    <RecordSection title={t("partner.proposals.reviewerComments")}>
                      <CommentThread comments={i.comments} label={t("partner.proposals.reviewerComments")} emptyLabel={t("portal.comments.empty")} />
                    </RecordSection>
                    <RecordSection title={t("partner.proposals.versions")}>
                      {(i.revisions ?? []).length === 0 ? (
                        <p className={portal.muted}>{t("partner.proposals.noVersions")}</p>
                      ) : (
                        <ul className={portal.rowList}>
                          {[...(i.revisions ?? [])].reverse().map((r) => (
                            <li key={r.version} className={portal.rowItem}>
                              <span className={portal.rowMain}>
                                <strong>{t("partner.proposals.versionN", { version: r.version })}</strong>
                                <span className={portal.ref}>
                                  {r.by} · {formatDate(r.at, true)}
                                </span>
                                <span className={portal.small}>“{r.note}”</span>
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </RecordSection>
                    <RecordSection title={t("partner.proposals.decisionHistory")}>
                      <AuditList entries={history.filter((a) => a.category === "decision" || a.category === "status" || a.action.startsWith("intervention"))} emptyLabel={t("portal.detail.timelineEmpty")} />
                    </RecordSection>
                  </>
                ),
              },
              {
                id: "attachments",
                label: t("partner.proposals.attachmentsTab"),
                count: documents.length,
                content: (
                  <RecordSection title={t("partner.proposals.attachmentsTab")}>
                    {documents.length === 0 ? (
                      <p className={portal.muted}>{t("partner.proposals.noAttachments")}</p>
                    ) : (
                      <ul className={portal.rowList}>
                        {documents.map((d) => (
                          <li key={d.id} className={portal.rowItem}>
                            <span className={portal.rowMain}>
                              <Link href={`/partner/documents/${d.id}`} className={portal.recordLink}>
                                {d.title}
                              </Link>
                              <span className={portal.ref}>
                                {d.ref} · v{d.versions.length}
                              </span>
                            </span>
                            <StatusBadge entity="document" status={d.status} />
                          </li>
                        ))}
                      </ul>
                    )}
                  </RecordSection>
                ),
              },
              ...(approvedWork
                ? [
                    {
                      id: "changes",
                      label: t("partner.proposals.changeRequestsTab"),
                      count: (i.changeRequests ?? []).length,
                      content: <ChangeRequests intervention={i} canManage={canManage} options={options.data!} />,
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

function ProposalSummary({ intervention: i }: { intervention: Intervention }) {
  const { t, formatDate, formatNumber } = useI18n();
  return (
    <>
      <RecordSection title={t("partner.proposals.sections.basics")}>
        <FieldGrid
          items={[
            { label: t("partner.proposals.fields.objective"), value: i.objective, wide: true },
            { label: t("portal.filters.sector"), value: sectorName(i.sector) },
            { label: t("partner.proposals.fields.targetGroup"), value: i.targetGroup },
            { label: t("partner.proposals.fields.targetReach"), value: formatNumber(i.targetReach) },
            { label: t("portal.filters.settlement"), value: settlementName(i.settlementId) },
            { label: t("partner.proposals.fields.location"), value: i.location ?? "—", wide: true },
            { label: t("partner.proposals.fields.servicePoints"), value: i.servicePointIds.map(servicePointName).join(", ") || "—", wide: true },
            { label: t("partner.proposals.dates"), value: i.startDate ? `${formatDate(i.startDate)} – ${formatDate(i.endDate)}` : "—" },
            { label: t("partner.proposals.fields.fundingSource"), value: i.fundingSource || "—" },
            { label: t("partner.proposals.fields.budget"), value: `$${formatNumber(i.budgetUsd)}` },
          ]}
        />
      </RecordSection>
      <RecordSection title={t("partner.proposals.sections.plan")}>
        <h3 className={portal.subheading}>{t("partner.proposals.fields.activities")}</h3>
        <ul className={portal.plainList}>
          {i.activities.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <h3 className={portal.subheading}>{t("partner.proposals.fields.milestones")}</h3>
        <ul className={portal.plainList}>
          {i.milestones.map((m) => (
            <li key={m.id}>
              {m.title} — {formatDate(m.dueAt)}
            </li>
          ))}
        </ul>
      </RecordSection>
      <RecordSection title={t("partner.proposals.sections.results")}>
        <h3 className={portal.subheading}>{t("partner.proposals.fields.outputs")}</h3>
        <ul className={portal.plainList}>
          {(i.expectedOutputs ?? []).map((o) => (
            <li key={o}>{o}</li>
          ))}
        </ul>
        <h3 className={portal.subheading}>{t("partner.proposals.fields.indicators")}</h3>
        <ul className={portal.plainList}>
          {i.indicatorTargets.map((x) => (
            <li key={x.indicatorId}>
              {indicatorLabel(x.indicatorId)} — {formatNumber(x.target)}
            </li>
          ))}
        </ul>
        {(i.budgetLines ?? []).length > 0 && (
          <>
            <h3 className={portal.subheading}>{t("partner.proposals.fields.budgetLines")}</h3>
            <ul className={portal.plainList}>
              {(i.budgetLines ?? []).map((l) => (
                <li key={l.id}>
                  {l.category} — ${formatNumber(l.amountUsd)}
                </li>
              ))}
            </ul>
          </>
        )}
      </RecordSection>
    </>
  );
}

/** Amendments to approved scope, location, dates or budget go to OPM; nothing changes until approved. */
function ChangeRequests({ intervention: i, canManage, options }: { intervention: Intervention; canManage: boolean; options: ProposalOptions }) {
  const { t, formatDate, formatNumber } = useI18n();
  const fid = useId();
  const current = useMemo(() => scopeOf(i), [i]);
  const [draft, setDraft] = useState<Required<ScopeValues>>(current);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string>();
  const action = useServiceAction();
  const open = (i.changeRequests ?? []).some((c) => c.status === "submitted");
  const points = options.servicePoints.filter((sp) => sp.settlementId === draft.settlementId);
  const permitted = [...new Set(options.permitted.filter((p) => p.sector === i.sector).map((p) => p.settlementId))];
  const describe = (v: ScopeValues) =>
    [
      v.objective !== undefined && `${t("partner.proposals.fields.objective")}: ${v.objective}`,
      v.activities !== undefined && `${t("partner.proposals.fields.activities")}: ${v.activities.join("; ")}`,
      v.settlementId !== undefined && `${t("portal.filters.settlement")}: ${settlementName(v.settlementId)}`,
      v.servicePointIds !== undefined && `${t("partner.proposals.fields.servicePoints")}: ${v.servicePointIds.map(servicePointName).join(", ")}`,
      v.endDate !== undefined && `${t("partner.proposals.fields.endDate")}: ${formatDate(v.endDate)}`,
      v.budgetUsd !== undefined && `${t("partner.proposals.fields.budget")}: $${formatNumber(v.budgetUsd)}`,
    ].filter(Boolean) as string[];

  return (
    <>
      <RecordSection title={t("partner.proposals.changeRequestsTab")}>
        <Notice tone="info">{t("partner.proposals.lockedScope")}</Notice>
        {(i.changeRequests ?? []).length === 0 ? (
          <p className={portal.muted}>{t("partner.proposals.noChangeRequests")}</p>
        ) : (
          <ul className={portal.rowList}>
            {[...(i.changeRequests ?? [])].reverse().map((c) => (
              <li key={c.id} className={portal.rowItem}>
                <span className={portal.rowMain}>
                  <strong>{c.ref}</strong>
                  <span className={portal.ref}>
                    {c.by} · {formatDate(c.at, true)}
                  </span>
                  <span className={portal.small}>
                    <strong>{t("partner.proposals.proposedChange")}:</strong> {describe(c.proposed).join(" · ")}
                  </span>
                  <span className={portal.small}>
                    <strong>{t("partner.proposals.previousValue")}:</strong> {describe(c.previous).join(" · ")}
                  </span>
                  <span className={portal.small}>“{c.reason}”</span>
                  {c.decisionNote && (
                    <span className={portal.small}>
                      <strong>{t("partner.common.opmComment")}:</strong> {c.decisionNote}
                    </span>
                  )}
                </span>
                <StatusBadge entity="changeRequest" status={c.status} />
              </li>
            ))}
          </ul>
        )}
      </RecordSection>
      {canManage && i.status !== "closed" && (
        <RecordSection title={t("partner.proposals.requestChange")}>
          {open ? (
            <p className={portal.muted}>{t("partner.proposals.changeOpen")}</p>
          ) : (
            <>
              <div className={styles.formGrid}>
                <div className={styles.wide}>
                  <TextAreaField id={`${fid}-obj`} label={t("partner.proposals.fields.objective")} value={draft.objective} onChange={(e) => setDraft({ ...draft, objective: e.target.value })} />
                </div>
                <SelectField id={`${fid}-set`} label={t("portal.filters.settlement")} value={draft.settlementId} onChange={(e) => setDraft({ ...draft, settlementId: e.target.value, servicePointIds: [] })}>
                  {permitted.map((s) => (
                    <option key={s} value={s}>
                      {settlementName(s)}
                    </option>
                  ))}
                </SelectField>
                <TextField id={`${fid}-end`} type="date" label={t("partner.proposals.fields.endDate")} value={dateInput(draft.endDate)} onChange={(e) => setDraft({ ...draft, endDate: e.target.value ? new Date(e.target.value).toISOString() : draft.endDate })} />
                <TextField id={`${fid}-budget`} type="number" min={0} label={t("partner.proposals.fields.budget")} value={draft.budgetUsd || ""} onChange={(e) => setDraft({ ...draft, budgetUsd: Number(e.target.value) })} />
                <fieldset className={`${styles.fieldset} ${styles.wide}`}>
                  <legend className={styles.legend}>{t("partner.proposals.fields.servicePoints")}</legend>
                  <div className={styles.checkGrid}>
                    {points.map((sp) => (
                      <label key={sp.id} className={portal.checkRow}>
                        <input
                          type="checkbox"
                          checked={draft.servicePointIds.includes(sp.id)}
                          onChange={(e) => setDraft({ ...draft, servicePointIds: e.target.checked ? [...draft.servicePointIds, sp.id] : draft.servicePointIds.filter((x) => x !== sp.id) })}
                        />
                        {sp.name}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className={styles.wide}>
                  <TextAreaField id={`${fid}-reason`} label={t("partner.proposals.changeReason")} requiredLabel={t("common.requiredMarker")} value={reason} error={reasonError} onChange={(e) => setReason(e.target.value)} />
                </div>
              </div>
              <div className={portal.buttonRow}>
                <Button
                  icon="send"
                  disabled={Boolean(action.pending)}
                  onClick={async () => {
                    if (!reason.trim()) {
                      setReasonError(t("portal.detail.noteRequired"));
                      return;
                    }
                    setReasonError(undefined);
                    const endDate = new Date(draft.endDate).toISOString().slice(0, 10) === new Date(current.endDate).toISOString().slice(0, 10) ? current.endDate : draft.endDate;
                    if (await action.run("cr", () => requestInterventionChange(i.id, { ...draft, endDate }, reason), t("partner.proposals.changeSubmitted"))) setReason("");
                  }}
                >
                  {action.pending ? t("common.loading") : t("partner.proposals.submitChange")}
                </Button>
                <Button variant="secondary" onClick={() => setDraft(current)}>
                  {t("partner.profile.discard")}
                </Button>
              </div>
              <div aria-live="polite">{action.success && <Notice tone="success">{action.success}</Notice>}</div>
              {action.error && (
                <Notice tone="error" role="alert">
                  {action.error}
                </Notice>
              )}
            </>
          )}
        </RecordSection>
      )}
    </>
  );
}
