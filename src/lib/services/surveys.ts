"use client";

import type { DemoState, FieldForm, FieldReport, FormQuestion, IndicatorDef, Intervention } from "@/lib/types";
import { addAudit, getState, mutate, newId } from "@/lib/demo/store";
import { DAY_MS, delay, now, requireNote, requirePermission, ServiceError } from "./core";
import { match, type RecordFilters } from "./filters";

/* ------------------------------------------------------------------ Forms */

export interface FormRow extends FieldForm {
  status: "published" | "draft" | "retired";
  currentVersion?: number;
  draftVersion?: number;
  responses: number;
  responsesByVersion: Record<number, number>;
}

function responses(state: DemoState, formId: string): FieldReport[] {
  return state.fieldReports.filter((r) => r.formId === formId && r.status !== "saved_offline");
}

function toRow(state: DemoState, f: FieldForm): FormRow {
  const published = f.versions.find((v) => v.status === "published");
  const draft = f.versions.find((v) => v.status === "draft");
  const list = responses(state, f.id);
  const responsesByVersion: Record<number, number> = {};
  for (const v of f.versions) responsesByVersion[v.version] = list.filter((r) => r.formVersion === v.version).length;
  return {
    ...f,
    status: published ? "published" : draft ? "draft" : "retired",
    currentVersion: published?.version,
    draftVersion: draft?.version,
    responses: list.length,
    responsesByVersion,
  };
}

export async function listForms(): Promise<FormRow[]> {
  const state = getState();
  return state.forms.map((f) => toRow(state, f)).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getForm(id: string): Promise<{ form: FormRow; responses: FieldReport[]; interventions: Intervention[] }> {
  const state = getState();
  const form = state.forms.find((f) => f.id === id);
  if (!form) throw new ServiceError("NOT_FOUND");
  return {
    form: toRow(state, form),
    responses: responses(state, id).sort((a, b) => b.collectedAt.localeCompare(a.collectedAt)),
    interventions: state.interventions.filter((i) => form.interventionIds.includes(i.id)),
  };
}

function load(draft: DemoState, id: string): FieldForm {
  const form = draft.forms.find((f) => f.id === id);
  if (!form) throw new ServiceError("NOT_FOUND");
  return form;
}

function log(draft: DemoState, f: FieldForm, actor: string, action: string, version: number, note?: string) {
  addAudit(draft, { actor, action, category: "status", params: { name: f.title, version }, entity: "form", entityId: f.id, entityRef: f.ref, note });
}

/** Starts a new draft from the latest version. Only one draft may exist at a time. */
export async function createDraftVersion(id: string, changeNote: string): Promise<number> {
  const note = requireNote(changeNote);
  await delay();
  const actor = requirePermission("forms.manage");
  return mutate((draft) => {
    const f = load(draft, id);
    if (f.versions.some((v) => v.status === "draft")) throw new ServiceError("INVALID_STATE");
    const latest = f.versions[f.versions.length - 1];
    const version = latest.version + 1;
    f.versions.push({ version, status: "draft", createdAt: now(), changeNote: note, questions: latest.questions.map((q) => ({ ...q })) });
    f.updatedAt = now();
    log(draft, f, actor, "formDrafted", version, note);
    return version;
  });
}

export async function addQuestion(id: string, question: Omit<FormQuestion, "id">): Promise<void> {
  if (!question.label.trim()) throw new ServiceError("FIELD_REQUIRED");
  await delay(150);
  const actor = requirePermission("forms.manage");
  mutate((draft) => {
    const f = load(draft, id);
    const d = f.versions.find((v) => v.status === "draft");
    if (!d) throw new ServiceError("INVALID_STATE");
    d.questions.push({ ...question, label: question.label.trim(), id: newId("q") });
    f.updatedAt = now();
    log(draft, f, actor, "formQuestionAdded", d.version, question.label.trim());
  });
}

export async function removeQuestion(id: string, questionId: string): Promise<void> {
  await delay(150);
  const actor = requirePermission("forms.manage");
  mutate((draft) => {
    const f = load(draft, id);
    const d = f.versions.find((v) => v.status === "draft");
    if (!d) throw new ServiceError("INVALID_STATE");
    const q = d.questions.find((x) => x.id === questionId);
    d.questions = d.questions.filter((x) => x.id !== questionId);
    f.updatedAt = now();
    log(draft, f, actor, "formQuestionRemoved", d.version, q?.label);
  });
}

/**
 * Publishing a draft retires the previously published version. Responses
 * already collected stay linked to the version they were collected with.
 */
export async function publishVersion(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("forms.manage");
  mutate((draft) => {
    const f = load(draft, id);
    const d = f.versions.find((v) => v.status === "draft");
    if (!d) throw new ServiceError("INVALID_STATE");
    if (d.questions.length === 0) throw new ServiceError("FIELD_REQUIRED");
    for (const v of f.versions.filter((x) => x.status === "published")) {
      v.status = "retired";
      v.retiredAt = now();
      log(draft, f, actor, "formRetired", v.version, `Superseded by version ${d.version}.`);
    }
    d.status = "published";
    d.publishedAt = now();
    f.updatedAt = now();
    log(draft, f, actor, "formPublished", d.version, reason);
  });
}

export async function retireForm(id: string, note: string): Promise<void> {
  const reason = requireNote(note);
  await delay();
  const actor = requirePermission("forms.manage");
  mutate((draft) => {
    const f = load(draft, id);
    const published = f.versions.find((v) => v.status === "published");
    if (!published) throw new ServiceError("INVALID_STATE");
    published.status = "retired";
    published.retiredAt = now();
    f.deploymentEnd = now();
    f.updatedAt = now();
    log(draft, f, actor, "formRetired", published.version, reason);
  });
}

export async function discardDraft(id: string): Promise<void> {
  await delay(150);
  const actor = requirePermission("forms.manage");
  mutate((draft) => {
    const f = load(draft, id);
    const d = f.versions.find((v) => v.status === "draft");
    if (!d) throw new ServiceError("INVALID_STATE");
    f.versions = f.versions.filter((v) => v !== d);
    f.updatedAt = now();
    log(draft, f, actor, "formDraftDiscarded", d.version);
  });
}

/* ------------------------------------------------------------- Indicators */

export interface Contribution {
  report: FieldReport;
  intervention: Intervention;
  value: number;
}

export interface IndicatorRow extends IndicatorDef {
  status: "active" | "inactive";
  actual: number;
  percent: number;
  contributions: number;
  /** Active interventions with a target for this indicator but no accepted report in the last 30 days. */
  missing: Intervention[];
  lastAcceptedAt?: string;
  freshness: "fresh" | "ageing" | "stale" | "none";
}

export function indicatorContributions(state: DemoState, indicatorId: string, filters: RecordFilters = {}): Contribution[] {
  return state.fieldReports
    .filter((r) => r.status === "accepted" && match.fieldReport(state, r, filters))
    .flatMap((r) => {
      const v = r.indicatorValues.find((x) => x.indicatorId === indicatorId);
      const intervention = state.interventions.find((i) => i.id === r.interventionId);
      return v && intervention ? [{ report: r, intervention, value: v.value }] : [];
    })
    .sort((a, b) => b.report.collectedAt.localeCompare(a.report.collectedAt));
}

export function indicatorRow(state: DemoState, ind: IndicatorDef, filters: RecordFilters = {}): IndicatorRow {
  const contributions = indicatorContributions(state, ind.id, filters);
  const actual = contributions.reduce((sum, c) => sum + c.value, 0);
  const cutoff = Date.now() - 30 * DAY_MS;
  const missing = state.interventions.filter(
    (i) =>
      i.status === "active" &&
      match.intervention(state, i, filters) &&
      i.indicatorTargets.some((t) => t.indicatorId === ind.id) &&
      !contributions.some((c) => c.intervention.id === i.id && new Date(c.report.collectedAt).getTime() >= cutoff),
  );
  const lastAcceptedAt = contributions.map((c) => c.report.updatedAt).sort().pop();
  const age = lastAcceptedAt ? (Date.now() - new Date(lastAcceptedAt).getTime()) / DAY_MS : Infinity;
  return {
    ...ind,
    status: ind.active ? "active" : "inactive",
    actual,
    percent: ind.target ? Math.round((actual / ind.target) * 100) : 0,
    contributions: contributions.length,
    missing,
    lastAcceptedAt,
    freshness: !lastAcceptedAt ? "none" : age <= 14 ? "fresh" : age <= 45 ? "ageing" : "stale",
  };
}

export async function listIndicators(filters: RecordFilters = {}): Promise<IndicatorRow[]> {
  const state = getState();
  return state.indicators.filter((i) => !filters.sector || i.sector === filters.sector).map((i) => indicatorRow(state, i, filters));
}

export async function getIndicator(id: string): Promise<{
  indicator: IndicatorRow;
  contributions: Contribution[];
  byIntervention: { intervention: Intervention; target: number; actual: number }[];
  forms: FieldForm[];
}> {
  const state = getState();
  const ind = state.indicators.find((i) => i.id === id);
  if (!ind) throw new ServiceError("NOT_FOUND");
  const contributions = indicatorContributions(state, id);
  const byIntervention = state.interventions
    .filter((i) => i.indicatorTargets.some((t) => t.indicatorId === id))
    .map((i) => ({
      intervention: i,
      target: i.indicatorTargets.find((t) => t.indicatorId === id)!.target,
      actual: contributions.filter((c) => c.intervention.id === i.id).reduce((sum, c) => sum + c.value, 0),
    }));
  const forms = state.forms.filter((f) => f.versions.some((v) => v.questions.some((q) => q.indicatorId === id)));
  return { indicator: indicatorRow(state, ind), contributions, byIntervention, forms };
}
