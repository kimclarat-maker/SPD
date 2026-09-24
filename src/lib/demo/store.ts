"use client";

import type { AuditEntry, DemoState, OutboxMessage } from "@/lib/types";
import { createSeed, SEED_VERSION } from "./seed";

/**
 * Browser-persisted demonstration store. Only the service layer
 * (src/lib/services) should import this module; UI code talks to services.
 * Replacing the services with API calls removes the need for this file.
 */
const STORAGE_KEY = "rpcms-demo-state-v1";

type Listener = () => void;

let state: DemoState | null = null;
let version = 0;
const listeners = new Set<Listener>();

function read(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DemoState;
      if (parsed && parsed.version === SEED_VERSION && Array.isArray(parsed.partners)) return parsed;
    }
  } catch {
    // Corrupt or unavailable storage: fall through to a fresh seed.
  }
  const seeded = createSeed();
  write(seeded);
  return seeded;
}

function write(next: DemoState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked; the session continues in memory.
  }
}

function emit() {
  version += 1;
  listeners.forEach((listener) => listener());
}

export function getState(): DemoState {
  if (!state) state = read();
  return state;
}

export function getVersion(): number {
  return version;
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Apply a change to a copy of the state, persist it, and notify subscribers. */
export function mutate<T>(recipe: (draft: DemoState) => T): T {
  const draft = structuredClone(getState());
  const result = recipe(draft);
  state = draft;
  write(draft);
  emit();
  return result;
}

export function resetState(): void {
  state = createSeed();
  write(state);
  emit();
}

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}-${counter}`;
}

export function addAudit(draft: DemoState, entry: Omit<AuditEntry, "id" | "at"> & { at?: string }): void {
  draft.audit.unshift({ id: newId("a"), at: entry.at ?? new Date().toISOString(), ...entry });
}

export function addOutbox(draft: DemoState, message: Omit<OutboxMessage, "id" | "at">): void {
  draft.outbox.unshift({ id: newId("o"), at: new Date().toISOString(), ...message });
}

// Keep several open tabs in step with each other.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === STORAGE_KEY) {
      state = null;
      emit();
    }
  });
}
