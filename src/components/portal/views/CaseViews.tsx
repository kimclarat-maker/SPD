"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { CaseStatus } from "@/lib/types";
import { settlementName } from "@/lib/demo/reference";
import { assignCase, closeCase, getCase, listCases, notifyRequester, resolveCase, startCase } from "@/lib/services/cases";
import { listApprovedPartners } from "@/lib/services/partners";
import { useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { RecordTable } from "@/components/portal/RecordTable";
import { PriorityBadge, StatusBadge, statusLabelKey } from "@/components/portal/StatusBadge";
import { AuditTimeline } from "@/components/portal/AuditTimeline";
import { RecordNotFound } from "@/components/portal/RecordBits";
import { FieldGrid, RecordPage, RecordSection, type RecordAction } from "@/components/portal/RecordPage";
import { progressFor } from "@/components/portal/progress";
import { SelectField } from "@/components/ui/Field";
import { Badge } from "@/components/ui/Badge";
import styles from "@/components/portal/portal.module.css";

const statuses: CaseStatus[] = ["new", "assigned", "in_progress", "resolved", "closed"];

export function CasesListView() {
  const { t, formatDate } = useI18n();
  const { data, loading } = useServiceQuery(listCases);

  return (
    <>
      <PageHeader title={t("portal.cases.title")} intro={t("portal.cases.intro")} />
      <RecordTable
        rows={data}
        loading={loading}
        caption={t("portal.cases.title")}
        searchText={(c) => `${c.title} ${c.ref} ${c.category} ${c.partnerName ?? ""}`}
        statusOptions={statuses.map((s) => ({ value: s, label: t(statusLabelKey("case", s)) }))}
        columns={[
          {
            key: "title",
            header: t("portal.table.name"),
            primary: true,
            render: (c) => (
              <>
                <Link href={`/portal/cases/${c.id}`} className={styles.recordLink}>
                  {c.title}
                </Link>
                <span className={styles.ref}>
                  {c.ref} · {settlementName(c.settlementId)}
                </span>
              </>
            ),
          },
          { key: "priority", header: t("portal.cases.priority"), render: (c) => <PriorityBadge priority={c.priority} /> },
          { key: "assigned", header: t("portal.cases.assignedTo"), render: (c) => c.partnerName ?? <span className={styles.muted}>{t("portal.cases.unassigned")}</span> },
          {
            key: "due",
            header: t("portal.cases.due"),
            render: (c) => (
              <>
                {formatDate(c.dueAt)}
                {c.overdue && (
                  <>
                    {" "}
                    <Badge tone="error" icon="clock">
                      {t("portal.cases.overdue")}
                    </Badge>
                  </>
                )}
              </>
            ),
          },
          { key: "status", header: t("portal.table.status"), render: (c) => <StatusBadge entity="case" status={c.status} /> },
        ]}
      />
    </>
  );
}

export function CaseDetailView({ id }: { id: string }) {
  const { t, formatDate } = useI18n();
  const fieldId = useId();
  const { data, notFound } = useServiceQuery(() => getCase(id), [id]);
  const { data: partners } = useServiceQuery(listApprovedPartners);
  const [partnerId, setPartnerId] = useState("");
  const [assignError, setAssignError] = useState<string>();

  if (notFound) return <RecordNotFound backHref="/portal/cases" />;
  if (!data) return <LoadingState label={t("common.loading")} />;

  const { serviceCase: c, partner, overdue } = data;
  const chosenPartner = partnerId || c.assignedPartnerId || "";

  const actions: RecordAction[] = [];
  if (c.status === "new" || c.status === "assigned") {
    actions.push({
      key: "assign",
      label: t("portal.cases.assign"),
      tone: "primary",
      icon: "user",
      fields: (
        <SelectField
          id={`${fieldId}-partner`}
          label={t("portal.cases.assignLabel")}
          hint={t("portal.cases.assignHint")}
          error={assignError}
          value={chosenPartner}
          onChange={(e) => {
            setPartnerId(e.target.value);
            setAssignError(undefined);
          }}
        >
          <option value="">{t("portal.cases.assignChoose")}</option>
          {(partners ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
      ),
      validate: () => {
        if (chosenPartner) return true;
        setAssignError(t("portal.cases.assignRequired"));
        document.getElementById(`${fieldId}-partner`)?.focus();
        return false;
      },
      run: (note) => assignCase(c.id, chosenPartner, note),
    });
  }
  if (c.status === "assigned") {
    actions.push({ key: "start", label: t("portal.cases.startWork"), icon: "refresh", run: () => startCase(c.id) });
  }
  if (c.status === "assigned" || c.status === "in_progress") {
    actions.push({
      key: "resolve",
      label: t("portal.cases.resolve"),
      icon: "checkCircle",
      requiresNote: true,
      noteLabel: t("portal.cases.resolutionLabel"),
      run: (note) => resolveCase(c.id, note),
    });
  }
  if (c.status === "resolved") {
    actions.push({ key: "close", label: t("portal.cases.close"), icon: "check", run: () => closeCase(c.id) });
  }
  actions.push({
    key: "notify",
    label: t("portal.cases.notify"),
    icon: "send",
    noNote: true,
    hint: t("common.simulatedLong"),
    success: t("portal.cases.notifySent"),
    run: () => notifyRequester(c.id),
  });

  const metaParts = [
    c.title,
    partner ? `${t("portal.cases.assignedTo")}: ${partner.name}` : t("portal.cases.unassigned"),
    `${t("portal.cases.received")} ${formatDate(c.receivedAt)}`,
    `${t("portal.cases.due")} ${formatDate(c.dueAt)}`,
  ];

  return (
    <RecordPage
      back={{ href: "/portal/cases", label: t("portal.detail.back") }}
      eyebrow={`${t("portal.entity.case")} · ${c.category}`}
      title={c.ref}
      mono
      badges={
        <>
          <StatusBadge entity="case" status={c.status} />
          <PriorityBadge priority={c.priority} />
          {overdue && (
            <Badge tone="error" icon="clock">
              {t("portal.cases.overdue")}
            </Badge>
          )}
        </>
      }
      meta={metaParts.join(" · ")}
      progress={progressFor.case(c.status)}
      actions={actions}
      tabs={[
        {
          id: "overview",
          label: t("portal.detail.overview"),
          content: (
            <RecordSection title={t("portal.detail.overview")}>
              <FieldGrid
                items={[
                  { label: t("portal.cases.category"), value: c.category },
                  { label: t("portal.cases.priority"), value: <PriorityBadge priority={c.priority} /> },
                  {
                    label: t("portal.cases.requester"),
                    value: (
                      <>
                        <span dir="ltr" className={styles.ref} style={{ display: "inline", fontSize: 16 }}>
                          {c.requesterRef}
                        </span>{" "}
                        <Badge tone="neutral" icon="lock">
                          {t("portal.detail.restricted")}
                        </Badge>
                      </>
                    ),
                  },
                  { label: t("portal.interventions.settlement"), value: settlementName(c.settlementId) },
                  { label: t("portal.cases.channel"), value: c.channel },
                  {
                    label: t("portal.cases.assignedTo"),
                    value: partner ? <Link href={`/portal/partners/${partner.id}`}>{partner.name}</Link> : t("portal.cases.unassigned"),
                  },
                  { label: t("portal.cases.received"), value: formatDate(c.receivedAt) },
                  { label: t("portal.cases.due"), value: formatDate(c.dueAt) },
                ]}
              />
              <p className={`${styles.small} ${styles.muted}`}>{t("portal.detail.restrictedNote")}</p>
            </RecordSection>
          ),
        },
        {
          id: "request",
          label: t("portal.cases.summary"),
          content: (
            <RecordSection title={t("portal.cases.summary")}>
              <p>{c.summary}</p>
              {c.resolution && (
                <div>
                  <p className={styles.subheading}>{t("portal.cases.resolution")}</p>
                  <p className={styles.quote}>{c.resolution}</p>
                </div>
              )}
            </RecordSection>
          ),
        },
        {
          id: "history",
          label: t("portal.detail.timeline"),
          content: (
            <RecordSection title={t("portal.detail.timeline")}>
              <AuditTimeline entityId={c.id} />
            </RecordSection>
          ),
        },
      ]}
    />
  );
}
