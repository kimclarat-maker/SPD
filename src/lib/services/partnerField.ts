"use client";

import type {
  AssistanceRecord,
  AssistanceStatus,
  Attachment,
  AuditEntry,
  BeneficiaryReview,
  BeneficiaryVerification,
  BeneficiaryVerificationStatus,
  DemoState,
  FieldForm,
  FieldReport,
  FieldReportKind,
  FieldReportStatus,
  FormVersion,
  Intervention,
  RunOutcome,
  ServicePoint,
  ValidationCode,
} from "@/lib/types";
import { addAudit, addNotification, getState, mutate, newId } from "@/lib/demo/store";
import { DAY_MS, delay, now, requireNote, ServiceError } from "./core";
import { APPROVED_WORK, REPORTABLE } from "./interventions";
import { currentIssues, totalReached, validateReport } from "./fieldReports";
import { recordRun } from "./external";
import {
  maskReference,
  nextRef,
  notifyOpm,
  notifyPartner,
  ownFieldReport,
  ownIntervention,
  partnerAudit,
  partnerAuthor,
  partnerContext,
  partnerVisibleAudit,
  requirePartnerPermission,
  visibleInterventions,
  type PartnerContext,
} from "./partnerContext";

/* ========================================================= Field reports */

/** The partner's view of the review lifecycle: Draft → Submitted → Needs correction / Accepted. */
export type PartnerReportStatus = "draft" | "saved_offline" | "awaiting_sync" | "submitted" | "needs_correction" | "accepted";

export function partnerReportStatus(s: FieldReportStatus): PartnerReportStatus {
  switch (s) {
    case "draft":
    case "saved_offline":
    case "awaiting_sync":
    case "accepted":
      return s;
    case "returned":
      return "needs_correction";
    default:
      return "submitted";
  }
}

export type ReportKind = Exclude<FieldReportKind, "survey">;

export interface FieldReportInput {
  interventionId: string;
  kind: ReportKind;
  title: string;
  activityType: string;
  collectedAt: string;
  servicePointId: string;
  locationNote: string;
  gps?: { lat: number; lng: number; accuracyM: number };
  reached: { women: number; men: number; children: number };
  indicatorValues: { indicatorId: string; value: number }[];
  distributed: { item: string; quantity: number; households: number }[];
  outputs: string;
  challenges: string;
  narrative: string;
  attachments: Omit<Attachment, "id">[];
}

export type FieldReportIssue =
  | "intervention"
  | "title"
  | "activityType"
  | "collectedAt"
  | "servicePoint"
  | "gps"
  | "reached"
  | "indicators"
  | "distributed"
  | "outputs"
  | "narrative";

export function fieldReportIssues(state: DemoState, input: FieldReportInput): FieldReportIssue[] {
  const issues: FieldReportIssue[] = [];
  const i = state.interventions.find((x) => x.id === input.interventionId);
  if (!i || !REPORTABLE.includes(i.status)) issues.push("intervention");
  if (!input.title.trim()) issues.push("title");
  if (!input.activityType.trim()) issues.push("activityType");
  const t = new Date(input.collectedAt).getTime();
  if (!input.collectedAt || Number.isNaN(t) || t > Date.now() + 60 * 60 * 1000 || (i && t < new Date(i.startDate).getTime() - DAY_MS)) issues.push("collectedAt");
  if (!input.servicePointId || (i && !i.servicePointIds.includes(input.servicePointId))) issues.push("servicePoint");
  if (input.gps && (!Number.isFinite(input.gps.lat) || !Number.isFinite(input.gps.lng) || Math.abs(input.gps.lat) > 90 || Math.abs(input.gps.lng) > 180)) issues.push("gps");
  const r = input.reached;
  if ([r.women, r.men, r.children].some((n) => !Number.isFinite(n) || n < 0) || r.women + r.men + r.children === 0) issues.push("reached");
  if (i && input.indicatorValues.some((v) => !i.indicatorTargets.some((x) => x.indicatorId === v.indicatorId) || !Number.isFinite(v.value) || v.value < 0)) issues.push("indicators");
  if (input.kind === "distribution" && (input.distributed.length === 0 || input.distributed.some((d) => !d.item.trim() || !(d.quantity > 0) || !(d.households > 0)))) issues.push("distributed");
  if (!input.outputs.trim()) issues.push("outputs");
  if (!input.narrative.trim()) issues.push("narrative");
  return issues;
}

/** The same checks the service applies on submission, for showing problems in the form first. */
export async function checkFieldReportInput(input: FieldReportInput): Promise<FieldReportIssue[]> {
  return fieldReportIssues(getState(), input);
}

function formFor(state: DemoState, interventionId: string, kind: FieldReportKind): { form: FieldForm; version: FormVersion } {
  const candidates = state.forms.filter((f) => f.kind === kind && f.versions.some((v) => v.status === "published"));
  const form = candidates.find((f) => f.interventionIds.includes(interventionId)) ?? candidates[0] ?? state.forms.find((f) => f.id === "frm-activity")!;
  const version = form.versions.find((v) => v.status === "published") ?? form.versions[form.versions.length - 1];
  return { form, version };
}

function applyInput(r: FieldReport, input: FieldReportInput) {
  r.title = input.title.trim();
  r.kind = input.kind;
  r.activityType = input.activityType.trim();
  r.collectedAt = new Date(input.collectedAt).toISOString();
  r.servicePointId = input.servicePointId || undefined;
  r.locationNote = input.locationNote.trim() || undefined;
  r.gps = input.gps ? { lat: input.gps.lat, lng: input.gps.lng, accuracyM: Math.max(1, Math.round(input.gps.accuracyM || 10)) } : undefined;
  r.reached = { women: Math.round(input.reached.women), men: Math.round(input.reached.men), children: Math.round(input.reached.children) };
  r.indicatorValues = input.indicatorValues.filter((v) => v.indicatorId).map((v) => ({ indicatorId: v.indicatorId, value: Math.round(v.value) }));
  r.distributed = input.kind === "distribution" ? input.distributed.map((d) => ({ item: d.item.trim(), quantity: Math.round(d.quantity), households: Math.round(d.households) })) : [];
  r.outputs = input.outputs.trim();
  r.challenges = input.challenges.trim() || undefined;
  r.narrative = input.narrative.trim();
  r.attachments = input.attachments.map((a, index) => ({ id: `at${index + 1}`, name: a.name, kind: a.kind, sizeKb: a.sizeKb }));
}

function snapshot(r: FieldReport, by: string, note: string) {
  const version = (r.history ?? []).length + 1;
  r.history = [
    ...(r.history ?? []),
    {
      version,
      at: now(),
      by,
      note,
      reached: { ...r.reached },
      indicatorValues: r.indicatorValues.map((v) => ({ ...v })),
      narrative: r.narrative,
      outputs: r.outputs,
      answers: r.answers?.map((a) => ({ ...a })),
    },
  ];
  return version;
}

/** The server-side checks run on arrival; issues route the report to "needs review" at OPM, never reject it. */
function arrive(draft: DemoState, r: FieldReport) {
  r.syncedAt = now();
  r.validationIssues = validateReport(draft, r, r.syncedAt);
  r.status = r.validationIssues.length ? "needs_review" : "synced";
  r.updatedAt = now();
}

export interface PartnerFieldReportRow extends FieldReport {
  interventionRef: string;
  interventionTitle: string;
  partnerStatus: PartnerReportStatus;
  total: number;
  version: number;
}

function toRow(state: DemoState, r: FieldReport): PartnerFieldReportRow {
  const i = state.interventions.find((x) => x.id === r.interventionId)!;
  return { ...r, interventionRef: i.ref, interventionTitle: i.title, partnerStatus: partnerReportStatus(r.status), total: totalReached(r), version: (r.history ?? []).length };
}

export async function listPartnerFieldReports(kind: "reports" | "surveys" = "reports"): Promise<PartnerFieldReportRow[]> {
  const state = getState();
  const ctx = partnerContext(state);
  const ids = new Set(visibleInterventions(state, ctx).map((i) => i.id));
  return state.fieldReports
    .filter((r) => ids.has(r.interventionId) && (kind === "surveys" ? r.kind === "survey" : r.kind !== "survey"))
    .map((r) => toRow(state, r))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getReportOptions(): Promise<{ interventions: Intervention[]; servicePoints: ServicePoint[]; canSubmit: boolean }> {
  const state = getState();
  const ctx = partnerContext(state);
  const interventions = visibleInterventions(state, ctx).filter((i) => REPORTABLE.includes(i.status));
  const points = new Set(interventions.flatMap((i) => i.servicePointIds));
  return { interventions, servicePoints: state.servicePoints.filter((sp) => points.has(sp.id)), canSubmit: ctx.permissions.includes("fieldReports.submit") };
}

export async function getPartnerFieldReport(id: string): Promise<{
  report: PartnerFieldReportRow;
  intervention: Intervention;
  form?: FieldForm;
  version?: FormVersion;
  servicePoint?: ServicePoint;
  issues: ValidationCode[];
  history: AuditEntry[];
  canEdit: boolean;
  canSubmit: boolean;
  /** Suffix on comments written by this organisation, to tell them apart from OPM comments. */
  orgLabel: string;
}> {
  const state = getState();
  const ctx = partnerContext(state);
  const { report, intervention } = ownFieldReport(state, ctx, id);
  const form = state.forms.find((f) => f.id === report.formId);
  const permission = report.kind === "survey" ? "surveys.collect" : "fieldReports.submit";
  const canSubmit = ctx.permissions.includes(permission);
  return {
    report: toRow(state, report),
    intervention,
    form,
    version: form?.versions.find((v) => v.version === report.formVersion),
    servicePoint: state.servicePoints.find((sp) => sp.id === report.servicePointId),
    issues: report.status === "draft" ? [] : currentIssues(state, report),
    history: partnerVisibleAudit(state, ctx, id),
    canEdit: canSubmit && (report.status === "draft" || report.status === "returned"),
    canSubmit,
    orgLabel: ctx.partner.acronym || ctx.partner.name,
  };
}

function log(draft: DemoState, ctx: PartnerContext, r: FieldReport, action: string, note?: string, simulated?: boolean) {
  partnerAudit(draft, ctx, action, "fieldReport", r.id, r.ref, {}, { note, simulated });
}

export async function createFieldReport(input: FieldReportInput, submit: boolean): Promise<string> {
  if (!input.interventionId || !input.title.trim()) throw new ServiceError("FIELD_REQUIRED");
  await delay(submit ? 450 : 250);
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "fieldReports.submit");
  return mutate((draft) => {
    const intervention = ownIntervention(draft, ctx, input.interventionId);
    if (!REPORTABLE.includes(intervention.status)) throw new ServiceError("INTERVENTION_NOT_APPROVED");
    if (submit && fieldReportIssues(draft, input).length > 0) throw new ServiceError("MISSING_INFORMATION");
    const { form, version } = formFor(draft, intervention.id, input.kind);
    const r: FieldReport = {
      id: newId("fr"),
      ref: nextRef(draft.fieldReports.map((x) => x.ref), "FR-2026-"),
      title: "",
      kind: input.kind,
      interventionId: intervention.id,
      formId: form.id,
      formVersion: version.version,
      submittedBy: partnerAuthor(ctx),
      channel: "online",
      collectedAt: now(),
      reached: { women: 0, men: 0, children: 0 },
      indicatorValues: [],
      distributed: [],
      attachments: [],
      narrative: "",
      status: "draft",
      validationIssues: [],
      comments: [],
      pendingReviewIds: [],
      updatedAt: now(),
      createdByUserId: ctx.user.id,
    };
    applyInput(r, input);
    draft.fieldReports.push(r);
    log(draft, ctx, r, "fieldReportDrafted");
    if (submit) {
      snapshot(r, ctx.actor, "First submission.");
      arrive(draft, r);
      log(draft, ctx, r, "fieldReportSubmittedByPartner");
      notifyOpm(draft, "fieldReportSubmitted", { ref: r.ref, partner: ctx.partner.name }, "fieldReport", r.id);
    }
    return r.id;
  });
}

export async function updateFieldReport(id: string, input: FieldReportInput): Promise<void> {
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "fieldReports.submit");
  mutate((draft) => {
    const { report } = ownFieldReport(draft, ctx, id);
    if (report.status !== "draft" && report.status !== "returned") throw new ServiceError("LOCKED");
    if (report.kind === "survey") throw new ServiceError("INVALID_STATE");
    if (input.interventionId !== report.interventionId) ownIntervention(draft, ctx, input.interventionId);
    report.interventionId = input.interventionId;
    applyInput(report, input);
    report.updatedAt = now();
    log(draft, ctx, report, "fieldReportSaved");
  });
}

/**
 * Draft → Submitted, or Needs correction → Submitted again with the
 * correction explained. Earlier submitted versions stay in the history.
 */
export async function submitFieldReport(id: string, note: string): Promise<void> {
  await delay(450);
  const ctx = partnerContext();
  mutate((draft) => {
    const { report, intervention } = ownFieldReport(draft, ctx, id);
    requirePartnerPermission(ctx, report.kind === "survey" ? "surveys.collect" : "fieldReports.submit");
    if (report.status !== "draft" && report.status !== "returned") throw new ServiceError("INVALID_STATE");
    if (!REPORTABLE.includes(intervention.status)) throw new ServiceError("INTERVENTION_NOT_APPROVED");
    if (report.kind === "survey") {
      if (surveyIssues(draft, report).length > 0) throw new ServiceError("MISSING_INFORMATION");
    } else if (fieldReportIssues(draft, inputOf(report)).length > 0) {
      throw new ServiceError("MISSING_INFORMATION");
    }
    const correction = report.status === "returned";
    const reply = correction ? requireNote(note) : note.trim() || undefined;
    snapshot(report, ctx.actor, reply ?? "First submission.");
    if (correction && reply) report.comments.push({ id: newId("c"), at: now(), author: partnerAuthor(ctx), text: reply });
    arrive(draft, report);
    // A correction is judged on its content, not on how long the correction took.
    if (correction) {
      report.validationIssues = report.validationIssues.filter((c) => c !== "late_submission");
      report.status = report.validationIssues.length ? "needs_review" : "synced";
    }
    log(draft, ctx, report, correction ? "fieldReportResubmittedByPartner" : "fieldReportSubmittedByPartner", reply);
    notifyOpm(draft, correction ? "fieldReportResubmitted" : "fieldReportSubmitted", { ref: report.ref, partner: ctx.partner.name }, "fieldReport", report.id);
  });
}

export async function deleteDraftFieldReport(id: string): Promise<void> {
  await delay();
  const ctx = partnerContext();
  mutate((draft) => {
    const { report } = ownFieldReport(draft, ctx, id);
    requirePartnerPermission(ctx, report.kind === "survey" ? "surveys.collect" : "fieldReports.submit");
    if (report.status !== "draft" || (report.history ?? []).length > 0) throw new ServiceError("INVALID_STATE");
    draft.fieldReports = draft.fieldReports.filter((x) => x.id !== id);
    log(draft, ctx, report, "fieldReportDraftDeleted");
  });
}

export function inputOf(r: FieldReport): FieldReportInput {
  return {
    interventionId: r.interventionId,
    kind: (r.kind === "survey" ? "activity_update" : r.kind) as ReportKind,
    title: r.title,
    activityType: r.activityType ?? "",
    collectedAt: r.collectedAt,
    servicePointId: r.servicePointId ?? "",
    locationNote: r.locationNote ?? "",
    gps: r.gps,
    reached: { ...r.reached },
    indicatorValues: r.indicatorValues.map((v) => ({ ...v })),
    distributed: r.distributed.map((d) => ({ ...d })),
    outputs: r.outputs ?? "",
    challenges: r.challenges ?? "",
    narrative: r.narrative,
    attachments: r.attachments.map((a) => ({ name: a.name, kind: a.kind, sizeKb: a.sizeKb })),
  };
}

/**
 * SIMULATED field application: stands in for a staff member's tablet saving a
 * report without connectivity. It appears here as "Saved offline" until synced.
 */
export async function simulateFieldAppCapture(interventionId: string): Promise<string> {
  await delay(400);
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "fieldReports.submit");
  return mutate((draft) => {
    const i = ownIntervention(draft, ctx, interventionId);
    if (!REPORTABLE.includes(i.status)) throw new ServiceError("INTERVENTION_NOT_APPROVED");
    const { form, version } = formFor(draft, i.id, "activity_update");
    const sp = draft.servicePoints.find((x) => x.id === i.servicePointIds[0]);
    const r: FieldReport = {
      id: newId("fr"),
      ref: nextRef(draft.fieldReports.map((x) => x.ref), "FR-2026-"),
      title: "Outreach session (captured offline)",
      kind: "activity_update",
      activityType: "Community outreach session",
      interventionId: i.id,
      formId: form.id,
      formVersion: version.version,
      servicePointId: sp?.id,
      submittedBy: `${ctx.partner.acronym || ctx.partner.name} field tablet 1 (simulated)`,
      channel: "offline",
      collectedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
      gps: sp ? { lat: sp.lat + 0.001, lng: sp.lng - 0.001, accuracyM: 9 } : undefined,
      reached: { women: 46, men: 9, children: 22 },
      indicatorValues: i.indicatorTargets.slice(0, 1).map((t) => ({ indicatorId: t.indicatorId, value: 6 })),
      distributed: [],
      attachments: [{ id: "at1", name: "session-attendance.jpg", kind: "photo", sizeKb: 640 }],
      narrative: "Outreach session recorded on a tablet without connectivity. Queued on the device until the team returns to base.",
      outputs: "One outreach session held.",
      status: "saved_offline",
      validationIssues: [],
      comments: [],
      pendingReviewIds: [],
      syncScript: "clean",
      updatedAt: now(),
      createdByUserId: ctx.user.id,
    };
    draft.fieldReports.push(r);
    log(draft, ctx, r, "fieldReportSavedOffline", undefined, true);
    return r.id;
  });
}

/** SIMULATED device sync from the field application: Saved offline → Awaiting sync → Submitted. */
export async function syncFieldAppRecord(id: string): Promise<PartnerReportStatus> {
  await delay(800);
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "fieldReports.submit");
  return mutate((draft) => {
    const { report } = ownFieldReport(draft, ctx, id);
    if (report.status === "saved_offline") {
      report.status = "awaiting_sync";
      report.updatedAt = now();
      log(draft, ctx, report, "fieldReportQueued", undefined, true);
      return partnerReportStatus(report.status);
    }
    if (report.status !== "awaiting_sync") throw new ServiceError("INVALID_STATE");
    snapshot(report, report.submittedBy, "Synced from the field application.");
    arrive(draft, report);
    log(draft, ctx, report, "fieldReportSynced", undefined, true);
    notifyOpm(draft, "fieldReportSubmitted", { ref: report.ref, partner: ctx.partner.name }, "fieldReport", report.id);
    return partnerReportStatus(report.status);
  });
}

/* ================================================================ Surveys */

export interface AssignedSurvey {
  form: FieldForm;
  published?: FormVersion;
  open: boolean;
  interventions: Intervention[];
  counts: Record<PartnerReportStatus, number>;
}

function emptyCounts(): Record<PartnerReportStatus, number> {
  return { draft: 0, saved_offline: 0, awaiting_sync: 0, submitted: 0, needs_correction: 0, accepted: 0 };
}

function isOpen(form: FieldForm, at = Date.now()) {
  return new Date(form.deploymentStart).getTime() <= at && new Date(form.deploymentEnd).getTime() >= at && form.versions.some((v) => v.status === "published");
}

export async function listAssignedSurveys(): Promise<AssignedSurvey[]> {
  const state = getState();
  const ctx = partnerContext(state);
  const own = visibleInterventions(state, ctx).filter((i) => APPROVED_WORK.includes(i.status));
  const ownIds = new Set(own.map((i) => i.id));
  return state.forms
    .filter((f) => f.interventionIds.some((id) => ownIds.has(id)))
    .map((form) => {
      const counts = emptyCounts();
      state.fieldReports.filter((r) => r.formId === form.id && ownIds.has(r.interventionId)).forEach((r) => (counts[partnerReportStatus(r.status)] += 1));
      return {
        form,
        published: form.versions.find((v) => v.status === "published"),
        open: isOpen(form),
        interventions: own.filter((i) => form.interventionIds.includes(i.id)),
        counts,
      };
    })
    .sort((a, b) => Number(b.open) - Number(a.open) || a.form.title.localeCompare(b.form.title));
}

export async function getAssignedSurvey(formId: string): Promise<{ survey: AssignedSurvey; responses: PartnerFieldReportRow[]; canCollect: boolean }> {
  const all = await listAssignedSurveys();
  const survey = all.find((s) => s.form.id === formId);
  const state = getState();
  const ctx = partnerContext(state);
  if (!survey) throw new ServiceError(state.forms.some((f) => f.id === formId) ? "NOT_PARTNER_RECORD" : "NOT_FOUND");
  const ids = new Set(survey.interventions.map((i) => i.id));
  const responses = state.fieldReports.filter((r) => r.formId === formId && ids.has(r.interventionId)).map((r) => toRow(state, r)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return { survey, responses, canCollect: ctx.permissions.includes("surveys.collect") };
}

/** Starts a response on the currently published version; that version stays with the response. */
export async function startSurveyResponse(formId: string, interventionId: string): Promise<string> {
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "surveys.collect");
  return mutate((draft) => {
    const i = ownIntervention(draft, ctx, interventionId);
    if (!REPORTABLE.includes(i.status)) throw new ServiceError("INTERVENTION_NOT_APPROVED");
    const form = draft.forms.find((f) => f.id === formId);
    if (!form || !form.interventionIds.includes(i.id)) throw new ServiceError("NOT_PARTNER_RECORD");
    if (!isOpen(form)) throw new ServiceError("INVALID_STATE");
    const published = form.versions.find((v) => v.status === "published")!;
    const r: FieldReport = {
      id: newId("fr"),
      ref: nextRef(draft.fieldReports.map((x) => x.ref), "FR-2026-"),
      title: `${form.title} response`,
      kind: "survey",
      interventionId: i.id,
      formId: form.id,
      formVersion: published.version,
      servicePointId: i.servicePointIds[0],
      submittedBy: partnerAuthor(ctx),
      channel: "online",
      collectedAt: now(),
      reached: { women: 0, men: 0, children: 0 },
      indicatorValues: [],
      distributed: [],
      attachments: [],
      narrative: "",
      answers: [],
      status: "draft",
      validationIssues: [],
      comments: [],
      pendingReviewIds: [],
      updatedAt: now(),
      createdByUserId: ctx.user.id,
    };
    draft.fieldReports.push(r);
    log(draft, ctx, r, "surveyResponseStarted");
    return r.id;
  });
}

export function surveyIssues(state: DemoState, r: FieldReport): string[] {
  const form = state.forms.find((f) => f.id === r.formId);
  const version = form?.versions.find((v) => v.version === r.formVersion);
  if (!version) return ["form"];
  const answers = new Map((r.answers ?? []).map((a) => [a.questionId, a.value.trim()]));
  return version.questions
    .filter((q) => {
      const value = answers.get(q.id) ?? "";
      if (q.required && !value) return true;
      if (value && q.type === "number" && !(Number.isFinite(Number(value)) && Number(value) >= 0)) return true;
      return false;
    })
    .map((q) => q.id);
}

export async function saveSurveyResponse(id: string, answers: { questionId: string; value: string }[]): Promise<void> {
  await delay(200);
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "surveys.collect");
  mutate((draft) => {
    const { report } = ownFieldReport(draft, ctx, id);
    if (report.kind !== "survey") throw new ServiceError("INVALID_STATE");
    if (report.status !== "draft" && report.status !== "returned") throw new ServiceError("LOCKED");
    const form = draft.forms.find((f) => f.id === report.formId);
    const version = form?.versions.find((v) => v.version === report.formVersion);
    report.answers = answers.map((a) => ({ questionId: a.questionId, value: a.value }));
    // Numeric answers linked to an indicator become indicator values once the response is accepted.
    report.indicatorValues = (version?.questions ?? [])
      .filter((q) => q.indicatorId && q.type === "number")
      .map((q) => ({ indicatorId: q.indicatorId!, value: Number(report.answers!.find((a) => a.questionId === q.id)?.value || 0) }))
      .filter((v) => Number.isFinite(v.value) && v.value > 0 && draft.interventions.find((i) => i.id === report.interventionId)?.indicatorTargets.some((t) => t.indicatorId === v.indicatorId));
    report.narrative = `Survey response on ${form?.ref ?? "form"} version ${report.formVersion}.`;
    report.outputs = `${report.answers.filter((a) => a.value.trim()).length} answers recorded.`;
    report.updatedAt = now();
    log(draft, ctx, report, "surveyResponseSaved");
  });
}

/* ============================================ Beneficiaries & assistance */

/** Minimum identifier format for the prototype: country-settlement-number-suffix, e.g. UG-NKV-0418-72. */
export const BENEFICIARY_REF = /^[A-Z]{2}-[A-Z]{3}-\d{4}-\d{2}$/;

export function normaliseRef(ref: string): string {
  return ref.trim().toUpperCase();
}

export interface VerificationRow extends Omit<BeneficiaryVerification, "beneficiaryRef"> {
  maskedRef: string;
  interventionRef: string;
}

export interface AssistanceRow extends Omit<AssistanceRecord, "beneficiaryRef"> {
  maskedRef: string;
  interventionRef: string;
  effectiveStatus: AssistanceStatus;
  verificationStatus?: BeneficiaryVerificationStatus;
}

/** Flag status as the partner sees it. The review content itself stays with the authorised OPM reviewer. */
export function assistanceStatus(state: DemoState, a: AssistanceRecord): AssistanceStatus {
  if (!a.reviewId) return a.status;
  const rv = state.reviews.find((x) => x.id === a.reviewId);
  if (rv?.status === "resolved_valid") return "cleared";
  if (rv?.status === "resolved_duplicate") return "corrected";
  return "flagged";
}

export async function listBeneficiaryWork(): Promise<{
  verifications: VerificationRow[];
  assistance: AssistanceRow[];
  interventions: Intervention[];
  servicePoints: ServicePoint[];
  can: { verify: boolean; record: boolean };
}> {
  const state = getState();
  const ctx = partnerContext(state);
  const own = visibleInterventions(state, ctx);
  const ids = new Set(own.map((i) => i.id));
  const refOf = (id: string) => state.interventions.find((i) => i.id === id)?.ref ?? "—";
  const live = own.filter((i) => REPORTABLE.includes(i.status));
  const points = new Set(live.flatMap((i) => i.servicePointIds));
  // Only this organisation's own entries. Other partners' assistance is never listed.
  return {
    verifications: state.verifications
      .filter((v) => v.partnerId === ctx.partner.id && ids.has(v.interventionId))
      .map(({ beneficiaryRef, ...v }) => ({ ...v, maskedRef: maskReference(beneficiaryRef), interventionRef: refOf(v.interventionId) }))
      .sort((a, b) => b.requestedAt.localeCompare(a.requestedAt)),
    assistance: state.assistance
      .filter((a) => a.partnerId === ctx.partner.id && ids.has(a.interventionId))
      .map((a) => {
        const { beneficiaryRef, ...rest } = a;
        return {
          ...rest,
          maskedRef: maskReference(beneficiaryRef),
          interventionRef: refOf(a.interventionId),
          effectiveStatus: assistanceStatus(state, a),
          verificationStatus: state.verifications.find((v) => v.id === a.verificationId)?.status,
        };
      })
      .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    interventions: live,
    servicePoints: state.servicePoints.filter((sp) => points.has(sp.id)),
    can: { verify: ctx.permissions.includes("beneficiaries.verify"), record: ctx.permissions.includes("assistance.record") },
  };
}

export async function getAssistance(id: string): Promise<{
  record: AssistanceRow;
  /** Full reference, only for staff authorised to verify or record assistance. */
  fullRef?: string;
  intervention: Intervention;
  verification?: VerificationRow;
  review?: { status: BeneficiaryReview["status"]; detectedAt: string; ref: string };
  history: AuditEntry[];
}> {
  const state = getState();
  const ctx = partnerContext(state);
  const a = state.assistance.find((x) => x.id === id);
  if (!a) throw new ServiceError("NOT_FOUND");
  if (a.partnerId !== ctx.partner.id) throw new ServiceError("NOT_PARTNER_RECORD");
  const intervention = ownIntervention(state, ctx, a.interventionId);
  const v = state.verifications.find((x) => x.id === a.verificationId);
  const rv = state.reviews.find((x) => x.id === a.reviewId);
  const { beneficiaryRef, ...rest } = a;
  const authorised = ctx.permissions.includes("beneficiaries.verify") || ctx.permissions.includes("assistance.record");
  return {
    record: { ...rest, maskedRef: maskReference(beneficiaryRef), interventionRef: intervention.ref, effectiveStatus: assistanceStatus(state, a), verificationStatus: v?.status },
    fullRef: authorised ? beneficiaryRef : undefined,
    intervention,
    verification: v ? (({ beneficiaryRef: _r, ...x }) => ({ ...x, maskedRef: maskReference(_r), interventionRef: intervention.ref }))(v) : undefined,
    review: rv ? { status: rv.status, detectedAt: rv.detectedAt, ref: rv.ref } : undefined,
    history: partnerVisibleAudit(state, ctx, id),
  };
}

/** Requests a (SIMULATED) ProGres v4 check. Only the reference and optional household size are sent. */
export async function requestBeneficiaryVerification(input: { interventionId: string; beneficiaryRef: string; householdSize?: number; purpose: string }): Promise<string> {
  const ref = normaliseRef(input.beneficiaryRef);
  if (!BENEFICIARY_REF.test(ref)) throw new ServiceError("INVALID_VALUE");
  const purpose = requireNote(input.purpose);
  await delay();
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "beneficiaries.verify");
  return mutate((draft) => {
    const i = ownIntervention(draft, ctx, input.interventionId);
    if (!REPORTABLE.includes(i.status)) throw new ServiceError("INTERVENTION_NOT_APPROVED");
    const v: BeneficiaryVerification = {
      id: newId("bv"),
      ref: nextRef(draft.verifications.map((x) => x.ref), "BV-2026-"),
      partnerId: ctx.partner.id,
      interventionId: i.id,
      beneficiaryRef: ref,
      householdSize: input.householdSize && input.householdSize > 0 ? Math.round(input.householdSize) : undefined,
      purpose,
      status: "pending",
      requestedAt: now(),
      requestedBy: ctx.actor,
      attempts: 0,
      simulated: true,
    };
    draft.verifications.push(v);
    partnerAudit(draft, ctx, "beneficiaryVerificationRequested", "verification", v.id, v.ref, { masked: maskReference(ref) }, { note: purpose });
    return v.id;
  });
}

/** Scripted, fictional ProGres v4 outcomes so every state can be demonstrated. Never a real UNHCR verification. */
export function scriptedOutcome(v: Pick<BeneficiaryVerification, "beneficiaryRef" | "attempts">): Exclude<BeneficiaryVerificationStatus, "pending"> {
  if (v.beneficiaryRef.endsWith("00") && v.attempts === 0) return "unavailable";
  if (v.beneficiaryRef.endsWith("9")) return "inconclusive";
  if (v.beneficiaryRef.endsWith("7")) return "needs_review";
  return "verified";
}

export const VERIFY_DETAIL: Record<Exclude<BeneficiaryVerificationStatus, "pending">, string> = {
  verified: "Reference found and active in ProGres v4 (simulated).",
  inconclusive: "Reference found, but the record was last updated more than 12 months ago (simulated).",
  unavailable: "ProGres v4 did not respond: service unavailable. Try again later (simulated).",
  needs_review: "Household size differs from the registration record; an authorised reviewer should confirm (simulated).",
};

export const RUN_OUTCOME: Record<Exclude<BeneficiaryVerificationStatus, "pending">, RunOutcome> = {
  verified: "success",
  inconclusive: "inconclusive",
  unavailable: "unavailable",
  needs_review: "mismatch",
};

export async function fetchVerificationResult(id: string): Promise<BeneficiaryVerificationStatus> {
  await delay(1000);
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "beneficiaries.verify");
  return mutate((draft) => {
    const v = draft.verifications.find((x) => x.id === id);
    if (!v || v.partnerId !== ctx.partner.id) throw new ServiceError("NOT_PARTNER_RECORD");
    ownIntervention(draft, ctx, v.interventionId);
    if (v.status !== "pending" && v.status !== "unavailable") throw new ServiceError("INVALID_STATE");
    const outcome = scriptedOutcome(v);
    recordRun(draft, {
      integrationId: "progres",
      operation: `Partner verification ${maskReference(v.beneficiaryRef)}`,
      trigger: v.attempts > 0 ? "retry" : "workflow",
      outcome: RUN_OUTCOME[outcome],
      records: outcome === "unavailable" ? 0 : 1,
      errors: outcome === "unavailable" ? 1 : 0,
      message: VERIFY_DETAIL[outcome],
      related: { entity: "verification", id: v.id },
    });
    v.status = outcome;
    v.detail = VERIFY_DETAIL[outcome];
    v.resultAt = now();
    v.attempts += 1;
    addAudit(draft, {
      actor: null,
      action: "beneficiaryVerificationResult",
      category: "integration",
      params: { name: v.ref, outcome },
      entity: "verification",
      entityId: v.id,
      entityRef: v.ref,
      simulated: true,
    });
    return v.status;
  });
}

export interface AssistanceInput {
  interventionId: string;
  verificationId?: string;
  beneficiaryRef: string;
  assistanceType: string;
  quantity: number;
  unit: string;
  valueUsd?: number;
  deliveredAt: string;
  servicePointId: string;
  responsibleStaff: string;
}

export type AssistanceIssue = "intervention" | "beneficiaryRef" | "assistanceType" | "quantity" | "unit" | "valueUsd" | "deliveredAt" | "servicePoint" | "responsibleStaff";

export function assistanceIssues(state: DemoState, input: AssistanceInput): AssistanceIssue[] {
  const issues: AssistanceIssue[] = [];
  const i = state.interventions.find((x) => x.id === input.interventionId);
  if (!i || !REPORTABLE.includes(i.status)) issues.push("intervention");
  // With a completed verification the reference comes from it, so staff do not re-enter identifiers.
  if (!input.verificationId && !BENEFICIARY_REF.test(normaliseRef(input.beneficiaryRef))) issues.push("beneficiaryRef");
  if (!input.assistanceType.trim()) issues.push("assistanceType");
  if (!(input.quantity > 0)) issues.push("quantity");
  if (!input.unit.trim()) issues.push("unit");
  if (input.valueUsd !== undefined && !(input.valueUsd >= 0)) issues.push("valueUsd");
  const t = new Date(input.deliveredAt).getTime();
  if (!input.deliveredAt || Number.isNaN(t) || t > Date.now() + 60 * 60 * 1000 || (i && t < new Date(i.startDate).getTime() - DAY_MS)) issues.push("deliveredAt");
  if (!input.servicePointId || (i && !i.servicePointIds.includes(input.servicePointId))) issues.push("servicePoint");
  if (!input.responsibleStaff.trim()) issues.push("responsibleStaff");
  return issues;
}

export async function checkAssistanceInput(input: AssistanceInput): Promise<AssistanceIssue[]> {
  return assistanceIssues(getState(), input);
}

/**
 * Records assistance delivered. A (SIMULATED) history check looks for the same
 * reference and assistance type within 30 days across all partners. A match
 * opens a review task for an authorised OPM reviewer. The assistance entry is
 * always kept: nobody is labelled as fraudulent and nothing is denied.
 */
export async function recordAssistance(input: AssistanceInput): Promise<{ id: string; flagged: boolean }> {
  await delay(500);
  const ctx = partnerContext();
  requirePartnerPermission(ctx, "assistance.record");
  return mutate((draft) => {
    const i = ownIntervention(draft, ctx, input.interventionId);
    if (assistanceIssues(draft, input).length > 0) throw new ServiceError("MISSING_INFORMATION");
    const verification = input.verificationId ? draft.verifications.find((v) => v.id === input.verificationId) : undefined;
    if (input.verificationId && (!verification || verification.partnerId !== ctx.partner.id || verification.interventionId !== i.id)) throw new ServiceError("INVALID_VALUE");
    const ref = verification ? verification.beneficiaryRef : normaliseRef(input.beneficiaryRef);
    if (verification && input.beneficiaryRef.trim() && normaliseRef(input.beneficiaryRef) !== ref) throw new ServiceError("INVALID_VALUE");
    const record: AssistanceRecord = {
      id: newId("as"),
      ref: nextRef(draft.assistance.map((x) => x.ref), "AS-2026-"),
      partnerId: ctx.partner.id,
      interventionId: i.id,
      verificationId: verification?.id,
      beneficiaryRef: ref,
      assistanceType: input.assistanceType.trim(),
      quantity: input.quantity,
      unit: input.unit.trim(),
      valueUsd: input.valueUsd,
      deliveredAt: new Date(input.deliveredAt).toISOString(),
      settlementId: i.settlementId,
      servicePointId: input.servicePointId,
      responsibleStaff: input.responsibleStaff.trim(),
      recordedBy: ctx.actor,
      recordedAt: now(),
      status: "recorded",
    };
    const earlier = earlierAssistance(draft, record);
    draft.assistance.push(record);
    partnerAudit(draft, ctx, "assistanceRecorded", "assistance", record.id, record.ref, { type: record.assistanceType, quantity: record.quantity });
    const flagged = runDuplicateCheck(draft, record, earlier, verification, ctx.partner.name);
    if (flagged) notifyPartner(draft, ctx.partner.id, "decision", "assistanceFlagged", { ref: record.ref }, "assistance", record.id);
    return { id: record.id, flagged };
  });
}

/** Earlier entries for the same reference and assistance type within 30 days, across all partners (simulated check). */
export function earlierAssistance(state: DemoState, record: AssistanceRecord): AssistanceRecord[] {
  const window = 30 * DAY_MS;
  return state.assistance.filter(
    (a) =>
      a.id !== record.id &&
      a.beneficiaryRef === record.beneficiaryRef &&
      a.assistanceType.toLowerCase() === record.assistanceType.toLowerCase() &&
      Math.abs(new Date(a.deliveredAt).getTime() - new Date(record.deliveredAt).getTime()) <= window,
  );
}

/**
 * SIMULATED history check. A match opens a review task for an authorised OPM
 * reviewer. The assistance entry is always kept: nobody is labelled as
 * fraudulent and nothing is denied. Returns whether a review was opened.
 */
export function runDuplicateCheck(draft: DemoState, record: AssistanceRecord, earlier: AssistanceRecord[], verification: BeneficiaryVerification | undefined, partnerName: string): boolean {
  const i = draft.interventions.find((x) => x.id === record.interventionId)!;
  const ref = record.beneficiaryRef;
  if (earlier.length > 0) {
    const first = [...earlier].sort((a, b) => a.deliveredAt.localeCompare(b.deliveredAt))[0];
    const days = Math.max(0, Math.round(Math.abs(new Date(record.deliveredAt).getTime() - new Date(first.deliveredAt).getTime()) / DAY_MS));
    const review: BeneficiaryReview = {
      id: newId("rv"),
      ref: nextRef(draft.reviews.map((x) => x.ref), "BR-2026-"),
      kind: "possible_duplicate",
      assistanceId: record.id,
      interventionId: i.id,
      householdMasked: maskReference(ref),
      restricted: {
        householdRef: `${ref} (fictional)`,
        householdSize: verification?.householdSize ?? 0,
        association: `${earlier.length} earlier ${record.assistanceType.toLowerCase()} entr${earlier.length === 1 ? "y" : "ies"} for the same reference within 30 days.`,
        progresId: verification?.status === "verified" ? `SIM-PGV4-${ref.slice(3, 6)}-${ref.slice(7, 11)}` : "Not verified",
      },
      detectedAt: now(),
      summary: `${record.assistanceType} recorded by ${partnerName} on ${record.deliveredAt.slice(0, 10)}; the same item was recorded for this reference ${days} day${days === 1 ? "" : "s"} earlier.`,
      history: earlier.map((a) => ({ item: a.assistanceType, partnerName: draft.partners.find((p) => p.id === a.partnerId)?.name ?? "—", date: a.deliveredAt, source: a.ref })),
      progres: {
        outcome: verification?.status === "verified" ? "success" : verification?.status === "inconclusive" ? "inconclusive" : verification?.status === "unavailable" ? "unavailable" : "not_requested",
        at: verification?.resultAt,
        detail: verification?.detail,
        attempts: verification?.attempts ?? 0,
        script: ["success"],
      },
      status: "open",
      notes: [],
      overrides: [],
      updatedAt: now(),
    };
    draft.reviews.push(review);
    record.reviewId = review.id;
    record.status = "flagged";
    addAudit(draft, { actor: null, action: "duplicateCheckRun", category: "record", params: { name: record.ref, count: 1 }, entity: "assistance", entityId: record.id, entityRef: record.ref, simulated: true });
    addAudit(draft, { actor: null, action: "reviewOpened", category: "record", params: { name: review.ref }, entity: "review", entityId: review.id, entityRef: review.ref, simulated: true });
    addNotification(draft, { kind: "assigned_review", message: "reviewOpened", params: { ref: review.ref }, entity: "review", entityId: review.id });
  } else {
    addAudit(draft, { actor: null, action: "duplicateCheckRun", category: "record", params: { name: record.ref, count: 0 }, entity: "assistance", entityId: record.id, entityRef: record.ref, simulated: true });
  }
  return Boolean(record.reviewId);
}
