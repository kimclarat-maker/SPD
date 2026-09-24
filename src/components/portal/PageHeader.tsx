"use client";

import Link from "next/link";
import { useId, type ReactNode } from "react";
import { Icon } from "@/components/ui/Icon";
import styles from "./portal.module.css";

export function PageHeader({
  title,
  intro,
  eyebrow,
  back,
  meta,
  actions,
}: {
  title: ReactNode;
  intro?: ReactNode;
  eyebrow?: ReactNode;
  back?: { href: string; label: string };
  meta?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.pageHeader}>
      {back && (
        <Link href={back.href} className={styles.backLink}>
          <Icon name="arrowLeft" size={18} />
          {back.label}
        </Link>
      )}
      <div className={styles.pageHeaderRow}>
        <div className={styles.pageHeaderText}>
          {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
          <h1 className={styles.pageTitle}>{title}</h1>
          {meta && <div className={styles.pageMeta}>{meta}</div>}
          {intro && <p className={styles.pageIntro}>{intro}</p>}
        </div>
        {actions && <div className={styles.pageActions}>{actions}</div>}
      </div>
    </header>
  );
}

export function Section({ title, children, actions, id }: { title: ReactNode; children: ReactNode; actions?: ReactNode; id?: string }) {
  const generated = useId();
  const headingId = id ?? generated;
  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.sectionHead}>
        <h2 id={headingId} className={styles.sectionTitle}>
          {title}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function DetailList({ items }: { items: { label: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className={styles.detailList}>
      {items.map((item, index) => (
        <div key={index} className={styles.detailItem}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LoadingState({ label }: { label: string }) {
  return (
    <div className={styles.loading} role="status">
      <span className={styles.spinner} aria-hidden="true" />
      {label}
    </div>
  );
}
