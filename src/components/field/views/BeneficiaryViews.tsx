"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { FieldSubmission } from "@/lib/services/fieldWork";
import { lookupOwnAssistanceHistory } from "@/lib/services/fieldWork";
import { retryFieldVerification } from "@/lib/services/fieldSync";
import { maskReference } from "@/lib/services/partnerContext";
import { useConnectivity } from "@/lib/field/connectivity";
import {
  assistanceIssues,
  createLocalRecord,
  discardLocalRecord,
  localDateTime,
  queueLocalRecord,
  retryLocalRecord,
  saveLocalRecord,
  syncNow,
  verificationIssues,
  withdrawLocalRecord,
  type AssistanceField,
  type VerificationField,
} from "@/lib/field/client";
import type { AssistanceData, LocalRecordOf, VerificationData } from "@/lib/field/device";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { useDevice, useFieldAction, useFieldData, useSyncRunning } from "../FieldData";
import { AttachmentPicker, KV, LocalHistory, PageHead, normaliseRefInput, recordChip, SourceNote, StatusChip, submissionChip, verificationChip, WhereTrack } from "../FieldBits";
import { useLookups, useParam } from "../lookup";
import { EarlierVersions, Feedback } from "./ReportViews";
import { ConflictResolver, SyncErrorNotice, SyncProgress } from "./SyncView";
import styles from "../field.module.css";

type VerificationRecord = LocalRecordOf<"verification">;
type AssistanceRecord = LocalRecordOf<"assistance">;
type VerificationSub = Extract<FieldSubmission, { kind: "verification" }>;
type AssistanceSub = Extract<FieldSubmission, { kind: "assistance" }>;

function NotAuthorised() {
  const { t } = useI18n();
  return (
    <div className={styles.stack}>
      <PageHead title={t("field.denied.permissionTitle")} back={{ href: "/field", label: t("field.nav.myWork") }} />
      <Notice tone="warning">{t("field.denied.permissionBody")}</Notice>
    </div>
  );
}

/* =============================================================== Scanner */

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

/**
 * Reads a printed code with the camera where the browser supports it
 * (BarcodeDetector). The camera is requested only when the officer presses
 * Scan, and it is switched off as soon as a code is read or scanning stops.
 */
function Scanner({ onValue }: { onValue: (value: string) => void }) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<"idle" | "scanning" | "unsupported" | "denied" | "badCode">("idle");

  const stop = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };
  useEffect(() => stop, []);

  async function start() {
    const Ctor = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
    if (!Ctor || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      setState("scanning");
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      const detector = new Ctor({ formats: ["qr_code", "code_128", "code_39", "pdf417"] });
      const tick = async () => {
        if (!streamRef.current) return;
        try {
          const codes = await detector.detect(video);
          const value = codes[0]?.rawValue ? normaliseRefInput(codes[0].rawValue) : "";
          if (value) {
            if (/^[A-Z]{2}-[A-Z]{3}-\d{4}-\d{2}$/.test(value)) {
              stop();
              setState("idle");
              onValue(value);
              return;
            }
            setState("badCode");
          }
        } catch {
          // Keep trying until the officer stops.
        }
        setTimeout(() => void tick(), 350);
      };
      void tick();
    } catch {
      setState("denied");
    }
  }

  return (
    <div className={styles.stack} style={{ gap: 8 }}>
      {state === "scanning" || state === "badCode" ? (
        <>
          <video ref={videoRef} className={styles.video} muted playsInline aria-label={t("field.verify.scanVideo")} />
          {state === "badCode" && <p className={styles.small}>{t("field.verify.badCode")}</p>}
          <Button variant="secondary" icon="x" onClick={() => (stop(), setState("idle"))}>
            {t("field.verify.stopScan")}
          </Button>
        </>
      ) : (
        <>
          <video ref={videoRef} hidden muted playsInline />
          <Button variant="secondary" icon="eye" onClick={() => void start()}>
            {t("field.verify.scan")}
          </Button>
        </>
      )}
      <div aria-live="polite">
        {state === "unsupported" && <p className={styles.small}>{t("field.verify.scanUnsupported")}</p>}
        {state === "denied" && <p className={styles.small}>{t("field.verify.cameraDenied")}</p>}
      </div>
    </div>
  );
}

/* ========================================================== Verification */

const NEXT_STEP: Record<string, MessageKey> = {
  verified: "field.verify.next.verified",
  inconclusive: "field.verify.next.inconclusive",
  unavailable: "field.verify.next.unavailable",
  needs_review: "field.verify.next.needs_review",
  pending: "field.verify.next.pending",
};

function verificationStatus(r: VerificationRecord, sub?: VerificationSub): string {
  if (sub) return sub.status;
  if (r.state === "synced" && r.data.result) return r.data.result.status;
  return "pending";
}

function VerificationResult({ record }: { record: VerificationRecord }) {
  const { t, formatDate } = useI18n();
  const lk = useLookups();
  const { online } = useConnectivity();
  const running = useSyncRunning();
  const { run, pending, error } = useFieldAction();
  const sub = lk.submissionFor(record) as VerificationSub | undefined;
  const status = verificationStatus(record, sub);
  const chip = record.state === "synced" ? verificationChip(status) : recordChip(record, online, sub);
  return (
    <section className={styles.card} aria-labelledby={`vr-${record.localId}`} aria-live="polite">
      <div className={styles.cardHead}>
        <h2 id={`vr-${record.localId}`} className={styles.cardTitle}>
          {t("field.verify.resultTitle", { ref: record.purged ? record.data.beneficiaryRef : maskReference(record.data.beneficiaryRef.toUpperCase()) })}
        </h2>
        <span className={styles.badges}>
          <StatusChip chip={chip} />
          {record.state === "synced" && <Badge tone="simulated">{t("common.simulated")}</Badge>}
        </span>
      </div>
      {record.state === "synced" ? (
        <>
          <p>{sub?.detail ?? record.data.result?.detail}</p>
          <p className={`${styles.small} ${styles.muted}`}>{t("field.verify.simulatedNote")}</p>
          {(sub?.resultAt ?? record.data.result?.at) && <p className={`${styles.small} ${styles.muted}`}>{t("field.verify.checkedAt", { at: formatDate(sub?.resultAt ?? record.data.result!.at, true), ref: record.central?.ref ?? "" })}</p>}
        </>
      ) : record.state === "syncing" ? (
        <SyncProgress record={record} />
      ) : record.state === "failed" ? (
        <SyncErrorNotice record={record} />
      ) : (
        <p>{t("field.verify.notYetChecked")}</p>
      )}
      <Notice tone={status === "verified" ? "success" : status === "pending" ? "info" : "warning"}>{t(NEXT_STEP[status] ?? NEXT_STEP.pending)}</Notice>
      <div className={styles.actions}>
        {status === "unavailable" && sub && (
          <Button size="sm" icon="refresh" disabled={!online || Boolean(pending)} onClick={() => void run("retry", () => retryFieldVerification(sub.id))}>
            {online ? t("field.verify.retry") : t("field.verify.retryOffline")}
          </Button>
        )}
        {record.state === "pending" && online && (
          <Button size="sm" icon="refresh" disabled={running} onClick={() => void run("sync", () => syncNow({ only: [record.localId] }))}>
            {t("field.verify.checkNow")}
          </Button>
        )}
        {status !== "needs_review" && (
          <ButtonLink size="sm" variant="secondary" icon="handshake" href={`/field/assistance/record?verification=${record.localId}`}>
            {t("field.verify.recordDelivery")}
          </ButtonLink>
        )}
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export function VerifyView() {
  const { t, formatDate } = useI18n();
  const focus = useParam("id");
  const presetRef = useParam("ref");
  const presetIntervention = useParam("intervention");
  const router = useRouter();
  const { snapshot } = useFieldData();
  const device = useDevice();
  const { online } = useConnectivity();
  const lk = useLookups();
  const running = useSyncRunning();
  const { run, pending, error } = useFieldAction();
  const interventions = snapshot?.interventions.filter((i) => ["approved", "active", "completed"].includes(i.status)) ?? [];
  const [form, setForm] = useState<VerificationData>({
    interventionId: presetIntervention ?? "",
    beneficiaryRef: presetRef ?? "",
    householdSize: "",
    purpose: "",
    consent: false,
    method: "typed",
  });
  const [showErrors, setShowErrors] = useState(false);

  if (!snapshot) return <SourceNote />;
  if (!snapshot.account.permissions.includes("beneficiaries.verify")) return <NotAuthorised />;
  const interventionId = form.interventionId || interventions[0]?.id || "";
  const intervention = lk.intervention(interventionId);
  const purpose = form.purpose || (intervention ? t("field.verify.purposeDefault", { intervention: intervention.title }) : "");
  const data: VerificationData = { ...form, interventionId, purpose, beneficiaryRef: form.beneficiaryRef.toUpperCase() };
  const issues = verificationIssues(data);
  const err = (f: VerificationField) => (showErrors && issues.includes(f) ? t(`field.verify.errors.${f}` as MessageKey) : undefined);
  const records = device.records.filter((r): r is VerificationRecord => r.kind === "verification");
  const focused = records.find((r) => r.localId === focus) ?? records[0];
  const centralOnly = snapshot.submissions.filter((s): s is VerificationSub => s.kind === "verification" && !records.some((r) => r.localId === s.clientRecordId || r.central?.id === s.id));

  async function submit() {
    setShowErrors(true);
    if (issues.length) return;
    await run("check", async () => {
      const id = createLocalRecord("verification", maskReference(data.beneficiaryRef), data);
      queueLocalRecord(id);
      setForm({ interventionId, beneficiaryRef: "", householdSize: "", purpose: "", consent: false, method: "typed" });
      setShowErrors(false);
      router.replace(`/field/verify?id=${id}`);
      if (online) await syncNow({ only: [id] });
    });
  }

  return (
    <div className={styles.stack}>
      <PageHead title={t("field.verify.title")} intro={t("field.verify.intro")} />
      <SourceNote />
      <Notice tone="info" title={t("field.verify.privacyTitle")}>
        <p>{t("field.verify.privacyBody")}</p>
      </Notice>
      {!online && (
        <Notice tone="warning" title={t("field.verify.offlineTitle")}>
          <p>{t("field.verify.offlineBody")}</p>
          <p>
            <Link href="/field/assistance">{t("field.verify.offlinePermitted")}</Link>
          </p>
        </Notice>
      )}

      {focused && <VerificationResult record={focused} />}

      <form
        className={styles.card}
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        aria-labelledby="verify-new"
      >
        <h2 id="verify-new" className={styles.cardTitle}>
          {t("field.verify.newTitle")}
        </h2>
        <SelectField id="field-interventionId" label={t("field.common.intervention")} value={interventionId} error={err("interventionId")} onChange={(e) => setForm({ ...form, interventionId: e.target.value, purpose: "" })}>
          {interventions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.ref} — {i.title}
            </option>
          ))}
        </SelectField>
        <TextField
          id="field-beneficiaryRef"
          label={t("field.verify.reference")}
          requiredLabel={t("common.requiredMarker")}
          hint={t("field.verify.referenceHint")}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          value={form.beneficiaryRef}
          error={err("beneficiaryRef")}
          onChange={(e) => setForm({ ...form, beneficiaryRef: normaliseRefInput(e.target.value), method: "typed" })}
        />
        <Scanner onValue={(value) => setForm({ ...form, beneficiaryRef: value, method: "scanned" })} />
        {form.method === "scanned" && <p className={styles.small}>{t("field.verify.scanned")}</p>}
        <TextField id="field-householdSize" type="number" inputMode="numeric" min={1} label={t("field.verify.householdSize")} hint={t("field.verify.householdSizeHint")} value={form.householdSize} error={err("householdSize")} onChange={(e) => setForm({ ...form, householdSize: e.target.value })} />
        <TextAreaField id="field-purpose" label={t("field.verify.purpose")} requiredLabel={t("common.requiredMarker")} hint={t("field.verify.purposeHint")} value={purpose} error={err("purpose")} onChange={(e) => setForm({ ...form, purpose: e.target.value })} />
        <label className={styles.checkRow} id="field-consent">
          <input type="checkbox" checked={form.consent} onChange={(e) => setForm({ ...form, consent: e.target.checked })} aria-invalid={Boolean(err("consent")) || undefined} />
          <span>{t("field.verify.consent")}</span>
        </label>
        {err("consent") && (
          <p className={styles.small} style={{ color: "var(--color-error)" }}>
            <Icon name="alertCircle" size={16} /> {err("consent")}
          </p>
        )}
        <div className={styles.actions}>
          <Button type="submit" icon={online ? "shield" : "wifiOff"} disabled={Boolean(pending) || running} aria-busy={pending === "check" || undefined}>
            {pending === "check" ? t("field.verify.checking") : online ? t("field.verify.submitOnline") : t("field.verify.submitOffline")}
          </Button>
        </div>
        <p className={`${styles.small} ${styles.muted}`}>{online ? t("field.verify.onlineNote") : t("field.verify.offlineNote")}</p>
        {error && (
          <Notice tone="error" role="alert">
            {error}
          </Notice>
        )}
      </form>

      <section className={styles.stack} aria-labelledby="my-checks">
        <h2 id="my-checks" className={styles.cardTitle}>
          {t("field.verify.myChecks")}
        </h2>
        {records.length + centralOnly.length === 0 && <p className={styles.muted}>{t("field.verify.none")}</p>}
        <ul className={styles.list}>
          {records.map((r) => {
            const sub = lk.submissionFor(r) as VerificationSub | undefined;
            return (
              <li key={r.localId}>
                <Link href={`/field/verify?id=${r.localId}`} className={styles.item} aria-current={r.localId === focused?.localId ? "true" : undefined}>
                  <span className={styles.itemTop}>
                    <span className={styles.itemTitle}>{r.purged ? r.data.beneficiaryRef : maskReference(r.data.beneficiaryRef.toUpperCase())}</span>
                    <StatusChip chip={r.state === "synced" ? verificationChip(verificationStatus(r, sub)) : recordChip(r, online, sub)} />
                  </span>
                  <span className={styles.itemMeta}>
                    <span>{lk.intervention(r.data.interventionId)?.ref}</span>
                    {r.central && <span className={styles.ref}>{r.central.ref}</span>}
                    <span>{formatDate(r.updatedAt, true)}</span>
                  </span>
                </Link>
              </li>
            );
          })}
          {centralOnly.map((s) => (
            <li key={s.id} className={styles.item}>
              <span className={styles.itemTop}>
                <span className={styles.itemTitle}>{s.maskedRef}</span>
                <StatusChip chip={submissionChip(s)} />
              </span>
              <span className={styles.itemMeta}>
                <span className={styles.ref}>{s.ref}</span>
                <span>{formatDate(s.updatedAt, true)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ============================================================ Assistance */

function assistanceTrack(r: AssistanceRecord, sub?: AssistanceSub) {
  return { saved: true, central: r.state === "synced", reviewed: Boolean(sub?.reviewed) };
}

export function AssistanceView() {
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const { snapshot } = useFieldData();
  const device = useDevice();
  const { online } = useConnectivity();
  const lk = useLookups();
  const [filter, setFilter] = useState<"all" | "device" | "synced" | "flagged" | "reviewed">("all");
  const [interventionId, setInterventionId] = useState("");
  if (!snapshot) return <SourceNote />;
  if (!snapshot.account.permissions.includes("assistance.record")) return <NotAuthorised />;
  const records = device.records.filter((r): r is AssistanceRecord => r.kind === "assistance");
  const centralOnly = snapshot.submissions.filter((s): s is AssistanceSub => s.kind === "assistance" && !records.some((r) => r.localId === s.clientRecordId || r.central?.id === s.id));
  const groupOf = (state: string, sub?: AssistanceSub) => (state !== "synced" ? "device" : sub?.reviewed ? "reviewed" : sub?.status === "flagged" ? "flagged" : "synced");
  const rows = [
    ...records.map((r) => {
      const sub = lk.submissionFor(r) as AssistanceSub | undefined;
      return { key: r.localId, href: `/field/assistance/record?id=${r.localId}`, ref: r.state === "synced" || r.purged ? r.data.householdRef : maskReference(r.data.householdRef.toUpperCase()), what: `${r.data.quantity} × ${r.data.assistanceType}`, at: r.data.deliveredAt ? new Date(r.data.deliveredAt).toISOString() : r.updatedAt, chip: recordChip(r, online, sub), group: groupOf(r.state, sub), central: r.central?.ref };
    }),
    ...centralOnly.map((s) => ({ key: s.id, href: "", ref: s.maskedRef, what: `${s.quantity} × ${s.assistanceType}`, at: s.deliveredAt, chip: submissionChip(s), group: groupOf("synced", s), central: s.ref })),
  ].sort((a, b) => b.at.localeCompare(a.at));
  const interventions = snapshot.interventions;
  const chosen = interventionId || interventions[0]?.id || "";

  return (
    <div className={styles.stack}>
      <PageHead title={t("field.assistance.title")} intro={t("field.assistance.intro")} />
      <SourceNote />
      <section className={styles.card} aria-labelledby="states-legend">
        <h2 id="states-legend" className={styles.cardTitle}>
          {t("field.assistance.statesTitle")}
        </h2>
        <ol className={styles.timeline}>
          <li>
            <strong>{t("field.status.recordedLocally")}</strong> {t("field.assistance.stateLocal")}
          </li>
          <li>
            <strong>{t("field.status.synced")}</strong> {t("field.assistance.stateSynced")}
          </li>
          <li>
            <strong>{t("field.status.reviewed")}</strong> {t("field.assistance.stateReviewed")}
          </li>
        </ol>
      </section>
      <div className={styles.card}>
        <SelectField id="assist-intervention" label={t("field.common.intervention")} value={chosen} onChange={(e) => setInterventionId(e.target.value)}>
          {interventions.map((i) => (
            <option key={i.id} value={i.id}>
              {i.ref} — {i.title}
            </option>
          ))}
        </SelectField>
        <div className={styles.actions}>
          <Button icon="plus" onClick={() => router.push(`/field/assistance/record?new=1&intervention=${chosen}`)}>
            {t("field.assistance.record")}
          </Button>
          <ButtonLink variant="secondary" icon="shield" href="/field/verify">
            {t("field.assistance.verifyFirst")}
          </ButtonLink>
        </div>
      </div>
      <div className={styles.filters} role="group" aria-label={t("field.assistance.filterLabel")}>
        {(["all", "device", "synced", "flagged", "reviewed"] as const).map((f) => (
          <button key={f} type="button" className={styles.chip} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`field.assistance.filter.${f}`)}
          </button>
        ))}
      </div>
      <ul className={styles.list}>
        {rows
          .filter((r) => filter === "all" || r.group === filter)
          .map((r) => {
            const body = (
              <>
                <span className={styles.itemTop}>
                  <span className={styles.itemTitle}>{r.what}</span>
                  <StatusChip chip={r.chip} />
                </span>
                <span className={styles.itemMeta}>
                  <span>{r.ref}</span>
                  {r.central && <span className={styles.ref}>{r.central}</span>}
                  <span>{formatDate(r.at, true)}</span>
                </span>
              </>
            );
            return (
              <li key={r.key}>
                {r.href ? (
                  <Link href={r.href} className={styles.item}>
                    {body}
                  </Link>
                ) : (
                  <div className={styles.item}>{body}</div>
                )}
              </li>
            );
          })}
      </ul>
      {rows.length === 0 && <p className={styles.muted}>{t("field.assistance.none")}</p>}
    </div>
  );
}

export function AssistanceRecordView() {
  const { t } = useI18n();
  const id = useParam("id");
  const isNew = useParam("new");
  const interventionParam = useParam("intervention");
  const verificationParam = useParam("verification");
  const router = useRouter();
  const device = useDevice();
  const { snapshot } = useFieldData();
  const { run, error } = useFieldAction();
  const record = device.records.find((r): r is AssistanceRecord => r.kind === "assistance" && r.localId === id);

  // A new delivery (not from a task) starts as a draft on the device.
  useEffect(() => {
    if (id || (!isNew && !verificationParam) || !snapshot) return;
    const verification = device.records.find((r): r is VerificationRecord => r.kind === "verification" && r.localId === verificationParam);
    const interventionId = verification?.data.interventionId ?? interventionParam ?? snapshot.interventions[0]?.id ?? "";
    void run("create", () => {
      const created = createLocalRecord("assistance", t("field.assistance.newTitle"), {
        interventionId,
        householdRef: verification && !verification.purged ? verification.data.beneficiaryRef.toUpperCase() : "",
        assistanceType: "",
        quantity: "",
        unit: "",
        valueUsd: "",
        deliveredAt: localDateTime(),
        servicePointId: snapshot.interventions.find((i) => i.id === interventionId)?.servicePointIds[0] ?? "",
        evidence: [],
        note: "",
        verificationLocalId: verification?.localId,
      } satisfies AssistanceData);
      router.replace(`/field/assistance/record?id=${created}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, isNew, verificationParam, snapshot]);

  if (!snapshot) return <SourceNote />;
  if (!snapshot.account.permissions.includes("assistance.record")) return <NotAuthorised />;
  if (!record) {
    return (
      <div className={styles.stack}>
        <PageHead title={t("field.assistance.title")} back={{ href: "/field/assistance", label: t("field.nav.assistance") }} />
        {error ? <Notice tone="error">{error}</Notice> : id ? <Notice tone="warning">{t("field.assistance.notOnDevice")}</Notice> : <p role="status">{t("common.loading")}</p>}
      </div>
    );
  }
  return <AssistanceForm key={record.localId} record={record} />;
}

function AssistanceForm({ record }: { record: AssistanceRecord }) {
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const { online } = useConnectivity();
  const lk = useLookups();
  const device = useDevice();
  const running = useSyncRunning();
  const { snapshot } = useFieldData();
  const { run, pending, error, success } = useFieldAction();
  const sub = lk.submissionFor(record) as AssistanceSub | undefined;
  const editable = record.state === "draft" || (record.state === "failed" && !record.error?.retryable);
  const [data, setData] = useState<AssistanceData>(record.data);
  const [showErrors, setShowErrors] = useState(false);
  const [history, setHistory] = useState<{ assistanceType: string; quantity: number; unit: string; deliveredAt: string; ref: string }[] | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [resolvedMessage, setResolvedMessage] = useState<string | null>(null);
  const task = lk.task(data.taskId);
  const intervention = lk.intervention(data.interventionId);
  const points = (intervention?.servicePointIds ?? []).map((p) => lk.servicePoint(p)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const issues = assistanceIssues(data);
  const err = (f: AssistanceField) => (showErrors && issues.includes(f) ? t(`field.assistance.errors.${f}` as MessageKey) : undefined);
  const verifications = device.records.filter((r): r is VerificationRecord => r.kind === "verification" && r.data.interventionId === data.interventionId && (r.purged ? r.data.beneficiaryRef === maskReference(data.householdRef.toUpperCase()) : r.data.beneficiaryRef.toUpperCase() === data.householdRef.toUpperCase()));
  const linkedVerification = device.records.find((r): r is VerificationRecord => r.kind === "verification" && r.localId === data.verificationLocalId);
  const cachedHistory = task?.householdHistory;
  const shownHistory = history ?? cachedHistory ?? null;

  const update = (patch: Partial<AssistanceData>) => {
    const next = { ...data, ...patch };
    setData(next);
    try {
      saveLocalRecord<"assistance">(record.localId, next);
    } catch {
      // Reported on explicit save.
    }
  };

  async function submit() {
    setShowErrors(true);
    if (issues.length) return;
    await run(
      "submit",
      async () => {
        saveLocalRecord<"assistance">(record.localId, data, `${data.quantity} × ${data.assistanceType}`);
        queueLocalRecord(record.localId);
        if (online) await syncNow({ only: [record.localId] });
      },
      online ? t("field.assistance.sent") : t("field.assistance.recordedLocally"),
    );
  }

  const track = assistanceTrack(record, sub);
  const header = (
    <PageHead
      title={task?.title ?? record.title}
      back={{ href: "/field/assistance", label: t("field.nav.assistance") }}
      badges={
        <>
          {record.central && <span className={styles.ref}>{record.central.ref}</span>}
          <StatusChip chip={recordChip(record, online, sub)} />
        </>
      }
    />
  );

  if (!editable) {
    return (
      <div className={styles.stack}>
        {header}
        <WhereTrack saved={track.saved} central={track.central} reviewed={track.reviewed} />
        <div aria-live="polite">{resolvedMessage && <Notice tone="success">{resolvedMessage}</Notice>}</div>
        <Notice tone={record.state === "synced" ? (sub?.status === "flagged" ? "warning" : "success") : "info"}>
          {record.state === "synced"
            ? sub?.reviewed
              ? t("field.assistance.explainReviewed", { ref: record.central?.ref ?? "" })
              : sub?.status === "flagged"
                ? t("field.assistance.explainFlagged", { ref: record.central?.ref ?? "" })
                : t("field.assistance.explainSynced", { ref: record.central?.ref ?? "" })
            : record.state === "pending"
              ? t("field.assistance.explainLocal")
              : record.state === "conflict"
                ? t("field.explain.conflict")
                : t("field.explain.syncing")}
        </Notice>
        {record.state === "syncing" && <SyncProgress record={record} />}
        {record.state === "failed" && <SyncErrorNotice record={record} />}
        {record.state === "conflict" && (
          <section className={styles.card} aria-labelledby="conflict-title">
            <h2 id="conflict-title" className={styles.cardTitle}>
              {t("field.conflict.title")}
            </h2>
            <ConflictResolver record={record} onResolved={(message) => setResolvedMessage(message)} />
          </section>
        )}
        <div className={styles.actions}>
          {record.state === "pending" && online && (
            <Button icon="refresh" disabled={running} onClick={() => void run("sync", () => syncNow({ only: [record.localId] }), t("field.sync.done"))}>
              {t("field.sync.syncThis")}
            </Button>
          )}
          {record.state === "pending" && (
            <Button variant="secondary" icon="pen" onClick={() => void run("withdraw", () => withdrawLocalRecord(record.localId))}>
              {t("field.reports.withdraw")}
            </Button>
          )}
          {record.state === "failed" && record.error?.retryable && (
            <Button icon="refresh" disabled={!online || running} onClick={() => void run("retry", () => retryLocalRecord(record.localId))}>
              {t("field.sync.retry")}
            </Button>
          )}
        </div>
        <section className={styles.card}>
          <KV
            items={[
              { label: t("field.assistance.household"), value: record.state === "synced" || record.purged ? data.householdRef : data.householdRef.toUpperCase() },
              { label: t("field.assistance.type"), value: data.assistanceType },
              { label: t("field.assistance.quantity"), value: `${data.quantity} ${data.unit}` },
              { label: t("field.assistance.value"), value: data.valueUsd ? `USD ${data.valueUsd}` : "—" },
              { label: t("field.assistance.deliveredAt"), value: data.deliveredAt ? formatDate(new Date(data.deliveredAt).toISOString(), true) : "—" },
              { label: t("field.common.location"), value: lk.servicePointName(data.servicePointId) },
              { label: t("field.assistance.evidence"), value: data.evidence.map((a) => a.name).join(", "), wide: true },
              ...(data.resolution ? [{ label: t("field.assistance.resolution"), value: `${t(data.resolution.choice === "keep_mine" ? "field.conflict.keepMine" : "field.conflict.useCentral")} — ${data.resolution.note}`, wide: true }] : []),
            ]}
          />
          {record.purged && <p className={`${styles.small} ${styles.muted}`}>{t("field.assistance.purged")}</p>}
        </section>
        <EarlierVersions record={record} />
        <details className={styles.card}>
          <summary className={styles.cardTitle}>{t("field.common.deviceHistory")}</summary>
          <LocalHistory record={record} />
        </details>
        <Feedback error={error} success={success} />
      </div>
    );
  }

  return (
    <div className={styles.stack}>
      {header}
      {record.state === "failed" && <SyncErrorNotice record={record} />}
      {data.resolution?.choice === "use_central" && <Notice tone="warning">{t("field.assistance.useCentralCheck")}</Notice>}
      {task && (
        <Notice tone="info" title={t("field.assistance.fromTask", { ref: task.ref })}>
          <p>{data.baseAllocation ? t("field.assistance.allocation", { quantity: data.baseAllocation.quantity, type: data.baseAllocation.assistanceType, unit: data.baseAllocation.unit, version: data.baseTaskVersion ?? 1 }) : task.instructions}</p>
        </Notice>
      )}
      <form className={styles.form} noValidate onSubmit={(e) => (e.preventDefault(), void submit())}>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{t("field.assistance.recipient")}</legend>
          <SelectField id="as-intervention" label={t("field.common.intervention")} value={data.interventionId} disabled={Boolean(task)} onChange={(e) => update({ interventionId: e.target.value, servicePointId: "" })}>
            {(snapshot?.interventions ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.ref} — {i.title}
              </option>
            ))}
          </SelectField>
          <TextField
            id="field-householdRef"
            label={t("field.assistance.household")}
            requiredLabel={t("common.requiredMarker")}
            hint={t("field.assistance.householdHint")}
            autoComplete="off"
            spellCheck={false}
            value={data.householdRef}
            readOnly={Boolean(task?.allocation)}
            error={err("householdRef")}
            onChange={(e) => (setHistory(null), update({ householdRef: normaliseRefInput(e.target.value), verificationLocalId: undefined }))}
          />
          <p className={styles.small}>
            {linkedVerification ? (
              <>
                {t("field.assistance.verification")}: <StatusChip chip={linkedVerification.state === "synced" ? verificationChip(linkedVerification.data.result?.status ?? "pending") : recordChip(linkedVerification, online)} />
              </>
            ) : verifications.length > 0 ? (
              <Button size="sm" variant="secondary" icon="link" onClick={() => update({ verificationLocalId: verifications[0].localId })}>
                {t("field.assistance.linkVerification")}
              </Button>
            ) : (
              <Link href={`/field/verify?ref=${encodeURIComponent(data.householdRef)}&intervention=${data.interventionId}`}>{t("field.assistance.verifyLink")}</Link>
            )}
          </p>
          {!linkedVerification && <p className={`${styles.small} ${styles.muted}`}>{t("field.assistance.verificationOptional")}</p>}
        </fieldset>

        <fieldset className={styles.fieldset} aria-labelledby="history-legend">
          <legend id="history-legend" className={styles.legend}>
            {t("field.assistance.historyTitle")}
          </legend>
          <p className={`${styles.small} ${styles.muted}`}>{t("field.assistance.historyNote")}</p>
          {shownHistory && shownHistory.length > 0 ? (
            <ul className={styles.timeline}>
              {shownHistory.map((h) => (
                <li key={h.ref}>
                  {h.quantity} × {h.assistanceType} ({h.unit}) · {formatDate(h.deliveredAt)} <span className={styles.ref}>{h.ref}</span>
                </li>
              ))}
            </ul>
          ) : shownHistory ? (
            <p className={styles.small}>{t("field.assistance.historyNone")}</p>
          ) : null}
          {!task?.allocation && (
            <Button
              size="sm"
              variant="secondary"
              icon="history"
              disabled={!online || Boolean(pending) || issues.includes("householdRef")}
              onClick={() => void run("history", async () => setHistory(await lookupOwnAssistanceHistory(data.householdRef)))}
            >
              {online ? t("field.assistance.checkHistory") : t("field.assistance.historyOffline")}
            </Button>
          )}
        </fieldset>

        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{t("field.assistance.delivery")}</legend>
          <TextField id="field-assistanceType" label={t("field.assistance.type")} requiredLabel={t("common.requiredMarker")} value={data.assistanceType} error={err("assistanceType")} onChange={(e) => update({ assistanceType: e.target.value })} />
          <div className={styles.row2}>
            <TextField id="field-quantity" type="number" inputMode="decimal" min={0} className={styles.bigInput} label={t("field.assistance.quantity")} requiredLabel={t("common.requiredMarker")} value={data.quantity} error={err("quantity")} onChange={(e) => update({ quantity: e.target.value })} />
            <TextField id="field-unit" label={t("field.assistance.unit")} requiredLabel={t("common.requiredMarker")} value={data.unit} error={err("unit")} onChange={(e) => update({ unit: e.target.value })} />
          </div>
          {data.baseAllocation && Number(data.quantity) !== data.baseAllocation.quantity && data.quantity.trim() !== "" && <Notice tone="info">{t("field.assistance.differsFromAllocation", { allocated: data.baseAllocation.quantity })}</Notice>}
          <TextField id="field-valueUsd" type="number" inputMode="decimal" min={0} label={t("field.assistance.value")} hint={t("common.optional")} value={data.valueUsd} error={err("valueUsd")} onChange={(e) => update({ valueUsd: e.target.value })} />
          <TextField id="field-deliveredAt" type="datetime-local" label={t("field.assistance.deliveredAt")} requiredLabel={t("common.requiredMarker")} value={data.deliveredAt} error={err("deliveredAt")} onChange={(e) => update({ deliveredAt: e.target.value })} />
          <SelectField id="field-servicePoint" label={t("field.common.location")} requiredLabel={t("common.requiredMarker")} value={data.servicePointId} error={err("servicePoint")} onChange={(e) => update({ servicePointId: e.target.value })}>
            <option value="">{t("field.common.choose")}</option>
            {points.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
          <TextAreaField id="as-note" label={t("field.assistance.note")} hint={t("common.optional")} value={data.note} onChange={(e) => update({ note: e.target.value })} />
        </fieldset>

        <AttachmentPicker label={t("field.assistance.evidence")} hint={t("field.assistance.evidenceHint")} items={data.evidence} onChange={(evidence) => update({ evidence })} prefix={`dev-${record.localId}`} />

        <Notice tone="info">{t("field.assistance.duplicateNote")}</Notice>
        <p className={`${styles.small} ${styles.muted}`}>{online ? t("field.assistance.submitOnlineNote") : t("field.assistance.submitOfflineNote")}</p>
        <div className={styles.stickyActions}>
          <Button type="submit" icon={online ? "send" : "smartphone"} disabled={Boolean(pending) || running} aria-busy={pending === "submit" || undefined}>
            {pending === "submit" ? t("field.sync.running") : online ? t("field.assistance.submitOnline") : t("field.assistance.submitOffline")}
          </Button>
        </div>
      </form>
      <Feedback error={error} success={success} />
      {!record.central && (
        <div className={styles.card}>
          {!confirmDiscard ? (
            <Button variant="ghost" icon="trash" onClick={() => setConfirmDiscard(true)}>
              {t("field.assistance.discard")}
            </Button>
          ) : (
            <div className={styles.actions}>
              <span>{t("field.reports.discardConfirm")}</span>
              <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
                {t("common.cancel")}
              </Button>
              <Button variant="danger" icon="trash" onClick={() => void run("discard", async () => (await discardLocalRecord(record.localId), router.push("/field/assistance")))}>
                {t("field.reports.discardYes")}
              </Button>
            </div>
          )}
        </div>
      )}
      <EarlierVersions record={record} />
    </div>
  );
}
