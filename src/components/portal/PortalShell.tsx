"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { DemoSession, EntityType } from "@/lib/types";
import { getSession, signOut } from "@/lib/services/session";
import { getAlerts, resetDemo } from "@/lib/services/dashboard";
import { useServiceQuery } from "@/lib/services/hooks";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LanguagePills } from "@/components/ui/LanguagePills";
import styles from "./PortalShell.module.css";

type NavItem = { href: string; label: MessageKey; icon: IconName; entity?: EntityType };

const groups: { label: MessageKey; items: NavItem[] }[] = [
  {
    label: "portal.nav.groupWork",
    items: [
      { href: "/portal", label: "portal.nav.dashboard", icon: "grid" },
      { href: "/portal/partners", label: "portal.nav.partners", icon: "handshake", entity: "partner" },
      { href: "/portal/interventions", label: "portal.nav.interventions", icon: "clipboard", entity: "intervention" },
      { href: "/portal/field-reports", label: "portal.nav.fieldReports", icon: "smartphone", entity: "fieldReport" },
      { href: "/portal/exceptions", label: "portal.nav.exceptions", icon: "layers", entity: "exception" },
      { href: "/portal/cases", label: "portal.nav.cases", icon: "inbox", entity: "case" },
    ],
  },
  {
    label: "portal.nav.groupOversight",
    items: [
      { href: "/portal/analytics", label: "portal.nav.analytics", icon: "barChart" },
      { href: "/portal/reports", label: "portal.nav.reports", icon: "fileCheck", entity: "report" },
      { href: "/portal/integrations", label: "portal.nav.integrations", icon: "link", entity: "integration" },
      { href: "/portal/audit", label: "portal.nav.audit", icon: "history" },
    ],
  },
];

const COLLAPSE_KEY = "rpcms-sidebar-collapsed";

function isActive(pathname: string, href: string) {
  return href === "/portal" ? pathname === "/portal" : pathname === href || pathname.startsWith(`${href}/`);
}

export function PortalShell({ children, fontClassName }: { children: ReactNode; fontClassName?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<DemoSession | null>(null);
  const [checked, setChecked] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navToggleRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const { data: alerts } = useServiceQuery(getAlerts);

  useEffect(() => {
    const current = getSession();
    if (!current) {
      router.replace("/sign-in");
      return;
    }
    setSession(current);
    setChecked(true);
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      // ignore
    }
  }, [router]);

  // Close the drawer on navigation and move focus to the new page's content.
  const firstRender = useRef(true);
  useEffect(() => {
    setNavOpen(false);
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname]);

  useEffect(() => {
    if (!navOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavOpen(false);
        navToggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [navOpen]);

  if (!checked || !session) {
    return (
      <div className={`${fontClassName ?? ""} ${styles.checking}`} role="status">
        <Icon name="lock" size={24} />
        <p>{t("portal.checkingSession")}</p>
      </div>
    );
  }

  const countFor = (entity?: EntityType) => (entity ? (alerts ?? []).filter((a) => a.entity === entity).length : 0);

  function toggleCollapsed() {
    setCollapsed((value) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, value ? "0" : "1");
      } catch {
        // ignore
      }
      return !value;
    });
  }

  const identity = (compact: boolean) => (
    <div className={styles.identity}>
      {compact ? (
        <span className={styles.avatar} title={`${t("portal.signedInLabel")} ${session.displayName}`}>
          <Icon name="user" size={20} />
          <span className="visually-hidden">
            {t("portal.signedInLabel")} {session.displayName}
          </span>
        </span>
      ) : (
        <>
          <p className={styles.identityLabel}>{t("portal.signedInLabel")}</p>
          <p className={styles.identityName}>{session.displayName}</p>
          <p className={styles.identityRole}>
            {t("portal.roleName")} · {t("portal.scope")}
          </p>
          <p className={styles.mfa}>
            <Icon name="alertTriangle" size={14} />
            {t("portal.noMfa")}
          </p>
        </>
      )}
    </div>
  );

  const nav = (compact: boolean) => (
    <nav aria-label={t("portal.sidebarLabel")} className={styles.nav}>
      {groups.map((group) => (
        <div key={group.label} className={styles.group}>
          <p className={compact ? "visually-hidden" : styles.groupLabel}>{t(group.label)}</p>
          <ul>
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const count = countFor(item.entity);
              const label = t(item.label);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`${styles.navLink} ${active ? styles.active : ""}`}
                    aria-current={active ? "page" : undefined}
                    title={compact ? label : undefined}
                  >
                    <Icon name={item.icon} size={22} />
                    <span className={compact ? "visually-hidden" : styles.navText}>{label}</span>
                    {count > 0 && (
                      <span className={styles.count}>
                        {count}
                        <span className="visually-hidden"> — {t("portal.dashboard.alertsCount", { count })}</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  async function handleReset() {
    dialogRef.current?.close();
    await resetDemo();
    setAnnouncement(t("portal.resetDone"));
    router.push("/portal");
  }

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
  }

  return (
    <div className={`${fontClassName ?? ""} ${styles.shell} ${collapsed ? styles.isCollapsed : ""}`}>
      <a href="#portal-main" className="skip-link">
        {t("common.skipToContent")}
      </a>

      <aside className={styles.sidebar}>
        {identity(collapsed)}
        {nav(collapsed)}
        <div className={styles.sidebarFoot}>
          <button
            type="button"
            className={styles.collapse}
            onClick={toggleCollapsed}
            aria-pressed={collapsed}
            aria-label={collapsed ? t("portal.expand") : t("portal.collapse")}
          >
            {!collapsed && <span>{t("portal.collapse")}</span>}
            <Icon name="chevronRight" size={18} className={collapsed ? "" : styles.chevronBack} />
          </button>
        </div>
      </aside>

      <div id="portal-drawer" className={styles.drawer} hidden={!navOpen}>
        <div className={styles.drawerHead}>
          {identity(false)}
          <button
            type="button"
            className={styles.iconButton}
            onClick={() => {
              setNavOpen(false);
              navToggleRef.current?.focus();
            }}
            aria-label={t("portal.closeNav")}
          >
            <Icon name="x" size={22} />
          </button>
        </div>
        {nav(false)}
      </div>
      {navOpen && <div className={styles.scrim} onClick={() => setNavOpen(false)} aria-hidden="true" />}

      <div className={styles.column}>
        <header className={styles.topbar}>
          <button
            ref={navToggleRef}
            type="button"
            className={`${styles.iconButton} ${styles.navToggle}`}
            aria-expanded={navOpen}
            aria-controls="portal-drawer"
            aria-label={navOpen ? t("portal.closeNav") : t("portal.openNav")}
            onClick={() => setNavOpen((v) => !v)}
          >
            <Icon name="menu" size={22} />
          </button>
          <div className={styles.brand}>
            <Logo href="/portal" shortName={t("common.shortName")} fullName={t("portal.portalName")} homeLabel={t("portal.nav.dashboard")} />
          </div>
          <div className={styles.topActions}>
            <LanguagePills />
            <Button
              variant="ghost"
              size="sm"
              icon="refresh"
              aria-label={t("portal.resetDemo")}
              onClick={() => dialogRef.current?.showModal()}
            >
              <span className={styles.hideSmall}>{t("portal.resetDemo")}</span>
            </Button>
            <Button variant="secondary" size="sm" icon="logOut" onClick={handleSignOut}>
              {t("portal.signOut")}
            </Button>
          </div>
        </header>
        <div className={styles.demoBanner} role="note">
          <Badge tone="simulated">{t("common.simulated")}</Badge>
          <span>{t("portal.demoBanner")}</span>
        </div>

        <main id="portal-main" ref={mainRef} tabIndex={-1} className={styles.main}>
          {children}
        </main>
      </div>

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="reset-title">
        <h2 id="reset-title">{t("portal.resetDemo")}</h2>
        <p>{t("portal.resetConfirm")}</p>
        <div className={styles.dialogActions}>
          <Button variant="secondary" onClick={() => dialogRef.current?.close()}>
            {t("common.cancel")}
          </Button>
          <Button variant="danger" icon="refresh" onClick={handleReset}>
            {t("common.confirm")}
          </Button>
        </div>
      </dialog>

      <div className="visually-hidden" aria-live="polite">
        {announcement}
      </div>
    </div>
  );
}
