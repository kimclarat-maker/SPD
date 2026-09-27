"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { CaseServiceType, FieldIssueCategory, Priority } from "@/lib/types";
import type { FieldSubmission } from "@/lib/services/fieldWork";
import { routeFor } from "@/lib/services/fieldSync";
import { useConnectivity } from "@/lib/field/connectivity";
import { createLocalRecord, discardLocalRecord, issueIssues, queueLocalRecord, retryLocalRecord, saveLocalRecord, syncNow, withdrawLocalRecord, type IssueField } from "@/lib/field/client";
import type { IssueData, LocalRecordOf } from "@/lib/field/device";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Notice } from "@/components/ui/Notice";
import { PriorityBadge } from "@/components/portal/StatusBadge";
import { useDevice, useFieldAction, useFieldData, useSyncRunning } from "../FieldData";
import { AttachmentPicker, KV, LocalHistory, PageHead, recordChip, SourceNote, StatusChip, submissionChip, WhereTrack } from "../FieldBits";
import { useLookups, useParam } from "../lookup";
import { Feedback } from "./ReportViews";
import { SyncErrorNotice, SyncProgress } from "./SyncView";
import styles from "../field.module.css";

type IssueRecord = LocalRecordOf<"issue">;
type IssueSub = Extract<FieldSubmission, { kind: "issue" }>;

export const CATEGORIES: FieldIssueCategory[] = ["service_gap", "safeguarding", "infrastructure", "failed_distribution", "follow_up", "referral"];
const CATEGORY_ICON: Record<FieldIssueCategory, IconName> = {
  service_gap: "alertCircle",
  safeguarding: "shield",
  infrastructure: "building",
  failed_distribution: "xCircle",
  follow_up: "flag",
  referral: "send",
};
const SERVICE_TYPES: CaseServiceType[] = ["inquiry", "registration", "family_attestation", "asylum_certificate", "refugee_id", "rsd_interview", "renewal", "verification", "document_other"];

export function IssuesView() {
  const { t, formatDate } = useI18n();
  const { snapshot } = useFieldData();
  const device = useDevice();
  const { online } = useConnectivity();
  const lk = useLookups();
  if (!snapshot) return <SourceNote />;
  const can = (c: FieldIssueCategory) => snapshot.account.permissions.includes(c === "referral" ? "referrals.create" : "issues.raise");
  const records = device.records.filter((r): r is IssueRecord => r.kind === "issue");
  const centralOnly = snapshot.submissions.filter((s): s is IssueSub => s.kind === "issue" && !records.some((r) => r.localId === s.clientRecordId || r.central?.id === s.id));

  return (
    <div className={styles.stack}>
      <PageHead title={t("field.issues.title")} intro={t("field.issues.intro")} />
      <SourceNote />
      <Notice tone="warning" title={t("field.issues.urgentTitle")}>
        <p>{t("field.issues.urgentBody")}</p>
      </Notice>
      <section className={styles.card} aria-labelledby="raise-title">
        <h2 id="raise-title" className={styles.cardTitle}>
          {t("field.issues.raise")}
        </h2>
        <div className={styles.choiceList}>
          {CATEGORIES.filter(can).map((c) => (
            <Link key={c} href={`/field/issue?new=${c}`} className={styles.choice} style={{ textDecoration: "none", color: "inherit" }}>
              <Icon name={CATEGORY_ICON[c]} size={20} />
              <span>
                {t(`field.issues.categories.${c}` as MessageKey)}
                <br />
                <span className={`${styles.small} ${styles.muted}`}>{t(`field.issues.categoryHints.${c}` as MessageKey)}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className={styles.stack} aria-labelledby="my-issues">
        <h2 id="my-issues" className={styles.cardTitle}>
          {t("field.issues.mine")}
        </h2>
        {records.length + centralOnly.length === 0 && <p className={styles.muted}>{t("field.issues.none")}</p>}
        <ul className={styles.list}>
          {records.map((r) => (
            <li key={r.localId}>
              <Link href={`/field/issue?id=${r.localId}`} className={styles.item}>
                <span className={styles.itemTop}>
                  <span className={styles.itemTitle}>
                    <Icon name={CATEGORY_ICON[r.data.category]} size={18} /> {t(`field.issues.categories.${r.data.category}` as MessageKey)}
                  </span>
                  <StatusChip chip={recordChip(r, online, lk.submissionFor(r))} />
                </span>
                <span className={styles.itemMeta}>
                  {r.central && <span className={styles.ref}>{r.central.ref}</span>}
                  <PriorityBadge priority={r.data.priority} />
                  <span>{formatDate(r.updatedAt, true)}</span>
                </span>
              </Link>
            </li>
          ))}
          {centralOnly.map((s) => (
            <li key={s.id}>
              <Link href={`/field/issue?central=${s.id}`} className={styles.item}>
                <span className={styles.itemTop}>
                  <span className={styles.itemTitle}>
                    <Icon name={CATEGORY_ICON[s.category]} size={18} /> {t(`field.issues.categories.${s.category}` as MessageKey)}
                  </span>
                  <StatusChip chip={submissionChip(s)} />
                </span>
                <span className={styles.itemMeta}>
                  <span className={styles.ref}>{s.ref}</span>
                  <PriorityBadge priority={s.priority} />
                  <span>{s.routedTo}</span>
                  <span>{formatDate(s.raisedAt, true)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function CentralStatus({ sub }: { sub: IssueSub }) {
  const { t, formatDate } = useI18n();
  return (
    <section className={styles.card} aria-labelledby="issue-status">
      <h2 id="issue-status" className={styles.cardTitle}>
        {t("field.issues.statusTitle")}
      </h2>
      <KV
        items={[
          { label: t("field.common.reference"), value: <span className={styles.ref}>{sub.ref}</span> },
          { label: t("field.issues.routedTo"), value: sub.routedTo },
          ...(sub.referralStatus ? [{ label: t("field.issues.referralStatus"), value: t(`portal.status.case.${sub.referralStatus}` as MessageKey), wide: true }] : []),
        ]}
      />
      {sub.referralStatus && <p className={`${styles.small} ${styles.muted}`}>{t("field.issues.referralNote")}</p>}
      {sub.restricted && <p className={`${styles.small} ${styles.muted}`}>{t("field.issues.restrictedNote")}</p>}
      <ul className={styles.timeline}>
        {[...sub.updates].reverse().map((u, i) => (
          <li key={i}>
            <strong>{t(`field.issueStatus.${u.status}` as MessageKey)}</strong>
            {u.text && <span>{u.text}</span>}
            <span className={`${styles.small} ${styles.muted}`}>
              {u.by} · {formatDate(u.at, true)}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function IssueView() {
  const { t } = useI18n();
  const id = useParam("id");
  const newCategory = useParam("new") as FieldIssueCategory | null;
  const interventionParam = useParam("intervention");
  const central = useParam("central");
  const router = useRouter();
  const device = useDevice();
  const { snapshot } = useFieldData();
  const lk = useLookups();
  const { run, error } = useFieldAction();
  const record = device.records.find((r): r is IssueRecord => r.kind === "issue" && (r.localId === id || (Boolean(central) && (r.central?.id === central || lk.submission(central ?? "")?.clientRecordId === r.localId))));

  useEffect(() => {
    if (id || central || !newCategory || !snapshot || !CATEGORIES.includes(newCategory)) return;
    void run("create", () => {
      const intervention = snapshot.interventions.find((i) => i.id === interventionParam);
      const created = createLocalRecord("issue", t(`field.issues.categories.${newCategory}` as MessageKey), {
        category: newCategory,
        priority: newCategory === "safeguarding" ? "high" : "medium",
        interventionId: intervention?.id ?? "",
        servicePointId: "",
        locationNote: "",
        description: "",
        evidence: [],
      } satisfies IssueData);
      router.replace(`/field/issue?id=${created}`);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, central, newCategory, snapshot]);

  if (!snapshot) return <SourceNote />;
  if (record) return <IssueForm key={record.localId} record={record} />;
  const sub = central ? lk.submission(central) : undefined;
  if (sub && sub.kind === "issue") {
    return (
      <div className={styles.stack}>
        <PageHead title={t(`field.issues.categories.${sub.category}` as MessageKey)} back={{ href: "/field/issues", label: t("field.nav.issues") }} badges={<StatusChip chip={submissionChip(sub)} />} />
        <SourceNote />
        <WhereTrack saved central reviewed={sub.status === "resolved" || sub.status === "closed"} reviewedLabel="field.track.resolved" />
        <CentralStatus sub={sub} />
      </div>
    );
  }
  return (
    <div className={styles.stack}>
      <PageHead title={t("field.issues.title")} back={{ href: "/field/issues", label: t("field.nav.issues") }} />
      {error ? <Notice tone="error">{error}</Notice> : id ? <Notice tone="warning">{t("field.issues.notOnDevice")}</Notice> : <p role="status">{t("common.loading")}</p>}
    </div>
  );
}

function IssueForm({ record }: { record: IssueRecord }) {
  const { t } = useI18n();
  const router = useRouter();
  const { online } = useConnectivity();
  const { snapshot } = useFieldData();
  const lk = useLookups();
  const running = useSyncRunning();
  const { run, pending, error, success } = useFieldAction();
  const sub = lk.submissionFor(record) as IssueSub | undefined;
  const editable = record.state === "draft" || (record.state === "failed" && !record.error?.retryable);
  const [data, setData] = useState<IssueData>(record.data);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const issues = issueIssues(data);
  const err = (f: IssueField) => (showErrors && issues.includes(f) ? t(`field.issues.errors.${f}` as MessageKey) : undefined);
  const settlementId = lk.intervention(data.interventionId)?.settlementId ?? snapshot?.settlements[0]?.id;
  const points = (snapshot?.servicePoints ?? []).filter((sp) => sp.settlementId === settlementId);
  const route = routeFor(data.category, lk.settlementName(settlementId), snapshot?.account.organisation.name ?? "");
  const safeguarding = data.category === "safeguarding";
  const referral = data.category === "referral";
  const can = (c: FieldIssueCategory) => Boolean(snapshot?.account.permissions.includes(c === "referral" ? "referrals.create" : "issues.raise"));

  const update = (patch: Partial<IssueData>) => {
    const next = { ...data, ...patch };
    setData(next);
    try {
      saveLocalRecord<"issue">(record.localId, next, t(`field.issues.categories.${next.category}` as MessageKey));
    } catch {
      // Reported on explicit submit.
    }
  };

  async function submit() {
    setShowErrors(true);
    if (issues.length) return;
    await run(
      "submit",
      async () => {
        saveLocalRecord<"issue">(record.localId, data);
        queueLocalRecord(record.localId);
        if (online) await syncNow({ only: [record.localId] });
      },
      online ? t("field.issues.sent") : t("field.issues.savedOffline"),
    );
  }

  const header = (
    <PageHead
      title={t(`field.issues.categories.${data.category}` as MessageKey)}
      back={{ href: "/field/issues", label: t("field.nav.issues") }}
      badges={
        <>
          {record.central && <span className={styles.ref}>{record.central.ref}</span>}
          <StatusChip chip={recordChip(record, online, sub)} />
          {(safeguarding || referral) && (
            <Badge tone="neutral" icon="lock">
              {t("field.issues.restricted")}
            </Badge>
          )}
        </>
      }
    />
  );

  if (!editable) {
    return (
      <div className={styles.stack}>
        {header}
        <WhereTrack saved central={record.state === "synced"} reviewed={sub?.status === "resolved" || sub?.status === "closed"} reviewedLabel="field.track.resolved" />
        {record.state === "pending" && <p>{online ? t("field.explain.readyToSync") : t("field.explain.savedOffline")}</p>}
        {record.state === "syncing" && <SyncProgress record={record} />}
        {record.state === "failed" && <SyncErrorNotice record={record} />}
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
        {sub ? (
          <CentralStatus sub={sub} />
        ) : (
          <section className={styles.card}>
            <KV items={[{ label: t("field.issues.routedTo"), value: route.team }]} />
          </section>
        )}
        <section className={styles.card}>
          <KV
            items={[
              { label: t("field.issues.priority"), value: <PriorityBadge priority={data.priority} /> },
              { label: t("field.common.location"), value: `${lk.servicePointName(data.servicePointId)}${data.locationNote ? ` · ${data.locationNote}` : ""}` },
              ...(referral && data.serviceType ? [{ label: t("field.issues.serviceType"), value: t(`portal.cases.types.${data.serviceType}` as MessageKey) }] : []),
              { label: t("field.issues.description"), value: record.purged ? t("field.issues.purged") : data.description, wide: true },
              { label: t("field.issues.evidence"), value: data.evidence.map((a) => a.name).join(", "), wide: true },
            ]}
          />
        </section>
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
      {safeguarding && (
        <Notice tone="warning" title={t("field.issues.safeguardingTitle")}>
          <p>{t("field.issues.safeguardingBody")}</p>
        </Notice>
      )}
      {referral && <Notice tone="info">{t("field.issues.referralIntro")}</Notice>}
      <form className={styles.form} noValidate onSubmit={(e) => (e.preventDefault(), void submit())}>
        <SelectField id="is-category" label={t("field.issues.category")} value={data.category} onChange={(e) => update({ category: e.target.value as FieldIssueCategory })}>
          {CATEGORIES.filter(can).map((c) => (
            <option key={c} value={c}>
              {t(`field.issues.categories.${c}` as MessageKey)}
            </option>
          ))}
        </SelectField>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>{t("field.issues.priority")}</legend>
          <div className={styles.choiceList}>
            {(["high", "medium", "low"] as Priority[]).map((p) => (
              <label key={p} className={styles.choice}>
                <input type="radio" name="is-priority" checked={data.priority === p} onChange={() => update({ priority: p })} />
                {t(`portal.status.priority.${p}` as MessageKey)}
              </label>
            ))}
          </div>
        </fieldset>
        {referral && (
          <SelectField id="field-serviceType" label={t("field.issues.serviceType")} requiredLabel={t("common.requiredMarker")} value={data.serviceType ?? ""} error={err("serviceType")} onChange={(e) => update({ serviceType: (e.target.value || undefined) as CaseServiceType | undefined })}>
            <option value="">{t("field.common.choose")}</option>
            {SERVICE_TYPES.map((s) => (
              <option key={s} value={s}>
                {t(`portal.cases.types.${s}` as MessageKey)}
              </option>
            ))}
          </SelectField>
        )}
        <SelectField id="is-intervention" label={t("field.common.intervention")} hint={t("common.optional")} value={data.interventionId} onChange={(e) => update({ interventionId: e.target.value })}>
          <option value="">{t("field.issues.noIntervention")}</option>
          {(snapshot?.interventions ?? []).map((i) => (
            <option key={i.id} value={i.id}>
              {i.ref} — {i.title}
            </option>
          ))}
        </SelectField>
        <div className={styles.row2}>
          <SelectField id="is-location" label={t("field.common.location")} value={data.servicePointId} onChange={(e) => update({ servicePointId: e.target.value })}>
            <option value="">{t("field.issues.noServicePoint")}</option>
            {points.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </SelectField>
          <TextField id="is-location-note" label={t("field.issues.locationNote")} hint={t("field.issues.locationNoteHint")} value={data.locationNote} onChange={(e) => update({ locationNote: e.target.value })} />
        </div>
        <TextAreaField
          id="field-description"
          rows={5}
          label={t("field.issues.description")}
          requiredLabel={t("common.requiredMarker")}
          hint={safeguarding ? t("field.issues.descriptionSafeguarding") : referral ? t("field.issues.descriptionReferral") : t("field.issues.descriptionHint")}
          value={data.description}
          error={err("description")}
          onChange={(e) => update({ description: e.target.value })}
        />
        {referral && (
          <>
            <label className={styles.checkRow} id="field-consent">
              <input type="checkbox" checked={Boolean(data.consent)} onChange={(e) => update({ consent: e.target.checked })} />
              <span>{t("field.issues.referralConsent")}</span>
            </label>
            {err("consent") && <p className={styles.small} style={{ color: "var(--color-error)" }}>{err("consent")}</p>}
          </>
        )}
        <AttachmentPicker label={t("field.issues.evidence")} hint={safeguarding || referral ? t("field.issues.evidenceRestricted") : t("field.issues.evidenceHint")} items={data.evidence} onChange={(evidence) => update({ evidence })} prefix={`dev-${record.localId}`} />
        <Notice tone="info">{t("field.issues.routing", { team: route.team })}</Notice>
        <p className={`${styles.small} ${styles.muted}`}>{online ? t("field.issues.submitOnlineNote") : t("field.issues.submitOfflineNote")}</p>
        <div className={styles.stickyActions}>
          <Button type="submit" icon={online ? "send" : "smartphone"} disabled={Boolean(pending) || running}>
            {pending === "submit" ? t("field.sync.running") : online ? t("field.issues.submitOnline") : t("field.issues.submitOffline")}
          </Button>
        </div>
      </form>
      <Feedback error={error} success={success} />
      {!record.central &&
        (!confirmDiscard ? (
          <Button variant="ghost" icon="trash" onClick={() => setConfirmDiscard(true)}>
            {t("field.issues.discard")}
          </Button>
        ) : (
          <div className={styles.actions}>
            <span>{t("field.reports.discardConfirm")}</span>
            <Button variant="secondary" onClick={() => setConfirmDiscard(false)}>
              {t("common.cancel")}
            </Button>
            <Button variant="danger" icon="trash" onClick={() => void run("discard", async () => (await discardLocalRecord(record.localId), router.push("/field/issues")))}>
              {t("field.reports.discardYes")}
            </Button>
          </div>
        ))}
      <ButtonLink variant="ghost" href="/field/issues">
        {t("field.issues.backToList")}
      </ButtonLink>
    </div>
  );
}
