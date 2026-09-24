"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/I18nProvider";
import { Icon } from "@/components/ui/Icon";
import styles from "./HeroVideo.module.css";

type NetworkInfo = { saveData?: boolean; effectiveType?: string };

/**
 * Decorative background video for the landing hero. It is only requested
 * after the page has rendered, and never when the visitor prefers reduced
 * motion or is on a data-saving / 2G connection — the navy panel shows
 * instead. A pause control satisfies WCAG 2.2.2 (Pause, Stop, Hide).
 */
export function HeroVideo({ src }: { src: string }) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const connection = (navigator as Navigator & { connection?: NetworkInfo }).connection;
    const constrained = Boolean(connection?.saveData) || /(^|-)2g$/.test(connection?.effectiveType ?? "");
    if (!reduced && !constrained) setEnabled(true);
  }, []);

  if (!enabled) return null;

  function toggle() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      void video.play();
      setPlaying(true);
    } else {
      video.pause();
      setPlaying(false);
    }
  }

  return (
    <>
      <video
        ref={videoRef}
        className={styles.video}
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      />
      <button
        type="button"
        className={styles.toggle}
        onClick={toggle}
        aria-pressed={!playing}
        aria-label={playing ? t("landing.hero.pauseVideo") : t("landing.hero.playVideo")}
      >
        <Icon name={playing ? "pauseCircle" : "circle"} size={20} />
      </button>
    </>
  );
}
