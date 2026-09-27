"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { FieldPermission } from "@/lib/types";
import { allFieldPermissions } from "@/lib/demo/reference";
import { markFieldNotificationsRead } from "@/lib/services/fieldWork";
import { signOut } from "@/lib/services/session";
import { useConnectivity } from "@/lib/field/connectivity";
import { syncNow } from "@/lib/field/client";
import { useInstall } from "@/lib/field/install";
import { Badge } from "@/components/ui/Badge";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Icon, type IconName } from "@/components/ui/Icon";
import { LanguagePills } from "@/components/ui/LanguagePills";
import { Notice } from "@/components/ui/Notice";
import { useDevice, useFieldAction, useFieldData, useSyncRunning } from "../FieldData";
import { KV, PageHead, SourceNote } from "../FieldBits";
import { useLookups } from "../lookup";
import { recordHref } from "./WorkViews";
import styles from "../field.module.css";

/* ========================================================= Notifications */

type Kind = "assignments" | "deadlines" | "reviews" | "sync";
interface Row {
  key: string;
  kind: Kind;
  at: string;
  text: string;
  detail?: string;
  href: string;
  icon: IconName;
  unread: boolean;
}

const CENTRAL_KIND: Record<string, Kind> = {
  fieldTaskAssigned: "assignments",
  fieldTaskUpdated: "assignments",
  fieldTaskReassigned: "assignments",
  fieldTaskCancelled: "assignments",
  fieldFormVersion: "assignments",
  fieldReportReturned: "reviews",
  fieldReportAccepted: "reviews",
  fieldIssueUpdated: "reviews",
  fieldIssueForTeam: "reviews",
  fieldAllocationDifference: "reviews",
};

export function NotificationsView() {
  const { t, formatDate } = useI18n();
  const { snapshot, source } = useFieldData();
  const device = useDevice();
  const { online } = useConnectivity();
  const lk = useLookups();
  const { run, pending, error } = useFieldAction();
  const [filter, setFilter] = useState<"all" | Kind>("all");
  if (!snapshot) return <SourceNote />;

  const rows: Row[] = [];
  for (const n of snapshot.notifications) {
    const kind = CENTRAL_KIND[n.message] ?? "assignments";
    let detail: string | undefined;
    if (n.message === "fieldReportReturned") {
      const sub = snapshot.submissions.find((s) => s.kind === "report" && s.ref === n.params.ref);
      const last = sub && (sub.kind === "report" || sub.kind === "survey") ? sub.comments[sub.comments.length - 1] : undefined;
      detail = last ? `“${last.text}” — ${last.author}` : undefined;
    }
    rows.push({ key: n.id, kind, at: n.at, text: t(`field.notify.${n.message}` as MessageKey, n.params), detail, href: n.href, icon: kind === "reviews" ? "messageSquare" : "inbox", unread: !n.read });
  }
  const soon = Date.now() + 24 * 60 * 60 * 1000;
  for (const task of snapshot.tasks.filter((x) => x.assignedTo === snapshot.userId && !["completed", "cancelled", "submitted"].includes(x.status) && new Date(x.dueAt).getTime() < soon)) {
    const overdue = new Date(task.dueAt).getTime() < Date.now();
    rows.push({ key: `due-${task.id}`, kind: "deadlines", at: task.dueAt, text: t(overdue ? "field.notify.overdue" : "field.notify.dueSoon", { ref: task.ref, title: task.title, at: formatDate(task.dueAt, true) }), href: `/field/task?id=${task.id}`, icon: "clock", unread: overdue });
  }
  for (const r of device.records.filter((x) => x.state === "failed" || x.state === "conflict")) {
    rows.push({
      key: `sync-${r.localId}`,
      kind: "sync",
      at: r.error?.at ?? r.updatedAt,
      text: r.state === "conflict" ? t("field.notify.syncConflict", { title: r.title }) : t("field.notify.syncFailed", { title: r.title }),
      detail: r.error ? t(`field.syncErrors.${r.error.code}.title` as MessageKey) : undefined,
      href: r.state === "conflict" ? "/field/sync#problems" : recordHref(r),
      icon: "alertTriangle",
      unread: true,
    });
  }
  rows.sort((a, b) => b.at.localeCompare(a.at));
  const shown = rows.filter((r) => filter === "all" || r.kind === filter);
  const unreadCentral = snapshot.notifications.filter((n) => !n.read).map((n) => n.id);
  void lk;

  return (
    <div className={styles.stack}>
      <PageHead title={t("field.notifications.title")} intro={t("field.notifications.intro")} />
      <SourceNote />
      <div className={styles.filters} role="group" aria-label={t("field.notifications.filterLabel")}>
        {(["all", "assignments", "deadlines", "reviews", "sync"] as const).map((f) => (
          <button key={f} type="button" className={styles.chip} aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {t(`field.notifications.filter.${f}`)} ({f === "all" ? rows.length : rows.filter((r) => r.kind === f).length})
          </button>
        ))}
      </div>
      {unreadCentral.length > 0 && (
        <div className={styles.actions}>
          <Button size="sm" variant="secondary" icon="check" disabled={!online || Boolean(pending)} onClick={() => void run("read", () => markFieldNotificationsRead(unreadCentral))}>
            {online ? t("field.notifications.markRead") : t("field.notifications.markReadOffline")}
          </Button>
        </div>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {shown.length === 0 ? (
        <p className={styles.muted}>{t("field.notifications.none")}</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((r) => (
            <li key={r.key}>
              <Link href={r.href} className={styles.item}>
                <span className={styles.itemTop}>
                  <span className={styles.itemTitle}>
                    <Icon name={r.icon} size={18} /> {r.text}
                  </span>
                  {r.unread && <Badge tone="info">{t("field.notifications.new")}</Badge>}
                </span>
                {r.detail && <span className={styles.small}>{r.detail}</span>}
                <span className={styles.itemMeta}>
                  <span>{t(`field.notifications.filter.${r.kind}`)}</span>
                  <span>{formatDate(r.at, true)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {source === "device" && <p className={`${styles.small} ${styles.muted}`}>{t("field.notifications.cachedNote")}</p>}
    </div>
  );
}

/* ================================================================ Account */

export function AccountView() {
  const { t, formatDate } = useI18n();
  const router = useRouter();
  const { snapshot } = useFieldData();
  const device = useDevice();
  const { online } = useConnectivity();
  const running = useSyncRunning();
  const lk = useLookups();
  const install = useInstall();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const { run, pending, error } = useFieldAction();
  if (!snapshot) return <SourceNote />;
  const a = snapshot.account;
  const unsynced = device.records.filter((r) => r.state !== "synced");
  const isIos = typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);

  async function doSignOut() {
    dialogRef.current?.close();
    await signOut({ audit: online });
    router.push("/sign-in");
  }

  return (
    <div className={styles.stack}>
      <PageHead title={t("field.account.title")} />
      <SourceNote />
      <section className={styles.card} aria-labelledby="acc-profile">
        <h2 id="acc-profile" className={styles.cardTitle}>
          {t("field.account.profile")}
        </h2>
        <KV
          items={[
            { label: t("field.account.name"), value: a.name },
            { label: t("field.account.role"), value: t(`portal.roles.${a.role}` as MessageKey) },
            { label: t("field.account.organisation"), value: a.organisation.acronym ? `${a.organisation.name} (${a.organisation.acronym})` : a.organisation.name, wide: true },
            { label: t("field.account.settlement"), value: snapshot.settlements.map((s) => `${s.name} (${s.district})`).join(", ") },
            { label: t("field.account.email"), value: a.email },
            { label: t("field.account.interventions"), value: snapshot.interventions.map((i) => `${i.ref} — ${i.title}`).join("; "), wide: true },
          ]}
        />
      </section>

      <section className={styles.card} aria-labelledby="acc-permissions">
        <h2 id="acc-permissions" className={styles.cardTitle}>
          {t("field.account.permissions")}
        </h2>
        <p className={`${styles.small} ${styles.muted}`}>{t("field.account.permissionsNote")}</p>
        <ul className={styles.list}>
          {allFieldPermissions
            .filter((p) => a.role === "field_supervisor" || !["work.assign", "work.review"].includes(p))
            .map((p: FieldPermission) => {
              const has = a.permissions.includes(p);
              return (
                <li key={p} className={styles.itemMeta}>
                  <Badge tone={has ? "success" : "neutral"} icon={has ? "checkCircle" : "minusCircle"}>
                    {has ? t("field.account.granted") : t("field.account.notGranted")}
                  </Badge>
                  <span>{t(`field.permissions.${p}` as MessageKey)}</span>
                </li>
              );
            })}
        </ul>
        <p className={`${styles.small} ${styles.muted}`}>{t("field.account.cannot")}</p>
      </section>

      <section className={styles.card} aria-labelledby="acc-language">
        <h2 id="acc-language" className={styles.cardTitle}>
          {t("field.account.language")}
        </h2>
        <LanguagePills />
        <p className={`${styles.small} ${styles.muted}`}>{online ? t("field.account.languageNote") : t("field.account.languageOffline")}</p>
      </section>

      <section className={styles.card} aria-labelledby="acc-device">
        <h2 id="acc-device" className={styles.cardTitle}>
          {t("field.account.device")}
        </h2>
        <p>{t("field.account.deviceSummary", { records: device.records.length, unsynced: unsynced.length })}</p>
        <p className={`${styles.small} ${styles.muted}`}>{device.lastSyncAt ? t("field.sync.last", { at: formatDate(device.lastSyncAt, true) }) : t("field.sync.neverLong")}</p>
        <div className={styles.actions}>
          <ButtonLink variant="secondary" href="/field/sync" icon="refresh">
            {t("field.nav.sync")}
          </ButtonLink>
          {install.canPrompt && !install.installed && (
            <Button icon="download" onClick={() => void install.prompt()}>
              {t("field.account.install")}
            </Button>
          )}
        </div>
        {install.installed ? <p className={styles.small}>{t("field.account.installed")}</p> : !install.canPrompt && <p className={`${styles.small} ${styles.muted}`}>{isIos ? t("field.account.installIos") : t("field.account.installHint")}</p>}
        <p className={`${styles.small} ${styles.muted}`}>{t("field.account.offlineShell")}</p>
      </section>

      <section className={styles.card} aria-labelledby="acc-signout">
        <h2 id="acc-signout" className={styles.cardTitle}>
          {t("field.account.signOutTitle")}
        </h2>
        <p className={`${styles.small} ${styles.muted}`}>{t("field.account.signOutNote")}</p>
        <div className={styles.actions}>
          <Button variant="secondary" icon="logOut" onClick={() => (unsynced.length ? dialogRef.current?.showModal() : void doSignOut())}>
            {t("portal.signOut")}
          </Button>
        </div>
      </section>

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="signout-title">
        <div className={styles.dialogBody}>
          <h2 id="signout-title">{t("field.account.unsyncedTitle", { count: unsynced.length })}</h2>
          <p>{t("field.account.unsyncedBody")}</p>
          <div className={styles.actions}>
            {online && (
              <Button icon="refresh" disabled={running || Boolean(pending)} onClick={() => void run("sync", async () => (await syncNow(), dialogRef.current?.close()))}>
                {t("field.account.syncFirst")}
              </Button>
            )}
            <Button variant="secondary" icon="logOut" onClick={() => void doSignOut()}>
              {t("field.account.signOutKeep")}
            </Button>
            <Button variant="ghost" onClick={() => dialogRef.current?.close()}>
              {t("common.cancel")}
            </Button>
          </div>
          {error && <p role="alert">{error}</p>}
        </div>
      </dialog>
      <p className={`${styles.small} ${styles.muted}`}>{t("field.account.demoNote", { settlement: lk.settlementName(snapshot.settlements[0]?.id) })}</p>
    </div>
  );
}
