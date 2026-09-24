import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./Notice.module.css";

type NoticeTone = "info" | "success" | "warning" | "error" | "simulated";

const icons: Record<NoticeTone, IconName> = {
  info: "info",
  success: "checkCircle",
  warning: "alertTriangle",
  error: "alertCircle",
  simulated: "refresh",
};

export function Notice({
  tone = "info",
  title,
  children,
  role,
  id,
  tabIndex,
}: {
  tone?: NoticeTone;
  title?: ReactNode;
  children?: ReactNode;
  role?: "status" | "alert";
  id?: string;
  tabIndex?: number;
}) {
  return (
    <div className={`${styles.notice} ${styles[tone]}`} role={role} id={id} tabIndex={tabIndex}>
      <Icon name={icons[tone]} size={20} className={styles.icon} />
      <div className={styles.body}>
        {title && <p className={styles.title}>{title}</p>}
        {children && <div className={styles.text}>{children}</div>}
      </div>
    </div>
  );
}
