"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { AuditCategory, AuditEntity } from "@/lib/types";
import { listAudit, listAuditActors, recordAuditViewed } from "@/lib/services/audit";
import { recordHref } from "@/lib/services/lookup";
import { useCan, useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { auditText } from "@/components/portal/AuditTimeline";
import { PermissionDenied } from "@/components/portal/RecordBits";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import styles from "@/components/portal/portal.module.css";

const entities: AuditEntity[] = ["partner", "intervention", "fieldReport", "form", "indicator", "review", "case", "document", "report", "integration", "user", "config", "session"];
const categories: AuditCategory[] = ["decision", "status", "access", "export", "integration", "config", "record", "session"];
const PAGE = 60;

/** Read-only audit history: there is no edit or delete control, and the service layer exposes none. */
export function AuditView({ initialRecord }: { initialRecord?: string }) {
  const { t, formatDate } = useI18n();
  const id = useId();
  const can = useCan();
  const [entity, setEntity] = useState<AuditEntity | "">("");
  const [category, setCategory] = useState<AuditCategory | "">("");
  const [actor, setActor] = useState("");
  const [record, setRecord] = useState(initialRecord ?? "");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [query, setQuery] = useState("");
  const [sensitive, setSensitive] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const logged = useRef(false);
  const { data, forbidden } = useServiceQuery(
    () =>
      listAudit({
        entity: entity || undefined,
        entityId: record || undefined,
        category: category || undefined,
        actor: actor || undefined,
        from: from ? new Date(from).toISOString() : undefined,
        to: to ? new Date(`${to}T23:59:59`).toISOString() : undefined,
        sensitiveOnly: sensitive,
      }),
    [entity, category, actor, record, from, to, sensitive],
  );
  const { data: actors } = useServiceQuery(listAuditActors);

  useEffect(() => {
    if (!logged.current && can("audit.view")) {
      logged.current = true;
      recordAuditViewed();
    }
  }, [can]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data ?? []).filter((e) => !q || `${auditText(t, e)} ${e.actor ?? ""} ${e.note ?? ""} ${e.entityRef ?? ""}`.toLowerCase().includes(q));
  }, [data, query, t]);

  if (forbidden || !can("audit.view")) {
    return (
      <>
        <PageHeader title={t("portal.audit.title")} />
        <PermissionDenied />
      </>
    );
  }

  const clear = () => {
    setEntity("");
    setCategory("");
    setActor("");
    setRecord("");
    setFrom("");
    setTo("");
    setQuery("");
    setSensitive(false);
  };

  return (
    <>
      <PageHeader title={t("portal.audit.title")} intro={t("portal.audit.intro")} meta={<Badge tone="neutral" icon="lock">{t("portal.audit.readOnly")}</Badge>} />
      <div className={styles.tableBlock}>
        <div className={styles.filterBar} role="search" aria-label={t("portal.audit.title")}>
          <div className={styles.filterField}>
            <label htmlFor={`${id}-q`} className={styles.toolbarLabel}>
              {t("common.search")}
            </label>
            <input id={`${id}-q`} type="search" className={styles.toolbarInput} value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <div className={styles.filterField}>
            <label htmlFor={`${id}-e`} className={styles.toolbarLabel}>
              {t("portal.audit.recordType")}
            </label>
            <select id={`${id}-e`} className={styles.toolbarSelect} value={entity} onChange={(e) => setEntity(e.target.value as AuditEntity | "")}>
              <option value="">{t("common.all")}</option>
              {entities.map((e) => (
                <option key={e} value={e}>
                  {t(`portal.entity.${e}` as MessageKey)}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.filterField}>
            <label htmlFor={`${id}-c`} className={styles.toolbarLabel}>
              {t("portal.audit.category")}
            </label>
            <select id={`${id}-c`} className={styles.toolbarSelect} value={category} onChange={(e) => setCategory(e.target.value as AuditCategory | "")}>
              <option value="">{t("common.all")}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {t(`portal.audit.categories.${c}` as MessageKey)}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.filterField}>
            <label htmlFor={`${id}-a`} className={styles.toolbarLabel}>
              {t("portal.audit.actor")}
            </label>
            <select id={`${id}-a`} className={styles.toolbarSelect} value={actor} onChange={(e) => setActor(e.target.value)}>
              <option value="">{t("common.all")}</option>
              <option value="system">{t("portal.audit.systemActor")}</option>
              {(actors ?? []).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.filterField}>
            <label htmlFor={`${id}-f`} className={styles.toolbarLabel}>
              {t("portal.reports.from")}
            </label>
            <input id={`${id}-f`} type="date" className={styles.toolbarInput} value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className={styles.filterField}>
            <label htmlFor={`${id}-t`} className={styles.toolbarLabel}>
              {t("portal.reports.to")}
            </label>
            <input id={`${id}-t`} type="date" className={styles.toolbarInput} value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <label className={styles.checkRow}>
            <input type="checkbox" checked={sensitive} onChange={(e) => setSensitive(e.target.checked)} />
            <span>{t("portal.audit.sensitiveOnly")}</span>
          </label>
          <Button variant="ghost" size="sm" icon="x" onClick={clear}>
            {t("portal.table.clearFilters")}
          </Button>
        </div>
        {record && (
          <p className={styles.small}>
            {t("portal.audit.recordFilter", { id: record })}{" "}
            <button type="button" className={styles.linkButton} onClick={() => setRecord("")}>
              {t("portal.audit.showAll")}
            </button>
          </p>
        )}
        <p className={styles.resultCount} aria-live="polite">
          {data ? t("portal.table.results", { count: rows.length }) : t("common.loading")}
        </p>
        {!data ? (
          <LoadingState label={t("common.loading")} />
        ) : (
          <div className={styles.tableScroll} role="region" aria-label={t("portal.audit.title")} tabIndex={0}>
            <table className={`${styles.table} ${styles.tableCompact}`}>
              <caption className="visually-hidden">{t("portal.audit.title")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("portal.audit.time")}</th>
                  <th scope="col">{t("portal.audit.actor")}</th>
                  <th scope="col">{t("portal.audit.action")}</th>
                  <th scope="col">{t("portal.audit.record")}</th>
                  <th scope="col">{t("portal.audit.reason")}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, limit).map((entry) => {
                  const href = recordHref(entry.entity, entry.entityId);
                  return (
                    <tr key={entry.id}>
                      <td className={styles.nowrap}>
                        <time dateTime={entry.at}>{formatDate(entry.at, true)}</time>
                      </td>
                      <td>{entry.actor ?? t("portal.audit.systemActor")}</td>
                      <td>
                        {auditText(t, entry)}
                        <span className={styles.badgeRow}>
                          <Badge tone="neutral">{t(`portal.audit.categories.${entry.category}` as MessageKey)}</Badge>
                          {entry.simulated && <Badge tone="simulated">{t("portal.audit.simulatedTag")}</Badge>}
                          {entry.sensitive && (
                            <Badge tone="warning" icon="eye">
                              {t("portal.audit.sensitiveTag")}
                            </Badge>
                          )}
                        </span>
                      </td>
                      <td>
                        {href && entry.entity !== "session" ? (
                          <Link href={href}>
                            {t(`portal.entity.${entry.entity}` as MessageKey)}
                            {entry.entityRef && <span className={styles.ref}>{entry.entityRef}</span>}
                          </Link>
                        ) : (
                          t(`portal.entity.${entry.entity}` as MessageKey)
                        )}
                      </td>
                      <td>{entry.note ? <span className={styles.noteText}>“{entry.note}”</span> : <span className={styles.muted}>—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {rows.length === 0 && <p className={styles.empty}>{t("portal.table.empty")}</p>}
          </div>
        )}
        {rows.length > limit && (
          <div>
            <Button variant="secondary" size="sm" onClick={() => setLimit((l) => l + PAGE)}>
              {t("portal.audit.loadMore", { count: rows.length - limit })}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
