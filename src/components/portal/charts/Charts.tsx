"use client";

import { useEffect, useId, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import styles from "./Charts.module.css";

/*
 * Small, dependency-free chart kit for the portal. Every chart is single
 * series in RPCMS teal, labels use text tokens (never the data colour), and
 * every value is also reachable through the card's data table.
 */

type Tip = { x: number; y: number; content: ReactNode } | null;

function useTooltip() {
  const [tip, setTip] = useState<Tip>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  function place(clientX: number, clientY: number, content: ReactNode) {
    const box = wrapRef.current?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: clientX - box.left, y: clientY - box.top, content });
  }

  return {
    wrapRef,
    tip,
    onPointer: (event: PointerEvent, content: ReactNode) => place(event.clientX, event.clientY, content),
    onFocusEl: (el: Element, content: ReactNode) => {
      const r = el.getBoundingClientRect();
      place(r.left + r.width / 2, r.top, content);
    },
    hide: () => setTip(null),
  };
}

function Tooltip({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <div className={styles.tooltip} style={{ left: 0, transform: `translate(${tip.x}px, ${tip.y}px)` }} role="presentation">
      {tip.content}
    </div>
  );
}

/** Tooltip body: value leads, label follows. */
export function TipBody({ value, label, rows }: { value: ReactNode; label: ReactNode; rows?: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <>
      <span className={styles.tipValue}>{value}</span>
      <span className={styles.tipLabel}>{label}</span>
      {rows && (
        <span className={styles.tipRows}>
          {rows.map((row, index) => (
            <span key={index} className={styles.tipRow}>
              <span className={styles.tipKey} aria-hidden="true" />
              <span>{row.label}</span>
              <strong>{row.value}</strong>
            </span>
          ))}
        </span>
      )}
    </>
  );
}

/** Card wrapper with title, subtitle and a data-table view. */
export function ChartCard({
  title,
  subtitle,
  children,
  table,
  wide = false,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  table: { caption: string; columns: string[]; rows: ReactNode[][] };
  wide?: boolean;
}) {
  const { t } = useI18n();
  const id = useId();
  return (
    <section className={`${styles.card} ${wide ? styles.wide : ""}`} aria-labelledby={`${id}-title`}>
      <div className={styles.head}>
        <h2 id={`${id}-title`} className={styles.title}>
          {title}
        </h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {children}
      <details className={styles.tableToggle}>
        <summary>{t("portal.charts.showTable")}</summary>
        <div className={styles.tableScroll} tabIndex={0} role="region" aria-label={table.caption}>
          <table className={styles.table}>
            <caption className="visually-hidden">{table.caption}</caption>
            <thead>
              <tr>
                {table.columns.map((column, index) => (
                  <th key={column} scope="col" className={index > 0 ? styles.num : undefined}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) =>
                    c === 0 ? (
                      <th key={c} scope="row">
                        {cell}
                      </th>
                    ) : (
                      <td key={c} className={styles.num}>
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export interface BarRow {
  key: string;
  label: string;
  value: number;
  valueLabel: string;
  tip?: ReactNode;
}

/** Horizontal bars from one baseline, value at the tip. Rows are focusable so keyboard users get the same tooltip. */
export function BarList({ rows, emptyLabel }: { rows: BarRow[]; emptyLabel: string }) {
  const { wrapRef, tip, onPointer, onFocusEl, hide } = useTooltip();
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (rows.length === 0) return <p className={styles.empty}>{emptyLabel}</p>;

  return (
    <div ref={wrapRef} className={styles.plot} onPointerLeave={hide}>
      <ul className={styles.bars}>
        {rows.map((row) => {
          const body = row.tip ?? <TipBody value={row.valueLabel} label={row.label} />;
          return (
            <li
              key={row.key}
              className={styles.barRow}
              tabIndex={0}
              aria-label={`${row.label}: ${row.valueLabel}`}
              onPointerMove={(e) => onPointer(e, body)}
              onFocus={(e) => onFocusEl(e.currentTarget, body)}
              onBlur={hide}
            >
              <span className={styles.barLabel} aria-hidden="true">
                {row.label}
              </span>
              <span className={styles.lane} aria-hidden="true">
                {row.value > 0 && <span className={styles.bar} style={{ width: `${(row.value / max) * 100}%` }} />}
                <span className={styles.barValue}>{row.valueLabel}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <Tooltip tip={tip} />
    </div>
  );
}

export interface ProgressRow {
  key: string;
  label: string;
  sub: string;
  value: number;
  target: number;
  valueLabel: string;
}

/** Actual against target: the track is the target, the fill is progress, a tick marks 100%. */
export function ProgressList({ rows, targetLabel }: { rows: ProgressRow[]; targetLabel: string }) {
  const { wrapRef, tip, onPointer, onFocusEl, hide } = useTooltip();
  return (
    <div ref={wrapRef} className={styles.plot} onPointerLeave={hide}>
      <ul className={styles.progressList}>
        {rows.map((row) => {
          const ratio = row.target > 0 ? Math.min(1, row.value / row.target) : 0;
          const body = <TipBody value={row.valueLabel} label={`${row.label} · ${targetLabel}`} />;
          return (
            <li
              key={row.key}
              className={styles.progressRow}
              tabIndex={0}
              aria-label={`${row.label}: ${row.valueLabel}`}
              onPointerMove={(e) => onPointer(e, body)}
              onFocus={(e) => onFocusEl(e.currentTarget, body)}
              onBlur={hide}
            >
              <span className={styles.progressText} aria-hidden="true">
                <span className={styles.progressLabel}>{row.label}</span>
                <span className={styles.progressSub}>{row.sub}</span>
              </span>
              <span className={styles.progressTrack} aria-hidden="true">
                <span className={styles.progressFill} style={{ width: `${ratio * 100}%` }} />
              </span>
              <span className={styles.progressValue} aria-hidden="true">
                {row.valueLabel}
              </span>
            </li>
          );
        })}
      </ul>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Clean, even axis maximum so the midpoint tick is a whole number. */
function niceMax(value: number): number {
  if (value <= 4) return 4;
  if (value <= 6) return 6;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) {
    const candidate = step * magnitude;
    if (candidate >= value) return candidate;
  }
  return 10 * magnitude;
}

/** Daily columns with clean y ticks and a per-column hover target (the full band, not just the painted bar). */
export function ColumnChart({
  points,
  formatX,
  tipLabel,
  ariaLabel,
}: {
  points: { key: string; label: string; value: number }[];
  formatX: (key: string) => string;
  tipLabel: (value: number) => string;
  ariaLabel: string;
}) {
  const { formatNumber } = useI18n();
  const { wrapRef, tip, onPointer, hide } = useTooltip();
  const svgWrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = svgWrap.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(280, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const height = 220;
  const pad = { top: 12, right: 8, bottom: 28, left: 36 };
  const innerW = width - pad.left - pad.right;
  const innerH = height - pad.top - pad.bottom;
  const max = niceMax(Math.max(...points.map((p) => p.value), 1));
  const ticks = [0, max / 2, max];
  const band = innerW / points.length;
  const barW = Math.min(24, Math.max(4, band - 4));
  const labelEvery = Math.ceil(points.length / 6);

  return (
    <div ref={wrapRef} className={styles.plot} onPointerLeave={() => (hide(), setHover(null))}>
      <div ref={svgWrap} className={styles.svgWrap}>
        <svg width={width} height={height} role="img" aria-label={ariaLabel} className={styles.svg}>
          {ticks.map((tick) => {
            const y = pad.top + innerH - (tick / max) * innerH;
            return (
              <g key={tick}>
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className={tick === 0 ? styles.baseline : styles.grid} />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" className={styles.axisText}>
                  {formatNumber(tick)}
                </text>
              </g>
            );
          })}
          {points.map((point, index) => {
            const x = pad.left + index * band + (band - barW) / 2;
            const h = (point.value / max) * innerH;
            const y = pad.top + innerH - h;
            const r = Math.min(4, h, barW / 2);
            return (
              <g key={point.key}>
                {h > 0 && (
                  <path
                    className={`${styles.column} ${hover === index ? styles.columnHover : ""}`}
                    d={`M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + barW - r} Q${x + barW},${y} ${x + barW},${y + r} V${y + h} Z`}
                  />
                )}
                {index % labelEvery === 0 && (
                  <text x={x + barW / 2} y={height - 8} textAnchor="middle" className={styles.axisText}>
                    {formatX(point.key)}
                  </text>
                )}
                <rect
                  x={pad.left + index * band}
                  y={pad.top}
                  width={band}
                  height={innerH}
                  fill="transparent"
                  onPointerMove={(e) => {
                    setHover(index);
                    onPointer(e, <TipBody value={tipLabel(point.value)} label={point.label} />);
                  }}
                />
              </g>
            );
          })}
        </svg>
      </div>
      <Tooltip tip={tip} />
    </div>
  );
}

/** Stat tile: label, then value in the UI sans (proportional figures). */
export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className={styles.tile}>
      <span className={styles.tileLabel}>{label}</span>
      <span className={styles.tileValue}>{value}</span>
      {note && <span className={styles.tileNote}>{note}</span>}
    </div>
  );
}
