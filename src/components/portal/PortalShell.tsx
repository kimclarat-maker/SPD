"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { DemoSession, EntityType, Permission } from "@/lib/types";
import { getSession, homeFor, signOut } from "@/lib/services/session";
import { getAttentionCounts } from "@/lib/services/dashboard";
import { listNotifications } from "@/lib/services/notifications";
import { useCan, useServiceQuery } from "@/lib/services/hooks";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { LanguagePills } from "@/components/ui/LanguagePills";
import styles from "./PortalShell.module.css";

type NavItem = { href: string; label: MessageKey; icon: IconName; entity?: EntityType; requires?: Permission[] };

const groups: { label: MessageKey; items: NavItem[] }[] = [
  {
    label: "portal.nav.groupOverview",
    items: [
      { href: "/portal", label: "portal.nav.dashboard", icon: "grid" },
      { href: "/portal/notifications", label: "portal.nav.notifications", icon: "bell" },
    ],
  },
  {
    label: "portal.nav.groupCoordination",
    items: [
      { href: "/portal/partners", label: "portal.nav.partners", icon: "handshake", entity: "partner" },
      { href: "/portal/interventions", label: "portal.nav.interventions", icon: "clipboard", entity: "intervention" },
      { href: "/portal/field-reports", label: "portal.nav.fieldReports", icon: "smartphone", entity: "fieldReport" },
      { href: "/portal/surveys", label: "portal.nav.surveys", icon: "target" },
    ],
  },
  {
    label: "portal.nav.groupOversight",
    items: [
      { href: "/portal/beneficiaries", label: "portal.nav.beneficiaries", icon: "users", entity: "review", requires: ["beneficiary.aggregate"] },
      { href: "/portal/cases", label: "portal.nav.cases", icon: "inbox", entity: "case", requires: ["case.monitor"] },
      { href: "/portal/documents", label: "portal.nav.documents", icon: "fileText", entity: "document" },
      { href: "/portal/gis", label: "portal.nav.gis", icon: "map" },
    ],
  },
  {
    label: "portal.nav.groupReporting",
    items: [
      { href: "/portal/reports", label: "portal.nav.reports", icon: "fileCheck", entity: "report" },
      { href: "/portal/integrations", label: "portal.nav.integrations", icon: "link", entity: "integration", requires: ["integration.view"] },
    ],
  },
  {
    label: "portal.nav.groupSystem",
    items: [
      { href: "/portal/audit", label: "portal.nav.audit", icon: "history", requires: ["audit.view"] },
      { href: "/portal/admin", label: "portal.nav.admin", icon: "settings", requires: ["admin.users", "admin.reference", "admin.security"] },
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
  const can = useCan();
  const [session, setSession] = useState<DemoSession | null>(null);
  const [checked, setChecked] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navToggleRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const { data: counts } = useServiceQuery(getAttentionCounts);
  const { data: notifications } = useServiceQuery(listNotifications);
  const unread = (notifications ?? []).filter((n) => !n.read).length;

  useEffect(() => {
    const current = getSession();
    if (!current) {
      router.replace("/sign-in");
      return;
    }
    // Partner and field users work in their own workspaces and never open the OPM workspace.
    if (homeFor(current) !== "/portal") {
      router.replace(homeFor(current));
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

  const scopeLabel =
    session.scope.level === "national" ? t("portal.scope.national") : t("portal.scope.limited", { areas: session.scope.ids.join(", ") });

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
            {t(`portal.roles.${session.role}` as MessageKey)} · {scopeLabel}
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
              const count = item.entity ? (counts?.[item.entity] ?? 0) : item.href === "/portal/notifications" ? unread : 0;
              const locked = item.requires ? !item.requires.some((p) => can(p)) : false;
              const label = t(item.label);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`${styles.navLink} ${active ? styles.active : ""}`}
                    aria-current={active ? "page" : undefined}
                    title={compact ? label : undefined}
                  >
                    <Icon name={item.icon} size={20} />
                    <span className={compact ? "visually-hidden" : styles.navText}>{label}</span>
                    {locked && (
                      <span className={styles.navLock} title={t("portal.denied.navHint")}>
                        <Icon name="lock" size={14} />
                        <span className="visually-hidden">{t("portal.denied.navHint")}</span>
                      </span>
                    )}
                    {!locked && count > 0 && (
                      <span className={styles.count}>
                        {count}
                        <span className="visually-hidden"> — {t("portal.nav.needsAttention", { count })}</span>
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
            <Link href="/portal/notifications" className={styles.bell} aria-label={t("portal.notifications.bellLabel", { count: unread })}>
              <Icon name="bell" size={20} />
              {unread > 0 && (
                <span className={styles.bellCount} aria-hidden="true">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <LanguagePills />
            <Button variant="secondary" size="sm" icon="logOut" onClick={handleSignOut}>
              <span className={styles.hideSmall}>{t("portal.signOut")}</span>
            </Button>
          </div>
        </header>

        <main id="portal-main" ref={mainRef} tabIndex={-1} className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
}
