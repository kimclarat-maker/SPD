"use client";

import Link from "next/link";
import { useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { Intervention, Partner, ScopeValues } from "@/lib/types";
import { acknowledgeRisk, decideChangeRequest, decideFinancialUpdate, decideProfileChange, reviewProgressUpdate } from "@/lib/services/partnerReview";
import { servicePointName, settlementName } from "@/lib/services/lookup";
import { useCan } from "@/lib/services/hooks";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { PriorityBadge, StatusBadge } from "./StatusBadge";
import { RecordSection } from "./RecordPage";
import { ConfirmDialog } from "./ConfirmDialog";
import styles from "./portal.module.css";

type Pending = { title: string; confirm: string; danger?: boolean; run: (reason: string) => Promise<unknown> } | null;

/**
 * What the partner submitted from the Partner Portal on an approved
 * intervention, with the OPM decision for each item. Every decision needs a
 * reason and is written to the audit trail; the partner sees it in its inbox.
 */
export function InterventionPartnerUpdates({ intervention: i }: { intervention: Intervention }) {
  const { t, formatDate, formatNumber } = useI18n();
  const can = useCan();
  const [pending, setPending] = useState<Pending>(null);
  const canReview = can("intervention.review");
  const canDecide = can("intervention.decide");
  const scope = (v: ScopeValues) =>
    [
      v.objective !== undefined && `${t("portal.partnerUpdates.objective")}: ${v.objective}`,
      v.activities !== undefined && `${t("portal.partnerUpdates.activities")}: ${v.activities.join("; ")}`,
      v.settlementId !== undefined && `${t("portal.filters.settlement")}: ${settlementName(v.settlementId)}`,
      v.servicePointIds !== undefined && `${t("portal.partnerUpdates.servicePoints")}: ${v.servicePointIds.map(servicePointName).join(", ")}`,
      v.endDate !== undefined && `${t("portal.partnerUpdates.endDate")}: ${formatDate(v.endDate)}`,
      v.budgetUsd !== undefined && `${t("portal.partnerUpdates.budget")}: $${formatNumber(v.budgetUsd)}`,
    ]
      .filter(Boolean)
      .join(" · ");
  const none = !(i.changeRequests ?? []).length && !(i.progressUpdates ?? []).length && !(i.risks ?? []).length && !(i.financialUpdates ?? []).length;

  return (
    <>
      <Notice tone="info">{t("portal.partnerUpdates.intro")}</Notice>
      {i.overlapResponse && (
        <RecordSection title={t("portal.partnerUpdates.overlapResponse")}>
          <p className={styles.quote}>{i.overlapResponse}</p>
        </RecordSection>
      )}
      {none && <p className={styles.muted}>{t("portal.partnerUpdates.none")}</p>}

      {(i.changeRequests ?? []).length > 0 && (
        <RecordSection title={t("portal.partnerUpdates.changeRequests")}>
          <ul className={styles.rowList}>
            {[...(i.changeRequests ?? [])].reverse().map((c) => (
              <li key={c.id} className={styles.rowItem} style={{ alignItems: "flex-start" }}>
                <span className={styles.rowMain}>
                  <strong>{c.ref}</strong>
                  <span className={styles.small}>
                    <strong>{t("portal.partnerUpdates.proposed")}:</strong> {scope(c.proposed)}
                  </span>
                  <span className={styles.small}>
                    <strong>{t("portal.partnerUpdates.current")}:</strong> {scope(c.previous)}
                  </span>
                  <span className={styles.small}>“{c.reason}”</span>
                  <span className={styles.ref}>
                    {c.by} · {formatDate(c.at, true)}
                  </span>
                  {c.decisionNote && <span className={styles.small}>{c.decisionNote}</span>}
                </span>
                <span className={styles.buttonRow}>
                  <StatusBadge entity="changeRequest" status={c.status} />
                  {c.status === "submitted" && canDecide && (
                    <>
                      <Button size="sm" icon="check" onClick={() => setPending({ title: `${t("portal.partnerUpdates.approve")}: ${c.ref}`, confirm: t("portal.partnerUpdates.approve"), run: (r) => decideChangeRequest(i.id, c.id, true, r) })}>
                        {t("portal.partnerUpdates.approve")}
                      </Button>
                      <Button size="sm" variant="secondary" icon="x" onClick={() => setPending({ title: `${t("portal.partnerUpdates.reject")}: ${c.ref}`, confirm: t("portal.partnerUpdates.reject"), danger: true, run: (r) => decideChangeRequest(i.id, c.id, false, r) })}>
                        {t("portal.partnerUpdates.reject")}
                      </Button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </RecordSection>
      )}

      {(i.progressUpdates ?? []).length > 0 && (
        <RecordSection title={t("portal.partnerUpdates.progress")}>
          <ul className={styles.rowList}>
            {[...(i.progressUpdates ?? [])].reverse().map((u) => (
              <li key={u.id} className={styles.rowItem}>
                <span className={styles.rowMain}>
                  <span>{u.summary}</span>
                  <span className={styles.ref}>
                    {u.by} · {formatDate(u.at, true)}
                    {u.milestoneId && ` · ${t("portal.partnerUpdates.milestone", { milestone: i.milestones.find((m) => m.id === u.milestoneId)?.title ?? "—" })}`}
                  </span>
                  {u.evidenceDocumentId && <Link href={`/portal/documents/${u.evidenceDocumentId}`}>{t("portal.partnerUpdates.evidence")}</Link>}
                  {u.reviewNote && <span className={styles.small}>{u.reviewNote}</span>}
                </span>
                <span className={styles.buttonRow}>
                  <StatusBadge entity="updateReview" status={u.status} />
                  {u.status === "awaiting_review" && canReview && (
                    <>
                      <Button size="sm" icon="check" onClick={() => setPending({ title: t("portal.partnerUpdates.acknowledge"), confirm: t("portal.partnerUpdates.acknowledge"), run: (r) => reviewProgressUpdate(i.id, u.id, true, r) })}>
                        {t("portal.partnerUpdates.acknowledge")}
                      </Button>
                      <Button size="sm" variant="secondary" icon="arrowLeft" onClick={() => setPending({ title: t("portal.partnerUpdates.return"), confirm: t("portal.partnerUpdates.return"), run: (r) => reviewProgressUpdate(i.id, u.id, false, r) })}>
                        {t("portal.partnerUpdates.return")}
                      </Button>
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </RecordSection>
      )}

      {(i.risks ?? []).length > 0 && (
        <RecordSection title={t("portal.partnerUpdates.risks")}>
          <ul className={styles.rowList}>
            {[...(i.risks ?? [])].reverse().map((r) => (
              <li key={r.id} className={styles.rowItem}>
                <span className={styles.rowMain}>
                  <strong>{r.description}</strong>
                  <span className={styles.small}>
                    {t("portal.partnerUpdates.mitigation")}: {r.mitigation}
                  </span>
                  <span className={styles.ref}>
                    {t(`portal.partnerUpdates.riskKinds.${r.kind}` as MessageKey)} · {r.by} · {formatDate(r.at, true)}
                  </span>
                  {r.opmNote && <span className={styles.small}>{r.opmNote}</span>}
                </span>
                <span className={styles.buttonRow}>
                  <PriorityBadge priority={r.severity} />
                  <StatusBadge entity="risk" status={r.status} />
                  {r.status === "open" && canReview && (
                    <Button size="sm" variant="secondary" icon="eye" onClick={() => setPending({ title: t("portal.partnerUpdates.acknowledgeRisk"), confirm: t("portal.partnerUpdates.acknowledgeRisk"), run: (reason) => acknowledgeRisk(i.id, r.id, reason) })}>
                      {t("portal.partnerUpdates.acknowledgeRisk")}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </RecordSection>
      )}

      {(i.financialUpdates ?? []).filter((f) => f.status !== "draft").length > 0 && (
        <RecordSection title={t("portal.partnerUpdates.finance")}>
          <p className={`${styles.small} ${styles.muted}`}>{t("portal.partnerUpdates.financeHint")}</p>
          <ul className={styles.rowList}>
            {[...(i.financialUpdates ?? [])]
              .filter((f) => f.status !== "draft")
              .reverse()
              .map((f) => (
                <li key={f.id} className={styles.rowItem} style={{ alignItems: "flex-start" }}>
                  <span className={styles.rowMain}>
                    <strong>
                      {f.ref} · {f.period}
                    </strong>
                    <span className={styles.ref}>
                      ${formatNumber(f.entries.reduce((s, e) => s + e.amountUsd, 0))} · {f.submittedBy ?? "—"} {f.submittedAt && `· ${formatDate(f.submittedAt, true)}`}
                    </span>
                    <ul className={styles.plainList}>
                      {f.entries.map((e) => (
                        <li key={e.id} className={styles.small}>
                          {formatDate(e.date)} · {(i.budgetLines ?? []).find((l) => l.id === e.budgetLineId)?.category ?? "—"} · {e.description} · ${formatNumber(e.amountUsd)}
                          {e.documentId && (
                            <>
                              {" "}
                              · <Link href={`/portal/documents/${e.documentId}`}>{t("portal.partnerUpdates.evidence")}</Link>
                            </>
                          )}
                        </li>
                      ))}
                    </ul>
                  </span>
                  <span className={styles.buttonRow}>
                    <StatusBadge entity="finance" status={f.status} />
                    {f.status === "submitted" && canReview && (
                      <>
                        <Button size="sm" icon="check" onClick={() => setPending({ title: `${t("portal.partnerUpdates.accept")}: ${f.ref}`, confirm: t("portal.partnerUpdates.accept"), run: (r) => decideFinancialUpdate(i.id, f.id, true, r) })}>
                          {t("portal.partnerUpdates.accept")}
                        </Button>
                        <Button size="sm" variant="secondary" icon="arrowLeft" onClick={() => setPending({ title: `${t("portal.partnerUpdates.return")}: ${f.ref}`, confirm: t("portal.partnerUpdates.return"), run: (r) => decideFinancialUpdate(i.id, f.id, false, r) })}>
                          {t("portal.partnerUpdates.return")}
                        </Button>
                      </>
                    )}
                  </span>
                </li>
              ))}
          </ul>
        </RecordSection>
      )}

      <ConfirmDialog open={Boolean(pending)} title={pending?.title ?? ""} confirmLabel={pending?.confirm ?? ""} danger={pending?.danger} onClose={() => setPending(null)} onConfirm={(reason) => pending!.run(reason)} />
    </>
  );
}

/** Profile changes an approved partner asked for. Approving applies them to the partner record. */
export function PartnerProfileChanges({ partner: p }: { partner: Partner }) {
  const { t, formatDate } = useI18n();
  const can = useCan();
  const [pending, setPending] = useState<Pending>(null);
  const changes = [...(p.profileChanges ?? [])].reverse();
  const show = (value: unknown) => (typeof value === "string" ? value : Array.isArray(value) ? value.map((x) => (typeof x === "object" && x ? `${(x as { name?: string }).name} (${(x as { role?: string }).role})` : String(x))).join(", ") : value && typeof value === "object" ? Object.values(value).filter(Boolean).join(", ") : "—");
  return (
    <RecordSection title={t("portal.partnerUpdates.profileChanges")}>
      {changes.length === 0 ? (
        <p className={styles.muted}>{t("portal.partnerUpdates.noProfileChanges")}</p>
      ) : (
        <ul className={styles.rowList}>
          {changes.map((c) => (
            <li key={c.id} className={styles.rowItem} style={{ alignItems: "flex-start" }}>
              <span className={styles.rowMain}>
                <strong>{c.ref}</strong>
                {c.fields.map((f) => (
                  <span key={f} className={styles.small}>
                    <strong>{t(`partner.profile.fieldNames.${f}` as MessageKey)}:</strong> {show(c.previous[f])} → {show(c.proposed[f])}
                  </span>
                ))}
                <span className={styles.small}>“{c.reason}”</span>
                <span className={styles.ref}>
                  {c.submittedBy} · {formatDate(c.submittedAt, true)}
                </span>
                {c.decisionNote && <span className={styles.small}>{c.decisionNote}</span>}
              </span>
              <span className={styles.buttonRow}>
                <StatusBadge entity="profileChange" status={c.status} />
                {c.status === "under_review" && can("partner.decide") && (
                  <>
                    <Button size="sm" icon="check" onClick={() => setPending({ title: `${t("portal.partnerUpdates.approve")}: ${c.ref}`, confirm: t("portal.partnerUpdates.approve"), run: (r) => decideProfileChange(p.id, c.id, true, r) })}>
                      {t("portal.partnerUpdates.approve")}
                    </Button>
                    <Button size="sm" variant="secondary" icon="arrowLeft" onClick={() => setPending({ title: `${t("portal.partnerUpdates.return")}: ${c.ref}`, confirm: t("portal.partnerUpdates.return"), run: (r) => decideProfileChange(p.id, c.id, false, r) })}>
                      {t("portal.partnerUpdates.return")}
                    </Button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog open={Boolean(pending)} title={pending?.title ?? ""} confirmLabel={pending?.confirm ?? ""} danger={pending?.danger} onClose={() => setPending(null)} onConfirm={(reason) => pending!.run(reason)} />
    </RecordSection>
  );
}
