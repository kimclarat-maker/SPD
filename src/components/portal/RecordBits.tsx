"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { Icon } from "@/components/ui/Icon";
import { ButtonLink } from "@/components/ui/Button";
import { Notice } from "@/components/ui/Notice";
import styles from "./portal.module.css";

export function RecordNotFound({ backHref }: { backHref: string }) {
  const { t } = useI18n();
  return (
    <div className={styles.stack}>
      <Notice tone="warning" title={t("portal.detail.notFound")} />
      <div>
        <ButtonLink href={backHref} variant="secondary" icon="arrowLeft">
          {t("portal.detail.back")}
        </ButtonLink>
      </div>
    </div>
  );
}

/** Checks show a word ("Complete"/"Waiting") and an icon, never colour alone. */
export function Checklist({ items }: { items: { label: ReactNode; done: boolean; extra?: ReactNode }[] }) {
  const { t } = useI18n();
  return (
    <ul className={styles.checklist}>
      {items.map((item, index) => (
        <li key={index} className={`${styles.checkItem} ${item.done ? styles.checkDone : styles.checkPending}`}>
          <Icon name={item.done ? "checkCircle" : "clock"} size={20} />
          <span className={styles.checkBody}>
            <span>{item.label}</span>
            <span className={styles.checkState}>
              {item.done ? t("portal.dashboard.journeyDone") : t("portal.dashboard.journeyPending")}
            </span>
            {item.extra}
          </span>
        </li>
      ))}
    </ul>
  );
}
