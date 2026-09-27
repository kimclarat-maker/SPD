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
  /** Makes the column sortable. */
  sortValue?: (row: T) => string | number;
  numeric?: boolean;
}

export interface TableFilter<T> {
  key: string;
  label: string;
  options: { value: string; label: string }[];
  test: (row: T, value: string) => boolean;
  initial?: string;
}

/**
 * Filterable record table: free-text search, a status filter (a value may be
 * a comma-separated group, as dashboard links use), optional extra filters,
 * sortable columns, and a result count announced to screen readers. Scrolls
 * horizontally inside its own region on narrow screens, never the page.
 */
export function RecordTable<T extends { id: string; status: string }>({
  rows,
  columns,
  caption,
  searchText,
  statusOptions,
  initialStatus = "",
  filters = [],
  loading,
  error,
  emptyLabel,
  toolbarExtra,
}: {
  rows: T[] | undefined;
  columns: Column<T>[];
  caption: string;
  searchText: (row: T) => string;
  statusOptions: { value: string; label: string }[];
  initialStatus?: string;
  filters?: TableFilter<T>[];
  loading?: boolean;
  error?: string | null;
  emptyLabel?: string;
  toolbarExtra?: ReactNode;
}) {
  const { t } = useI18n();
  const id = useId();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [extra, setExtra] = useState<Record<string, string>>(() => Object.fromEntries(filters.map((f) => [f.key, f.initial ?? ""])));
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null);

  const options = useMemo(() => {
    if (!status || statusOptions.some((o) => o.value === status)) return statusOptions;
    return [{ value: status, label: t("portal.table.selectedStatuses") }, ...statusOptions];
  }, [status, statusOptions, t]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const wanted = status ? status.split(",") : null;
    const list = (rows ?? []).filter(
      (row) =>
        (!wanted || wanted.includes(row.status)) &&
        (!q || searchText(row).toLowerCase().includes(q)) &&
        filters.every((f) => !extra[f.key] || f.test(row, extra[f.key])),
    );
    if (!sort) return list;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return list;
    return [...list].sort((a, b) => {
      const va = column.sortValue!(a);
      const vb = column.sortValue!(b);
      return (typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb))) * sort.dir;
    });
  }, [rows, query, status, searchText, filters, extra, sort, columns]);

  const active = Boolean(query || status || Object.values(extra).some(Boolean));

  return (
    <div className={styles.tableBlock}>
      <div className={styles.toolbar} role="search" aria-label={caption}>
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
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        {filters.map((f) => (
          <div className={styles.toolbarField} key={f.key}>
            <label htmlFor={`${id}-${f.key}`} className={styles.toolbarLabel}>
              {f.label}
            </label>
            <select
              id={`${id}-${f.key}`}
              className={styles.toolbarSelect}
              value={extra[f.key] ?? ""}
              onChange={(e) => setExtra((prev) => ({ ...prev, [f.key]: e.target.value }))}
            >
              <option value="">{t("common.all")}</option>
              {f.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}
        {active && (
          <Button
            variant="ghost"
            size="sm"
            icon="x"
            onClick={() => {
              setQuery("");
              setStatus("");
              setExtra({});
            }}
          >
            {t("portal.table.clearFilters")}
          </Button>
        )}
        {toolbarExtra}
        <p className={styles.resultCount} aria-live="polite">
          {loading && !rows ? t("common.loading") : t("portal.table.results", { count: filtered.length })}
        </p>
      </div>

      <div className={styles.tableScroll} role="region" aria-label={caption} tabIndex={0}>
        <table className={styles.table} style={{ minWidth: Math.max(760, columns.length * 128) }}>
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            <tr>
              {columns.map((column) => {
                const sorted = sort?.key === column.key ? sort.dir : 0;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={column.numeric ? styles.num : undefined}
                    aria-sort={sorted === 1 ? "ascending" : sorted === -1 ? "descending" : column.sortValue ? "none" : undefined}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        className={styles.sortButton}
                        onClick={() => setSort(sorted === 1 ? { key: column.key, dir: -1 } : sorted === -1 ? null : { key: column.key, dir: 1 })}
                      >
                        {column.header}
                        <Icon name={sorted === -1 ? "arrowUp" : "arrowDown"} size={14} className={sorted ? undefined : styles.sortIdle} />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
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
                    <td key={column.key} className={column.numeric ? styles.num : undefined}>
                      {column.render(row)}
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {loading && !rows && (
          <p className={styles.empty} role="status">
            {t("common.loading")}
          </p>
        )}
        {error && (
          <p className={styles.empty} role="alert">
            {error}
          </p>
        )}
        {rows && filtered.length === 0 && (
          <p className={styles.empty}>{rows.length === 0 ? (emptyLabel ?? t("portal.table.emptyNone")) : t("portal.table.empty")}</p>
        )}
      </div>
    </div>
  );
}
