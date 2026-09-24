"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import styles from "./SiteHeader.module.css";

const links: { href: string; label: MessageKey }[] = [
  { href: "/#how-it-works", label: "header.howItWorks" },
  { href: "/#capabilities", label: "header.capabilities" },
  { href: "/#who-it-serves", label: "header.whoItServes" },
  { href: "/#help", label: "header.help" },
];

export function SiteHeader() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    panelRef.current?.querySelector<HTMLElement>("a, select, button")?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Close the menu if the viewport grows to the desktop layout.
  useEffect(() => {
    const query = window.matchMedia("(min-width: 960px)");
    const onChange = () => query.matches && setOpen(false);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <header className={styles.header}>
      <a href="#main" className="skip-link">
        {t("common.skipToContent")}
      </a>
      <div className={`container ${styles.bar}`}>
        <Logo shortName={t("common.shortName")} fullName={t("common.systemName")} homeLabel={t("common.homeLink")} />

        <nav aria-label={t("header.mainNav")} className={styles.desktopNav}>
          <ul className={styles.links}>
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={styles.link}>
                  {t(link.label)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className={styles.actions}>
          <div className={styles.desktopOnly}>
            <LanguageSwitcher />
          </div>
          <Link href="/sign-in" className={`${styles.signIn} ${styles.desktopOnly}`}>
            <Icon name="lock" size={18} />
            {t("header.signIn")}
          </Link>
          <button
            ref={toggleRef}
            type="button"
            className={styles.toggle}
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? t("header.closeMenu") : t("header.openMenu")}
            onClick={() => setOpen((value) => !value)}
          >
            <Icon name={open ? "x" : "menu"} size={22} />
            <span aria-hidden="true">{t("header.menu")}</span>
          </button>
        </div>
      </div>

      <div id="mobile-menu" ref={panelRef} className={styles.mobilePanel} hidden={!open}>
        <nav aria-label={t("header.mainNav")} className="container">
          <ul className={styles.mobileLinks}>
            {links.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className={styles.mobileLink} onClick={() => setOpen(false)}>
                  {t(link.label)}
                  <Icon name="chevronRight" size={18} />
                </Link>
              </li>
            ))}
            <li>
              <Link href="/sign-in" className={styles.mobileSignIn} onClick={() => setOpen(false)}>
                <Icon name="lock" size={18} />
                {t("header.signIn")}
              </Link>
            </li>
          </ul>
          <div className={styles.mobileLang}>
            <LanguageSwitcher showLabel />
          </div>
        </nav>
      </div>
    </header>
  );
}
