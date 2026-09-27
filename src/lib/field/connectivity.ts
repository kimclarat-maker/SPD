"use client";

import { useSyncExternalStore } from "react";

/**
 * Connectivity as the Field Operations Portal sees it. The device is online
 * only when the browser reports a network connection AND the officer has not
 * switched on the demonstration's "simulate offline" control. While offline,
 * field screens read and write only the device store; nothing reaches the
 * central system until the officer syncs.
 *
 * `navigator.onLine` only reflects the network interface, so a sync can still
 * fail on a connection with no upstream internet. The sync engine treats any
 * failed upload as retryable and never discards the record.
 */
const SIM_KEY = "rpcms-field-simulated-offline";

type Listener = () => void;
const listeners = new Set<Listener>();
let simulated: boolean | null = null;
let wired = false;

function readSimulated(): boolean {
  if (simulated === null) {
    try {
      simulated = localStorage.getItem(SIM_KEY) === "1";
    } catch {
      simulated = false;
    }
  }
  return simulated;
}

function emit() {
  listeners.forEach((l) => l());
}

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  window.addEventListener("online", emit);
  window.addEventListener("offline", emit);
  window.addEventListener("storage", (event) => {
    if (event.key === SIM_KEY) {
      simulated = null;
      emit();
    }
  });
}

export function browserOnline(): boolean {
  return typeof navigator === "undefined" ? true : navigator.onLine;
}

export function isSimulatedOffline(): boolean {
  return typeof window === "undefined" ? false : readSimulated();
}

export function isOnline(): boolean {
  return browserOnline() && !isSimulatedOffline();
}

export function setSimulatedOffline(value: boolean): void {
  simulated = value;
  try {
    localStorage.setItem(SIM_KEY, value ? "1" : "0");
  } catch {
    // The choice then lasts for this page only.
  }
  emit();
}

export function subscribeConnectivity(listener: Listener): () => void {
  wire();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): string {
  return `${browserOnline() ? 1 : 0}${isSimulatedOffline() ? 1 : 0}`;
}

export interface Connectivity {
  online: boolean;
  browserOnline: boolean;
  simulatedOffline: boolean;
}

export function useConnectivity(): Connectivity {
  const snap = useSyncExternalStore(subscribeConnectivity, snapshot, () => "10");
  const browser = snap[0] === "1";
  const sim = snap[1] === "1";
  return { online: browser && !sim, browserOnline: browser, simulatedOffline: sim };
}
