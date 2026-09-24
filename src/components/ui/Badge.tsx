import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";
import styles from "./Badge.module.css";

export type Tone = "neutral" | "info" | "success" | "warning" | "error" | "planned" | "simulated";

const toneIcons: Record<Tone, IconName> = {
  neutral: "circle",
  info: "info",
  success: "checkCircle",
  warning: "clock",
  error: "alertCircle",
  planned: "clock",
  simulated: "refresh",
};

/** Status is always icon + text, never colour alone. */
export function Badge({ tone = "neutral", icon, children }: { tone?: Tone; icon?: IconName; children: ReactNode }) {
  return (
    <span data-badge={tone} className={`${styles.badge} ${styles[tone]}`}>
      <Icon name={icon ?? toneIcons[tone]} size={14} />
      <span>{children}</span>
    </span>
  );
}
