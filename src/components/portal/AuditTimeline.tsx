"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey, Translate } from "@/i18n/core";
import type { AuditEntry } from "@/lib/types";
import { listAudit } from "@/lib/services/audit";
import { recordHref } from "@/lib/services/lookup";
import { useServiceQuery } from "@/lib/services/hooks";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import styles from "./portal.module.css";

export function auditText(t: Translate, entry: AuditEntry): string {
  return t(`portal.auditActions.${entry.action}` as MessageKey, entry.params);
}

export function AuditTimeline({ entityId, limit }: { entityId: string; limit?: number }) {
  const { t } = useI18n();
  const { data } = useServiceQuery(() => listAudit({ entityId, limit }), [entityId, limit]);
  return <AuditList entries={data ?? []} emptyLabel={t("portal.detail.timelineEmpty")} />;
}

export function AuditList({ entries, emptyLabel, showRecord = false }: { entries: AuditEntry[]; emptyLabel: string; showRecord?: boolean }) {
  const { t, formatDate } = useI18n();
  if (entries.length === 0) return <p className={styles.muted}>{emptyLabel}</p>;
  return (
    <ol className={styles.timeline}>
      {entries.map((entry) => {
        const href = showRecord ? recordHref(entry.entity, entry.entityId) : null;
        return (
          <li key={entry.id} className={styles.timelineItem}>
            <span className={`${styles.timelineDot} ${entry.sensitive ? styles.timelineSensitive : ""}`} aria-hidden="true">
              <Icon name={entry.sensitive ? "eye" : entry.actor ? "user" : "refresh"} size={14} />
            </span>
            <div className={styles.timelineBody}>
              <p className={styles.timelineText}>
                {href ? <Link href={href}>{auditText(t, entry)}</Link> : auditText(t, entry)}
              </p>
              <p className={styles.timelineMeta}>
                <time dateTime={entry.at}>{formatDate(entry.at, true)}</time>
                <span aria-hidden="true"> · </span>
                <span>{entry.actor ?? t("portal.audit.systemActor")}</span>
                {entry.simulated && <Badge tone="simulated">{t("portal.audit.simulatedTag")}</Badge>}
                {entry.sensitive && (
                  <Badge tone="warning" icon="eye">
                    {t("portal.audit.sensitiveTag")}
                  </Badge>
                )}
              </p>
              {entry.note && <p className={styles.timelineNote}>“{entry.note}”</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
