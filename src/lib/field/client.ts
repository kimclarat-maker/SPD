"use client";

import type { FieldReportField } from "@/lib/types";
import { ServiceError } from "@/lib/services/core";
import type { FieldFormView, FieldSubmission, FieldTaskView, VisitContent } from "@/lib/services/fieldWork";
import {
  receiveAssistance,
  receiveIssue,
  receiveSurveyResponse,
  receiveVerification,
  receiveVisitReport,
  type AssistancePayload,
  type IssuePayload,
  type SurveyPayload,
  type SyncResult,
  type VerificationPayload,
  type VisitPayload,
} from "@/lib/services/fieldSync";
import { maskReference } from "@/lib/services/partnerContext";
import { isOnline } from "./connectivity";
import {
  DeviceStorageError,
  getDevice,
  mutateDevice,
  newLocalId,
  type AssistanceData,
  type DeviceState,
  type IssueData,
  type LocalKind,
  type LocalRecord,
  type LocalRecordOf,
  type ReportData,
  type SurveyData,
  type VerificationData,
} from "./device";
import { deleteFiles, requestPersistentStorage, type LocalAttachment } from "./files";

/**
 * Device-side operations for the Field Operations Portal. Creating, editing
 * and queueing records only ever touches the device store, so they work the
 * same online and offline. `syncNow` is the only path to the central system,
 * and it refuses to run without a connection.
 */

const now = () => new Date().toISOString();
const REF_PATTERN = /^[A-Z]{2}-[A-Z]{3}-\d{4}-\d{2}$/;

function write<T>(recipe: (draft: DeviceState) => T): T {
  try {
    return mutateDevice(recipe);
  } catch (err) {
    if (err instanceof DeviceStorageError) throw new ServiceError("DEVICE_STORAGE");
    throw err;
  }
}

function find(draft: DeviceState, localId: string): LocalRecord {
  const r = draft.records.find((x) => x.localId === localId);
  if (!r) throw new ServiceError("NOT_FOUND");
  return r;
}

export function getLocalRecord(localId: string): LocalRecord | undefined {
  return getDevice().records.find((r) => r.localId === localId);
}

/* ============================================================= Validation */

const num = (v: string) => (v.trim() === "" ? NaN : Number(v));

/** Device-side checks. The central system repeats them and adds rules only it can check. */
export function reportIssues(d: ReportData, servicePointIds: string[] = []): FieldReportField[] {
  const issues: FieldReportField[] = [];
  const t = new Date(d.visitAt).getTime();
  if (!d.visitAt || Number.isNaN(t) || t > Date.now() + 60 * 60 * 1000) issues.push("visitAt");
  if (!d.activityType.trim()) issues.push("activityType");
  if (!d.servicePointId || (servicePointIds.length > 0 && !servicePointIds.includes(d.servicePointId))) issues.push("location");
  if (!d.gps && !d.gpsUnavailableReason.trim()) issues.push("gps");
  if (!d.observations.trim()) issues.push("observations");
  if (!d.workCompleted.trim()) issues.push("workCompleted");
  if ([d.reached.women, d.reached.men, d.reached.children].some((v) => !(num(v) >= 0) || !Number.isInteger(num(v)))) issues.push("reached");
  if (Object.values(d.indicatorValues).some((v) => v.trim() !== "" && !(num(v) >= 0))) issues.push("indicators");
  return issues;
}

export function surveyIssues(d: SurveyData): string[] {
  return d.questions
    .filter((q) => {
      const value = (d.answers[q.id] ?? "").trim();
      if (q.required && !value) return true;
      return Boolean(value) && q.type === "number" && !(Number.isFinite(Number(value)) && Number(value) >= 0);
    })
    .map((q) => q.id);
}

export type AssistanceField = "householdRef" | "assistanceType" | "quantity" | "unit" | "valueUsd" | "deliveredAt" | "servicePoint";

export function assistanceIssues(d: AssistanceData): AssistanceField[] {
  const issues: AssistanceField[] = [];
  if (!REF_PATTERN.test(d.householdRef.trim().toUpperCase())) issues.push("householdRef");
  if (!d.assistanceType.trim()) issues.push("assistanceType");
  if (!(num(d.quantity) > 0)) issues.push("quantity");
  if (!d.unit.trim()) issues.push("unit");
  if (d.valueUsd.trim() !== "" && !(num(d.valueUsd) >= 0)) issues.push("valueUsd");
  const t = new Date(d.deliveredAt).getTime();
  if (!d.deliveredAt || Number.isNaN(t) || t > Date.now() + 60 * 60 * 1000) issues.push("deliveredAt");
  if (!d.servicePointId) issues.push("servicePoint");
  return issues;
}

export type VerificationField = "beneficiaryRef" | "householdSize" | "purpose" | "consent" | "interventionId";

export function verificationIssues(d: VerificationData): VerificationField[] {
  const issues: VerificationField[] = [];
  if (!d.interventionId) issues.push("interventionId");
  if (!REF_PATTERN.test(d.beneficiaryRef.trim().toUpperCase())) issues.push("beneficiaryRef");
  if (d.householdSize.trim() !== "" && !(num(d.householdSize) > 0 && Number.isInteger(num(d.householdSize)))) issues.push("householdSize");
  if (!d.purpose.trim()) issues.push("purpose");
  if (!d.consent) issues.push("consent");
  return issues;
}

export type IssueField = "description" | "serviceType" | "consent" | "location";

export function issueIssues(d: IssueData): IssueField[] {
  const issues: IssueField[] = [];
  if (!d.description.trim()) issues.push("description");
  if (d.category === "referral" && !d.serviceType) issues.push("serviceType");
  if (d.category === "referral" && !d.consent) issues.push("consent");
  return issues;
}

function isComplete(r: LocalRecord): boolean {
  switch (r.kind) {
    case "report":
      return reportIssues(r.data).length === 0;
    case "survey":
      return surveyIssues(r.data).length === 0;
    case "assistance":
      return assistanceIssues(r.data).length === 0;
    case "verification":
      return verificationIssues(r.data).length === 0;
    case "issue":
      return issueIssues(r.data).length === 0;
  }
}

/* ========================================================= Local records */

function base(kind: LocalKind, title: string) {
  const at = now();
  return {
    localId: newLocalId(kind),
    state: "draft" as const,
    title,
    createdAt: at,
    updatedAt: at,
    createdOffline: !isOnline(),
    attempts: 0,
    previous: [],
    events: [{ at, type: isOnline() ? "created" : "createdOffline" }],
  };
}

/** Creates a draft on this device. Nothing is sent anywhere. */
export function createLocalRecord<K extends LocalKind>(kind: K, title: string, data: LocalRecordOf<K>["data"]): string {
  const record = { ...base(kind, title), kind, data } as LocalRecord;
  write((draft) => void draft.records.unshift(record));
  void requestPersistentStorage();
  return record.localId;
}

/** Saves changes to a draft. Editing a queued or failed record returns it to draft until it is queued again. */
export function saveLocalRecord<K extends LocalKind>(localId: string, data: LocalRecordOf<K>["data"], title?: string): void {
  write((draft) => {
    const r = find(draft, localId);
    if (r.state === "syncing") throw new ServiceError("INVALID_STATE");
    if (r.state === "synced" && !r.revision) throw new ServiceError("LOCKED");
    (r as LocalRecordOf<K>).data = data;
    if (title) r.title = title;
    if (r.state === "pending" || r.state === "failed") {
      r.events.push({ at: now(), type: r.state === "failed" ? "correcting" : "withdrawn" });
      r.state = "draft";
    }
    r.updatedAt = now();
    r.events.push({ at: now(), type: "saved" });
    if (r.events.length > 60) r.events = r.events.slice(-60);
  });
}

/**
 * Marks a complete record ready to go: it joins the upload queue. Offline, it
 * shows as "Saved offline"; online, as "Ready to sync". Incomplete records
 * stay as drafts.
 */
export function queueLocalRecord(localId: string): void {
  write((draft) => {
    const r = find(draft, localId);
    if (!["draft", "failed"].includes(r.state)) throw new ServiceError("INVALID_STATE");
    if (!isComplete(r)) throw new ServiceError("MISSING_INFORMATION");
    if (r.revision && !r.revision.note.trim()) throw new ServiceError("NOTE_REQUIRED");
    if (r.kind === "survey" && !r.data.collectedAt) r.data.collectedAt = now();
    r.state = "pending";
    r.queuedAt = now();
    r.error = undefined;
    r.updatedAt = now();
    r.events.push({ at: now(), type: isOnline() ? "queued" : "savedOffline" });
  });
}

/** Takes a queued record back out of the queue for more editing. */
export function withdrawLocalRecord(localId: string): void {
  write((draft) => {
    const r = find(draft, localId);
    if (r.state !== "pending") throw new ServiceError("INVALID_STATE");
    r.state = "draft";
    r.updatedAt = now();
    r.events.push({ at: now(), type: "withdrawn" });
  });
}

/** Deletes a draft the officer chose to discard. Records that reached the central system cannot be deleted here. */
export async function discardLocalRecord(localId: string): Promise<void> {
  const r = getLocalRecord(localId);
  if (!r) return;
  if (r.central || r.state === "syncing" || r.state === "synced") throw new ServiceError("LOCKED");
  write((draft) => {
    draft.records = draft.records.filter((x) => x.localId !== localId);
  });
  await deleteFiles(attachmentsOf(r).map((a) => a.id));
}

function attachmentsOf(r: LocalRecord): LocalAttachment[] {
  if (r.kind === "report") return r.data.attachments;
  if (r.kind === "assistance" || r.kind === "issue") return r.data.evidence;
  return [];
}

/* ============================================= Corrections and conflicts */

/** Starts correcting a report the reviewer returned. The submitted version is kept on the device. */
export function startCorrection(submission: Extract<FieldSubmission, { kind: "report" | "survey" }>, taskTitle?: string): string {
  const existing = getDevice().records.find((r) => r.central?.id === submission.id || (submission.clientRecordId && r.localId === submission.clientRecordId));
  if (existing && existing.kind === "report") {
    write((draft) => {
      const r = find(draft, existing.localId) as LocalRecordOf<"report">;
      if (r.revision) return;
      r.previous.push({ at: now(), reason: "returned", label: `v${submission.versions}`, data: structuredClone(r.data) });
      r.revision = { of: submission.id, number: submission.versions + 1, note: "" };
      r.state = "draft";
      r.updatedAt = now();
      r.events.push({ at: now(), type: "correctionStarted", params: { ref: submission.ref } });
    });
    return existing.localId;
  }
  // The device no longer holds a copy: rebuild the report from the central record.
  const c = submission.content as VisitContent;
  const data: ReportData = {
    kind: c.kind,
    title: submission.title || taskTitle || "",
    interventionId: submission.interventionId,
    taskId: submission.taskId,
    visitAt: c.visitAt,
    activityType: c.activityType,
    servicePointId: c.servicePointId,
    locationNote: c.locationNote,
    observations: c.observations,
    workCompleted: c.workCompleted,
    reached: { women: String(c.reached.women), men: String(c.reached.men), children: String(c.reached.children) },
    indicatorValues: Object.fromEntries(c.indicatorValues.map((v) => [v.indicatorId, String(v.value)])),
    challenges: c.challenges,
    followUp: c.followUp,
    gps: c.gps ? { ...c.gps, capturedAt: c.visitAt, source: "device" } : undefined,
    gpsUnavailableReason: c.gpsUnavailableReason ?? "",
    attachments: c.attachments.map((a, i) => ({ id: `central-${i}`, name: a.name, mime: "", kind: a.kind === "photo" ? "photo" : "document", originalKb: a.sizeKb, storedKb: a.sizeKb, stored: false, uploaded: true })),
  };
  const localId = createLocalRecord("report", data.title, data);
  write((draft) => {
    const r = find(draft, localId);
    r.central = { id: submission.id, ref: submission.ref, syncedAt: submission.syncedAt ?? now(), status: submission.status };
    r.revision = { of: submission.id, number: submission.versions + 1, note: "" };
    r.events.push({ at: now(), type: "correctionStarted", params: { ref: submission.ref } });
  });
  return localId;
}

export function setCorrectionNote(localId: string, note: string): void {
  write((draft) => {
    const r = find(draft, localId);
    if (!r.revision) throw new ServiceError("INVALID_STATE");
    r.revision.note = note;
    r.updatedAt = now();
  });
}

/**
 * Resolves a version conflict on an assistance task. Both versions are kept:
 * the central task keeps every version, and the device keeps the officer's
 * original entry under "Earlier versions".
 */
export async function resolveAssistanceConflict(localId: string, choice: "keep_mine" | "use_central", note: string): Promise<void> {
  if (!note.trim()) throw new ServiceError("NOTE_REQUIRED");
  write((draft) => {
    const r = find(draft, localId);
    if (r.kind !== "assistance" || r.state !== "conflict" || !r.conflict) throw new ServiceError("INVALID_STATE");
    const c = r.conflict;
    r.previous.push({ at: now(), reason: "conflict", label: `task v${c.baseVersion}`, data: structuredClone(r.data) });
    if (choice === "use_central") {
      for (const change of c.changes) {
        if (change.field === "quantity") r.data.quantity = change.central;
        if (change.field === "assistanceType") r.data.assistanceType = change.central;
        if (change.field === "unit") r.data.unit = change.central;
      }
      r.data.baseAllocation = { quantity: Number(r.data.quantity), assistanceType: r.data.assistanceType, unit: r.data.unit };
    }
    r.data.baseTaskVersion = c.centralVersion;
    r.data.resolution = { choice, againstVersion: c.centralVersion, note: note.trim() };
    r.conflict = undefined;
    r.error = undefined;
    // Keeping the delivery as recorded goes straight back to the queue; using the central
    // version returns to draft so the officer confirms it matches what was delivered.
    r.state = choice === "keep_mine" ? "pending" : "draft";
    r.updatedAt = now();
    r.events.push({ at: now(), type: "conflictResolved", params: { choice } });
  });
  if (choice === "keep_mine" && isOnline()) await syncNow({ only: [localId] });
}

/** Moves a survey response collected on a retired version to the current one. The original answers stay on the device. */
export function moveSurveyToCurrentVersion(localId: string, form: FieldFormView): void {
  write((draft) => {
    const r = find(draft, localId);
    if (r.kind !== "survey") throw new ServiceError("INVALID_STATE");
    const current = form.published;
    if (!current || current.version === r.data.formVersion) throw new ServiceError("INVALID_STATE");
    r.previous.push({ at: now(), reason: "formVersionRetired", label: `v${r.data.formVersion}`, data: structuredClone(r.data) });
    const kept = Object.fromEntries(Object.entries(r.data.answers).filter(([id]) => current.questions.some((q) => q.id === id)));
    const from = r.data.formVersion;
    r.data = {
      ...r.data,
      formVersion: current.version,
      questions: current.questions.map((q) => ({ ...q })),
      answers: kept,
      migratedFrom: { version: from },
      position: Math.max(0, current.questions.findIndex((q) => q.required && !(kept[q.id] ?? "").trim())),
    };
    r.state = "draft";
    r.error = undefined;
    r.updatedAt = now();
    r.events.push({ at: now(), type: "migrated", params: { from, to: current.version } });
  });
}

/* ================================================================== Sync */

let running = false;
const runListeners = new Set<() => void>();

export function isSyncRunning(): boolean {
  return running;
}

export function subscribeSyncRun(listener: () => void): () => void {
  runListeners.add(listener);
  return () => runListeners.delete(listener);
}

function setRunning(value: boolean) {
  running = value;
  runListeners.forEach((l) => l());
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const ORDER: Record<LocalKind, number> = { verification: 0, report: 1, survey: 2, assistance: 3, issue: 4 };

function numberOr(v: string, fallback = 0): number {
  const n = Number(v);
  return v.trim() === "" || !Number.isFinite(n) ? fallback : n;
}

function meta(list: LocalAttachment[]) {
  return list.map((a) => ({ name: a.name, kind: a.kind === "photo" ? ("photo" as const) : ("document" as const), sizeKb: a.storedKb }));
}

async function send(r: LocalRecord): Promise<SyncResult> {
  switch (r.kind) {
    case "report": {
      const d = r.data;
      const payload: VisitPayload = {
        clientRecordId: r.localId,
        resubmissionOf: r.revision?.of,
        clientRevisionId: r.revision ? `${r.localId}:r${r.revision.number}` : undefined,
        correctionNote: r.revision?.note,
        taskId: d.taskId,
        kind: d.kind,
        title: d.title,
        interventionId: d.interventionId,
        visitAt: d.visitAt,
        activityType: d.activityType,
        servicePointId: d.servicePointId,
        locationNote: d.locationNote,
        observations: d.observations,
        workCompleted: d.workCompleted,
        reached: { women: numberOr(d.reached.women), men: numberOr(d.reached.men), children: numberOr(d.reached.children) },
        indicatorValues: Object.entries(d.indicatorValues)
          .filter(([, v]) => v.trim() !== "")
          .map(([indicatorId, v]) => ({ indicatorId, value: numberOr(v) })),
        challenges: d.challenges,
        followUp: d.followUp,
        gps: d.gps ? { lat: d.gps.lat, lng: d.gps.lng, accuracyM: d.gps.accuracyM } : undefined,
        gpsUnavailableReason: d.gps ? undefined : d.gpsUnavailableReason,
        attachments: meta(d.attachments),
        collectedOffline: r.createdOffline,
      };
      return receiveVisitReport(payload);
    }
    case "survey": {
      const d = r.data;
      const payload: SurveyPayload = {
        clientRecordId: r.localId,
        taskId: d.taskId,
        interventionId: d.interventionId,
        formId: d.formId,
        formVersion: d.formVersion,
        answers: d.questions.map((q) => ({ questionId: q.id, value: d.answers[q.id] ?? "" })),
        collectedAt: d.collectedAt ?? r.createdAt,
        collectedOffline: r.createdOffline,
        migratedFrom: d.migratedFrom,
      };
      return receiveSurveyResponse(payload);
    }
    case "assistance": {
      const d = r.data;
      const payload: AssistancePayload = {
        clientRecordId: r.localId,
        taskId: d.taskId,
        baseTaskVersion: d.baseTaskVersion,
        interventionId: d.interventionId,
        householdRef: d.householdRef,
        assistanceType: d.assistanceType,
        quantity: numberOr(d.quantity),
        unit: d.unit,
        valueUsd: d.valueUsd.trim() === "" ? undefined : numberOr(d.valueUsd),
        deliveredAt: d.deliveredAt,
        servicePointId: d.servicePointId,
        evidence: meta(d.evidence),
        note: d.note,
        verificationClientId: d.verificationLocalId,
        collectedOffline: r.createdOffline,
        resolution: d.resolution,
      };
      return receiveAssistance(payload);
    }
    case "verification": {
      const d = r.data;
      const payload: VerificationPayload = {
        clientRecordId: r.localId,
        interventionId: d.interventionId,
        beneficiaryRef: d.beneficiaryRef,
        householdSize: d.householdSize.trim() === "" ? undefined : numberOr(d.householdSize),
        purpose: d.purpose,
        consent: d.consent,
        queuedOffline: r.createdOffline,
      };
      return receiveVerification(payload);
    }
    case "issue": {
      const d = r.data;
      const payload: IssuePayload = {
        clientRecordId: r.localId,
        category: d.category,
        priority: d.priority,
        interventionId: d.interventionId || undefined,
        servicePointId: d.servicePointId || undefined,
        locationNote: d.locationNote,
        description: d.description,
        evidence: meta(d.evidence),
        serviceType: d.serviceType,
      };
      return receiveIssue(payload);
    }
  }
}

/** After upload, keep only what the officer still needs on the device. */
function purgeAfterSync(r: LocalRecord): string[] {
  const files = attachmentsOf(r).filter((a) => a.stored).map((a) => a.id);
  attachmentsOf(r).forEach((a) => {
    a.stored = false;
    a.uploaded = true;
  });
  if (r.kind === "assistance") {
    r.data.householdRef = maskReference(r.data.householdRef.trim().toUpperCase());
    r.purged = true;
  }
  if (r.kind === "verification") {
    r.data.beneficiaryRef = maskReference(r.data.beneficiaryRef.trim().toUpperCase());
    r.purged = true;
  }
  if (r.kind === "issue" && (r.data.category === "safeguarding" || r.data.category === "referral")) {
    r.data.description = "";
    r.purged = true;
  }
  return files;
}

export interface SyncRunSummary {
  accepted: number;
  rejected: number;
  conflicts: number;
  interrupted: number;
  total: number;
}

function update(localId: string, recipe: (r: LocalRecord) => void) {
  write((draft) => recipe(find(draft, localId)));
}

/**
 * Uploads queued records one at a time, verifications first so a delivery can
 * refer to its check. Each record ends synced, rejected (kept on the device
 * with the reason), in conflict (kept, waiting for a decision), or
 * interrupted (kept, safe to retry). Nothing is ever deleted by a failure.
 */
export async function syncNow(options: { only?: string[] } = {}): Promise<SyncRunSummary> {
  if (!isOnline()) throw new ServiceError("OFFLINE");
  if (running) throw new ServiceError("INVALID_STATE");
  setRunning(true);
  const summary: SyncRunSummary = { accepted: 0, rejected: 0, conflicts: 0, interrupted: 0, total: 0 };
  let reachedServer = false;
  try {
    const device = getDevice();
    const queue = device.records
      .filter((r) => r.state === "pending" || r.state === "syncing" || (r.state === "failed" && r.error?.retryable))
      .filter((r) => !options.only || options.only.includes(r.localId))
      .sort((a, b) => ORDER[a.kind] - ORDER[b.kind] || (a.queuedAt ?? a.createdAt).localeCompare(b.queuedAt ?? b.createdAt));
    summary.total = queue.length;
    const slow = device.settings.unstable;
    let dropNextReply = slow;

    for (const item of queue) {
      if (!isOnline()) {
        // Connection lost part-way: the rest stay queued, untouched.
        break;
      }
      update(item.localId, (r) => {
        r.state = "syncing";
        r.progress = "preparing";
        r.attempts += 1;
        r.lastAttemptAt = now();
        r.events.push({ at: now(), type: "syncStarted" });
      });
      await wait(slow ? 700 : 250);
      const files = attachmentsOf(item).filter((a) => !a.uploaded);
      if (files.length) {
        update(item.localId, (r) => void (r.progress = "uploadingFiles"));
        const kb = files.reduce((sum, a) => sum + a.storedKb, 0);
        await wait(Math.min(slow ? 4000 : 1800, 300 + kb * (slow ? 3 : 1)));
      }
      if (!isOnline()) {
        update(item.localId, (r) => {
          r.state = "failed";
          r.progress = undefined;
          r.error = { code: "CONNECTION_LOST", fields: [], retryable: true, at: now() };
          r.events.push({ at: now(), type: "interrupted" });
        });
        summary.interrupted += 1;
        break;
      }
      update(item.localId, (r) => void (r.progress = "confirming"));
      const latest = getLocalRecord(item.localId)!;
      let result: SyncResult;
      try {
        result = await send(latest);
        reachedServer = true;
      } catch (err) {
        update(item.localId, (r) => {
          r.state = "failed";
          r.progress = undefined;
          r.error = { code: err instanceof ServiceError ? err.code : "SERVER_ERROR", fields: [], retryable: true, at: now() };
          r.events.push({ at: now(), type: "interrupted" });
        });
        summary.interrupted += 1;
        continue;
      }
      if (dropNextReply && result.outcome === "accepted") {
        // SIMULATED unstable connection: the central system saved the record, but its reply
        // never reached the device. The device keeps the record; a retry is safe because the
        // central system recognises the device id and does not create a second record.
        dropNextReply = false;
        update(item.localId, (r) => {
          r.state = "failed";
          r.progress = undefined;
          r.error = { code: "REPLY_LOST", fields: [], retryable: true, at: now() };
          r.events.push({ at: now(), type: "interrupted" });
        });
        summary.interrupted += 1;
        continue;
      }
      let purge: string[] = [];
      update(item.localId, (r) => {
        r.progress = undefined;
        if (result.outcome === "accepted") {
          r.state = "synced";
          r.error = undefined;
          r.conflict = undefined;
          r.central = { id: result.centralId, ref: result.ref, syncedAt: now(), status: result.status };
          if (r.kind === "verification") r.data.result = { status: result.status, detail: result.detail, at: now() };
          if (r.revision) {
            r.events.push({ at: now(), type: "resubmitted", params: { ref: result.ref, version: r.revision.number } });
            r.revision = undefined;
          }
          r.events.push({ at: now(), type: result.replayed ? "syncedReplay" : "synced", params: { ref: result.ref } });
          purge = purgeAfterSync(r);
        } else if (result.outcome === "rejected") {
          r.state = "failed";
          r.error = { code: result.code, fields: result.fields, params: result.params, retryable: false, at: now() };
          r.events.push({ at: now(), type: "rejected", params: { code: result.code } });
        } else {
          r.state = "conflict";
          r.conflict = result.conflict;
          r.events.push({ at: now(), type: "conflict", params: { ref: result.conflict.taskRef } });
        }
      });
      if (result.outcome === "accepted") summary.accepted += 1;
      else if (result.outcome === "rejected") summary.rejected += 1;
      else summary.conflicts += 1;
      await deleteFiles(purge);
    }
  } finally {
    // A record left "syncing" by a closed tab or lost connection goes back to the queue.
    write((draft) => {
      for (const r of draft.records.filter((x) => x.state === "syncing")) {
        r.state = "pending";
        r.progress = undefined;
      }
      if (reachedServer || summary.total === 0) draft.lastSyncAt = now();
      draft.lastRun = { at: now(), accepted: summary.accepted, rejected: summary.rejected, conflicts: summary.conflicts, interrupted: summary.interrupted };
      if (draft.walkthrough.wentOfflineAt && !draft.walkthrough.syncedAfterOfflineAt && summary.total > 0) draft.walkthrough.syncedAfterOfflineAt = now();
    });
    setRunning(false);
  }
  return summary;
}

/** Puts a failed upload back in the queue and, when online, tries it straight away. */
export async function retryLocalRecord(localId: string): Promise<SyncRunSummary | null> {
  write((draft) => {
    const r = find(draft, localId);
    if (r.state !== "failed") throw new ServiceError("INVALID_STATE");
    if (!r.error?.retryable && !isComplete(r)) throw new ServiceError("MISSING_INFORMATION");
    r.state = "pending";
    r.error = undefined;
    r.events.push({ at: now(), type: "retryQueued" });
  });
  return isOnline() ? syncNow({ only: [localId] }) : null;
}

/** Removes device copies of records the central system already has. Drafts and queued work are never touched. */
export async function removeSyncedCopies(): Promise<number> {
  const removed = getDevice().records.filter((r) => r.state === "synced" && !r.revision);
  write((draft) => {
    draft.records = draft.records.filter((r) => !(r.state === "synced" && !r.revision));
  });
  await deleteFiles(removed.flatMap((r) => attachmentsOf(r).map((a) => a.id)));
  return removed.length;
}

export function setDeviceSetting(key: "autoSync" | "unstable", value: boolean): void {
  write((draft) => void (draft.settings[key] = value));
}

export function noteWalkthrough(key: "openedOnlineAt" | "wentOfflineAt" | "centralChangesAt"): void {
  if (getDevice().walkthrough[key]) return;
  write((draft) => void (draft.walkthrough[key] = now()));
}

/* ============================================================ Helpers */

/** The local record that belongs to a task, if the officer already started it on this device. */
export function recordForTask(taskId: string, kind?: LocalKind): LocalRecord | undefined {
  return getDevice().records.find((r) => "taskId" in r.data && r.data.taskId === taskId && (!kind || r.kind === kind));
}

/** Starts (or reopens) the record for an assigned task. */
export function startTaskRecord(task: FieldTaskView, form?: FieldFormView): { kind: LocalKind; localId: string } {
  const kind: LocalKind = task.kind === "survey" ? "survey" : task.kind === "assistance" ? "assistance" : "report";
  const existing = recordForTask(task.id, kind);
  if (existing) return { kind, localId: existing.localId };
  if (kind === "survey" && form?.published) return { kind, localId: startSurvey(form, task.interventionId, task.id) };
  if (kind === "assistance") {
    const a = task.allocation;
    return {
      kind,
      localId: createLocalRecord("assistance", task.title, {
        interventionId: task.interventionId,
        taskId: task.id,
        baseTaskVersion: task.version,
        baseAllocation: a ? { quantity: a.quantity, assistanceType: a.assistanceType, unit: a.unit } : undefined,
        householdRef: a?.householdRef ?? "",
        assistanceType: a?.assistanceType ?? "",
        quantity: a ? String(a.quantity) : "",
        unit: a?.unit ?? "",
        valueUsd: "",
        deliveredAt: localDateTime(),
        servicePointId: task.servicePointId ?? "",
        evidence: [],
        note: "",
      }),
    };
  }
  return { kind: "report", localId: startReport(task.interventionId, task.kind === "activity" ? "activity_update" : "site_visit", task) };
}

export function localDateTime(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function startReport(interventionId: string, kind: ReportData["kind"], task?: FieldTaskView): string {
  return createLocalRecord("report", task?.title ?? "", {
    kind,
    title: task?.title ?? "",
    interventionId,
    taskId: task?.id,
    visitAt: localDateTime(),
    activityType: "",
    servicePointId: task?.servicePointId ?? "",
    locationNote: "",
    observations: "",
    workCompleted: "",
    reached: { women: "", men: "", children: "" },
    indicatorValues: {},
    challenges: "",
    followUp: "",
    gpsUnavailableReason: "",
    attachments: [],
  });
}

export function startSurvey(form: FieldFormView, interventionId: string, taskId?: string): string {
  const version = form.published;
  if (!version) throw new ServiceError("INVALID_STATE");
  return createLocalRecord("survey", `${form.title}`, {
    formId: form.id,
    formRef: form.ref,
    formTitle: form.title,
    formVersion: version.version,
    questions: version.questions.map((q) => ({ ...q })),
    interventionId,
    taskId,
    answers: {},
    position: 0,
  });
}
