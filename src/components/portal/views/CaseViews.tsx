"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { CaseServiceType, CaseStatus } from "@/lib/types";
import {
  addInternalNote,
  assignCase,
  claimCase,
  closeCase,
  getCase,
  listCases,
  requestCaseAccess,
  requestInformation,
  resolveCase,
  scheduleAppointment,
  sendRequesterMessage,
  setEscalation,
  simulateRequesterReply,
  startCase,
  type CaseRow,
} from "@/lib/services/cases";
import { caseworkerTeam } from "@/lib/services/caseworkerContext";
import type { RecordFilters } from "@/lib/services/filters";
import { settlementName } from "@/lib/services/lookup";
import { useCan, useErrorMessage, useServiceAction, useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { PriorityBadge, StatusBadge, statusLabelKey, useStatusOptions } from "@/components/portal/StatusBadge";
import { FilterBar, useRecordFilters } from "@/components/portal/FilterBar";
import { FieldGrid, RecordPage, RecordSection, type RecordAction } from "@/components/portal/RecordPage";
import { CommentThread, ErrorState, Masked, PermissionDenied, RecordNotFound, SimulatedTag, type StageState } from "@/components/portal/RecordBits";
import { SelectField, TextAreaField, TextField } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import styles from "@/components/portal/portal.module.css";

const statuses: CaseStatus[] = ["received", "assigned", "in_progress", "awaiting_info", "resolved", "closed"];
const serviceTypes: CaseServiceType[] = ["inquiry", "registration", "family_attestation", "asylum_certificate", "refugee_id", "rsd_interview", "renewal", "verification", "document_other"];

export function CasesListView({ initialFilters, initialStatus }: { initialFilters: RecordFilters; initialStatus?: string }) {
  const { t, formatDate } = useI18n();
  const toMessage = useErrorMessage();
  const [filters, setFilters] = useRecordFilters(initialFilters);
  const { data, loading, error, forbidden } = useServiceQuery(() => listCases(filters), [JSON.stringify(filters)]);
  const statusOptions = useStatusOptions("case", statuses);

  if (forbidden) {
    return (
      <>
        <PageHeader title={t("portal.cases.title")} />
        <PermissionDenied />
      </>
    );
  }

  return (
    <>
      <PageHeader title={t("portal.cases.title")} intro={t("portal.cases.intro")} />
      <FilterBar value={filters} onChange={setFilters} fields={["period", "district", "settlement"]} />
      <RecordTable<CaseRow>
        rows={data}
        loading={loading}
        error={error ? toMessage(error) : null}
        caption={t("portal.cases.title")}
        initialStatus={initialStatus}
        searchText={(c) => `${c.ref} ${t(`portal.cases.types.${c.serviceType}` as MessageKey)} ${c.assignedTeam ?? ""} ${settlementName(c.settlementId)}`}
        statusOptions={statusOptions}
        filters={[
          { key: "type", label: t("portal.cases.serviceType"), options: serviceTypes.map((s) => ({ value: s, label: t(`portal.cases.types.${s}` as MessageKey) })), test: (c, v) => c.serviceType === v },
          {
            key: "flag",
            label: t("portal.cases.flags"),
            options: [
              { value: "escalated", label: t("portal.cases.escalated") },
              { value: "overdue", label: t("portal.common.overdue") },
              { value: "unassigned", label: t("portal.common.unassigned") },
            ],
            test: (c, v) => (v === "escalated" ? c.escalated : v === "overdue" ? c.overdue : !c.assignedTeam),
          },
        ]}
        columns={[
          {
            key: "ref",
            header: t("portal.table.reference"),
            primary: true,
            sortValue: (c) => c.ref,
            render: (c) => (
              <>
                <Link href={`/portal/cases/${c.id}`} className={`${styles.recordLink} ${styles.monoInline}`}>
                  {c.ref}
                </Link>
                {c.escalated && (
                  <span className={styles.warnLine}>
                    <Badge tone="warning" icon="flag">
                      {t("portal.cases.escalated")}
                    </Badge>
                  </span>
                )}
              </>
            ),
          },
          { key: "type", header: t("portal.cases.serviceType"), sortValue: (c) => c.serviceType, render: (c) => t(`portal.cases.types.${c.serviceType}` as MessageKey) },
          { key: "settlement", header: t("portal.filters.settlement"), render: (c) => settlementName(c.settlementId) },
          { key: "priority", header: t("portal.cases.priority"), sortValue: (c) => ({ high: 0, medium: 1, low: 2 })[c.priority], render: (c) => <PriorityBadge priority={c.priority} /> },
          { key: "team", header: t("portal.cases.team"), render: (c) => c.assignedTeam ?? <span className={styles.muted}>{t("portal.common.unassigned")}</span> },
          { key: "received", header: t("portal.cases.received"), sortValue: (c) => c.receivedAt, render: (c) => formatDate(c.receivedAt) },
          {
            key: "due",
            header: t("portal.cases.due"),
            sortValue: (c) => c.dueAt,
            render: (c) => (
              <>
                {formatDate(c.dueAt)}
                {c.overdue && (
                  <span className={styles.warnLine}>
                    <Badge tone="error" icon="clock">
                      {t("portal.common.overdue")}
                    </Badge>
                  </span>
                )}
              </>
            ),
          },
          { key: "status", header: t("portal.table.status"), sortValue: (c) => statuses.indexOf(c.status), render: (c) => <StatusBadge entity="case" status={c.status} /> },
        ]}
      />
    </>
  );
}

function caseStages(status: CaseStatus, t: (k: MessageKey) => string): { key: string; label: string; state: StageState }[] {
  const index = statuses.indexOf(status);
  return statuses.map((s, i) => {
    let state: StageState = i < index ? "done" : i === index ? "current" : "upcoming";
    if (s === "awaiting_info" && index > i && status !== "awaiting_info") state = "skipped";
    if (s === "closed" && status === "closed") state = "done";
    return { key: s, label: t(statusLabelKey("case", s)), state };
  });
}

export function CaseDetailView({ id, backHref = "/portal/cases" }: { id: string; backHref?: string }) {
  const { t, formatDate } = useI18n();
  const fieldId = useId();
  const can = useCan();
  const toMessage = useErrorMessage();
  const { data, notFound, forbidden, error } = useServiceQuery(() => getCase(id), [id]);
  const msg = useServiceAction();
  const myTeam = caseworkerTeam();
  const [team, setTeam] = useState("");
  const [teamError, setTeamError] = useState<string>();
  const [message, setMessage] = useState("");
  const [messageError, setMessageError] = useState<string>();
  const [appt, setAppt] = useState({ kind: "", at: "", location: "" });
  const [apptError, setApptError] = useState<string>();

  if (forbidden) return <PermissionDenied />;
  if (notFound) return <RecordNotFound backHref={backHref} />;
  if (error) return <ErrorState message={toMessage(error)} />;
  if (!data) return <LoadingState label={t("common.loading")} />;

  const { serviceCase: c, overdue, hasAccess, teams } = data;
  const canAssign = can("case.assign");
  const openCase = ["received", "assigned", "in_progress", "awaiting_info"].includes(c.status);
  const chosenTeam = team || c.assignedTeam || "";
  const canClaim = openCase && !c.assignedTo && Boolean(myTeam) && c.assignedTeam === myTeam;

  const actions: RecordAction[] = [];
  if (canClaim) {
    actions.push({ key: "claim", label: t("portal.cases.claim"), tone: "primary", icon: "user", noNote: true, denied: !canAssign, run: () => claimCase(c.id) });
  }
  if (!hasAccess) {
    actions.push({
      key: "access",
      label: t("portal.cases.requestAccess"),
      icon: "key",
      requiresNote: true,
      denied: !canAssign,
      noteLabel: t("portal.cases.accessReason"),
      hint: t("portal.cases.accessHint"),
      success: t("portal.cases.accessGranted"),
      run: (note) => requestCaseAccess(c.id, note),
    });
  }
  if (openCase) {
    actions.push({
      key: "assign",
      label: c.assignedTeam ? t("portal.cases.reassign") : t("portal.cases.assign"),
      tone: c.status === "received" ? "primary" : "neutral",
      icon: "user",
      denied: !canAssign,
      fields: (
        <SelectField id={`${fieldId}-team`} label={t("portal.cases.team")} error={teamError} value={chosenTeam} onChange={(e) => (setTeam(e.target.value), setTeamError(undefined))}>
          <option value="">{t("portal.common.choose")}</option>
          {teams.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </SelectField>
      ),
      validate: () => (chosenTeam ? true : (setTeamError(t("portal.validation.chooseOne")), false)),
      run: (note) => assignCase(c.id, chosenTeam, note),
    });
  }
  if (c.status === "assigned") actions.push({ key: "start", label: t("portal.cases.start"), tone: "primary", icon: "refresh", noNote: true, denied: !canAssign, run: () => startCase(c.id) });
  if (c.status === "assigned" || c.status === "in_progress") {
    actions.push({
      key: "info",
      label: t("portal.cases.requestInfo"),
      icon: "messageSquare",
      requiresNote: true,
      denied: !canAssign,
      noteLabel: t("portal.cases.messageToRequester"),
      hint: (
        <>
          <SimulatedTag /> {t("portal.cases.requestInfoHint")}
        </>
      ),
      run: (note) => requestInformation(c.id, note),
    });
    actions.push({ key: "resolve", label: t("portal.cases.resolve"), tone: "primary", icon: "checkCircle", requiresNote: true, denied: !canAssign, noteLabel: t("portal.cases.resolution"), run: (note) => resolveCase(c.id, note) });
  }
  if (c.status === "awaiting_info") {
    actions.push({ key: "reply", label: t("portal.cases.simulateReply"), icon: "inbox", noNote: true, hint: t("common.simulatedLong"), run: () => simulateRequesterReply(c.id) });
  }
  if (c.status === "resolved") actions.push({ key: "close", label: t("portal.cases.close"), icon: "lock", denied: !canAssign, run: (note) => closeCase(c.id, note) });
  if (openCase) {
    actions.push(
      c.escalated
        ? { key: "deescalate", label: t("portal.cases.deescalate"), icon: "minusCircle", requiresNote: true, denied: !canAssign, run: (note) => setEscalation(c.id, false, note) }
        : { key: "escalate", label: t("portal.cases.escalate"), tone: "warning", icon: "flag", requiresNote: true, denied: !canAssign, run: (note) => setEscalation(c.id, true, note) },
    );
  }

  return (
    <RecordPage
      back={{ href: backHref, label: t("portal.cases.back") }}
      eyebrow={`${t("portal.entity.case")} · ${t(`portal.cases.types.${c.serviceType}` as MessageKey)}`}
      title={c.ref}
      mono
      badges={
        <>
          <StatusBadge entity="case" status={c.status} />
          <PriorityBadge priority={c.priority} />
          {c.escalated && (
            <Badge tone="warning" icon="flag">
              {t("portal.cases.escalated")}
            </Badge>
          )}
          {overdue && (
            <Badge tone="error" icon="clock">
              {t("portal.common.overdue")}
            </Badge>
          )}
        </>
      }
      meta={[
        settlementName(c.settlementId),
        c.assignedTeam ?? t("portal.common.unassigned"),
        c.assignedTo && t("portal.cases.claimedBy", { name: c.assignedTo }),
        `${t("portal.cases.received")} ${formatDate(c.receivedAt)}`,
        `${t("portal.cases.due")} ${formatDate(c.dueAt)}`,
      ]
        .filter(Boolean)
        .join(" · ")}
      stages={caseStages(c.status, t)}
      notices={
        <>
          <Notice tone="info" title={t("portal.cases.nextAction")}>
            {c.nextAction}
          </Notice>
          {!hasAccess && <Notice tone="warning">{t("portal.cases.maskedNotice")}</Notice>}
        </>
      }
      actions={actions}
      timelineId={c.id}
      tabs={[
        {
          id: "request",
          label: t("portal.cases.request"),
          content: (
            <>
              <RecordSection title={t("portal.cases.request")}>
                <p>{c.summary}</p>
                <FieldGrid
                  items={[
                    { label: t("portal.cases.serviceType"), value: t(`portal.cases.types.${c.serviceType}` as MessageKey) },
                    { label: t("portal.cases.channel"), value: c.channel },
                    { label: t("portal.filters.settlement"), value: settlementName(c.settlementId) },
                    { label: t("portal.cases.team"), value: c.assignedTeam ?? t("portal.common.unassigned") },
                    { label: t("portal.cases.caseworker"), value: c.assignedTo ?? t("portal.common.unassigned") },
                    { label: t("portal.cases.received"), value: formatDate(c.receivedAt, true) },
                    { label: t("portal.cases.due"), value: formatDate(c.dueAt, true) },
                  ]}
                />
                {c.resolution && (
                  <div>
                    <p className={styles.subheading}>{t("portal.cases.resolution")}</p>
                    <p className={styles.quote}>{c.resolution}</p>
                  </div>
                )}
              </RecordSection>
              <RecordSection title={t("portal.cases.requester")} actions={!hasAccess ? <Badge tone="neutral" icon="lock">{t("portal.detail.restricted")}</Badge> : <Badge tone="warning" icon="eye">{t("portal.cases.accessActive")}</Badge>}>
                <FieldGrid
                  items={[
                    { label: t("portal.cases.requesterName"), value: <Masked value={c.requester.name} masked={!hasAccess} /> },
                    { label: t("portal.cases.individualId"), value: <Masked value={c.requester.individualId} masked={!hasAccess} /> },
                    { label: t("portal.cases.phone"), value: <Masked value={c.requester.phone} masked={!hasAccess} /> },
                    { label: t("portal.cases.household"), value: <Masked value={c.requester.household} masked={!hasAccess} /> },
                  ]}
                />
                <p className={`${styles.small} ${styles.muted}`}>{hasAccess ? t("portal.cases.accessLogged") : t("portal.detail.restrictedNote")}</p>
              </RecordSection>
            </>
          ),
        },
        {
          id: "documents",
          label: t("portal.cases.documents"),
          count: c.documents.length,
          content: (
            <RecordSection title={t("portal.cases.documents")}>
              {c.documents.length === 0 ? (
                <p className={styles.muted}>{t("portal.cases.noDocuments")}</p>
              ) : (
                <ul className={styles.rowList}>
                  {c.documents.map((d) => (
                    <li key={d.id} className={styles.rowItem}>
                      <span className={styles.rowMain}>{d.name}</span>
                      <Badge tone={d.status === "issued" ? "success" : d.status === "authorised" ? "info" : "warning"}>{t(`portal.cases.docStatus.${d.status}` as MessageKey)}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </RecordSection>
          ),
        },
        {
          id: "appointments",
          label: t("portal.cases.appointments"),
          count: c.appointments.length,
          content: (
            <RecordSection title={t("portal.cases.appointments")}>
              {c.appointments.length === 0 ? (
                <p className={styles.muted}>{t("portal.cases.noAppointments")}</p>
              ) : (
                <ul className={styles.rowList}>
                  {c.appointments.map((a) => (
                    <li key={a.id} className={styles.rowItem}>
                      <span className={styles.rowMain}>
                        <span>{a.kind}</span>
                        <span className={styles.ref}>
                          {formatDate(a.at, true)} · {a.location}
                        </span>
                      </span>
                      <Badge tone={a.status === "scheduled" ? "info" : a.status === "attended" ? "success" : "warning"} icon="calendar">
                        {t(`portal.cases.appointmentStatus.${a.status}` as MessageKey)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              {openCase && canAssign && (
                <form
                  className={styles.inlineGrid}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!appt.kind.trim() || !appt.at || !appt.location.trim()) {
                      setApptError(t("portal.validation.allRequired"));
                      return;
                    }
                    setApptError(undefined);
                    if (await msg.run("appt", () => scheduleAppointment(c.id, appt.kind, appt.at, appt.location), t("portal.cases.appointmentScheduled"))) setAppt({ kind: "", at: "", location: "" });
                  }}
                >
                  <p className={styles.subheading}>{t("portal.cases.schedule")}</p>
                  <TextField id={`${fieldId}-ak`} label={t("portal.cases.appointmentKind")} value={appt.kind} onChange={(e) => setAppt({ ...appt, kind: e.target.value })} />
                  <TextField id={`${fieldId}-at`} type="datetime-local" label={t("portal.cases.appointmentAt")} value={appt.at} onChange={(e) => setAppt({ ...appt, at: e.target.value })} />
                  <TextField id={`${fieldId}-al`} label={t("portal.cases.appointmentLocation")} value={appt.location} onChange={(e) => setAppt({ ...appt, location: e.target.value })} />
                  {apptError && (
                    <Notice tone="error" role="alert">
                      {apptError}
                    </Notice>
                  )}
                  <div>
                    <Button type="submit" variant="secondary" icon="calendar" disabled={Boolean(msg.pending)}>
                      {t("portal.cases.schedule")}
                    </Button>
                  </div>
                </form>
              )}
            </RecordSection>
          ),
        },
        {
          id: "messages",
          label: t("portal.cases.messages"),
          count: c.messages.length,
          content: (
            <RecordSection title={t("portal.cases.messages")} actions={<SimulatedTag />}>
              <p className={`${styles.small} ${styles.muted}`}>{t("portal.cases.messagesIntro")}</p>
              {c.messages.length === 0 ? (
                <p className={styles.muted}>{t("portal.cases.noMessages")}</p>
              ) : (
                <ul className={styles.messageList}>
                  {c.messages.map((m) => (
                    <li key={m.id} className={`${styles.message} ${m.direction === "out" ? styles.messageOut : ""}`}>
                      <p className={styles.commentMeta}>
                        {m.direction === "out" ? t("portal.cases.toRequester") : t("portal.cases.fromRequester")} · {t(`portal.cases.channels.${m.channel}` as MessageKey)} ·{" "}
                        <time dateTime={m.at}>{formatDate(m.at, true)}</time>
                      </p>
                      <p>{m.text}</p>
                    </li>
                  ))}
                </ul>
              )}
              {canAssign && c.status !== "closed" && (
                <form
                  className={styles.inlineForm}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!message.trim()) {
                      setMessageError(t("portal.validation.required"));
                      return;
                    }
                    setMessageError(undefined);
                    if (await msg.run("send", () => sendRequesterMessage(c.id, message), t("portal.cases.messageSent"))) setMessage("");
                  }}
                >
                  <TextAreaField id={`${fieldId}-msg`} label={t("portal.cases.messageToRequester")} hint={t("portal.cases.messageHint")} value={message} error={messageError} onChange={(e) => setMessage(e.target.value)} />
                  <div>
                    <Button type="submit" variant="secondary" icon="send" disabled={Boolean(msg.pending)}>
                      {t("portal.cases.send")}
                    </Button>
                  </div>
                </form>
              )}
              <div aria-live="polite">{msg.success && <Notice tone="success">{msg.success}</Notice>}</div>
              {msg.error && (
                <Notice tone="error" role="alert">
                  {msg.error}
                </Notice>
              )}
            </RecordSection>
          ),
        },
        {
          id: "notes",
          label: t("portal.cases.internalNotes"),
          count: c.internalNotes.length,
          content: (
            <RecordSection title={t("portal.cases.internalNotes")} actions={<Badge tone="neutral" icon="lock">{t("portal.cases.staffOnly")}</Badge>}>
              <p className={`${styles.small} ${styles.muted}`}>{t("portal.cases.notesIntro")}</p>
              <CommentThread comments={c.internalNotes} label={t("portal.cases.internalNotes")} emptyLabel={t("portal.comments.empty")} placeholderLabel={t("portal.cases.addNote")} onAdd={(text) => addInternalNote(c.id, text)} />
            </RecordSection>
          ),
        },
      ]}
    />
  );
}
