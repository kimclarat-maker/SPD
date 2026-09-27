"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { Attachment, FieldReport, Intervention, ServicePoint } from "@/lib/types";
import {
  checkFieldReportInput,
  createFieldReport,
  deleteDraftFieldReport,
  getPartnerFieldReport,
  getReportOptions,
  inputOf,
  listPartnerFieldReports,
  simulateFieldAppCapture,
  submitFieldReport,
  syncFieldAppRecord,
  updateFieldReport,
  type FieldReportInput,
  type FieldReportIssue,
  type PartnerFieldReportRow,
  type PartnerReportStatus,
  type ReportKind,
} from "@/lib/services/partnerField";
import { addInternalNote } from "@/lib/services/partnerInsights";
import { indicatorLabel, servicePointName } from "@/lib/services/lookup";
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
import { CommentThread, SimulatedTag, type StageState } from "@/components/portal/RecordBits";
import { ErrorSummary, FilePicker, Gate, usePartnerQuery, type PickedFile } from "@/components/partner/PartnerBits";
import portal from "@/components/portal/portal.module.css";
import styles from "@/components/partner/partner.module.css";

const statuses: PartnerReportStatus[] = ["draft", "saved_offline", "awaiting_sync", "submitted", "needs_correction", "accepted"];
const kinds: ReportKind[] = ["activity_update", "distribution", "site_visit"];

export function FieldReportsListView() {
  const { t, formatDate, formatNumber } = useI18n();
  const q = usePartnerQuery(() => listPartnerFieldReports("reports"));
  const options = usePartnerQuery(getReportOptions);
  const statusOptions = useStatusOptions("partnerReport", statuses);
  const rows = q.data?.map((r) => ({ ...r, status: r.partnerStatus }));
  const offline = (q.data ?? []).filter((r) => r.status === "saved_offline" || r.status === "awaiting_sync");

  return (
    <>
      <PageHeader
        title={t("partner.fieldReports.title")}
        intro={t("partner.fieldReports.intro")}
        actions={
          options.data?.canSubmit &&
          options.data.interventions.length > 0 && (
            <ButtonLink href="/partner/field-reports/new" icon="plus">
              {t("partner.fieldReports.new")}
            </ButtonLink>
          )
        }
      />
      <div className={portal.stack}>
        {options.data && options.data.interventions.length === 0 && <Notice tone="info">{t("partner.fieldReports.noLiveIntervention")}</Notice>}
        <Notice tone="info">{t("partner.fieldReports.acceptedOnly")}</Notice>
        {options.data?.canSubmit && options.data.interventions.length > 0 && <FieldAppPanel offline={offline} interventions={options.data.interventions} />}
        <RecordTable
          rows={rows}
          loading={q.loading}
          caption={t("partner.fieldReports.title")}
          searchText={(r) => `${r.ref} ${r.title} ${r.interventionRef} ${r.activityType ?? ""}`}
          statusOptions={statusOptions}
          emptyLabel={t("partner.fieldReports.empty")}
          filters={[
            {
              key: "kind",
              label: t("portal.fieldReports.kind"),
              options: kinds.map((k) => ({ value: k, label: t(`portal.fieldReports.kinds.${k}` as MessageKey) })),
              test: (r, v) => r.kind === v,
            },
          ]}
          columns={[
            {
              key: "title",
              header: t("partner.fieldReports.report"),
              primary: true,
              sortValue: (r) => r.title,
              render: (r) => (
                <>
                  <Link href={`/partner/field-reports/${r.id}`} className={portal.recordLink}>
                    {r.title}
                  </Link>
                  <span className={portal.ref}>
                    {r.ref} · {t(`portal.fieldReports.kinds.${r.kind}` as MessageKey)}
                  </span>
                </>
              ),
            },
            { key: "intervention", header: t("partner.workspace.intervention"), render: (r) => r.interventionRef },
            { key: "date", header: t("partner.fieldReports.activityDate"), sortValue: (r) => r.collectedAt, render: (r) => formatDate(r.collectedAt) },
            {
              key: "channel",
              header: t("partner.fieldReports.source"),
              render: (r) => (r.channel === "offline" ? <Badge tone="neutral" icon="smartphone">{t("partner.fieldReports.fromFieldApp")}</Badge> : t("partner.fieldReports.fromPortal")),
            },
            { key: "reached", header: t("portal.fieldReports.reached"), numeric: true, sortValue: (r) => r.total, render: (r) => formatNumber(r.total) },
            { key: "version", header: t("partner.documents.version"), numeric: true, render: (r) => (r.version ? `v${r.version}` : "—") },
            { key: "status", header: t("partner.proposals.status"), sortValue: (r) => r.status, render: (r) => <StatusBadge entity="partnerReport" status={r.partnerStatus} /> },
          ]}
        />
      </div>
    </>
  );
}

/** Records captured on the (SIMULATED) field application, waiting to sync. */
function FieldAppPanel({ offline, interventions }: { offline: PartnerFieldReportRow[]; interventions: Intervention[] }) {
  const { t, formatDate } = useI18n();
  const id = useId();
  const [intervention, setIntervention] = useState(interventions[0]?.id ?? "");
  const action = useServiceAction();
  return (
    <Section title={t("partner.fieldReports.fieldApp")} actions={<SimulatedTag />}>
      <p className={portal.small}>{t("partner.fieldReports.fieldAppHint")}</p>
      {offline.length > 0 ? (
        <ul className={portal.rowList}>
          {offline.map((r) => (
            <li key={r.id} className={portal.rowItem}>
              <span className={portal.rowMain}>
                <Link href={`/partner/field-reports/${r.id}`} className={portal.recordLink}>
                  {r.ref} {r.title}
                </Link>
                <span className={portal.ref}>
                  {r.submittedBy} · {formatDate(r.collectedAt, true)}
                </span>
              </span>
              <StatusBadge entity="partnerReport" status={r.partnerStatus} />
              <Button size="sm" variant="secondary" icon="refresh" disabled={Boolean(action.pending)} onClick={() => action.run(r.id, () => syncFieldAppRecord(r.id), t("partner.fieldReports.syncStep"))}>
                {action.pending === r.id ? t("common.loading") : r.status === "saved_offline" ? t("partner.fieldReports.reconnect") : t("partner.fieldReports.syncNow")}
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className={portal.muted}>{t("partner.fieldReports.noOffline")}</p>
      )}
      <div className={styles.listRow}>
        <SelectField id={`${id}-int`} label={t("partner.fieldReports.captureFor")} value={intervention} onChange={(e) => setIntervention(e.target.value)}>
          {interventions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.ref} {i.title}
            </option>
          ))}
        </SelectField>
        <Button size="sm" variant="ghost" icon="wifiOff" disabled={!intervention || Boolean(action.pending)} onClick={() => action.run("capture", () => simulateFieldAppCapture(intervention), t("partner.fieldReports.captured"))}>
          {t("partner.fieldReports.simulateCapture")}
        </Button>
      </div>
      <div aria-live="polite">{action.success && <Notice tone="success">{action.success}</Notice>}</div>
      {action.error && (
        <Notice tone="error" role="alert">
          {action.error}
        </Notice>
      )}
    </Section>
  );
}

const issueTarget: Record<FieldReportIssue, string> = {
  intervention: "fr-intervention",
  title: "fr-title",
  activityType: "fr-activity",
  collectedAt: "fr-date",
  servicePoint: "fr-point",
  gps: "fr-lat",
  reached: "fr-women",
  indicators: "fr-ind-0",
  distributed: "fr-item-0",
  outputs: "fr-outputs",
  narrative: "fr-narrative",
};

function emptyInput(interventionId: string, i?: Intervention): FieldReportInput {
  return {
    interventionId,
    kind: "activity_update",
    title: "",
    activityType: "",
    collectedAt: new Date().toISOString().slice(0, 10),
    servicePointId: i?.servicePointIds[0] ?? "",
    locationNote: "",
    reached: { women: 0, men: 0, children: 0 },
    indicatorValues: (i?.indicatorTargets ?? []).map((x) => ({ indicatorId: x.indicatorId, value: 0 })),
    distributed: [],
    outputs: "",
    challenges: "",
    narrative: "",
    attachments: [],
  };
}

function exampleInput(i: Intervention, points: ServicePoint[]): FieldReportInput {
  const sp = points.find((p) => i.servicePointIds.includes(p.id));
  return {
    interventionId: i.id,
    kind: "activity_update",
    title: "Outreach session and antenatal referrals",
    activityType: "Community outreach session",
    collectedAt: new Date().toISOString().slice(0, 10),
    servicePointId: sp?.id ?? "",
    locationNote: "Outreach tent beside the zone office",
    gps: sp ? { lat: Number((sp.lat + 0.002).toFixed(4)), lng: Number((sp.lng - 0.002).toFixed(4)), accuracyM: 8 } : undefined,
    reached: { women: 64, men: 11, children: 48 },
    indicatorValues: i.indicatorTargets.map((x, index) => ({ indicatorId: x.indicatorId, value: index === 0 ? 14 : 40 })),
    distributed: [],
    outputs: "One outreach session held; 14 women referred for antenatal care.",
    challenges: "Heavy rain delayed the start by one hour.",
    narrative: "Session run by two community health workers with the zone leader. Referral slips issued for follow-up at the health centre.",
    attachments: [{ name: "attendance-sheet.jpg", kind: "photo", sizeKb: 612 }],
  };
}

function FieldReportForm({ initial, reportId, returned, onSubmitted }: { initial: FieldReportInput; reportId?: string; returned?: boolean; onSubmitted?: (message: string) => void }) {
  const { t } = useI18n();
  const router = useRouter();
  const opts = usePartnerQuery(getReportOptions);
  const [form, setForm] = useState<FieldReportInput>(initial);
  const [issues, setIssues] = useState<FieldReportIssue[]>([]);
  const [file, setFile] = useState<PickedFile>();
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string>();
  const summaryRef = useRef<HTMLDivElement>(null);
  const action = useServiceAction();
  const set = (patch: Partial<FieldReportInput>) => setForm((f) => ({ ...f, ...patch }));

  useEffect(() => {
    if (issues.length) summaryRef.current?.focus();
  }, [issues]);

  if (!opts.data) return null;
  const intervention = opts.data.interventions.find((i) => i.id === form.interventionId);
  const points = opts.data.servicePoints.filter((sp) => intervention?.servicePointIds.includes(sp.id));
  const err = (k: FieldReportIssue) => (issues.includes(k) ? t(`partner.fieldReports.issues.${k}` as MessageKey) : undefined);

  async function go(submit: boolean) {
    if (submit) {
      const found = await checkFieldReportInput(form);
      const missingNote = Boolean(returned) && !note.trim();
      setIssues(found);
      setNoteError(missingNote ? t("partner.fieldReports.correctionRequired") : undefined);
      if (found.length || missingNote) return;
    } else if (!form.interventionId || !form.title.trim()) {
      setIssues([!form.interventionId ? "intervention" : "title"]);
      return;
    }
    let id = reportId ?? "";
    const ok = await action.run(
      submit ? "submit" : "save",
      async () => {
        if (reportId) {
          await updateFieldReport(reportId, form);
          if (submit) await submitFieldReport(reportId, note);
        } else {
          id = await createFieldReport(form, submit);
        }
      },
      submit ? (returned ? t("partner.fieldReports.resubmitted") : t("partner.fieldReports.submitted")) : t("partner.fieldReports.saved"),
    );
    // After submission the form closes (the report is locked), so the page shows the confirmation.
    if (ok && submit) onSubmitted?.(returned ? t("partner.fieldReports.resubmitted") : t("partner.fieldReports.submitted"));
    if (ok && !reportId) router.replace(`/partner/field-reports/${id}`);
  }

  return (
    <div className={portal.stack}>
      {!reportId && intervention && (
        <Notice tone="info">
          {t("partner.fieldReports.formIntro")}{" "}
          <Button size="sm" variant="ghost" icon="pen" onClick={() => setForm(exampleInput(intervention, opts.data!.servicePoints))}>
            {t("partner.fieldReports.demoFill")}
          </Button>
        </Notice>
      )}
      <ErrorSummary focusRef={summaryRef} items={issues.map((i) => ({ id: issueTarget[i], message: t(`partner.fieldReports.issues.${i}` as MessageKey) }))} />

      <Section title={t("partner.fieldReports.sections.activity")}>
        <div className={styles.formGrid}>
          <SelectField
            id="fr-intervention"
            label={t("partner.workspace.intervention")}
            requiredLabel={t("common.requiredMarker")}
            value={form.interventionId}
            error={err("intervention")}
            onChange={(e) => {
              const next = opts.data!.interventions.find((i) => i.id === e.target.value);
              set({ interventionId: e.target.value, servicePointId: next?.servicePointIds[0] ?? "", indicatorValues: (next?.indicatorTargets ?? []).map((x) => ({ indicatorId: x.indicatorId, value: 0 })) });
            }}
          >
            <option value="">{t("portal.common.choose")}</option>
            {opts.data.interventions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.ref} {i.title}
              </option>
            ))}
          </SelectField>
          <SelectField id="fr-kind" label={t("portal.fieldReports.kind")} value={form.kind} onChange={(e) => set({ kind: e.target.value as ReportKind })}>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {t(`portal.fieldReports.kinds.${k}` as MessageKey)}
              </option>
            ))}
          </SelectField>
          <div className={styles.wide}>
            <TextField id="fr-title" label={t("partner.fieldReports.fields.title")} requiredLabel={t("common.requiredMarker")} value={form.title} error={err("title")} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <TextField id="fr-activity" label={t("partner.fieldReports.fields.activityType")} requiredLabel={t("common.requiredMarker")} value={form.activityType} error={err("activityType")} onChange={(e) => set({ activityType: e.target.value })} />
          <TextField id="fr-date" type="date" label={t("partner.fieldReports.activityDate")} requiredLabel={t("common.requiredMarker")} value={form.collectedAt.slice(0, 10)} error={err("collectedAt")} onChange={(e) => set({ collectedAt: e.target.value })} />
        </div>
      </Section>

      <Section title={t("partner.fieldReports.sections.location")}>
        <div className={styles.formGrid}>
          <SelectField id="fr-point" label={t("portal.fieldReports.servicePoint")} requiredLabel={t("common.requiredMarker")} value={form.servicePointId} error={err("servicePoint")} onChange={(e) => set({ servicePointId: e.target.value })}>
            <option value="">{t("portal.common.choose")}</option>
            {points.map((sp) => (
              <option key={sp.id} value={sp.id}>
                {sp.name}
              </option>
            ))}
          </SelectField>
          <TextField id="fr-location" label={t("partner.fieldReports.fields.locationNote")} value={form.locationNote} onChange={(e) => set({ locationNote: e.target.value })} />
          <TextField
            id="fr-lat"
            type="number"
            step="0.0001"
            label={t("partner.fieldReports.fields.lat")}
            hint={t("partner.fieldReports.gpsHint")}
            value={form.gps?.lat ?? ""}
            error={err("gps")}
            onChange={(e) => set({ gps: e.target.value === "" && !form.gps?.lng ? undefined : { lat: Number(e.target.value), lng: form.gps?.lng ?? 0, accuracyM: form.gps?.accuracyM ?? 10 } })}
          />
          <TextField
            id="fr-lng"
            type="number"
            step="0.0001"
            label={t("partner.fieldReports.fields.lng")}
            value={form.gps?.lng ?? ""}
            onChange={(e) => set({ gps: e.target.value === "" && !form.gps?.lat ? undefined : { lat: form.gps?.lat ?? 0, lng: Number(e.target.value), accuracyM: form.gps?.accuracyM ?? 10 } })}
          />
          <div className={styles.wide}>
            <Button
              size="sm"
              variant="ghost"
              icon="mapPin"
              disabled={!form.servicePointId}
              onClick={() => {
                const sp = points.find((p) => p.id === form.servicePointId);
                if (sp) set({ gps: { lat: sp.lat, lng: sp.lng, accuracyM: 15 } });
              }}
            >
              {t("partner.fieldReports.useServicePoint")}
            </Button>{" "}
            {form.gps && (
              <Button size="sm" variant="ghost" icon="x" onClick={() => set({ gps: undefined })}>
                {t("partner.fieldReports.clearGps")}
              </Button>
            )}
          </div>
        </div>
      </Section>

      <Section title={t("partner.fieldReports.sections.results")}>
        <p className={`${portal.small} ${portal.muted}`}>{t("partner.fieldReports.aggregateOnly")}</p>
        <div className={styles.formGrid}>
          {(["women", "men", "children"] as const).map((k) => (
            <TextField
              key={k}
              id={`fr-${k}`}
              type="number"
              min={0}
              inputMode="numeric"
              label={t(`portal.fieldReports.${k}` as MessageKey)}
              value={form.reached[k] || ""}
              error={k === "women" ? err("reached") : undefined}
              onChange={(e) => set({ reached: { ...form.reached, [k]: Number(e.target.value) } })}
            />
          ))}
        </div>
        {form.indicatorValues.length > 0 && (
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>{t("partner.fieldReports.fields.indicators")}</legend>
            {err("indicators") && <p className={portal.fieldError}>{err("indicators")}</p>}
            <div className={styles.formGrid}>
              {form.indicatorValues.map((v, index) => (
                <TextField
                  key={v.indicatorId}
                  id={`fr-ind-${index}`}
                  type="number"
                  min={0}
                  inputMode="numeric"
                  label={indicatorLabel(v.indicatorId)}
                  value={v.value || ""}
                  onChange={(e) => set({ indicatorValues: form.indicatorValues.map((x, i) => (i === index ? { ...x, value: Number(e.target.value) } : x)) })}
                />
              ))}
            </div>
          </fieldset>
        )}
        {form.kind === "distribution" && (
          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>
              {t("portal.fieldReports.distributed")} <span className={portal.muted}>{t("common.requiredMarker")}</span>
            </legend>
            {err("distributed") && <p className={portal.fieldError}>{err("distributed")}</p>}
            {form.distributed.map((d, index) => (
              <div key={index} className={styles.listRowWide}>
                <TextField id={`fr-item-${index}`} label={t("partner.fieldReports.fields.item")} value={d.item} onChange={(e) => set({ distributed: form.distributed.map((x, i) => (i === index ? { ...x, item: e.target.value } : x)) })} />
                <TextField id={`fr-qty-${index}`} type="number" min={0} label={t("partner.fieldReports.fields.quantity")} value={d.quantity || ""} onChange={(e) => set({ distributed: form.distributed.map((x, i) => (i === index ? { ...x, quantity: Number(e.target.value) } : x)) })} />
                <TextField id={`fr-hh-${index}`} type="number" min={0} label={t("partner.fieldReports.fields.households")} value={d.households || ""} onChange={(e) => set({ distributed: form.distributed.map((x, i) => (i === index ? { ...x, households: Number(e.target.value) } : x)) })} />
                <Button variant="ghost" size="sm" icon="trash" aria-label={`${t("partner.common.remove")}: ${d.item || index + 1}`} onClick={() => set({ distributed: form.distributed.filter((_, i) => i !== index) })}>
                  {t("partner.common.remove")}
                </Button>
              </div>
            ))}
            <div>
              <Button size="sm" variant="secondary" icon="plus" onClick={() => set({ distributed: [...form.distributed, { item: "", quantity: 0, households: 0 }] })}>
                {t("partner.fieldReports.addItem")}
              </Button>
            </div>
          </fieldset>
        )}
        <div className={styles.formGrid}>
          <div className={styles.wide}>
            <TextAreaField id="fr-outputs" label={t("partner.fieldReports.fields.outputs")} requiredLabel={t("common.requiredMarker")} value={form.outputs} error={err("outputs")} onChange={(e) => set({ outputs: e.target.value })} />
          </div>
          <div className={styles.wide}>
            <TextAreaField id="fr-challenges" label={t("partner.fieldReports.fields.challenges")} value={form.challenges} onChange={(e) => set({ challenges: e.target.value })} />
          </div>
          <div className={styles.wide}>
            <TextAreaField id="fr-narrative" label={t("partner.fieldReports.fields.notes")} requiredLabel={t("common.requiredMarker")} value={form.narrative} error={err("narrative")} onChange={(e) => set({ narrative: e.target.value })} />
          </div>
        </div>
      </Section>

      <Section title={t("partner.fieldReports.sections.attachments")}>
        {form.attachments.length > 0 && (
          <ul className={portal.rowList}>
            {form.attachments.map((a, index) => (
              <li key={`${a.name}-${index}`} className={portal.rowItem}>
                <span>
                  <Icon name="paperclip" size={16} /> {a.name} · {a.sizeKb} KB
                </span>
                <Button size="sm" variant="ghost" icon="trash" aria-label={`${t("partner.common.remove")}: ${a.name}`} onClick={() => set({ attachments: form.attachments.filter((_, i) => i !== index) })}>
                  {t("partner.common.remove")}
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className={styles.listRow}>
          <FilePicker id="fr-file" label={t("partner.upload.file")} value={file} onChange={setFile} />
          <Button
            size="sm"
            variant="secondary"
            icon="plus"
            disabled={!file}
            onClick={() => {
              if (!file) return;
              const kind: Attachment["kind"] = /\.(jpe?g|png|heic|webp)$/i.test(file.name) ? "photo" : /sign|register|attendance/i.test(file.name) ? "signature_sheet" : "document";
              set({ attachments: [...form.attachments, { name: file.name, kind, sizeKb: file.sizeKb }] });
              setFile(undefined);
            }}
          >
            {t("partner.fieldReports.addAttachment")}
          </Button>
        </div>
      </Section>

      {returned && (
        <Section title={t("partner.fieldReports.correctionTitle")}>
          <TextAreaField id="fr-correction" label={t("partner.fieldReports.correctionLabel")} requiredLabel={t("common.requiredMarker")} value={note} error={noteError} onChange={(e) => setNote(e.target.value)} />
        </Section>
      )}

      <div className={styles.formActions}>
        <Button icon="send" disabled={Boolean(action.pending)} aria-busy={action.pending === "submit" || undefined} onClick={() => go(true)}>
          {action.pending === "submit" ? t("common.loading") : returned ? t("partner.fieldReports.resubmit") : t("partner.fieldReports.submit")}
        </Button>
        <Button variant="secondary" icon="check" disabled={Boolean(action.pending)} onClick={() => go(false)}>
          {action.pending === "save" ? t("common.loading") : t("partner.fieldReports.saveDraft")}
        </Button>
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

export function FieldReportFormView({ initialIntervention }: { initialIntervention?: string }) {
  const { t } = useI18n();
  const opts = usePartnerQuery(getReportOptions);
  return (
    <>
      <PageHeader back={{ href: "/partner/field-reports", label: t("partner.fieldReports.back") }} title={t("partner.fieldReports.new")} intro={t("partner.fieldReports.newIntro")} />
      <Gate loading={!opts.data} denied={opts.denied} notFound={opts.notFound} backHref="/partner/field-reports">
        {() => {
          if (!opts.data!.canSubmit) return <Notice tone="warning" title={t("partner.denied.permissionTitle")}>{t("partner.fieldReports.noPermission")}</Notice>;
          if (opts.data!.interventions.length === 0) return <Notice tone="info">{t("partner.fieldReports.noLiveIntervention")}</Notice>;
          const first = opts.data!.interventions.find((i) => i.id === initialIntervention) ?? opts.data!.interventions[0];
          return <FieldReportForm initial={emptyInput(first.id, first)} />;
        }}
      </Gate>
    </>
  );
}

/** Draft → Submitted → Needs correction / Accepted. Offline records are still drafts until they sync. */
function reportStages(status: PartnerReportStatus, t: (k: MessageKey) => string): { key: string; label: string; state: StageState }[] {
  const decided = status === "accepted" || status === "needs_correction";
  const drafting = status === "draft" || status === "saved_offline" || status === "awaiting_sync";
  const draftState: StageState = drafting ? "current" : "done";
  const submittedState: StageState = status === "submitted" ? "current" : decided ? "done" : "upcoming";
  const decisionState: StageState = status === "accepted" ? "done" : status === "needs_correction" ? "current" : "upcoming";
  return [
    { key: "draft", label: t("portal.status.partnerReport.draft"), state: draftState },
    { key: "submitted", label: t("portal.status.partnerReport.submitted"), state: submittedState },
    { key: "decision", label: decided ? t(`portal.status.partnerReport.${status}` as MessageKey) : t("partner.fieldReports.stageDecision"), state: decisionState },
  ];
}

export function FieldReportDetailView({ id }: { id: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const router = useRouter();
  const q = usePartnerQuery(() => getPartnerFieldReport(id), [id]);
  const sync = useServiceAction();
  const [submitted, setSubmitted] = useState<string>();

  return (
    <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner/field-reports">
      {() => {
        const { report: r, intervention, servicePoint, form, version, issues, history, canEdit, canSubmit, orgLabel } = q.data!;
        if (r.kind === "survey") {
          router.replace(`/partner/surveys/responses/${r.id}`);
          return null;
        }
        const lastOpm = [...r.comments].reverse().find((c) => !c.author.endsWith(`, ${orgLabel}`));
        const actions: RecordAction[] = [];
        if (r.status === "draft" && (r.history ?? []).length === 0) {
          actions.push({
            key: "delete",
            label: t("partner.fieldReports.deleteDraft"),
            tone: "danger",
            icon: "trash",
            noNote: true,
            denied: !canSubmit,
            run: async () => {
              await deleteDraftFieldReport(r.id);
              router.push("/partner/field-reports");
            },
          });
        }
        return (
          <RecordPage
            back={{ href: "/partner/field-reports", label: t("partner.fieldReports.back") }}
            eyebrow={`${t("partner.fieldReports.report")} · ${r.ref}`}
            title={r.title}
            badges={
              <>
                <StatusBadge entity="partnerReport" status={r.partnerStatus} />
                {r.channel === "offline" && (
                  <Badge tone="neutral" icon="smartphone">
                    {t("partner.fieldReports.fromFieldApp")}
                  </Badge>
                )}
                {r.version > 0 && <Badge tone="neutral">{t("partner.proposals.versionN", { version: r.version })}</Badge>}
              </>
            }
            meta={`${intervention.ref} · ${formatDate(r.collectedAt)} · ${servicePoint?.name ?? "—"}`}
            stages={reportStages(r.partnerStatus, t)}
            notices={
              <>
                <div aria-live="polite">{submitted && <Notice tone="success">{submitted}</Notice>}</div>
                {r.status === "returned" && (
                  <Notice tone="warning" title={t("partner.fieldReports.returnedTitle")}>
                    {lastOpm && (
                      <p>
                        <strong>{lastOpm.author}:</strong> “{lastOpm.text}”
                      </p>
                    )}
                    <p>{t("partner.fieldReports.returnedNext")}</p>
                  </Notice>
                )}
                {r.partnerStatus === "submitted" && <Notice tone="info">{t("partner.fieldReports.awaitingOpm")}</Notice>}
                {r.status === "accepted" && <Notice tone="success">{t("partner.fieldReports.acceptedNote")}</Notice>}
                {(r.status === "saved_offline" || r.status === "awaiting_sync") && (
                  <Notice tone="simulated" title={t("partner.fieldReports.offlineTitle")}>
                    <p>{t(r.status === "saved_offline" ? "partner.fieldReports.savedOfflineBody" : "partner.fieldReports.awaitingSyncBody")}</p>
                    {canSubmit && (
                      <div className={portal.buttonRow}>
                        <Button size="sm" variant="secondary" icon="refresh" disabled={Boolean(sync.pending)} onClick={() => sync.run("sync", () => syncFieldAppRecord(r.id), t("partner.fieldReports.syncStep"))}>
                          {sync.pending ? t("common.loading") : r.status === "saved_offline" ? t("partner.fieldReports.reconnect") : t("partner.fieldReports.syncNow")}
                        </Button>
                      </div>
                    )}
                    <div aria-live="polite">{sync.success && <p>{sync.success}</p>}</div>
                  </Notice>
                )}
                {issues.length > 0 && r.status !== "accepted" && (
                  <Notice tone="warning" title={t("partner.fieldReports.checksTitle")}>
                    <ul className={portal.plainList}>
                      {issues.map((code) => (
                        <li key={code}>
                          <strong>{t(`portal.fieldReports.issues.${code}.title` as MessageKey)}</strong> — {t(`portal.fieldReports.issues.${code}.body` as MessageKey)}
                        </li>
                      ))}
                    </ul>
                  </Notice>
                )}
              </>
            }
            actions={actions}
            timeline={{ entries: history }}
            tabs={[
              {
                id: "report",
                label: canEdit ? t("partner.fieldReports.editTab") : t("partner.fieldReports.reportTab"),
                content: canEdit ? (
                  <FieldReportForm
                    key={`${r.id}-${r.status}`}
                    initial={{ ...inputOf(r), collectedAt: r.collectedAt.slice(0, 10) }}
                    reportId={r.id}
                    returned={r.status === "returned"}
                    onSubmitted={setSubmitted}
                  />
                ) : (
                  <ReportSummary report={r} form={form?.ref} version={version?.version} servicePoint={servicePoint?.name} />
                ),
              },
              {
                id: "versions",
                label: t("partner.fieldReports.versionsTab"),
                count: (r.history ?? []).length,
                content: (
                  <RecordSection title={t("partner.fieldReports.versionsTab")}>
                    <p className={`${portal.small} ${portal.muted}`}>{t("partner.fieldReports.versionsHint")}</p>
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
                              <span className={portal.small}>“{h.note}”</span>
                              <span className={portal.small}>
                                {t("partner.fieldReports.snapshot", {
                                  reached: formatNumber(h.reached.women + h.reached.men + h.reached.children),
                                  indicators: h.indicatorValues.map((v) => `${indicatorLabel(v.indicatorId).split(" ")[0]} ${v.value}`).join(", ") || "—",
                                })}
                              </span>
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
                  <>
                    <RecordSection title={t("partner.messages.correspondence")} actions={<Link href="/partner/messages?tab=correspondence" className={portal.inlineLink}>{t("partner.workspace.replyInMessages")}</Link>}>
                      <CommentThread comments={r.comments} label={t("partner.messages.correspondence")} emptyLabel={t("partner.messages.noFormal")} />
                    </RecordSection>
                    <RecordSection title={t("partner.messages.notes")}>
                      <Notice tone="warning">{t("partner.messages.notesHint")}</Notice>
                      <CommentThread comments={r.partnerNotes ?? []} label={t("partner.messages.noteLabel")} emptyLabel={t("partner.messages.noNotes")} onAdd={(text) => addInternalNote("fieldReport", r.id, text)} />
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

function ReportSummary({ report: r, form, version, servicePoint }: { report: FieldReport; form?: string; version?: number; servicePoint?: string }) {
  const { t, formatNumber } = useI18n();
  return (
    <>
      <RecordSection title={t("partner.fieldReports.sections.activity")}>
        <FieldGrid
          items={[
            { label: t("portal.fieldReports.kind"), value: t(`portal.fieldReports.kinds.${r.kind}` as MessageKey) },
            { label: t("partner.fieldReports.fields.activityType"), value: r.activityType ?? "—" },
            { label: t("portal.fieldReports.servicePoint"), value: servicePoint ?? servicePointName(r.servicePointId) },
            { label: t("partner.fieldReports.fields.locationNote"), value: r.locationNote ?? "—" },
            { label: t("portal.fieldReports.gps"), value: r.gps ? `${r.gps.lat.toFixed(4)}, ${r.gps.lng.toFixed(4)} (±${r.gps.accuracyM} m)` : t("portal.fieldReports.noGps") },
            { label: t("portal.fieldReports.form"), value: form ? `${form} v${version ?? r.formVersion}` : "—" },
            { label: t("portal.fieldReports.submittedBy"), value: r.submittedBy },
            { label: t("portal.fieldReports.reached"), value: `${formatNumber(r.reached.women + r.reached.men + r.reached.children)} (${t("portal.fieldReports.women")} ${r.reached.women}, ${t("portal.fieldReports.men")} ${r.reached.men}, ${t("portal.fieldReports.children")} ${r.reached.children})` },
          ]}
        />
      </RecordSection>
      <RecordSection title={t("partner.fieldReports.sections.results")}>
        <FieldGrid
          items={[
            { label: t("partner.fieldReports.fields.indicators"), value: r.indicatorValues.map((v) => `${indicatorLabel(v.indicatorId)}: ${formatNumber(v.value)}`).join("; ") || "—", wide: true },
            { label: t("portal.fieldReports.distributed"), value: r.distributed.map((d) => `${d.item}: ${d.quantity} (${d.households} HH)`).join("; ") || "—", wide: true },
            { label: t("partner.fieldReports.fields.outputs"), value: r.outputs ?? "—", wide: true },
            { label: t("partner.fieldReports.fields.challenges"), value: r.challenges ?? "—", wide: true },
            { label: t("partner.fieldReports.fields.notes"), value: r.narrative, wide: true },
            { label: t("partner.fieldReports.sections.attachments"), value: r.attachments.map((a) => a.name).join(", ") || "—", wide: true },
          ]}
        />
      </RecordSection>
    </>
  );
}
