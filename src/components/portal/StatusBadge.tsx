"use client";

import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { Priority } from "@/lib/types";
import { Badge, type Tone } from "@/components/ui/Badge";
import type { IconName } from "@/components/ui/Icon";

export type StatusEntity =
  | "partner"
  | "compliance"
  | "verification"
  | "intervention"
  | "fieldReport"
  | "form"
  | "formVersion"
  | "indicator"
  | "freshness"
  | "review"
  | "progres"
  | "case"
  | "document"
  | "signature"
  | "report"
  | "exchange"
  | "integration"
  | "run"
  | "user"
  | "priority"
  | "proposal"
  | "partnerReport"
  | "beneficiaryCheck"
  | "assistance"
  | "changeRequest"
  | "updateReview"
  | "risk"
  | "finance"
  | "profileField"
  | "profileChange"
  | "schedule";

const tones: Record<string, [Tone, IconName?]> = {
  "partner.draft": ["neutral", "pen"],
  "partner.submitted": ["warning", "inbox"],
  "partner.completeness_review": ["info", "clipboard"],
  "partner.verification": ["info", "shield"],
  "partner.approved": ["success"],
  "partner.changes_requested": ["warning", "arrowLeft"],
  "partner.rejected": ["error", "xCircle"],
  "partner.suspended": ["error", "pauseCircle"],
  "compliance.compliant": ["success"],
  "compliance.expiring": ["warning", "clock"],
  "compliance.expired": ["error", "alertTriangle"],
  "compliance.incomplete": ["neutral", "minusCircle"],
  "verification.not_run": ["neutral", "circle"],
  "verification.match": ["success"],
  "verification.mismatch": ["error", "xCircle"],
  "verification.timeout": ["warning", "clock"],
  "verification.unavailable": ["warning", "alertTriangle"],
  "intervention.draft": ["neutral", "pen"],
  "intervention.submitted": ["warning", "inbox"],
  "intervention.coordination_review": ["info", "clipboard"],
  "intervention.approved": ["success"],
  "intervention.changes_requested": ["warning", "arrowLeft"],
  "intervention.rejected": ["error", "xCircle"],
  "intervention.active": ["success", "activity"],
  "intervention.completed": ["neutral", "check"],
  "intervention.closed": ["neutral", "lock"],
  "fieldReport.draft": ["neutral", "pen"],
  "fieldReport.saved_offline": ["neutral", "wifiOff"],
  "fieldReport.awaiting_sync": ["warning", "cloud"],
  "fieldReport.synced": ["info", "refresh"],
  "fieldReport.needs_review": ["warning", "alertTriangle"],
  "fieldReport.conflict": ["error", "gitCompare"],
  "fieldReport.accepted": ["success"],
  "fieldReport.returned": ["info", "arrowLeft"],
  "fieldReport.escalated": ["warning", "flag"],
  "form.published": ["success"],
  "form.draft": ["warning", "pen"],
  "form.retired": ["neutral", "minusCircle"],
  "formVersion.published": ["success"],
  "formVersion.draft": ["warning", "pen"],
  "formVersion.retired": ["neutral", "minusCircle"],
  "indicator.active": ["success"],
  "indicator.inactive": ["neutral", "minusCircle"],
  "freshness.fresh": ["success"],
  "freshness.ageing": ["warning", "clock"],
  "freshness.stale": ["error", "alertTriangle"],
  "freshness.none": ["neutral", "minusCircle"],
  "review.waiting": ["neutral", "pauseCircle"],
  "review.open": ["warning", "flag"],
  "review.in_review": ["info", "eye"],
  "review.escalated": ["warning", "alertTriangle"],
  "review.resolved_valid": ["success"],
  "review.resolved_duplicate": ["neutral", "check"],
  "progres.not_requested": ["neutral", "circle"],
  "progres.success": ["success"],
  "progres.unavailable": ["warning", "alertTriangle"],
  "progres.inconclusive": ["info", "help"],
  "case.received": ["warning", "inbox"],
  "case.assigned": ["info", "user"],
  "case.in_progress": ["info", "refresh"],
  "case.awaiting_info": ["warning", "clock"],
  "case.resolved": ["success"],
  "case.closed": ["neutral", "check"],
  "document.missing": ["error", "alertCircle"],
  "document.draft": ["neutral", "pen"],
  "document.in_review": ["info", "eye"],
  "document.changes_requested": ["warning", "arrowLeft"],
  "document.approved": ["success"],
  "document.rejected": ["error", "xCircle"],
  "signature.not_required": ["neutral", "minusCircle"],
  "signature.not_requested": ["neutral", "pen"],
  "signature.requested": ["warning", "send"],
  "signature.signed": ["success", "pen"],
  "signature.declined": ["error", "xCircle"],
  "report.draft": ["warning", "pen"],
  "report.generated": ["info", "fileCheck"],
  "report.submitted": ["success", "send"],
  "exchange.not_prepared": ["neutral", "circle"],
  "exchange.prepared": ["info", "clipboard"],
  "exchange.submitted": ["info", "send"],
  "exchange.accepted": ["success"],
  "exchange.partial": ["warning", "alertTriangle"],
  "exchange.failed": ["error", "xCircle"],
  "integration.healthy": ["success"],
  "integration.degraded": ["warning", "alertTriangle"],
  "integration.failing": ["error", "xCircle"],
  "integration.paused": ["neutral", "pauseCircle"],
  "run.success": ["success"],
  "run.timeout": ["warning", "clock"],
  "run.mismatch": ["error", "xCircle"],
  "run.partial": ["warning", "alertTriangle"],
  "run.unavailable": ["error", "alertCircle"],
  "run.inconclusive": ["info", "help"],
  "user.active": ["success"],
  "user.invited": ["info", "mail"],
  "user.deactivated": ["neutral", "minusCircle"],
  // Partner Portal wording for the same records, and partner-only states.
  "proposal.draft": ["neutral", "pen"],
  "proposal.submitted": ["info", "send"],
  "proposal.coordination_review": ["info", "eye"],
  "proposal.approved": ["success"],
  "proposal.changes_requested": ["warning", "arrowLeft"],
  "proposal.rejected": ["error", "xCircle"],
  "proposal.active": ["success", "activity"],
  "proposal.completed": ["neutral", "check"],
  "proposal.closed": ["neutral", "lock"],
  "partnerReport.draft": ["neutral", "pen"],
  "partnerReport.saved_offline": ["neutral", "wifiOff"],
  "partnerReport.awaiting_sync": ["warning", "cloud"],
  "partnerReport.submitted": ["info", "send"],
  "partnerReport.needs_correction": ["warning", "arrowLeft"],
  "partnerReport.accepted": ["success"],
  "beneficiaryCheck.pending": ["neutral", "clock"],
  "beneficiaryCheck.verified": ["success"],
  "beneficiaryCheck.inconclusive": ["info", "help"],
  "beneficiaryCheck.unavailable": ["warning", "alertTriangle"],
  "beneficiaryCheck.needs_review": ["warning", "flag"],
  "assistance.recorded": ["success"],
  "assistance.flagged": ["warning", "flag"],
  "assistance.cleared": ["success", "checkCircle"],
  "assistance.corrected": ["neutral", "pen"],
  "changeRequest.submitted": ["info", "send"],
  "changeRequest.approved": ["success"],
  "changeRequest.rejected": ["error", "xCircle"],
  "updateReview.awaiting_review": ["info", "eye"],
  "updateReview.acknowledged": ["success"],
  "updateReview.returned": ["warning", "arrowLeft"],
  "risk.open": ["warning", "flag"],
  "risk.acknowledged": ["info", "eye"],
  "risk.closed": ["neutral", "check"],
  "finance.draft": ["neutral", "pen"],
  "finance.submitted": ["info", "send"],
  "finance.accepted": ["success"],
  "finance.returned": ["warning", "arrowLeft"],
  "profileField.editable": ["info", "pen"],
  "profileField.under_review": ["warning", "eye"],
  "profileField.verified": ["success", "shield"],
  "profileField.locked": ["neutral", "lock"],
  "profileChange.under_review": ["info", "eye"],
  "profileChange.approved": ["success"],
  "profileChange.returned": ["warning", "arrowLeft"],
  "schedule.accepted": ["success"],
  "schedule.submitted": ["info", "send"],
  "schedule.overdue": ["error", "alertTriangle"],
  "schedule.due": ["warning", "clock"],
  "schedule.upcoming": ["neutral", "calendar"],
  "priority.high": ["error", "alertTriangle"],
  "priority.medium": ["warning", "circle"],
  "priority.low": ["neutral", "minusCircle"],
};

export function statusLabelKey(entity: StatusEntity, status: string): MessageKey {
  return `portal.status.${entity}.${status}` as MessageKey;
}

export function StatusBadge({ entity, status }: { entity: StatusEntity; status: string }) {
  const { t } = useI18n();
  const [tone, icon] = tones[`${entity}.${status}`] ?? ["neutral"];
  return (
    <Badge tone={tone} icon={icon}>
      {t(statusLabelKey(entity, status))}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return <StatusBadge entity="priority" status={priority} />;
}

/** Options for a status filter select. */
export function useStatusOptions(entity: StatusEntity, statuses: readonly string[]) {
  const { t } = useI18n();
  return statuses.map((s) => ({ value: s, label: t(statusLabelKey(entity, s)) }));
}
