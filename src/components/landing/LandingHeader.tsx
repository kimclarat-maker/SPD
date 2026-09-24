"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import type { MessageKey } from "@/i18n/core";
import { Icon } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { LanguagePills } from "@/components/ui/LanguagePills";
import styles from "./LandingHeader.module.css";

const links: { href: string; label: MessageKey }[] = [
  { href: "#how-it-works", label: "header.howItWorks" },
  { href: "#capabilities", label: "header.capabilities" },
  { href: "#who-it-serves", label: "header.whoItServes" },
  { href: "#help", label: "header.help" },
];

export function LandingHeader() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);

  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) toggleRef.current?.focus();
  };

  // Modal drawer: focus moves in, Tab stays inside, Escape closes, page does not scroll behind it.
  useEffect(() => {
    if (!open) return;
    const drawer = drawerRef.current;
    const focusables = () => [...(drawer?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? [])];
    focusables()[0]?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      } else if (event.key === "Tab") {
        const items = focusables();
        const first = items[0];
        const last = items[items.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const onChange = () => query.matches && setOpen(false);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return (
    <header className={styles.header}>
      <a href="#main" className="skip-link">
        {t("common.skipToContent")}
      </a>
      <div className={styles.bar}>
        <div className={styles.brand}>
          <Logo shortName={t("common.shortName")} fullName={t("common.systemName")} homeLabel={t("common.homeLink")} />
        </div>

        <div className={styles.desktop}>
          <nav aria-label={t("header.mainNav")}>
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
          <span className={styles.divider} aria-hidden="true" />
          <LanguagePills />
          <Link href="/sign-in" className={styles.signIn}>
            {t("header.signIn")}
          </Link>
        </div>

        <button
          ref={toggleRef}
          type="button"
          className={styles.toggle}
          aria-expanded={open}
          aria-controls="landing-menu"
          aria-label={t("header.openMenu")}
          onClick={() => setOpen(true)}
        >
          <Icon name="menu" size={24} />
        </button>
      </div>

      <div className={styles.overlay} hidden={!open}>
        <div className={styles.backdrop} onClick={() => close()} aria-hidden="true" />
        <div
          id="landing-menu"
          ref={drawerRef}
          className={styles.drawer}
          role="dialog"
          aria-modal="true"
          aria-labelledby="landing-menu-title"
        >
          <div className={styles.drawerHead}>
            <h2 id="landing-menu-title" className={styles.drawerTitle}>
              {t("header.menu")}
            </h2>
            <button type="button" className={styles.close} aria-label={t("header.closeMenu")} onClick={() => close()}>
              <Icon name="x" size={24} />
            </button>
          </div>
          <nav aria-label={t("header.mainNav")}>
            <ul className={styles.drawerLinks}>
              {links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={styles.drawerLink} onClick={() => close(false)}>
                    {t(link.label)}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <hr className={styles.rule} />
          <LanguagePills stretch />
          <Link href="/sign-in" className={styles.drawerSignIn} onClick={() => close(false)}>
            {t("header.signIn")}
          </Link>
        </div>
      </div>
    </header>
  );
}
