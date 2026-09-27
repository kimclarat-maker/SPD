"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import type { DemoSession, PartnerPermission } from "@/lib/types";
import { getSession, homeFor, signOut } from "@/lib/services/session";
import { resetDemo } from "@/lib/services/dashboard";
import { getPartnerNavCounts } from "@/lib/services/partnerInsights";
import { useServiceQuery } from "@/lib/services/hooks";
import { usePartnerCan, usePartnerIdentity } from "@/components/partner/partnerHooks";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { LanguagePills } from "@/components/ui/LanguagePills";
import styles from "@/components/portal/PortalShell.module.css";

type NavItem = { href: string; label: MessageKey; icon: IconName; requires?: PartnerPermission[] };

const groups: { label: MessageKey; items: NavItem[] }[] = [
  {
    label: "partner.nav.groupOverview",
    items: [
      { href: "/partner", label: "partner.nav.dashboard", icon: "grid" },
      { href: "/partner/messages", label: "partner.nav.messages", icon: "bell" },
    ],
  },
  {
    label: "partner.nav.groupOrganisation",
    items: [
      { href: "/partner/profile", label: "partner.nav.profile", icon: "building" },
      { href: "/partner/accreditation", label: "partner.nav.accreditation", icon: "shield" },
      { href: "/partner/documents", label: "partner.nav.documents", icon: "fileText" },
      { href: "/partner/agreements", label: "partner.nav.agreements", icon: "pen" },
    ],
  },
  {
    label: "partner.nav.groupWork",
    items: [
      { href: "/partner/proposals", label: "partner.nav.proposals", icon: "clipboard" },
      { href: "/partner/interventions", label: "partner.nav.interventions", icon: "activity" },
      { href: "/partner/field-reports", label: "partner.nav.fieldReports", icon: "smartphone" },
      { href: "/partner/surveys", label: "partner.nav.surveys", icon: "target" },
      { href: "/partner/beneficiaries", label: "partner.nav.beneficiaries", icon: "users", requires: ["beneficiaries.verify", "assistance.record"] },
      { href: "/partner/finance", label: "partner.nav.finance", icon: "barChart" },
    ],
  },
  {
    label: "partner.nav.groupReporting",
    items: [
      { href: "/partner/reports", label: "partner.nav.reports", icon: "fileCheck" },
      { href: "/partner/team", label: "partner.nav.team", icon: "settings" },
    ],
  },
];

const COLLAPSE_KEY = "rpcms-partner-sidebar-collapsed";

function isActive(pathname: string, href: string) {
  return href === "/partner" ? pathname === "/partner" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Partner Portal workspace. Same design system and behaviour as the OPM
 * workspace, but its own navigation and data: every screen reads through the
 * partner services, which only return the signed-in organisation's records.
 */
export function PartnerShell({ children, fontClassName }: { children: ReactNode; fontClassName?: string }) {
  const { t } = useI18n();
  const router = useRouter();
  const pathname = usePathname();
  const can = usePartnerCan();
  const identity = usePartnerIdentity();
  const [session, setSession] = useState<DemoSession | null>(null);
  const [checked, setChecked] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const navToggleRef = useRef<HTMLButtonElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const { data: counts } = useServiceQuery(() => (getSession()?.partnerId ? getPartnerNavCounts() : Promise.resolve(null)), [checked]);

  useEffect(() => {
    const current = getSession();
    if (!current) {
      router.replace("/sign-in");
      return;
    }
    // OPM users work in the OPM Oversight Portal and never open another organisation's workspace.
    if (homeFor(current) !== "/partner") {
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

  // An administrator may deactivate this user while they are signed in.
  useEffect(() => {
    if (checked && identity === null) {
      void signOut().then(() => router.replace("/sign-in"));
    }
  }, [checked, identity, router]);

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

  if (!checked || !session || !identity) {
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

  const identityBlock = (compact: boolean) => (
    <div className={styles.identity}>
      {compact ? (
        <span className={styles.avatar} title={`${t("portal.signedInLabel")} ${identity.name}`}>
          <Icon name="user" size={20} />
          <span className="visually-hidden">
            {t("portal.signedInLabel")} {identity.name}
          </span>
        </span>
      ) : (
        <>
          <p className={styles.identityLabel}>{t("portal.signedInLabel")}</p>
          <p className={styles.identityName}>{identity.name}</p>
          <p className={styles.identityRole}>
            {t(`portal.roles.${identity.role}` as MessageKey)} · {identity.organisation}
          </p>
        </>
      )}
    </div>
  );

  const nav = (compact: boolean) => (
    <nav aria-label={t("partner.nav.label")} className={styles.nav}>
      {groups.map((group) => (
        <div key={group.label} className={styles.group}>
          <p className={compact ? "visually-hidden" : styles.groupLabel}>{t(group.label)}</p>
          <ul>
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              const count = counts?.[item.href] ?? 0;
              const locked = item.requires ? !item.requires.some((p) => can(p)) : false;
              const label = t(item.label);
              return (
                <li key={item.href}>
                  <Link href={item.href} className={`${styles.navLink} ${active ? styles.active : ""}`} aria-current={active ? "page" : undefined} title={compact ? label : undefined}>
                    <Icon name={item.icon} size={20} />
                    <span className={compact ? "visually-hidden" : styles.navText}>{label}</span>
                    {locked && (
                      <span className={styles.navLock} title={t("partner.denied.navHint")}>
                        <Icon name="lock" size={14} />
                        <span className="visually-hidden">{t("partner.denied.navHint")}</span>
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

  async function handleReset() {
    dialogRef.current?.close();
    await resetDemo();
    setAnnouncement(t("portal.resetDone"));
    router.push("/partner");
  }

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
  }

  const unread = counts?.["/partner/messages"] ?? 0;

  return (
    <div className={`${fontClassName ?? ""} ${styles.shell} ${collapsed ? styles.isCollapsed : ""}`}>
      <a href="#partner-main" className="skip-link">
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

      <div id="partner-drawer" className={styles.drawer} hidden={!navOpen}>
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
            aria-controls="partner-drawer"
            aria-label={navOpen ? t("portal.closeNav") : t("portal.openNav")}
            onClick={() => setNavOpen((v) => !v)}
          >
            <Icon name="menu" size={22} />
          </button>
          <div className={styles.brand}>
            <Logo href="/partner" shortName={t("common.shortName")} fullName={t("partner.portalName")} homeLabel={t("partner.nav.dashboard")} />
          </div>
          <div className={styles.topActions}>
            <Link href="/partner/messages" className={styles.bell} aria-label={t("portal.notifications.bellLabel", { count: unread })}>
              <Icon name="bell" size={20} />
              {unread > 0 && (
                <span className={styles.bellCount} aria-hidden="true">
                  {unread > 99 ? "99+" : unread}
                </span>
              )}
            </Link>
            <LanguagePills />
            <Button variant="ghost" size="sm" icon="refresh" aria-label={t("portal.resetDemo")} onClick={() => dialogRef.current?.showModal()}>
              <span className={styles.hideSmall}>{t("portal.resetDemo")}</span>
            </Button>
            <Button variant="secondary" size="sm" icon="logOut" onClick={handleSignOut}>
              <span className={styles.hideSmall}>{t("portal.signOut")}</span>
            </Button>
          </div>
        </header>
        <div className={styles.demoBanner} role="note">
          <Badge tone="simulated">{t("common.simulated")}</Badge>
          <span>{t("partner.demoBanner")}</span>
        </div>

        <main id="partner-main" ref={mainRef} tabIndex={-1} className={styles.main}>
          {children}
        </main>
      </div>

      <dialog ref={dialogRef} className={styles.dialog} aria-labelledby="partner-reset-title">
        <h2 id="partner-reset-title">{t("portal.resetDemo")}</h2>
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
