"use client";

import { useId, useMemo, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { Icon } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import styles from "./portal.module.css";

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Primary column holds the row's link; it becomes the row header for screen readers. */
  primary?: boolean;
}

/**
 * Filterable record table: free-text search, a status filter, and a
 * result count announced to screen readers. Scrolls horizontally inside its
 * own region on narrow screens, never the page.
 */
export function RecordTable<T extends { id: string; status: string }>({
  rows,
  columns,
  caption,
  searchText,
  statusOptions,
  loading,
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  caption: string;
  searchText: (row: T) => string;
  statusOptions: { value: string; label: string }[];
  loading?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter(
      (row) => (!status || row.status === status) && (!q || searchText(row).toLowerCase().includes(q)),
    );
  }, [rows, query, status, searchText]);

  return (
    <div className={styles.tableBlock}>
      <div className={styles.toolbar} role="search">
        <div className={styles.toolbarField}>
          <label htmlFor={`${id}-q`} className={styles.toolbarLabel}>
            {t("common.search")}
          </label>
          <div className={styles.searchWrap}>
            <Icon name="search" size={18} className={styles.searchIcon} />
            <input
              id={`${id}-q`}
              type="search"
              className={styles.toolbarInput}
              placeholder={t("portal.table.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.toolbarField}>
          <label htmlFor={`${id}-s`} className={styles.toolbarLabel}>
            {t("portal.table.statusFilter")}
          </label>
          <select id={`${id}-s`} className={styles.toolbarSelect} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">{t("common.all")}</option>
            {statusOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {(query || status) && (
          <Button
            variant="ghost"
            size="sm"
            icon="x"
            onClick={() => {
              setQuery("");
              setStatus("");
            }}
          >
            {t("portal.table.clearFilters")}
          </Button>
        )}
        <p className={styles.resultCount} aria-live="polite">
          {loading && !rows ? t("common.loading") : t("portal.table.results", { count: filtered.length })}
        </p>
      </div>

      <div className={styles.tableScroll} role="region" aria-label={caption} tabIndex={0}>
        <table className={styles.table}>
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} scope="col">
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((row) => (
              <tr key={row.id}>
                {columns.map((column) =>
                  column.primary ? (
                    <th key={column.key} scope="row">
                      {column.render(row)}
                    </th>
                  ) : (
                    <td key={column.key}>{column.render(row)}</td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {rows && filtered.length === 0 && <p className={styles.empty}>{t("portal.table.empty")}</p>}
      </div>
    </div>
  );
}
