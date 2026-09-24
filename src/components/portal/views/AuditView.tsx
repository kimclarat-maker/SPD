"use client";

import Link from "next/link";
import { useId, useMemo, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { EntityType } from "@/lib/types";
import { listAudit, recordHref } from "@/lib/services/audit";
import { useServiceQuery } from "@/lib/services/hooks";
import { PageHeader } from "@/components/portal/PageHeader";
import { auditText } from "@/components/portal/AuditTimeline";
import { Badge } from "@/components/ui/Badge";
import styles from "@/components/portal/portal.module.css";

const entities: EntityType[] = ["partner", "intervention", "fieldReport", "exception", "case", "report", "integration"];

export function AuditView() {
  const { t, formatDate } = useI18n();
  const id = useId();
  const [entity, setEntity] = useState<EntityType | "">("");
  const [query, setQuery] = useState("");
  const { data } = useServiceQuery(() => listAudit({ entity: entity || undefined }), [entity]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((e) => !q || `${auditText(t, e)} ${e.actor ?? ""} ${e.note ?? ""}`.toLowerCase().includes(q));
  }, [data, query, t]);

  return (
    <>
      <PageHeader title={t("portal.audit.title")} intro={t("portal.audit.intro")} />
      <div className={styles.tableBlock}>
        <div className={styles.toolbar} role="search">
          <div className={styles.toolbarField}>
            <label htmlFor={`${id}-q`} className={styles.toolbarLabel}>
              {t("common.search")}
            </label>
            <input id={`${id}-q`} type="search" className={styles.toolbarInput} style={{ paddingInlineStart: 12 }} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className={styles.toolbarField}>
            <label htmlFor={`${id}-e`} className={styles.toolbarLabel}>
              {t("portal.audit.entityFilter")}
            </label>
            <select id={`${id}-e`} className={styles.toolbarSelect} value={entity} onChange={(e) => setEntity(e.target.value as EntityType | "")}>
              <option value="">{t("common.all")}</option>
              {entities.map((e) => (
                <option key={e} value={e}>
                  {t(`portal.entity.${e}` as MessageKey)}
                </option>
              ))}
            </select>
          </div>
          <p className={styles.resultCount} aria-live="polite">
            {t("portal.table.results", { count: rows.length })}
          </p>
        </div>
        <div className={styles.tableScroll} role="region" aria-label={t("portal.audit.title")} tabIndex={0}>
          <table className={styles.table}>
            <caption className="visually-hidden">{t("portal.audit.title")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("portal.audit.time")}</th>
                <th scope="col">{t("portal.audit.action")}</th>
                <th scope="col">{t("portal.audit.actor")}</th>
                <th scope="col">{t("portal.audit.record")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => {
                const href = recordHref(entry.entity, entry.entityId);
                return (
                  <tr key={entry.id}>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <time dateTime={entry.at}>{formatDate(entry.at, true)}</time>
                    </td>
                    <td>
                      {auditText(t, entry)}
                      {entry.simulated && (
                        <>
                          {" "}
                          <Badge tone="simulated">{t("portal.audit.simulatedTag")}</Badge>
                        </>
                      )}
                      {entry.note && <span className={styles.ref}>“{entry.note}”</span>}
                    </td>
                    <td>{entry.actor ?? t("portal.audit.systemActor")}</td>
                    <td>
                      {href && entry.entity !== "session" ? (
                        <Link href={href}>{t(`portal.entity.${entry.entity}` as MessageKey)}</Link>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data && rows.length === 0 && <p className={styles.empty}>{t("portal.table.empty")}</p>}
        </div>
      </div>
    </>
  );
}
