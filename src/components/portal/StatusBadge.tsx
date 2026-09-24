"use client";

import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { EntityType, Priority } from "@/lib/types";
import { Badge, type Tone } from "@/components/ui/Badge";
import type { IconName } from "@/components/ui/Icon";

type StatusEntity = Exclude<EntityType, never> | "priority";

const tones: Record<string, [Tone, IconName?]> = {
  "partner.pending": ["warning"],
  "partner.approved": ["success"],
  "partner.rejected": ["error", "xCircle"],
  "partner.suspended": ["error", "pauseCircle"],
  "intervention.submitted": ["warning"],
  "intervention.approved": ["success"],
  "intervention.returned": ["info", "arrowLeft"],
  "intervention.rejected": ["error", "xCircle"],
  "intervention.completed": ["neutral", "check"],
  "fieldReport.held": ["neutral", "pauseCircle"],
  "fieldReport.submitted": ["warning"],
  "fieldReport.accepted": ["success"],
  "fieldReport.returned": ["info", "arrowLeft"],
  "exception.waiting": ["neutral", "pauseCircle"],
  "exception.open": ["error", "flag"],
  "exception.escalated": ["warning", "alertTriangle"],
  "exception.cleared": ["success"],
  "exception.duplicate": ["neutral", "minusCircle"],
  "case.new": ["warning", "inbox"],
  "case.assigned": ["info", "user"],
  "case.in_progress": ["info", "refresh"],
  "case.resolved": ["success"],
  "case.closed": ["neutral", "check"],
  "report.draft": ["warning", "pen"],
  "report.signed": ["info", "pen"],
  "report.shared": ["success", "send"],
  "integration.healthy": ["success"],
  "integration.delayed": ["warning", "alertTriangle"],
  "integration.paused": ["neutral", "pauseCircle"],
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
