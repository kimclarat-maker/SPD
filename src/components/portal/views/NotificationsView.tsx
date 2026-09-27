"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { NotificationKind } from "@/lib/types";
import { listNotifications, markRead, markUnread } from "@/lib/services/notifications";
import { useServiceAction, useServiceQuery } from "@/lib/services/hooks";
import { PageHeader, LoadingState } from "@/components/portal/PageHeader";
import { EmptyState } from "@/components/portal/RecordBits";
import { Button } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import styles from "@/components/portal/portal.module.css";

const kinds: NotificationKind[] = ["assigned_review", "deadline", "overdue", "document_expiry", "sync_failed", "integration_failed", "decision"];
const icons: Record<NotificationKind, IconName> = {
  changes_requested: "arrowLeft",
  assigned_review: "user",
  deadline: "calendar",
  overdue: "clock",
  document_expiry: "fileText",
  sync_failed: "wifiOff",
  integration_failed: "link",
  decision: "checkCircle",
};

export function NotificationsView() {
  const { t, formatDate } = useI18n();
  const id = useId();
  const { data } = useServiceQuery(listNotifications);
  const action = useServiceAction();
  const [kind, setKind] = useState<NotificationKind | "">("");
  const [unreadOnly, setUnreadOnly] = useState(false);

  const header = <PageHeader title={t("portal.notifications.title")} intro={t("portal.notifications.intro")} />;
  if (!data) {
    return (
      <>
        {header}
        <LoadingState label={t("common.loading")} />
      </>
    );
  }
  const list = data.filter((n) => (!kind || n.kind === kind) && (!unreadOnly || !n.read));
  const unread = data.filter((n) => !n.read);

  return (
    <>
      {header}
      <div className={styles.toolbar}>
        <div className={styles.toolbarField}>
          <label htmlFor={`${id}-k`} className={styles.toolbarLabel}>
            {t("portal.notifications.type")}
          </label>
          <select id={`${id}-k`} className={styles.toolbarSelect} value={kind} onChange={(e) => setKind(e.target.value as NotificationKind | "")}>
            <option value="">{t("common.all")}</option>
            {kinds.map((k) => (
              <option key={k} value={k}>
                {t(`portal.notifications.kinds.${k}` as MessageKey)} ({data.filter((n) => n.kind === k).length})
              </option>
            ))}
          </select>
        </div>
        <label className={styles.checkRow}>
          <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
          <span>{t("portal.notifications.unreadOnly")}</span>
        </label>
        <Button variant="secondary" size="sm" icon="check" disabled={unread.length === 0 || Boolean(action.pending)} onClick={() => action.run("all", () => markRead(unread.map((n) => n.id)))}>
          {t("portal.notifications.markAll")}
        </Button>
        <p className={styles.resultCount} aria-live="polite">
          {t("portal.notifications.count", { count: list.length, unread: unread.length })}
        </p>
      </div>
      {list.length === 0 ? (
        <EmptyState icon="bell" title={t("portal.notifications.empty")} />
      ) : (
        <ul className={styles.notificationList}>
          {list.map((n) => (
            <li key={n.id} className={`${styles.notification} ${n.read ? "" : styles.notificationUnread}`}>
              <span className={styles.notificationIcon} aria-hidden="true">
                <Icon name={icons[n.kind]} size={18} />
              </span>
              <div className={styles.notificationBody}>
                <p className={styles.alertKind}>
                  {t(`portal.notifications.kinds.${n.kind}` as MessageKey)}
                  {!n.read && <span className={styles.unreadDot}>{t("portal.notifications.new")}</span>}
                </p>
                <Link href={n.href} className={styles.recordLink} onClick={() => !n.read && markRead([n.id])}>
                  {t(`portal.notify.${n.message}` as MessageKey, n.params)}
                </Link>
                <p className={styles.timelineMeta}>
                  <time dateTime={n.at}>{formatDate(n.at, true)}</time>
                </p>
              </div>
              <Button size="sm" variant="ghost" icon={n.read ? "eyeOff" : "check"} onClick={() => (n.read ? markUnread(n.id) : markRead([n.id]))}>
                {n.read ? t("portal.notifications.markUnread") : t("portal.notifications.markRead")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
