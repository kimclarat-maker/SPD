"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { FieldPermission } from "@/lib/types";
import { getSession, homeFor, signOut } from "@/lib/services/session";
import { resetDemo } from "@/lib/services/dashboard";
import { isFieldRole } from "@/lib/services/fieldContext";
import { useConnectivity } from "@/lib/field/connectivity";
import { clearDevice } from "@/lib/field/device";
import { clearFiles } from "@/lib/field/files";
import { syncNow } from "@/lib/field/client";
import "@/lib/field/install";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FieldDataProvider, useDevice, useFieldData, useSyncRunning } from "./FieldData";
import styles from "./field.module.css";

type NavItem = { href: string; label: MessageKey; icon: IconName; requires?: FieldPermission; count?: "sync" | "notifications" | "returned" };

const NAV: { group: MessageKey; items: NavItem[] }[] = [
  {
    group: "field.nav.groupWork",
    items: [
      { href: "/field", label: "field.nav.myWork", icon: "grid" },
      { href: "/field/interventions", label: "field.nav.interventions", icon: "activity" },
      { href: "/field/reports", label: "field.nav.reports", icon: "clipboard", count: "returned" },
      { href: "/field/surveys", label: "field.nav.surveys", icon: "target" },
      { href: "/field/verify", label: "field.nav.verify", icon: "shield", requires: "beneficiaries.verify" },
      { href: "/field/assistance", label: "field.nav.assistance", icon: "handshake", requires: "assistance.record" },
      { href: "/field/issues", label: "field.nav.issues", icon: "flag" },
      { href: "/field/map", label: "field.nav.map", icon: "map" },
      { href: "/field/team", label: "field.nav.team", icon: "users", requires: "work.assign" },
    ],
  },
  {
    group: "field.nav.groupDevice",
    items: [
      { href: "/field/sync", label: "field.nav.sync", icon: "refresh", count: "sync" },
      { href: "/field/notifications", label: "field.nav.notifications", icon: "bell", count: "notifications" },
      { href: "/field/account", label: "field.nav.account", icon: "user" },
    ],
  },
];

const TABS: NavItem[] = [
  { href: "/field", label: "field.nav.myWorkShort", icon: "grid" },
  { href: "/field/reports", label: "field.nav.reportsShort", icon: "clipboard", count: "returned" },
  { href: "/field/surveys", label: "field.nav.surveysShort", icon: "target" },
  { href: "/field/sync", label: "field.nav.syncShort", icon: "refresh", count: "sync" },
];

function isActive(pathname: string, href: string) {
  if (href === "/field") return pathname === "/field";
  return pathname === href || pathname.startsWith(`${href}/`) || pathname === href.replace(/s$/, "");
}

/** Registers the offline service worker in production builds (development chunks change on every edit). */
function useServiceWorker(locale: string) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/field-sw.js", { scope: "/field" })
      .then((reg) => {
        // The worker caches the screens when it installs. Re-cache them when the language
        // changes, so offline pages open in the officer's language.
        const key = "rpcms-field-sw-locale";
        let cachedLocale: string | null = null;
        try {
          cachedLocale = localStorage.getItem(key);
          localStorage.setItem(key, locale);
        } catch {
          // ignore
        }
        if (cachedLocale === null || cachedLocale === locale) return;
        const post = () => reg.active?.postMessage({ type: "precache", locale });
        if (reg.active) post();
        else navigator.serviceWorker.ready.then(post).catch(() => undefined);
      })
      .catch(() => undefined);
  }, [locale]);
}

function Counts({ children }: { children: (counts: { sync: number; syncAlert: boolean; notifications: number; returned: number }) => ReactNode }) {
  const device = useDevice();
  const { snapshot } = useFieldData();
  const queued = device.records.filter((r) => r.state === "pending" || r.state === "syncing").length;
  const problems = device.records.filter((r) => r.state === "failed" || r.state === "conflict").length;
  const notifications = snapshot?.notifications.filter((n) => !n.read).length ?? 0;
  const returned = snapshot?.submissions.filter((s) => s.kind === "report" && s.status === "returned").length ?? 0;
  return <>{children({ sync: queued + problems, syncAlert: problems > 0, notifications, returned })}</>;
}

function ConnectivityPill() {
  const { t, formatDate } = useI18n();
  const { online, simulatedOffline } = useConnectivity();
  const device = useDevice();
  const running = useSyncRunning();
  return (
    <>
      <span className={`${styles.pill} ${online ? styles.pillOnline : styles.pillOffline}`} role="status">
        <Icon name={online ? "cloud" : "wifiOff"} size={16} />
        {online ? t("field.connectivity.online") : simulatedOffline ? t("field.connectivity.offlineSimulated") : t("field.connectivity.offline")}
      </span>
      <Link href="/field/sync" className={`${styles.pill} ${styles.pillSync} ${styles.hideNarrow}`}>
        <Icon name="refresh" size={16} />
        {running ? t("field.sync.running") : device.lastSyncAt ? t("field.sync.lastShort", { at: formatDate(device.lastSyncAt, true) }) : t("field.sync.never")}
      </Link>
    </>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const router = useRouter();
  const { online, simulatedOffline } = useConnectivity();
  const { snapshot } = useFieldData();
  const device = useDevice();
  const [moreOpen, setMoreOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);
  const resetRef = useRef<HTMLDialogElement>(null);
  const [announcement, setAnnouncement] = useState("");
  const wasOnline = useRef(online);
  useServiceWorker(locale);

  const can = (p?: FieldPermission) => !p || Boolean(snapshot?.account.permissions.includes(p));

  // Announce connectivity changes, and sync automatically on reconnect if the officer chose to.
  useEffect(() => {
    if (wasOnline.current !== online) {
      setAnnouncement(online ? t("field.connectivity.backOnline") : t("field.connectivity.wentOffline"));
      if (online && device.settings.autoSync && device.records.some((r) => r.state === "pending")) void syncNow().catch(() => undefined);
    }
    wasOnline.current = online;
  }, [online, t, device.settings.autoSync, device.records]);

  const first = useRef(true);
  useEffect(() => {
    setMoreOpen(false);
    if (first.current) {
      first.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMoreOpen(false);
        moreRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  async function handleReset() {
    resetRef.current?.close();
    await resetDemo();
    clearDevice();
    await clearFiles("dev-");
    await clearFiles("field-");
    setAnnouncement(t("portal.resetDone"));
    router.push("/field");
  }

  const navLinks = (counts: { sync: number; syncAlert: boolean; notifications: number; returned: number }, onPick?: () => void) =>
    NAV.map((group) => (
      <div key={group.group}>
        <p className={styles.navGroup}>{t(group.group)}</p>
        <ul className={styles.navList}>
          {group.items
            .filter((item) => can(item.requires))
            .map((item) => {
              const count = item.count ? counts[item.count] : 0;
              return (
                <li key={item.href}>
                  <Link href={item.href} className={styles.navLink} aria-current={isActive(pathname, item.href) ? "page" : undefined} onClick={onPick}>
                    <Icon name={item.icon} size={20} />
                    <span>{t(item.label)}</span>
                    {count > 0 && (
                      <span className={`${styles.navCount} ${item.count === "sync" && counts.syncAlert ? styles.navCountAlert : ""}`}>
                        {count}
                        <span className="visually-hidden"> — {t("field.nav.countHint", { count })}</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
        </ul>
      </div>
    ));

  return (
    <Counts>
      {(counts) => (
        <div className={styles.shell}>
          <a href="#field-main" className="skip-link">
            {t("common.skipToContent")}
          </a>
          <div>
            <header className={styles.topbar}>
              <Link href="/field" className={styles.brand} aria-label={`${t("common.shortName")} — ${t("field.portalName")}`}>
                <span className={styles.brandMark} aria-hidden="true">
                  <Icon name="smartphone" size={18} />
                </span>
                <span className={styles.brandText}>
                  <span>{t("common.shortName")}</span>
                  <span className={styles.brandSub}>{t("field.portalShort")}</span>
                </span>
              </Link>
              <div className={styles.topActions}>
                <ConnectivityPill />
                <Link href="/field/notifications" className={styles.iconLink} aria-label={t("portal.notifications.bellLabel", { count: counts.notifications })}>
                  <Icon name="bell" size={20} />
                  {counts.notifications > 0 && (
                    <span className={styles.dot} aria-hidden="true">
                      {counts.notifications > 9 ? "9+" : counts.notifications}
                    </span>
                  )}
                </Link>
              </div>
            </header>
            {!online && (
              <div className={styles.offlineBanner} role="status">
                <Icon name="wifiOff" size={20} />
                <p>
                  {simulatedOffline ? t("field.offline.bannerSimulated") : t("field.offline.banner")} <Link href="/field/sync">{t("field.offline.bannerLink")}</Link>
                </p>
              </div>
            )}
            <div className={styles.demoBar} role="note">
              <Badge tone="simulated">{t("common.simulated")}</Badge>
              <span>{t("field.demoBanner")}</span>
              <Button size="sm" variant="ghost" icon="refresh" onClick={() => resetRef.current?.showModal()}>
                {t("portal.resetDemo")}
              </Button>
            </div>
          </div>

          <div className={styles.body}>
            <aside className={styles.sidebar} aria-label={t("field.nav.label")}>
              <nav aria-label={t("field.nav.label")}>{navLinks(counts)}</nav>
            </aside>
            <main id="field-main" ref={mainRef} tabIndex={-1} className={styles.main}>
              {children}
            </main>
          </div>

          <nav className={styles.tabbar} aria-label={t("field.nav.tabsLabel")}>
            {TABS.map((tab) => {
              const count = tab.count ? counts[tab.count] : 0;
              return (
                <Link key={tab.href} href={tab.href} className={styles.tab} aria-current={isActive(pathname, tab.href) ? "page" : undefined}>
                  <Icon name={tab.icon} size={22} />
                  <span>{t(tab.label)}</span>
                  {count > 0 && (
                    <span className={styles.tabDot}>
                      {count}
                      <span className="visually-hidden"> — {t("field.nav.countHint", { count })}</span>
                    </span>
                  )}
                </Link>
              );
            })}
            <button ref={moreRef} type="button" className={styles.tab} aria-expanded={moreOpen} aria-controls="field-more" onClick={() => setMoreOpen((v) => !v)}>
              <Icon name="menu" size={22} />
              <span>{t("field.nav.more")}</span>
            </button>
          </nav>
          {moreOpen && (
            <>
              <div className={styles.scrim} onClick={() => setMoreOpen(false)} aria-hidden="true" />
              <div id="field-more" className={styles.sheet} role="dialog" aria-modal="true" aria-label={t("field.nav.more")}>
                <div className={styles.sheetHead}>
                  <strong>{t("field.nav.more")}</strong>
                  <Button size="sm" variant="ghost" icon="x" onClick={() => (setMoreOpen(false), moreRef.current?.focus())}>
                    {t("common.close")}
                  </Button>
                </div>
                <nav aria-label={t("field.nav.label")}>{navLinks(counts, () => setMoreOpen(false))}</nav>
              </div>
            </>
          )}

          <dialog ref={resetRef} className={styles.dialog} aria-labelledby="field-reset-title">
            <div className={styles.dialogBody}>
              <h2 id="field-reset-title">{t("portal.resetDemo")}</h2>
              <p>{t("field.resetConfirm")}</p>
              <div className={styles.actions}>
                <Button variant="secondary" onClick={() => resetRef.current?.close()}>
                  {t("common.cancel")}
                </Button>
                <Button variant="danger" icon="refresh" onClick={handleReset}>
                  {t("common.confirm")}
                </Button>
              </div>
            </div>
          </dialog>
          <div className="visually-hidden" aria-live="polite">
            {announcement}
          </div>
        </div>
      )}
    </Counts>
  );
}

/**
 * Field Operations Portal workspace for authorised field officers and
 * settlement supervisors. Client-rendered: its screens read the device store
 * and, when online, the central system through the field services.
 */
export function FieldShell({ children, fontClassName }: { children: ReactNode; fontClassName?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      router.replace("/sign-in");
      return;
    }
    if (!isFieldRole(session.role)) {
      router.replace(homeFor(session));
      return;
    }
    setChecked(true);
  }, [router]);

  if (!checked) {
    return (
      <div className={`${fontClassName ?? ""} ${styles.checking}`} role="status">
        <Icon name="lock" size={24} />
        <p>{t("portal.checkingSession")}</p>
      </div>
    );
  }
  return (
    <div className={fontClassName}>
      <FieldDataProvider>
        <Shell>{children}</Shell>
      </FieldDataProvider>
    </div>
  );
}

export async function fieldSignOut(): Promise<void> {
  await signOut();
}
