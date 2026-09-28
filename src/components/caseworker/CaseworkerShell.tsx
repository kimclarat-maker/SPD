"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { DemoSession } from "@/lib/types";
import { getSession, homeFor, signOut } from "@/lib/services/session";
import { isCaseworkerRole, caseworkerTeam } from "@/lib/services/caseworkerContext";
import { listMyQueue } from "@/lib/services/cases";
import { useServiceQuery } from "@/lib/services/hooks";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { LanguagePills } from "@/components/ui/LanguagePills";
import styles from "@/components/portal/PortalShell.module.css";

type NavItem = { href: string; label: MessageKey; icon: IconName; badge?: "queue" };

const navItems: NavItem[] = [
  { href: "/caseworker", label: "caseworker.nav.dashboard", icon: "grid" },
  { href: "/caseworker/queue", label: "caseworker.nav.queue", icon: "inbox", badge: "queue" },
  { href: "/caseworker/cases", label: "caseworker.nav.myCases", icon: "clipboard" },
];

const COLLAPSE_KEY = "rpcms-caseworker-sidebar-collapsed";

function isActive(pathname: string, href: string) {
  return href === "/caseworker" ? pathname === "/caseworker" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Caseworker Portal workspace. Same design system and behaviour as the OPM
 * workspace, but scoped to the signed-in caseworker's own team queue and
 * claimed cases — every action reuses src/lib/services/cases.ts as-is.
 */
export function CaseworkerShell({ children, fontClassName }: { children: ReactNode; fontClassName?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<DemoSession | null>(null);
  const [checked, setChecked] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const navToggleRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const { data: queue } = useServiceQuery(() => (checked ? listMyQueue() : Promise.resolve([])), [checked]);

  useEffect(() => {
    const current = getSession();
    if (!current) {
      router.replace("/sign-in");
      return;
    }
    if (!isCaseworkerRole(current.role)) {
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

  const team = caseworkerTeam();
  const queueCount = queue?.length ?? 0;

  const identityBlock = (compact: boolean) => (
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
            {t("portal.roles.caseworker")} · {team ?? t("caseworker.noTeam")}
          </p>
        </>
      )}
    </div>
  );

  const nav = (compact: boolean) => (
    <nav aria-label={t("caseworker.nav.label")} className={styles.nav}>
      <div className={styles.group}>
        <p className={compact ? "visually-hidden" : styles.groupLabel}>{t("caseworker.portalName")}</p>
        <ul>
          {navItems.map((item) => {
            const active = isActive(pathname, item.href);
            const count = item.badge === "queue" ? queueCount : 0;
            const label = t(item.label);
            return (
              <li key={item.href}>
                <Link href={item.href} className={`${styles.navLink} ${active ? styles.active : ""}`} aria-current={active ? "page" : undefined} title={compact ? label : undefined}>
                  <Icon name={item.icon} size={20} />
                  <span className={compact ? "visually-hidden" : styles.navText}>{label}</span>
                  {count > 0 && (
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
    </nav>
  );

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
  }

  return (
    <div className={`${fontClassName ?? ""} ${styles.shell} ${collapsed ? styles.isCollapsed : ""}`}>
      <a href="#caseworker-main" className="skip-link">
        {t("common.skipToContent")}
      </a>

      <aside className={styles.sidebar}>
        {identityBlock(collapsed)}
        {nav(collapsed)}
        <div className={styles.sidebarFoot}>
          <button type="button" className={styles.collapse} onClick={toggleCollapsed} aria-pressed={collapsed} aria-label={collapsed ? t("portal.expand") : t("portal.collapse")}>
            {!collapsed && <span>{t("portal.collapse")}</span>}
            <Icon name="chevronRight" size={18} className={collapsed ? "" : styles.chevronBack} />
          </button>
        </div>
      </aside>

      <div id="caseworker-drawer" className={styles.drawer} hidden={!navOpen}>
        <div className={styles.drawerHead}>
          {identityBlock(false)}
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
            aria-controls="caseworker-drawer"
            aria-label={navOpen ? t("portal.closeNav") : t("portal.openNav")}
            onClick={() => setNavOpen((v) => !v)}
          >
            <Icon name="menu" size={22} />
          </button>
          <div className={styles.brand}>
            <Logo href="/caseworker" shortName={t("common.shortName")} fullName={t("caseworker.portalName")} homeLabel={t("caseworker.nav.dashboard")} />
          </div>
          <div className={styles.topActions}>
            <LanguagePills />
            <Button variant="secondary" size="sm" icon="logOut" onClick={handleSignOut}>
              <span className={styles.hideSmall}>{t("portal.signOut")}</span>
            </Button>
          </div>
        </header>

        <main id="caseworker-main" ref={mainRef} tabIndex={-1} className={styles.main}>
          {children}
        </main>
      </div>
    </div>
  );
}
