"use client";

import type { CaseServiceType, FieldIssueCategory, FormQuestion, Priority } from "@/lib/types";
import type { FieldSnapshot } from "@/lib/services/fieldWork";
import type { TaskConflict } from "@/lib/services/fieldSync";
import { getSession } from "@/lib/services/session";
import type { LocalAttachment } from "./files";

/**
 * The device store: everything the Field Operations Portal keeps on this
 * device, separate from the central system. It holds the officer's drafts and
 * upload queue (the outbox), the results of earlier uploads, and a cache of
 * the assigned work taken the last time the device was online. It lives in
 * localStorage under one key per user, so it survives closing and reopening
 * the browser; photos live in IndexedDB (see files.ts).
 *
 * Nothing here changes a central record. Only an accepted upload does.
 */
const KEY_PREFIX = "rpcms-field-device-v1:";

export type LocalKind = "report" | "survey" | "assistance" | "verification" | "issue";

/**
 * Upload state on the device:
 * draft (saved only here, may be incomplete) → pending (complete, queued; shown as
 * "Saved offline" without a connection and "Ready to sync" with one) → syncing →
 * synced (reached the central system) | failed (rejected or interrupted) | conflict.
 */
export type UploadState = "draft" | "pending" | "syncing" | "synced" | "failed" | "conflict";

export interface GpsFix {
  lat: number;
  lng: number;
  accuracyM: number;
  capturedAt: string;
  /** "device" came from the browser's location service; "simulated" is the demonstration fallback. */
  source: "device" | "simulated";
}

export interface ReportData {
  kind: "site_visit" | "activity_update";
  title: string;
  interventionId: string;
  taskId?: string;
  visitAt: string;
  activityType: string;
  servicePointId: string;
  locationNote: string;
  observations: string;
  workCompleted: string;
  reached: { women: string; men: string; children: string };
  indicatorValues: Record<string, string>;
  challenges: string;
  followUp: string;
  gps?: GpsFix;
  gpsUnavailableReason: string;
  attachments: LocalAttachment[];
}

export interface SurveyData {
  formId: string;
  formRef: string;
  formTitle: string;
  /** The exact version the answers belong to, with its questions, kept with the response. */
  formVersion: number;
  questions: FormQuestion[];
  interventionId: string;
  taskId?: string;
  answers: Record<string, string>;
  position: number;
  collectedAt?: string;
  migratedFrom?: { version: number };
}

export interface AssistanceData {
  interventionId: string;
  taskId?: string;
  /** Task version the officer worked from, and its allocation at that time. */
  baseTaskVersion?: number;
  baseAllocation?: { quantity: number; assistanceType: string; unit: string };
  householdRef: string;
  assistanceType: string;
  quantity: string;
  unit: string;
  valueUsd: string;
  deliveredAt: string;
  servicePointId: string;
  evidence: LocalAttachment[];
  note: string;
  verificationLocalId?: string;
  resolution?: { choice: "keep_mine" | "use_central"; againstVersion: number; note: string };
}

export interface VerificationData {
  interventionId: string;
  beneficiaryRef: string;
  householdSize: string;
  purpose: string;
  consent: boolean;
  method: "typed" | "scanned";
  result?: { status: string; detail?: string; at: string };
}

export interface IssueData {
  category: FieldIssueCategory;
  priority: Priority;
  interventionId: string;
  servicePointId: string;
  locationNote: string;
  description: string;
  evidence: LocalAttachment[];
  serviceType?: CaseServiceType;
  /** Referral only: the person agreed to be referred. */
  consent?: boolean;
}

export interface SyncError {
  /** A central validation code (see fieldSync.ts) or a transport problem. */
  code: string;
  fields: string[];
  params?: Record<string, string | number>;
  retryable: boolean;
  at: string;
}

interface LocalBase {
  localId: string;
  state: UploadState;
  title: string;
  createdAt: string;
  updatedAt: string;
  createdOffline: boolean;
  queuedAt?: string;
  attempts: number;
  lastAttemptAt?: string;
  /** Current step while syncing, for progress messages. */
  progress?: "preparing" | "uploadingFiles" | "confirming";
  error?: SyncError;
  conflict?: TaskConflict;
  central?: { id: string; ref: string; syncedAt: string; status: string };
  /** Present while correcting a report that was returned for correction. */
  revision?: { of: string; number: number; note: string };
  /** Earlier versions of this record kept on the device (never discarded silently). */
  previous: { at: string; reason: "conflict" | "formVersionRetired" | "returned" | "useCentral"; label: string; data: unknown }[];
  /** Local activity history. */
  events: { at: string; type: string; params?: Record<string, string | number> }[];
  /** Sensitive details were removed from the device after upload. */
  purged?: boolean;
}

export type LocalRecord =
  | (LocalBase & { kind: "report"; data: ReportData })
  | (LocalBase & { kind: "survey"; data: SurveyData })
  | (LocalBase & { kind: "assistance"; data: AssistanceData })
  | (LocalBase & { kind: "verification"; data: VerificationData })
  | (LocalBase & { kind: "issue"; data: IssueData });

export type LocalRecordOf<K extends LocalKind> = Extract<LocalRecord, { kind: K }>;

export interface DeviceState {
  version: 1;
  userId: string;
  records: LocalRecord[];
  /** Assigned work as of the last online read. */
  cache?: FieldSnapshot;
  /** Last time the device completed a sync run with the central system. */
  lastSyncAt?: string;
  lastRun?: { at: string; accepted: number; rejected: number; conflicts: number; interrupted: number };
  settings: { autoSync: boolean; unstable: boolean };
  walkthrough: { openedOnlineAt?: string; wentOfflineAt?: string; centralChangesAt?: string; syncedAfterOfflineAt?: string };
}

type Listener = () => void;
const listeners = new Set<Listener>();
let current: DeviceState | null = null;
let version = 0;

function keyFor(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

function blank(userId: string): DeviceState {
  return { version: 1, userId, records: [], settings: { autoSync: false, unstable: false }, walkthrough: {} };
}

function currentUserId(): string | null {
  return getSession()?.userId ?? null;
}

function load(userId: string): DeviceState {
  try {
    const raw = localStorage.getItem(keyFor(userId));
    if (raw) {
      const parsed = JSON.parse(raw) as DeviceState;
      if (parsed?.version === 1 && Array.isArray(parsed.records)) return { ...blank(userId), ...parsed };
    }
  } catch {
    // Unreadable device data is never overwritten silently: keep it and start in memory.
    return blank(userId);
  }
  return blank(userId);
}

function persist(state: DeviceState): boolean {
  try {
    localStorage.setItem(keyFor(state.userId), JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export class DeviceStorageError extends Error {
  constructor() {
    super("DEVICE_STORAGE_FULL");
  }
}

export function getDevice(): DeviceState {
  const userId = currentUserId() ?? "anonymous";
  if (!current || current.userId !== userId) current = load(userId);
  return current;
}

export function getDeviceVersion(): number {
  return version;
}

export function subscribeDevice(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  version += 1;
  listeners.forEach((l) => l());
}

/**
 * Applies a change to the device store. If the browser refuses to save it
 * (storage full or blocked), the change is not applied and the caller is told,
 * so the officer is never shown "saved" for something that was not.
 */
export function mutateDevice<T>(recipe: (draft: DeviceState) => T): T {
  const draft = structuredClone(getDevice());
  const result = recipe(draft);
  if (!persist(draft)) throw new DeviceStorageError();
  current = draft;
  emit();
  return result;
}

/** Removes this user's device data. Used only by "Reset demonstration data". */
export function clearDevice(): void {
  const userId = currentUserId();
  if (!userId) return;
  try {
    localStorage.removeItem(keyFor(userId));
  } catch {
    // ignore
  }
  current = blank(userId);
  emit();
}

let counter = 0;
export function newLocalId(kind: LocalKind): string {
  counter += 1;
  return `dev-${kind}-${Date.now().toString(36)}-${counter}${Math.random().toString(36).slice(2, 5)}`;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key?.startsWith(KEY_PREFIX)) {
      current = null;
      emit();
    }
  });
}
