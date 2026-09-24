import type { Translate } from "@/i18n/core";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import styles from "./ProductPreview.module.css";

/**
 * Static, server-rendered illustration of the coordinator dashboard.
 * Regions are generic ("Region A") and figures are fictional aggregates,
 * so nothing here can be read as a real statistic or location.
 */
export function ProductPreview({ t }: { t: Translate }) {
  const regions = [
    { key: "regionA", x: 70, y: 58, r: 22, value: 9 },
    { key: "regionB", x: 200, y: 50, r: 16, value: 5 },
    { key: "regionC", x: 92, y: 142, r: 18, value: 7 },
    { key: "regionD", x: 212, y: 138, r: 12, value: 3 },
  ] as const;

  const indicators = [
    { label: t("landing.preview.indicator1"), value: "24" },
    { label: t("landing.preview.indicator2"), value: "86%" },
    { label: t("landing.preview.indicator3"), value: "13" },
  ];

  const queue = [
    { label: t("landing.preview.queue1"), icon: "handshake" as const, due: t("landing.preview.today") },
    { label: t("landing.preview.queue2"), icon: "clipboard" as const, due: t("landing.preview.today") },
    { label: t("landing.preview.queue3"), icon: "fileText" as const, due: t("landing.preview.tomorrow") },
  ];

  return (
    <figure className={styles.preview}>
      <figcaption className={styles.caption}>
        <Badge tone="planned" icon="eye">
          {t("common.illustrative")}
        </Badge>
        <span className="visually-hidden">{t("landing.preview.label")}</span>
      </figcaption>

      <div className={styles.body} aria-hidden="true">
        <div className={styles.mapCard}>
          <div className={styles.cardHead}>
            <span>{t("landing.preview.mapTitle")}</span>
            <span className={styles.muted}>{t("landing.preview.mapNote")}</span>
          </div>
          <svg viewBox="0 0 280 190" className={styles.map} role="presentation">
            <path
              d="M28 40 L120 18 L178 26 L252 20 L262 92 L246 170 L150 178 L60 172 L20 120 Z"
              fill="var(--color-surface-muted)"
              stroke="var(--color-border-strong)"
              strokeWidth="1.5"
            />
            <path d="M140 22 L150 178 M24 100 L258 96" stroke="var(--color-border)" strokeWidth="1.5" strokeDasharray="4 4" />
            {regions.map((region) => (
              <g key={region.key}>
                <circle cx={region.x} cy={region.y} r={region.r} fill="var(--color-primary)" fillOpacity="0.16" />
                <circle cx={region.x} cy={region.y} r="11" fill="var(--color-primary)" stroke="#fff" strokeWidth="2" />
                <text x={region.x} y={region.y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill="#fff">
                  {region.value}
                </text>
                <text
                  x={region.x}
                  y={region.y + region.r + 14}
                  textAnchor="middle"
                  fontSize="11"
                  fill="var(--color-text-muted)"
                >
                  {t(`landing.preview.${region.key}`)}
                </text>
              </g>
            ))}
          </svg>
        </div>

        <div className={styles.indicators}>
          {indicators.map((indicator) => (
            <div key={indicator.label} className={styles.indicator}>
              <span className={styles.value}>{indicator.value}</span>
              <span className={styles.indicatorLabel}>{indicator.label}</span>
            </div>
          ))}
        </div>

        <div className={styles.queue}>
          <div className={styles.cardHead}>
            <span>{t("landing.preview.queueTitle")}</span>
          </div>
          <ul>
            {queue.map((item) => (
              <li key={item.label}>
                <Icon name={item.icon} size={18} />
                <span className={styles.queueLabel}>{item.label}</span>
                <span className={styles.due}>
                  <Icon name="clock" size={14} />
                  {t("landing.preview.due", { when: item.due })}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </figure>
  );
}
