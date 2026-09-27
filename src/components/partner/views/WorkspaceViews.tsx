"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { InterventionStatus, Priority } from "@/lib/types";
import { closeRisk, flagRisk, getWorkspace, listWorkspaces, setInterventionStaff, submitProgressUpdate, type WorkspaceRow } from "@/lib/services/partnerWork";
import { addInternalNote } from "@/lib/services/partnerInsights";
import { partnerReportStatus } from "@/lib/services/partnerField";
import { indicatorLabel, sectorName, settlementName } from "@/lib/services/lookup";
import { useServiceAction } from "@/lib/services/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SelectField, TextAreaField } from "@/components/ui/Field";
import { PageHeader } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, useStatusOptions, PriorityBadge } from "@/components/portal/StatusBadge";
import { FieldGrid, RecordPage, RecordSection } from "@/components/portal/RecordPage";
import { CommentThread } from "@/components/portal/RecordBits";
import { ProgressList } from "@/components/portal/charts/Charts";
import { FilePicker, Gate, PlanBar, usePartnerQuery, type PickedFile } from "@/components/partner/PartnerBits";
import portal from "@/components/portal/portal.module.css";
import styles from "@/components/partner/partner.module.css";

const PointsMap = dynamic(() => import("@/components/portal/GisMap").then((m) => m.PointsMap), {
  ssr: false,
  loading: () => <p className={portal.muted}>…</p>,
});

const statuses: InterventionStatus[] = ["approved", "active", "completed", "closed"];

export function WorkspaceListView() {
  const { t, formatDate, formatNumber } = useI18n();
  const q = usePartnerQuery(listWorkspaces);
  const statusOptions = useStatusOptions("proposal", statuses);
  return (
    <>
      <PageHeader title={t("partner.workspace.title")} intro={t("partner.workspace.intro")} />
      <RecordTable<WorkspaceRow>
        rows={q.data}
        loading={q.loading}
        caption={t("partner.workspace.title")}
        searchText={(i) => `${i.ref} ${i.title}`}
        statusOptions={statusOptions}
        emptyLabel={t("partner.workspace.empty")}
        columns={[
          {
            key: "title",
            header: t("partner.workspace.intervention"),
            primary: true,
            sortValue: (i) => i.title,
            render: (i) => (
              <>
                <Link href={`/partner/interventions/${i.id}`} className={portal.recordLink}>
                  {i.title}
                </Link>
                <span className={portal.ref}>{i.ref}</span>
              </>
            ),
          },
          { key: "place", header: t("portal.filters.settlement"), render: (i) => `${settlementName(i.settlementId)} · ${sectorName(i.sector)}` },
          { key: "status", header: t("partner.proposals.status"), sortValue: (i) => i.status, render: (i) => <StatusBadge entity="proposal" status={i.status} /> },
          {
            key: "progress",
            header: t("partner.workspace.progress"),
            numeric: true,
            sortValue: (i) => i.progress.percent,
            render: (i) => (
              <span className={portal.miniProgress}>
                <span className={portal.miniTrack}>
                  <span className={portal.miniFill} style={{ width: `${i.progress.percent}%` }} />
                </span>
                {i.progress.percent}%
              </span>
            ),
          },
          { key: "reached", header: t("partner.workspace.reached"), numeric: true, sortValue: (i) => i.progress.reached, render: (i) => formatNumber(i.progress.reached) },
          {
            key: "due",
            header: t("partner.workspace.nextReport"),
            render: (i) => (i.nextDue ? <StatusBadge entity="schedule" status={i.nextDue.status} /> : "—"),
          },
          { key: "awaiting", header: t("partner.workspace.awaitingOpm"), numeric: true, sortValue: (i) => i.awaiting, render: (i) => (i.awaiting ? <Badge tone="info">{i.awaiting}</Badge> : "—") },
          { key: "end", header: t("partner.proposals.fields.endDate"), sortValue: (i) => i.endDate, render: (i) => formatDate(i.endDate) },
        ]}
      />
    </>
  );
}

export function WorkspaceDetailView({ id, initialTab }: { id: string; initialTab?: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const q = usePartnerQuery(() => getWorkspace(id), [id]);

  return (
    <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner/interventions">
      {() => {
        const w = q.data!;
        const i = w.intervention;
        const milestonesDone = i.milestones.filter((m) => m.done).length;
        const now = new Date().toISOString();
        return (
          <RecordPage
            initialTab={initialTab}
            back={{ href: "/partner/interventions", label: t("partner.workspace.back") }}
            eyebrow={`${t("partner.workspace.intervention")} · ${i.ref}`}
            title={i.title}
            badges={
              <>
                <StatusBadge entity="proposal" status={i.status} />
                {w.awaiting.length > 0 && <Badge tone="info">{t("partner.workspace.awaitingCount", { count: w.awaiting.length })}</Badge>}
              </>
            }
            meta={`${sectorName(i.sector)} · ${settlementName(i.settlementId)} · ${formatDate(i.startDate)} – ${formatDate(i.endDate)} · $${formatNumber(i.budgetUsd)}`}
            progress={w.progress.percent}
            notices={
              <>
                <Notice tone="info">{t("partner.workspace.officialNote")}</Notice>
                {i.status === "approved" && <Notice tone="info">{t("partner.workspace.approvedNotActive")}</Notice>}
              </>
            }
            timeline={{ entries: w.history }}
            tabs={[
              {
                id: "overview",
                label: t("portal.detail.overview"),
                content: (
                  <>
                    <RecordSection title={t("partner.workspace.plannedActual")}>
                      <div className={styles.plannedActual}>
                        <PlanBar label={t("partner.workspace.progressVsTime")} actual={w.progress.percent} planned={w.finance.timeElapsedPercent} valueLabel={t("partner.workspace.progressValue", { progress: w.progress.percent, time: w.finance.timeElapsedPercent })} />
                        <PlanBar label={t("partner.workspace.spendVsTime")} actual={w.finance.spentPercent} planned={w.finance.timeElapsedPercent} valueLabel={t("partner.workspace.spendValue", { spent: w.finance.spentPercent, time: w.finance.timeElapsedPercent })} />
                        <PlanBar
                          label={t("partner.workspace.milestonesDone")}
                          actual={i.milestones.length ? Math.round((milestonesDone / i.milestones.length) * 100) : 0}
                          planned={i.milestones.length ? Math.round((i.milestones.filter((m) => m.dueAt < now).length / i.milestones.length) * 100) : 0}
                          valueLabel={`${milestonesDone}/${i.milestones.length}`}
                        />
                        <div className={portal.figure}>
                          <span className={portal.figureLabel}>{t("partner.workspace.reached")}</span>
                          <span className={portal.figureValue}>{formatNumber(w.progress.reached)}</span>
                          <span className={portal.small}>{t("partner.workspace.ofTarget", { target: formatNumber(i.targetReach) })}</span>
                        </div>
                      </div>
                      <p className={`${portal.small} ${portal.muted}`}>{t("partner.workspace.planMarker")}</p>
                    </RecordSection>
                    <RecordSection title={t("partner.workspace.awaitingOpm")}>
                      {w.awaiting.length === 0 ? (
                        <p className={portal.muted}>{t("partner.workspace.nothingAwaiting")}</p>
                      ) : (
                        <ul className={portal.rowList}>
                          {w.awaiting.map((a) => (
                            <li key={`${a.kind}-${a.id}`} className={portal.rowItem}>
                              <span className={portal.rowMain}>
                                <span>{a.kind === "fieldReport" ? <Link href={`/partner/field-reports/${a.id}`}>{a.label}</Link> : a.kind === "document" ? <Link href={`/partner/documents/${a.id}`}>{a.label}</Link> : a.label}</span>
                                <span className={portal.ref}>
                                  {t(`partner.workspace.awaitingKinds.${a.kind}` as MessageKey)} · {formatDate(a.at, true)}
                                </span>
                              </span>
                              <Badge tone="info" icon="eye">
                                {t("partner.workspace.awaitingBadge")}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      )}
                    </RecordSection>
                    <RecordSection title={t("partner.proposals.sections.basics")}>
                      <FieldGrid
                        items={[
                          { label: t("partner.proposals.fields.objective"), value: i.objective, wide: true },
                          { label: t("partner.proposals.fields.targetGroup"), value: i.targetGroup },
                          { label: t("partner.proposals.fields.fundingSource"), value: i.fundingSource },
                          { label: t("partner.proposals.fields.location"), value: i.location ?? "—", wide: true },
                          { label: t("partner.proposals.fields.outputs"), value: (i.expectedOutputs ?? []).join("; ") || "—", wide: true },
                        ]}
                      />
                      <p className={portal.small}>
                        <Link href={`/partner/proposals/${i.id}?tab=changes`}>{t("partner.workspace.requestChangeLink")}</Link> — {t("partner.workspace.lockedHint")}
                      </p>
                    </RecordSection>
                  </>
                ),
              },
              {
                id: "progress",
                label: t("partner.workspace.activitiesTab"),
                content: <ProgressTab w={w} />,
              },
              {
                id: "map",
                label: t("partner.workspace.mapTab"),
                content: (
                  <RecordSection title={t("partner.workspace.mapTab")}>
                    <p className={`${portal.small} ${portal.muted}`}>{t("partner.workspace.mapNote")}</p>
                    <PointsMap points={w.servicePoints.map((sp) => ({ id: sp.id, name: sp.name, lat: sp.lat, lng: sp.lng }))} />
                    <ul className={portal.plainList}>
                      {w.servicePoints.map((sp) => (
                        <li key={sp.id}>
                          {sp.name} — {t(`portal.servicePointTypes.${sp.type}` as MessageKey)} ({sp.lat.toFixed(3)}, {sp.lng.toFixed(3)})
                        </li>
                      ))}
                    </ul>
                  </RecordSection>
                ),
              },
              {
                id: "staff",
                label: t("partner.workspace.staffTab"),
                count: w.staff.length,
                content: <StaffTab w={w} />,
              },
              {
                id: "reporting",
                label: t("partner.workspace.reportingTab"),
                content: (
                  <>
                    <RecordSection
                      title={t("partner.workspace.schedule")}
                      actions={
                        w.can.report && (
                          <ButtonLink size="sm" href={`/partner/field-reports/new?intervention=${i.id}`} icon="plus">
                            {t("partner.fieldReports.new")}
                          </ButtonLink>
                        )
                      }
                    >
                      <p className={`${portal.small} ${portal.muted}`}>{t("partner.workspace.scheduleHint")}</p>
                      <div className={portal.tableScroll} role="region" aria-label={t("partner.workspace.schedule")} tabIndex={0}>
                        <table className={`${portal.table} ${portal.tableCompact}`}>
                          <thead>
                            <tr>
                              <th scope="col">{t("partner.workspace.period")}</th>
                              <th scope="col">{t("partner.workspace.dueDate")}</th>
                              <th scope="col">{t("partner.proposals.status")}</th>
                              <th scope="col">{t("partner.workspace.reports")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {w.schedule.map((p) => (
                              <tr key={p.key}>
                                <th scope="row">{p.key}</th>
                                <td>{formatDate(p.dueAt)}</td>
                                <td>
                                  <StatusBadge entity="schedule" status={p.status} />
                                </td>
                                <td>
                                  {p.reportIds.length
                                    ? p.reportIds.map((rid) => {
                                        const r = w.fieldReports.find((x) => x.id === rid);
                                        return r ? (
                                          <Link key={rid} href={`/partner/field-reports/${rid}`} className={portal.inlineLink}>
                                            {r.ref}{" "}
                                          </Link>
                                        ) : null;
                                      })
                                    : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </RecordSection>
                    <RecordSection title={t("partner.workspace.fieldUpdates")}>
                      {w.fieldReports.length === 0 ? (
                        <p className={portal.muted}>{t("partner.fieldReports.empty")}</p>
                      ) : (
                        <ul className={portal.rowList}>
                          {w.fieldReports.map((r) => (
                            <li key={r.id} className={portal.rowItem}>
                              <span className={portal.rowMain}>
                                <Link href={`/partner/field-reports/${r.id}`} className={portal.recordLink}>
                                  {r.title}
                                </Link>
                                <span className={portal.ref}>
                                  {r.ref} · {formatDate(r.collectedAt)} · {r.channel === "offline" ? t("partner.fieldReports.fromFieldApp") : t("partner.fieldReports.fromPortal")}
                                </span>
                              </span>
                              <StatusBadge entity="partnerReport" status={partnerReportStatus(r.status)} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </RecordSection>
                  </>
                ),
              },
              {
                id: "indicators",
                label: t("partner.workspace.indicatorsTab"),
                count: w.progress.indicators.length,
                content: (
                  <RecordSection title={t("partner.workspace.indicatorsTab")}>
                    <p className={`${portal.small} ${portal.muted}`}>{t("partner.workspace.indicatorsHint")}</p>
                    <ProgressList
                      targetLabel={t("portal.dashboard.sectorTarget")}
                      rows={w.progress.indicators.map((x) => ({
                        key: x.indicatorId,
                        label: indicatorLabel(x.indicatorId),
                        sub: t("partner.workspace.indicatorSub", { actual: formatNumber(x.actual), target: formatNumber(x.target) }),
                        value: x.actual,
                        target: x.target,
                        valueLabel: `${x.percent}%`,
                      }))}
                    />
                  </RecordSection>
                ),
              },
              {
                id: "budget",
                label: t("partner.workspace.budgetTab"),
                content: (
                  <RecordSection title={t("partner.workspace.budgetTab")} actions={<Link href={`/partner/finance?intervention=${i.id}`} className={portal.inlineLink}>{t("partner.workspace.openFinance")}</Link>}>
                    <BudgetTable finance={w.finance} />
                  </RecordSection>
                ),
              },
              {
                id: "documents",
                label: t("partner.workspace.documentsTab"),
                count: w.documents.length,
                content: (
                  <RecordSection title={t("partner.workspace.documentsTab")} actions={<Link href="/partner/documents" className={portal.inlineLink}>{t("partner.documents.addNew")}</Link>}>
                    {w.documents.length === 0 ? (
                      <p className={portal.muted}>{t("partner.proposals.noAttachments")}</p>
                    ) : (
                      <ul className={portal.rowList}>
                        {w.documents.map((d) => (
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
              {
                id: "correspondence",
                label: t("partner.workspace.correspondenceTab"),
                count: i.comments.length,
                content: (
                  <>
                    <RecordSection title={t("partner.messages.correspondence")} actions={<Link href="/partner/messages?tab=correspondence" className={portal.inlineLink}>{t("partner.workspace.replyInMessages")}</Link>}>
                      <CommentThread comments={i.comments} label={t("partner.messages.correspondence")} emptyLabel={t("partner.messages.noFormal")} />
                    </RecordSection>
                    <RecordSection title={t("partner.messages.notes")}>
                      <Notice tone="warning">{t("partner.messages.notesHint")}</Notice>
                      <CommentThread comments={i.partnerNotes ?? []} label={t("partner.messages.noteLabel")} emptyLabel={t("partner.messages.noNotes")} onAdd={(text) => addInternalNote("intervention", i.id, text)} />
                    </RecordSection>
                  </>
                ),
              },
            ]}
          />
        );
      }}
    </Gate>
  );
}

export function BudgetTable({ finance }: { finance: import("@/lib/services/partnerWork").FinanceSummary }) {
  const { t, formatNumber } = useI18n();
  const money = (n: number) => `$${formatNumber(n)}`;
  return (
    <>
      <div className={portal.tableScroll} role="region" aria-label={t("partner.workspace.budgetTab")} tabIndex={0}>
        <table className={`${portal.table} ${portal.tableCompact}`}>
          <thead>
            <tr>
              <th scope="col">{t("partner.finance.line")}</th>
              <th scope="col" className={portal.num}>
                {t("partner.finance.budget")}
              </th>
              <th scope="col" className={portal.num}>
                {t("partner.finance.accepted")}
              </th>
              <th scope="col" className={portal.num}>
                {t("partner.finance.awaiting")}
              </th>
              <th scope="col" className={portal.num}>
                {t("partner.finance.variance")}
              </th>
            </tr>
          </thead>
          <tbody>
            {finance.lines.map((l) => (
              <tr key={l.line.id}>
                <th scope="row">{l.line.category}</th>
                <td className={portal.num}>{money(l.line.amountUsd)}</td>
                <td className={portal.num}>{money(l.accepted)}</td>
                <td className={portal.num}>{l.submitted ? money(l.submitted) : "—"}</td>
                <td className={portal.num}>{money(l.variance)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">{t("partner.finance.total")}</th>
              <td className={portal.num}>{money(finance.budget)}</td>
              <td className={portal.num}>{money(finance.accepted)}</td>
              <td className={portal.num}>{finance.submitted ? money(finance.submitted) : "—"}</td>
              <td className={portal.num}>{money(finance.budget - finance.accepted)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className={`${portal.small} ${portal.muted}`}>{t("partner.finance.varianceHint", { spent: finance.spentPercent, time: finance.timeElapsedPercent })}</p>
    </>
  );
}

function ProgressTab({ w }: { w: NonNullable<Awaited<ReturnType<typeof getWorkspace>>> }) {
  const { t, formatDate } = useI18n();
  const fid = useId();
  const i = w.intervention;
  const [summary, setSummary] = useState("");
  const [milestone, setMilestone] = useState("");
  const [file, setFile] = useState<PickedFile>();
  const [kind, setKind] = useState<"delay" | "risk">("delay");
  const [severity, setSeverity] = useState<Priority>("medium");
  const [description, setDescription] = useState("");
  const [mitigation, setMitigation] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const update = useServiceAction();
  const risk = useServiceAction();
  const now = new Date().toISOString();
  const live = ["approved", "active", "completed"].includes(i.status);

  return (
    <>
      <RecordSection title={t("partner.proposals.fields.activities")}>
        <ul className={portal.plainList}>
          {i.activities.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      </RecordSection>
      <RecordSection title={t("partner.proposals.fields.milestones")}>
        <ul className={portal.rowList}>
          {i.milestones.map((m) => {
            const awaiting = w.milestonesAwaiting.includes(m.id);
            return (
              <li key={m.id} className={portal.rowItem}>
                <span className={portal.rowMain}>
                  <strong>{m.title}</strong>
                  <span className={portal.ref}>{t("partner.workspace.dueOn", { date: formatDate(m.dueAt) })}</span>
                </span>
                {m.done ? (
                  <Badge tone="success">{t("partner.workspace.milestoneDone")}</Badge>
                ) : awaiting ? (
                  <Badge tone="info" icon="eye">
                    {t("partner.workspace.milestoneAwaiting")}
                  </Badge>
                ) : m.dueAt < now ? (
                  <Badge tone="error" icon="alertTriangle">
                    {t("partner.workspace.milestoneOverdue")}
                  </Badge>
                ) : (
                  <Badge tone="neutral" icon="calendar">
                    {t("partner.workspace.milestoneUpcoming")}
                  </Badge>
                )}
              </li>
            );
          })}
        </ul>
      </RecordSection>

      <RecordSection title={t("partner.workspace.progressUpdates")}>
        {(i.progressUpdates ?? []).length === 0 ? (
          <p className={portal.muted}>{t("partner.workspace.noUpdates")}</p>
        ) : (
          <ul className={portal.rowList}>
            {[...(i.progressUpdates ?? [])].reverse().map((u) => (
              <li key={u.id} className={portal.rowItem}>
                <span className={portal.rowMain}>
                  <span>{u.summary}</span>
                  <span className={portal.ref}>
                    {u.by} · {formatDate(u.at, true)}
                    {u.milestoneId && ` · ${t("partner.workspace.reportsMilestone", { milestone: i.milestones.find((m) => m.id === u.milestoneId)?.title ?? "—" })}`}
                  </span>
                  {u.reviewNote && (
                    <span className={portal.small}>
                      <strong>{t("partner.common.opmComment")}:</strong> {u.reviewNote}
                    </span>
                  )}
                </span>
                <StatusBadge entity="updateReview" status={u.status} />
              </li>
            ))}
          </ul>
        )}
        {w.can.progress && live && (
          <div className={portal.inlineForm}>
            <h3 className={portal.subheading}>{t("partner.workspace.newUpdate")}</h3>
            <TextAreaField id={`${fid}-summary`} label={t("partner.workspace.updateSummary")} requiredLabel={t("common.requiredMarker")} value={summary} error={errors.summary} onChange={(e) => setSummary(e.target.value)} />
            <SelectField id={`${fid}-ms`} label={t("partner.workspace.milestoneReached")} hint={t("partner.workspace.milestoneHint")} value={milestone} onChange={(e) => setMilestone(e.target.value)}>
              <option value="">{t("partner.workspace.noMilestone")}</option>
              {i.milestones
                .filter((m) => !m.done && !w.milestonesAwaiting.includes(m.id))
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.title}
                  </option>
                ))}
            </SelectField>
            <FilePicker id={`${fid}-file`} label={t("partner.workspace.evidence")} value={file} onChange={setFile} />
            <div>
              <Button
                icon="send"
                disabled={Boolean(update.pending)}
                onClick={async () => {
                  if (!summary.trim()) {
                    setErrors({ summary: t("portal.validation.required") });
                    return;
                  }
                  setErrors({});
                  if (await update.run("u", () => submitProgressUpdate(i.id, { summary, milestoneId: milestone || undefined, evidence: file ? { fileName: file.name, sizeKb: file.sizeKb } : undefined }), t("partner.workspace.updateSent"))) {
                    setSummary("");
                    setMilestone("");
                    setFile(undefined);
                  }
                }}
              >
                {update.pending ? t("common.loading") : t("partner.workspace.sendUpdate")}
              </Button>
            </div>
            <div aria-live="polite">{update.success && <Notice tone="success">{update.success}</Notice>}</div>
            {update.error && (
              <Notice tone="error" role="alert">
                {update.error}
              </Notice>
            )}
          </div>
        )}
      </RecordSection>

      <RecordSection title={t("partner.workspace.risks")}>
        {(i.risks ?? []).length === 0 ? (
          <p className={portal.muted}>{t("partner.workspace.noRisks")}</p>
        ) : (
          <ul className={portal.rowList}>
            {[...(i.risks ?? [])].reverse().map((r) => (
              <li key={r.id} className={portal.rowItem}>
                <span className={portal.rowMain}>
                  <strong>
                    {t(`partner.workspace.riskKinds.${r.kind}` as MessageKey)}: {r.description}
                  </strong>
                  <span className={portal.small}>
                    {t("partner.workspace.mitigation")}: {r.mitigation}
                  </span>
                  <span className={portal.ref}>
                    {r.by} · {formatDate(r.at, true)}
                  </span>
                  {r.opmNote && (
                    <span className={portal.small}>
                      <strong>{t("partner.common.opmComment")}:</strong> {r.opmNote}
                    </span>
                  )}
                </span>
                <span className={portal.buttonRow}>
                  <PriorityBadge priority={r.severity} />
                  <StatusBadge entity="risk" status={r.status} />
                  {w.can.progress && r.status !== "closed" && (
                    <Button size="sm" variant="ghost" icon="check" onClick={() => risk.run(`close-${r.id}`, () => closeRisk(i.id, r.id))}>
                      {t("partner.workspace.closeRisk")}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
        {w.can.progress && live && (
          <div className={portal.inlineForm}>
            <h3 className={portal.subheading}>{t("partner.workspace.flagRisk")}</h3>
            <div className={styles.formGrid}>
              <SelectField id={`${fid}-kind`} label={t("partner.workspace.riskKind")} value={kind} onChange={(e) => setKind(e.target.value as "delay" | "risk")}>
                <option value="delay">{t("partner.workspace.riskKinds.delay")}</option>
                <option value="risk">{t("partner.workspace.riskKinds.risk")}</option>
              </SelectField>
              <SelectField id={`${fid}-sev`} label={t("partner.workspace.severity")} value={severity} onChange={(e) => setSeverity(e.target.value as Priority)}>
                {(["high", "medium", "low"] as const).map((p) => (
                  <option key={p} value={p}>
                    {t(`portal.status.priority.${p}` as MessageKey)}
                  </option>
                ))}
              </SelectField>
            </div>
            <TextAreaField id={`${fid}-desc`} label={t("partner.workspace.riskDescription")} requiredLabel={t("common.requiredMarker")} value={description} error={errors.description} onChange={(e) => setDescription(e.target.value)} />
            <TextAreaField id={`${fid}-mit`} label={t("partner.workspace.mitigation")} requiredLabel={t("common.requiredMarker")} value={mitigation} error={errors.mitigation} onChange={(e) => setMitigation(e.target.value)} />
            <div>
              <Button
                variant="secondary"
                icon="flag"
                disabled={Boolean(risk.pending)}
                onClick={async () => {
                  const e: Record<string, string> = {};
                  if (!description.trim()) e.description = t("portal.validation.required");
                  if (!mitigation.trim()) e.mitigation = t("portal.validation.required");
                  setErrors(e);
                  if (Object.keys(e).length) return;
                  if (await risk.run("flag", () => flagRisk(i.id, { kind, severity, description, mitigation }), t("partner.workspace.riskSent"))) {
                    setDescription("");
                    setMitigation("");
                  }
                }}
              >
                {risk.pending === "flag" ? t("common.loading") : t("partner.workspace.flagRisk")}
              </Button>
            </div>
            <div aria-live="polite">{risk.success && <Notice tone="success">{risk.success}</Notice>}</div>
            {risk.error && (
              <Notice tone="error" role="alert">
                {risk.error}
              </Notice>
            )}
          </div>
        )}
      </RecordSection>
    </>
  );
}

function StaffTab({ w }: { w: NonNullable<Awaited<ReturnType<typeof getWorkspace>>> }) {
  const { t } = useI18n();
  const i = w.intervention;
  const [chosen, setChosen] = useState<string[]>(w.teamOptions.filter((u) => (u.interventionIds ?? []).includes(i.id)).map((u) => u.id));
  const action = useServiceAction();
  return (
    <RecordSection title={t("partner.workspace.staffTab")}>
      <ul className={portal.rowList}>
        {w.staff.map((u) => (
          <li key={u.id} className={portal.rowItem}>
            <span className={portal.rowMain}>
              <strong>{u.name}</strong>
              <span className={portal.ref}>
                {u.title ?? "—"} · {t(`portal.roles.${u.role}` as MessageKey)}
              </span>
            </span>
            {u.role === "partner_admin" && <Badge tone="neutral">{t("partner.workspace.allInterventions")}</Badge>}
          </li>
        ))}
      </ul>
      {w.can.team && (
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{t("partner.workspace.assignStaff")}</legend>
          <p className={`${portal.small} ${portal.muted}`}>{t("partner.workspace.assignHint")}</p>
          <div className={styles.checkGrid}>
            {w.teamOptions.map((u) => (
              <label key={u.id} className={portal.checkRow}>
                <input type="checkbox" checked={chosen.includes(u.id)} onChange={(e) => setChosen(e.target.checked ? [...chosen, u.id] : chosen.filter((x) => x !== u.id))} />
                {u.name} <span className={portal.muted}>({u.title})</span>
              </label>
            ))}
          </div>
          <div className={portal.buttonRow}>
            <Button size="sm" icon="users" disabled={Boolean(action.pending)} onClick={() => action.run("staff", () => setInterventionStaff(i.id, chosen), t("partner.workspace.staffSaved"))}>
              {action.pending ? t("common.loading") : t("partner.workspace.saveStaff")}
            </Button>
            <div aria-live="polite">{action.success && <span className={portal.small}>{action.success}</span>}</div>
          </div>
          {action.error && (
            <Notice tone="error" role="alert">
              {action.error}
            </Notice>
          )}
        </fieldset>
      )}
    </RecordSection>
  );
}
