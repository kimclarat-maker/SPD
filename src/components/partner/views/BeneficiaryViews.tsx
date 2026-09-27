"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { AssistanceStatus, BeneficiaryVerificationStatus } from "@/lib/types";
import {
  checkAssistanceInput,
  fetchVerificationResult,
  getAssistance,
  listBeneficiaryWork,
  recordAssistance,
  requestBeneficiaryVerification,
  type AssistanceInput,
  type AssistanceIssue,
  type AssistanceRow,
  type VerificationRow,
} from "@/lib/services/partnerField";
import { servicePointName, settlementName } from "@/lib/services/lookup";
import { useServiceAction } from "@/lib/services/hooks";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { PageHeader, Section } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { StatusBadge, useStatusOptions } from "@/components/portal/StatusBadge";
import { FieldGrid, PageTabs, RecordPage, RecordSection } from "@/components/portal/RecordPage";
import { Masked, SimulatedTag } from "@/components/portal/RecordBits";
import { Gate, PartnerDenied, usePartnerQuery } from "@/components/partner/PartnerBits";
import portal from "@/components/portal/portal.module.css";
import styles from "@/components/partner/partner.module.css";

const checkStatuses: BeneficiaryVerificationStatus[] = ["pending", "verified", "inconclusive", "unavailable", "needs_review"];
const assistanceStatuses: AssistanceStatus[] = ["recorded", "flagged", "cleared", "corrected"];

export function BeneficiariesView({ initialTab }: { initialTab?: string }) {
  const { t } = useI18n();
  const q = usePartnerQuery(listBeneficiaryWork);
  const [tab, setTab] = useState(initialTab === "verification" ? "verification" : "assistance");

  return (
    <>
      <PageHeader title={t("partner.beneficiaries.title")} intro={t("partner.beneficiaries.intro")} />
      <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner">
        {() => {
          const d = q.data!;
          if (!d.can.verify && !d.can.record) return <PartnerDenied kind="permission" />;
          return (
            <div className={portal.stack}>
              <Notice tone="info" title={t("partner.beneficiaries.privacyTitle")}>
                <ul className={portal.plainList}>
                  <li>{t("partner.beneficiaries.privacy1")}</li>
                  <li>{t("partner.beneficiaries.privacy2")}</li>
                  <li>{t("partner.beneficiaries.privacy3")}</li>
                </ul>
              </Notice>
              {d.interventions.length === 0 && <Notice tone="warning">{t("partner.beneficiaries.noLive")}</Notice>}
              <PageTabs
                label={t("partner.beneficiaries.title")}
                active={tab}
                onChange={setTab}
                tabs={[
                  { id: "assistance", label: t("partner.beneficiaries.assistanceTab"), count: d.assistance.length, content: <AssistanceTab data={d} /> },
                  { id: "verification", label: t("partner.beneficiaries.verificationTab"), count: d.verifications.length, content: <VerificationTab data={d} /> },
                ]}
              />
            </div>
          );
        }}
      </Gate>
    </>
  );
}

type Work = Awaited<ReturnType<typeof listBeneficiaryWork>>;

function VerificationTab({ data }: { data: Work }) {
  const { t, formatDate } = useI18n();
  const fid = useId();
  const statusOptions = useStatusOptions("beneficiaryCheck", checkStatuses);
  const [intervention, setIntervention] = useState(data.interventions[0]?.id ?? "");
  const [ref, setRef] = useState("");
  const [size, setSize] = useState("");
  const [purpose, setPurpose] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const action = useServiceAction();
  const fetcher = useServiceAction();

  return (
    <div className={portal.stack}>
      {data.can.verify && data.interventions.length > 0 && (
        <Section title={t("partner.beneficiaries.requestVerification")} actions={<SimulatedTag />}>
          <p className={portal.small}>{t("partner.beneficiaries.verificationHint")}</p>
          <div className={styles.formGrid}>
            <SelectField id={`${fid}-int`} label={t("partner.workspace.intervention")} value={intervention} onChange={(e) => setIntervention(e.target.value)}>
              {data.interventions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.ref} {i.title}
                </option>
              ))}
            </SelectField>
            <TextField id={`${fid}-ref`} label={t("partner.beneficiaries.reference")} requiredLabel={t("common.requiredMarker")} hint={t("partner.beneficiaries.referenceHint")} autoComplete="off" spellCheck={false} value={ref} error={errors.ref} onChange={(e) => setRef(e.target.value)} />
            <TextField id={`${fid}-size`} type="number" min={1} label={t("partner.beneficiaries.householdSize")} value={size} onChange={(e) => setSize(e.target.value)} />
            <div className={styles.wide}>
              <TextAreaField id={`${fid}-purpose`} label={t("partner.beneficiaries.purpose")} requiredLabel={t("common.requiredMarker")} hint={t("partner.beneficiaries.purposeHint")} value={purpose} error={errors.purpose} onChange={(e) => setPurpose(e.target.value)} />
            </div>
          </div>
          <div className={portal.buttonRow}>
            <Button
              icon="shield"
              disabled={Boolean(action.pending)}
              onClick={async () => {
                const e: Record<string, string> = {};
                if (!/^[A-Z]{2}-[A-Z]{3}-\d{4}-\d{2}$/.test(ref.trim().toUpperCase())) e.ref = t("partner.beneficiaries.referenceInvalid");
                if (!purpose.trim()) e.purpose = t("portal.validation.required");
                setErrors(e);
                if (Object.keys(e).length) return;
                if (await action.run("req", () => requestBeneficiaryVerification({ interventionId: intervention, beneficiaryRef: ref, householdSize: size ? Number(size) : undefined, purpose }), t("partner.beneficiaries.requested"))) {
                  setRef("");
                  setSize("");
                  setPurpose("");
                }
              }}
            >
              {action.pending ? t("common.loading") : t("partner.beneficiaries.requestButton")}
            </Button>
            <span className={`${portal.small} ${portal.muted}`}>{t("partner.beneficiaries.demoHint")}</span>
          </div>
          <div aria-live="polite">{action.success && <Notice tone="success">{action.success}</Notice>}</div>
          {action.error && (
            <Notice tone="error" role="alert">
              {action.error}
            </Notice>
          )}
        </Section>
      )}
      <div aria-live="polite">{fetcher.success && <Notice tone="success">{fetcher.success}</Notice>}</div>
      {fetcher.error && (
        <Notice tone="error" role="alert">
          {fetcher.error}
        </Notice>
      )}
      <RecordTable<VerificationRow>
        rows={data.verifications}
        caption={t("partner.beneficiaries.verificationTab")}
        searchText={(v) => `${v.ref} ${v.maskedRef} ${v.interventionRef}`}
        statusOptions={statusOptions}
        emptyLabel={t("partner.beneficiaries.noVerifications")}
        columns={[
          { key: "ref", header: t("partner.beneficiaries.request"), primary: true, sortValue: (v) => v.ref, render: (v) => <span className={portal.monoInline}>{v.ref}</span> },
          { key: "who", header: t("partner.beneficiaries.reference"), render: (v) => <Masked value={v.maskedRef} masked /> },
          { key: "intervention", header: t("partner.workspace.intervention"), render: (v) => v.interventionRef },
          { key: "requested", header: t("partner.beneficiaries.requestedOn"), sortValue: (v) => v.requestedAt, render: (v) => formatDate(v.requestedAt, true) },
          {
            key: "status",
            header: t("partner.beneficiaries.result"),
            sortValue: (v) => v.status,
            render: (v) => (
              <span className={portal.stack} style={{ gap: 4 }}>
                <span>
                  <StatusBadge entity="beneficiaryCheck" status={v.status} /> <SimulatedTag />
                </span>
                {v.detail && <span className={portal.small}>{v.detail}</span>}
              </span>
            ),
          },
          {
            key: "act",
            header: t("partner.common.action"),
            render: (v) =>
              data.can.verify && (v.status === "pending" || v.status === "unavailable") ? (
                <Button
                  size="sm"
                  variant="secondary"
                  icon="refresh"
                  disabled={Boolean(fetcher.pending)}
                  aria-label={`${t("partner.beneficiaries.fetch")}: ${v.ref}`}
                  onClick={() => fetcher.run(v.id, () => fetchVerificationResult(v.id), (s) => t("partner.beneficiaries.resultReceived", { status: t(`portal.status.beneficiaryCheck.${String(s)}` as MessageKey) }))}
                >
                  {fetcher.pending === v.id ? t("common.loading") : v.status === "unavailable" ? t("partner.beneficiaries.retry") : t("partner.beneficiaries.fetch")}
                </Button>
              ) : (
                "—"
              ),
          },
        ]}
      />
    </div>
  );
}

const issueField: Record<AssistanceIssue, string> = {
  intervention: "as-int",
  beneficiaryRef: "as-ref",
  assistanceType: "as-type",
  quantity: "as-qty",
  unit: "as-unit",
  valueUsd: "as-value",
  deliveredAt: "as-date",
  servicePoint: "as-point",
  responsibleStaff: "as-staff",
};

function AssistanceTab({ data }: { data: Work }) {
  const { t, formatDate, formatNumber } = useI18n();
  const statusOptions = useStatusOptions("assistance", assistanceStatuses);
  const first = data.interventions[0];
  const [form, setForm] = useState<AssistanceInput>({
    interventionId: first?.id ?? "",
    verificationId: "",
    beneficiaryRef: "",
    assistanceType: "",
    quantity: 1,
    unit: "",
    deliveredAt: new Date().toISOString().slice(0, 10),
    servicePointId: first?.servicePointIds[0] ?? "",
    responsibleStaff: "",
  });
  const [issues, setIssues] = useState<AssistanceIssue[]>([]);
  const [result, setResult] = useState<{ id: string; flagged: boolean } | null>(null);
  const action = useServiceAction();
  const set = (patch: Partial<AssistanceInput>) => setForm((f) => ({ ...f, ...patch }));
  const intervention = data.interventions.find((i) => i.id === form.interventionId);
  const points = data.servicePoints.filter((sp) => intervention?.servicePointIds.includes(sp.id));
  const verified = data.verifications.filter((v) => v.interventionId === form.interventionId && (v.status === "verified" || v.status === "inconclusive" || v.status === "needs_review"));
  const err = (k: AssistanceIssue) => (issues.includes(k) ? t(`partner.beneficiaries.issues.${k}` as MessageKey) : undefined);

  return (
    <div className={portal.stack}>
      {data.can.record && data.interventions.length > 0 && (
        <Section title={t("partner.beneficiaries.recordAssistance")}>
          <p className={portal.small}>{t("partner.beneficiaries.assistanceHint")}</p>
          <div className={styles.formGrid}>
            <SelectField
              id="as-int"
              label={t("partner.workspace.intervention")}
              requiredLabel={t("common.requiredMarker")}
              value={form.interventionId}
              error={err("intervention")}
              onChange={(e) => {
                const next = data.interventions.find((i) => i.id === e.target.value);
                set({ interventionId: e.target.value, servicePointId: next?.servicePointIds[0] ?? "", verificationId: "" });
              }}
            >
              {data.interventions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.ref} {i.title}
                </option>
              ))}
            </SelectField>
            <SelectField id="as-ver" label={t("partner.beneficiaries.useVerification")} hint={t("partner.beneficiaries.useVerificationHint")} value={form.verificationId ?? ""} onChange={(e) => set({ verificationId: e.target.value, beneficiaryRef: "" })}>
              <option value="">{t("partner.beneficiaries.noVerification")}</option>
              {verified.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.ref} · {v.maskedRef} · {t(`portal.status.beneficiaryCheck.${v.status}` as MessageKey)}
                </option>
              ))}
            </SelectField>
            {!form.verificationId && (
              <TextField id="as-ref" label={t("partner.beneficiaries.reference")} requiredLabel={t("common.requiredMarker")} hint={t("partner.beneficiaries.referenceHint")} autoComplete="off" spellCheck={false} value={form.beneficiaryRef} error={err("beneficiaryRef")} onChange={(e) => set({ beneficiaryRef: e.target.value })} />
            )}
            <TextField id="as-type" label={t("partner.beneficiaries.assistanceType")} requiredLabel={t("common.requiredMarker")} hint={t("partner.beneficiaries.assistanceTypeHint")} value={form.assistanceType} error={err("assistanceType")} onChange={(e) => set({ assistanceType: e.target.value })} list="as-types" />
            <datalist id="as-types">
              <option value="Dignity kit" />
              <option value="Hygiene kit" />
              <option value="Cash transfer" />
              <option value="Shelter kit" />
              <option value="Antenatal referral" />
            </datalist>
            <TextField id="as-qty" type="number" min={1} label={t("partner.beneficiaries.quantity")} requiredLabel={t("common.requiredMarker")} value={form.quantity || ""} error={err("quantity")} onChange={(e) => set({ quantity: Number(e.target.value) })} />
            <TextField id="as-unit" label={t("partner.beneficiaries.unit")} requiredLabel={t("common.requiredMarker")} placeholder={t("partner.beneficiaries.unitPlaceholder")} value={form.unit} error={err("unit")} onChange={(e) => set({ unit: e.target.value })} />
            <TextField id="as-value" type="number" min={0} label={t("partner.beneficiaries.value")} value={form.valueUsd ?? ""} error={err("valueUsd")} onChange={(e) => set({ valueUsd: e.target.value === "" ? undefined : Number(e.target.value) })} />
            <TextField id="as-date" type="date" label={t("partner.beneficiaries.date")} requiredLabel={t("common.requiredMarker")} value={form.deliveredAt} error={err("deliveredAt")} onChange={(e) => set({ deliveredAt: e.target.value })} />
            <SelectField id="as-point" label={t("partner.beneficiaries.location")} requiredLabel={t("common.requiredMarker")} value={form.servicePointId} error={err("servicePoint")} onChange={(e) => set({ servicePointId: e.target.value })}>
              {points.map((sp) => (
                <option key={sp.id} value={sp.id}>
                  {sp.name}
                </option>
              ))}
            </SelectField>
            <TextField id="as-staff" label={t("partner.beneficiaries.responsibleStaff")} requiredLabel={t("common.requiredMarker")} value={form.responsibleStaff} error={err("responsibleStaff")} onChange={(e) => set({ responsibleStaff: e.target.value })} />
          </div>
          {issues.length > 0 && (
            <Notice tone="error" role="alert" title={t("common.errorSummary")}>
              <ul className={portal.plainList}>
                {issues.map((i) => (
                  <li key={i}>
                    <a href={`#${issueField[i]}`}>{t(`partner.beneficiaries.issues.${i}` as MessageKey)}</a>
                  </li>
                ))}
              </ul>
            </Notice>
          )}
          <div className={portal.buttonRow}>
            <Button
              icon="check"
              disabled={Boolean(action.pending)}
              onClick={async () => {
                const found = await checkAssistanceInput(form);
                setIssues(found);
                setResult(null);
                if (found.length) return;
                let res: { id: string; flagged: boolean } | null = null;
                const ok = await action.run("rec", async () => {
                  res = await recordAssistance({ ...form, verificationId: form.verificationId || undefined });
                });
                if (ok && res) {
                  setResult(res);
                  set({ beneficiaryRef: "", verificationId: "", quantity: 1 });
                }
              }}
            >
              {action.pending ? t("common.loading") : t("partner.beneficiaries.record")}
            </Button>
          </div>
          <div aria-live="polite">
            {result && !result.flagged && <Notice tone="success">{t("partner.beneficiaries.recorded")}</Notice>}
            {result?.flagged && (
              <Notice tone="warning" title={t("partner.beneficiaries.flaggedTitle")}>
                <p>{t("partner.beneficiaries.flaggedBody")}</p>
                <p>
                  <Link href={`/partner/beneficiaries/${result.id}`}>{t("partner.beneficiaries.openEntry")}</Link>
                </p>
              </Notice>
            )}
          </div>
          {action.error && (
            <Notice tone="error" role="alert">
              {action.error}
            </Notice>
          )}
        </Section>
      )}
      <RecordTable<AssistanceRow & { status: string }>
        rows={data.assistance.map((a) => ({ ...a, status: a.effectiveStatus }))}
        caption={t("partner.beneficiaries.assistanceTab")}
        searchText={(a) => `${a.ref} ${a.maskedRef} ${a.assistanceType} ${a.interventionRef} ${a.responsibleStaff}`}
        statusOptions={statusOptions}
        emptyLabel={t("partner.beneficiaries.noAssistance")}
        columns={[
          {
            key: "ref",
            header: t("partner.beneficiaries.entry"),
            primary: true,
            sortValue: (a) => a.ref,
            render: (a) => (
              <Link href={`/partner/beneficiaries/${a.id}`} className={portal.recordLink}>
                {a.ref}
              </Link>
            ),
          },
          { key: "who", header: t("partner.beneficiaries.reference"), render: (a) => <Masked value={a.maskedRef} masked /> },
          { key: "type", header: t("partner.beneficiaries.assistanceType"), sortValue: (a) => a.assistanceType, render: (a) => a.assistanceType },
          { key: "qty", header: t("partner.beneficiaries.quantity"), numeric: true, render: (a) => `${formatNumber(a.quantity)} ${a.unit}` },
          { key: "date", header: t("partner.beneficiaries.date"), sortValue: (a) => a.deliveredAt, render: (a) => formatDate(a.deliveredAt) },
          { key: "intervention", header: t("partner.workspace.intervention"), render: (a) => a.interventionRef },
          { key: "check", header: t("partner.beneficiaries.verification"), render: (a) => (a.verificationStatus ? <StatusBadge entity="beneficiaryCheck" status={a.verificationStatus} /> : <span className={portal.muted}>{t("partner.beneficiaries.notVerified")}</span>) },
          { key: "status", header: t("partner.proposals.status"), sortValue: (a) => a.effectiveStatus, render: (a) => <StatusBadge entity="assistance" status={a.effectiveStatus} /> },
        ]}
      />
    </div>
  );
}

export function AssistanceDetailView({ id }: { id: string }) {
  const { t, formatDate, formatNumber } = useI18n();
  const q = usePartnerQuery(() => getAssistance(id), [id]);
  return (
    <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner/beneficiaries">
      {() => {
        const { record: a, fullRef, intervention, verification, review, history } = q.data!;
        return (
          <RecordPage
            back={{ href: "/partner/beneficiaries", label: t("partner.beneficiaries.back") }}
            eyebrow={`${t("partner.beneficiaries.entry")} · ${a.ref}`}
            title={`${a.assistanceType} · ${formatNumber(a.quantity)} ${a.unit}`}
            badges={
              <>
                <StatusBadge entity="assistance" status={a.effectiveStatus} />
                {verification && <StatusBadge entity="beneficiaryCheck" status={verification.status} />}
              </>
            }
            meta={`${intervention.ref} · ${formatDate(a.deliveredAt)} · ${settlementName(a.settlementId)}`}
            notices={
              <>
                {a.effectiveStatus === "flagged" && (
                  <Notice tone="warning" title={t("partner.beneficiaries.flaggedTitle")}>
                    <p>{t("partner.beneficiaries.flaggedBody")}</p>
                    {review && <p className={portal.small}>{t("partner.beneficiaries.reviewRef", { ref: review.ref, date: formatDate(review.detectedAt) })}</p>}
                  </Notice>
                )}
                {a.effectiveStatus === "cleared" && <Notice tone="success">{t("partner.beneficiaries.clearedBody")}</Notice>}
                {a.effectiveStatus === "corrected" && <Notice tone="info">{t("partner.beneficiaries.correctedBody")}</Notice>}
              </>
            }
            timeline={{ entries: history }}
            tabs={[
              {
                id: "entry",
                label: t("portal.detail.overview"),
                content: (
                  <>
                    <RecordSection title={t("portal.detail.overview")}>
                      <FieldGrid
                        items={[
                          { label: t("partner.beneficiaries.reference"), value: <Masked value={fullRef ?? a.maskedRef} masked={!fullRef} /> },
                          { label: t("partner.beneficiaries.assistanceType"), value: a.assistanceType },
                          { label: t("partner.beneficiaries.quantity"), value: `${formatNumber(a.quantity)} ${a.unit}` },
                          { label: t("partner.beneficiaries.value"), value: a.valueUsd !== undefined ? `$${formatNumber(a.valueUsd)}` : "—" },
                          { label: t("partner.beneficiaries.date"), value: formatDate(a.deliveredAt) },
                          { label: t("partner.beneficiaries.location"), value: servicePointName(a.servicePointId) },
                          { label: t("partner.beneficiaries.responsibleStaff"), value: a.responsibleStaff },
                          { label: t("partner.beneficiaries.recordedBy"), value: `${a.recordedBy} · ${formatDate(a.recordedAt, true)}` },
                          { label: t("partner.workspace.intervention"), value: <Link href={`/partner/interventions/${intervention.id}`}>{intervention.ref}</Link> },
                        ]}
                      />
                      <p className={`${portal.small} ${portal.muted}`}>{t("partner.beneficiaries.minimumData")}</p>
                    </RecordSection>
                    <RecordSection title={t("partner.beneficiaries.verification")}>
                      {verification ? (
                        <FieldGrid
                          items={[
                            { label: t("partner.beneficiaries.request"), value: verification.ref },
                            { label: t("partner.beneficiaries.result"), value: <><StatusBadge entity="beneficiaryCheck" status={verification.status} /> <SimulatedTag /></> },
                            { label: t("partner.beneficiaries.detail"), value: verification.detail ?? "—", wide: true },
                          ]}
                        />
                      ) : (
                        <p className={portal.muted}>{t("partner.beneficiaries.notVerified")}</p>
                      )}
                    </RecordSection>
                    <RecordSection title={t("partner.beneficiaries.reviewTitle")}>
                      {review ? (
                        <>
                          <p>
                            <Badge tone={a.effectiveStatus === "flagged" ? "warning" : "success"}>{t(`partner.beneficiaries.reviewStates.${a.effectiveStatus}` as MessageKey)}</Badge>
                          </p>
                          <p className={`${portal.small} ${portal.muted}`}>{t("partner.beneficiaries.reviewPrivacy")}</p>
                        </>
                      ) : (
                        <p className={portal.muted}>{t("partner.beneficiaries.noReview")}</p>
                      )}
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
