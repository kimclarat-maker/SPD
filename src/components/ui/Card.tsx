import type { ElementType, ReactNode } from "react";
import styles from "./Card.module.css";

export function Card({
  as: Tag = "div",
  children,
  className,
  padded = true,
  ...rest
}: {
  as?: ElementType;
  children: ReactNode;
  className?: string;
  padded?: boolean;
  [key: string]: unknown;
}) {
  return (
    <Tag className={`${styles.card} ${padded ? styles.padded : ""} ${className ?? ""}`} {...rest}>
      {children}
    </Tag>
  );
}
