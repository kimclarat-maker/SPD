"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { Comment } from "@/lib/types";
import {
  addFormalReply,
  addInternalNote,
  listPartnerInbox,
  listThreads,
  markPartnerRead,
  markPartnerUnread,
  type InboxItem,
  type InboxKind,
  type Thread,
} from "@/lib/services/partnerInsights";
import { useServiceAction } from "@/lib/services/hooks";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import { TextAreaField } from "@/components/ui/Field";
import { PageHeader } from "@/components/portal/PageHeader";
import { PageTabs } from "@/components/portal/RecordPage";
import { auditText } from "@/components/portal/AuditTimeline";
import { EmptyState } from "@/components/portal/RecordBits";
import { Gate, usePartnerQuery } from "@/components/partner/PartnerBits";
import portal from "@/components/portal/portal.module.css";
import styles from "@/components/partner/partner.module.css";

const icons: Record<InboxKind, IconName> = {
  changes_requested: "arrowLeft",
  returned: "arrowLeft",
  assigned_review: "user",
  deadline: "calendar",
  overdue: "clock",
  document_expiry: "fileText",
  sync_failed: "wifiOff",
  integration_failed: "link",
  decision: "checkCircle",
};

const kinds: InboxKind[] = ["decision", "changes_requested", "deadline", "overdue", "document_expiry", "sync_failed", "integration_failed"];

export function inboxText(t: ReturnType<typeof useI18n>["t"], item: InboxItem): string {
  if (item.audit) return auditText(t, item.audit);
  return t(`partner.notify.${item.message}` as MessageKey, item.params);
}

/** One inbox line: what happened, when, and a link to the exact record. Opening it marks it read. */
export function InboxLine({ item }: { item: InboxItem }) {
  const { t, formatDate } = useI18n();
  return (
    <>
      <span className={portal.rowMain}>
        <Link href={item.href} className={portal.recordLink} onClick={() => void markPartnerRead([item.id])}>
          <Icon name={icons[item.kind] ?? "bell"} size={16} /> {inboxText(t, item)}
        </Link>
        <span className={portal.ref}>
          <time dateTime={item.at}>{formatDate(item.at, true)}</time> · {t(`partner.messages.kinds.${item.kind}` as MessageKey)}
          {item.audit?.simulated && (
            <>
              {" "}
              <Badge tone="simulated">{t("portal.audit.simulatedTag")}</Badge>
            </>
          )}
        </span>
        {item.audit?.note && <span className={portal.small}>“{item.audit.note}”</span>}
      </span>
      {!item.read && <Badge tone="info">{t("partner.messages.unread")}</Badge>}
    </>
  );
}

export function MessagesView({ initialTab }: { initialTab?: string }) {
  const { t } = useI18n();
  const [tab, setTab] = useState(initialTab === "correspondence" || initialTab === "notes" ? initialTab : "inbox");
  return (
    <>
      <PageHeader title={t("partner.messages.title")} intro={t("partner.messages.intro")} />
      <PageTabs
        label={t("partner.messages.title")}
        active={tab}
        onChange={setTab}
        tabs={[
          { id: "inbox", label: t("partner.messages.inbox"), content: <Inbox /> },
          { id: "correspondence", label: t("partner.messages.correspondence"), content: <Threads mode="formal" /> },
          { id: "notes", label: t("partner.messages.notes"), content: <Threads mode="notes" /> },
        ]}
      />
    </>
  );
}

function Inbox() {
  const { t } = useI18n();
  const id = useId();
  const q = usePartnerQuery(listPartnerInbox);
  const [kind, setKind] = useState<InboxKind | "">("");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const action = useServiceAction();
  return (
    <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner">
      {() => {
        const items = q.data!.filter((n) => (!kind || n.kind === kind) && (!unreadOnly || !n.read));
        const unread = q.data!.filter((n) => !n.read);
        return (
          <div className={portal.stack}>
            <div className={portal.toolbar} role="search" aria-label={t("partner.messages.inbox")}>
              <div className={portal.toolbarField}>
                <label htmlFor={`${id}-k`} className={portal.toolbarLabel}>
                  {t("partner.messages.kindFilter")}
                </label>
                <select id={`${id}-k`} className={portal.toolbarSelect} value={kind} onChange={(e) => setKind(e.target.value as InboxKind | "")}>
                  <option value="">{t("common.all")}</option>
                  {kinds.map((k) => (
                    <option key={k} value={k}>
                      {t(`partner.messages.kinds.${k}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </div>
              <label className={portal.checkRow}>
                <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
                {t("partner.messages.unreadOnly")}
              </label>
              <Button size="sm" variant="secondary" icon="check" disabled={unread.length === 0 || Boolean(action.pending)} onClick={() => action.run("all", () => markPartnerRead(unread.map((n) => n.id)))}>
                {t("partner.messages.markAllRead")}
              </Button>
              <p className={portal.resultCount} aria-live="polite">
                {t("portal.table.results", { count: items.length })}
              </p>
            </div>
            {items.length === 0 ? (
              <EmptyState icon="inbox" title={t("partner.messages.empty")} />
            ) : (
              <ul className={portal.rowList}>
                {items.map((n) => (
                  <li key={n.id} className={portal.rowItem}>
                    <InboxLine item={n} />
                    <Button size="sm" variant="ghost" icon={n.read ? "mail" : "check"} onClick={() => (n.read ? markPartnerUnread(n.id) : markPartnerRead([n.id]))}>
                      {n.read ? t("partner.messages.markUnread") : t("partner.messages.markRead")}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      }}
    </Gate>
  );
}

function Threads({ mode }: { mode: "formal" | "notes" }) {
  const { t } = useI18n();
  const q = usePartnerQuery(listThreads);
  return (
    <Gate loading={!q.data} denied={q.denied} notFound={q.notFound} backHref="/partner">
      {() => (
        <div className={portal.stack}>
          {mode === "formal" ? <Notice tone="info">{t("partner.messages.formalHint")}</Notice> : <Notice tone="warning">{t("partner.messages.notesHint")}</Notice>}
          <ul className={styles.threadList}>
            {q.data!
              .filter((th) => mode === "notes" || th.comments.length > 0 || th.entity === "partner")
              .map((th) => (
                <li key={`${th.entity}-${th.id}`}>
                  <ThreadCard thread={th} mode={mode} />
                </li>
              ))}
          </ul>
        </div>
      )}
    </Gate>
  );
}

function ThreadCard({ thread, mode }: { thread: Thread; mode: "formal" | "notes" }) {
  const { t, formatDate } = useI18n();
  const id = useId();
  const [text, setText] = useState("");
  const [error, setError] = useState<string>();
  const action = useServiceAction();
  const list: Comment[] = mode === "formal" ? thread.comments : thread.notes;
  const canWrite = mode === "notes" || thread.canReply;
  return (
    <section className={`${styles.thread} ${mode === "notes" ? styles.privateNote : ""}`} aria-labelledby={`${id}-h`}>
      <div className={styles.threadHead}>
        <h2 id={`${id}-h`} className={portal.subCardTitle}>
          <Link href={thread.href}>{thread.title}</Link>
        </h2>
        <span className={portal.ref}>
          {thread.ref} · {t(`partner.messages.entity.${thread.entity}` as MessageKey)}
        </span>
      </div>
      {list.length === 0 ? (
        <p className={`${portal.small} ${portal.muted}`}>{mode === "formal" ? t("partner.messages.noFormal") : t("partner.messages.noNotes")}</p>
      ) : (
        <ul className={portal.messageList}>
          {list.map((c) => {
            const fromPartner = mode === "notes" || c.author.endsWith(`, ${thread.orgLabel}`);
            return (
              <li key={c.id} className={`${portal.message} ${fromPartner ? portal.messageOut : ""}`}>
                <span className={portal.commentMeta}>
                  <strong>{c.author}</strong> · <time dateTime={c.at}>{formatDate(c.at, true)}</time>
                </span>
                <span>{c.text}</span>
              </li>
            );
          })}
        </ul>
      )}
      {canWrite && (
        <form
          className={portal.inlineForm}
          onSubmit={async (e) => {
            e.preventDefault();
            if (!text.trim()) {
              setError(t("portal.validation.required"));
              return;
            }
            setError(undefined);
            const ok = await action.run("send", () => (mode === "formal" ? addFormalReply(thread.entity, thread.id, text) : addInternalNote(thread.entity, thread.id, text)), mode === "formal" ? t("partner.messages.replySent") : t("partner.messages.noteSaved"));
            if (ok) setText("");
          }}
        >
          <TextAreaField
            id={`${id}-text`}
            label={mode === "formal" ? t("partner.messages.replyLabel") : t("partner.messages.noteLabel")}
            hint={mode === "formal" ? t("partner.messages.replyHint") : t("partner.messages.noteHint")}
            value={text}
            error={error}
            onChange={(e) => setText(e.target.value)}
          />
          <div className={portal.buttonRow}>
            <Button type="submit" size="sm" variant={mode === "formal" ? "primary" : "secondary"} icon={mode === "formal" ? "send" : "lock"} disabled={Boolean(action.pending)}>
              {action.pending ? t("common.loading") : mode === "formal" ? t("partner.messages.sendReply") : t("partner.messages.saveNote")}
            </Button>
          </div>
          <div aria-live="polite">{action.success && <Notice tone="success">{action.success}</Notice>}</div>
          {action.error && (
            <Notice tone="error" role="alert">
              {action.error}
            </Notice>
          )}
        </form>
      )}
    </section>
  );
}
