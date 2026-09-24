import Link from "next/link";
import styles from "./Logo.module.css";

/** Text-only wordmark. No crest or emblem is implied. */
export function Logo({
  href = "/",
  shortName,
  fullName,
  homeLabel,
  showFullName = true,
  onDark = false,
}: {
  href?: string;
  shortName: string;
  fullName: string;
  homeLabel: string;
  showFullName?: boolean;
  onDark?: boolean;
}) {
  return (
    <Link href={href} className={`${styles.logo} ${onDark ? styles.onDark : ""}`} aria-label={homeLabel}>
      <span className={styles.mark} aria-hidden="true">
        {shortName}
      </span>
      {showFullName && (
        <span className={styles.full} aria-hidden="true">
          {fullName}
        </span>
      )}
    </Link>
  );
}
