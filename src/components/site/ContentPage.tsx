import type { ReactNode } from "react";
import styles from "./ContentPage.module.css";

export function ContentPage({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <article className={`container ${styles.page}`}>
      <header className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {intro && <p className={styles.intro}>{intro}</p>}
      </header>
      <div className={styles.body}>{children}</div>
    </article>
  );
}

export function ContentSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

export const contentStyles = styles;
