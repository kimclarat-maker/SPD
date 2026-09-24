"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { useServiceAction } from "@/lib/services/hooks";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Button } from "@/components/ui/Button";
import { TextAreaField } from "@/components/ui/Field";
import { Notice } from "@/components/ui/Notice";
import styles from "./RecordPage.module.css";

export interface RecordAction {
  key: string;
  label: string;
  /** Visual intent of the pill: neutral outline, teal (main action), red (destructive), amber (escalation). */
  tone?: "neutral" | "primary" | "danger" | "warning";
  icon?: IconName;
  requiresNote?: boolean;
  /** Hide the note field when the service does not record one. */
  noNote?: boolean;
  disabled?: boolean;
  /** Extra inputs shown in the confirm step (e.g. choosing a partner). */
  fields?: ReactNode;
  /** Return false to stay on the confirm step (the caller shows its own field error). */
  validate?: () => boolean;
  /** Label for the note field when the default ("Decision note") does not fit. */
  noteLabel?: string;
  /** Short explanation shown in the confirm step. */
  hint?: ReactNode;
  run: (note: string) => Promise<unknown>;
  success?: string;
}

export interface RecordTab {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Layout for every portal record: header card, action pills with a confirm
 * step, then tabbed section cards. Every action still goes through the
 * service layer, which writes the audit trail.
 */
export function RecordPage({
  back,
  eyebrow,
  title,
  mono = false,
  badges,
  meta,
  progress,
  notices,
  actions = [],
  tabs,
}: {
  back: { href: string; label: string };
  eyebrow: ReactNode;
  title: ReactNode;
  mono?: boolean;
  badges?: ReactNode;
  meta?: ReactNode;
  progress?: number;
  notices?: ReactNode;
  actions?: RecordAction[];
  tabs: RecordTab[];
}) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState(tabs[0]?.id);
  const tablistRef = useRef<HTMLDivElement>(null);
  const current = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0]?.id;
  const quick = tabs.slice(1, 5);

  function jumpTo(id: string) {
    setActiveTab(id);
    requestAnimationFrame(() => {
      const tab = document.getElementById(`tab-${id}`);
      tab?.focus({ preventScroll: true });
      tablistRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className={styles.page}>
      <Link href={back.href} className={styles.back}>
        <Icon name="arrowLeft" size={18} />
        {back.label}
      </Link>

      <header className={styles.headerCard}>
        <div className={styles.headerMain}>
          <p className={styles.eyebrow}>{eyebrow}</p>
          <h1 className={`${styles.title} ${mono ? styles.mono : ""}`}>{title}</h1>
          {badges && <div className={styles.badges}>{badges}</div>}
          {meta && <p className={styles.meta}>{meta}</p>}
        </div>
        {(progress !== undefined || quick.length > 0) && (
          <div className={styles.headerSide}>
            {progress !== undefined && (
              <div className={styles.progress}>
                <span
                  className={styles.progressTrack}
                  role="progressbar"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={progress}
                  aria-label={t("portal.detail.progress", { percent: progress })}
                >
                  <span className={styles.progressFill} style={{ width: `${progress}%` }} />
                </span>
                <span className={styles.progressLabel} aria-hidden="true">
                  {t("portal.detail.progress", { percent: progress })}
                </span>
              </div>
            )}
            {quick.length > 0 && (
              <nav aria-label={t("portal.detail.jumpTo")} className={styles.quick}>
                {quick.map((tab) => (
                  <button key={tab.id} type="button" className={styles.quickPill} onClick={() => jumpTo(tab.id)}>
                    {tab.label}
                  </button>
                ))}
              </nav>
            )}
          </div>
        )}
      </header>

      {notices && <div className={styles.notices}>{notices}</div>}

      {actions.length > 0 && <ActionBar actions={actions} />}

      <div ref={tablistRef} className={styles.tabsWrap}>
        <Tabs tabs={tabs} active={current} onChange={setActiveTab} label={t("portal.detail.sections")} />
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          id={`panel-${tab.id}`}
          role="tabpanel"
          aria-labelledby={`tab-${tab.id}`}
          hidden={tab.id !== current}
          className={styles.panel}
          tabIndex={0}
        >
          {tab.content}
        </div>
      ))}
    </div>
  );
}

function Tabs({
  tabs,
  active,
  onChange,
  label,
}: {
  tabs: RecordTab[];
  active?: string;
  onChange: (id: string) => void;
  label: string;
}) {
  const { dir } = useI18n();

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === active);
    const forward = dir === "rtl" ? "ArrowLeft" : "ArrowRight";
    const backward = dir === "rtl" ? "ArrowRight" : "ArrowLeft";
    let next = -1;
    if (event.key === forward) next = (index + 1) % tabs.length;
    else if (event.key === backward) next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    onChange(tabs[next].id);
    document.getElementById(`tab-${tabs[next].id}`)?.focus();
  }

  return (
    <div role="tablist" aria-label={label} className={styles.tabs} onKeyDown={onKeyDown}>
      {tabs.map((tab) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            className={styles.tab}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Pill action row. Choosing an action opens a confirm step with its note and any extra fields. */
export function ActionBar({ actions }: { actions: RecordAction[] }) {
  const { t } = useI18n();
  const id = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string>();
  const { run, pending, error, success, clear } = useServiceAction();
  const panelRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const triggerRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const action = actions.find((a) => a.key === selected);

  // Drop the confirm step if its action is no longer available (e.g. after the record changed).
  useEffect(() => {
    if (selected && !action) setSelected(null);
  }, [selected, action]);

  useEffect(() => {
    if (selected) panelRef.current?.querySelector<HTMLElement>("select, textarea, input")?.focus();
  }, [selected]);

  function open(key: string) {
    clear();
    setNote("");
    setNoteError(undefined);
    setSelected(key);
  }

  function cancel() {
    const key = selected;
    setSelected(null);
    if (key) triggerRefs.current[key]?.focus();
  }

  async function confirm() {
    if (!action) return;
    if (action.validate && !action.validate()) return;
    if (action.requiresNote && !note.trim()) {
      setNoteError(t("portal.detail.noteRequired"));
      noteRef.current?.focus();
      return;
    }
    setNoteError(undefined);
    const ok = await run(action.key, () => action.run(note.trim()), action.success ?? t("portal.detail.decisionRecorded"));
    if (ok) {
      setSelected(null);
      setNote("");
    }
  }

  return (
    <section className={styles.actions} aria-label={t("portal.detail.actions")}>
      <div className={styles.actionRow}>
        {actions.map((a) => (
          <button
            key={a.key}
            ref={(el) => {
              triggerRefs.current[a.key] = el;
            }}
            type="button"
            className={`${styles.actionPill} ${styles[a.tone ?? "neutral"]}`}
            disabled={a.disabled || Boolean(pending)}
            aria-expanded={selected === a.key}
            aria-controls={`${id}-confirm`}
            onClick={() => (selected === a.key ? cancel() : open(a.key))}
          >
            {a.icon && <Icon name={a.icon} size={18} />}
            {a.label}
          </button>
        ))}
      </div>

      {action && (
        <div ref={panelRef} id={`${id}-confirm`} className={styles.confirm} role="group" aria-labelledby={`${id}-confirm-title`}>
          <h2 id={`${id}-confirm-title`} className={styles.confirmTitle}>
            {t("portal.detail.confirmAction", { action: action.label })}
          </h2>
          {action.hint && <div className={styles.confirmHint}>{action.hint}</div>}
          {action.fields}
          {!action.noNote && (
          <TextAreaField
            ref={noteRef}
            id={`${id}-note`}
            label={action.noteLabel ?? t("portal.detail.note")}
            hint={t("portal.detail.noteHint")}
            requiredLabel={action.requiresNote ? undefined : t("common.optional")}
            value={note}
            error={noteError}
            onChange={(e) => setNote(e.target.value)}
          />
          )}
          <div className={styles.confirmButtons}>
            <Button
              variant={action.tone === "danger" ? "danger" : "primary"}
              icon={action.icon}
              disabled={Boolean(pending)}
              aria-busy={pending === action.key || undefined}
              onClick={confirm}
            >
              {pending === action.key ? t("common.loading") : action.label}
            </Button>
            <Button variant="secondary" disabled={Boolean(pending)} onClick={cancel}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}

      <div aria-live="polite" className={styles.status}>
        {success && <Notice tone="success">{success}</Notice>}
      </div>
      {error && (
        <Notice tone="error" role="alert">
          {error}
        </Notice>
      )}
    </section>
  );
}

/** Section card used inside record tabs. */
export function RecordSection({ title, children, actions }: { title: ReactNode; children: ReactNode; actions?: ReactNode }) {
  const headingId = useId();
  return (
    <section className={styles.card} aria-labelledby={headingId}>
      <div className={styles.cardHead}>
        <h2 id={headingId} className={styles.cardTitle}>
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Two-column field list with small uppercase labels. */
export function FieldGrid({ items }: { items: { label: ReactNode; value: ReactNode; wide?: boolean }[] }) {
  return (
    <dl className={styles.fields}>
      {items.map((item, index) => (
        <div key={index} className={item.wide ? styles.fieldWide : undefined}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
