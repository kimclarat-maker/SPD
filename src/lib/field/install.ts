"use client";

import { useSyncExternalStore } from "react";

/**
 * "Install app" support. Chromium browsers fire `beforeinstallprompt` once,
 * early, so it is captured here at module load and kept until the officer
 * chooses Install. Safari has no prompt; the Account screen explains the
 * Add to Home Screen steps instead.
 */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferred = event as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    installed = true;
    deferred = null;
    emit();
  });
}

function snapshot(): string {
  const standalone = typeof window !== "undefined" && (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);
  return `${deferred ? 1 : 0}${installed || standalone ? 1 : 0}`;
}

export function useInstall(): { canPrompt: boolean; installed: boolean; prompt: () => Promise<boolean> } {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    snapshot,
    () => "00",
  );
  return {
    canPrompt: snap[0] === "1",
    installed: snap[1] === "1",
    prompt: async () => {
      if (!deferred) return false;
      await deferred.prompt();
      const choice = await deferred.userChoice;
      deferred = null;
      emit();
      return choice.outcome === "accepted";
    },
  };
}
