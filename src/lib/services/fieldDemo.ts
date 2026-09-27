"use client";

import type { FieldForm, FormVersion } from "@/lib/types";
import { FIELD_JOURNEY, FIELD_USERS } from "@/lib/demo/seed";
import { addAudit, getState, mutate } from "@/lib/demo/store";
import { delay, now, ServiceError } from "./core";
import { applyFieldReportAcceptance, applyFieldReportReturn } from "./fieldReports";
import { fieldContext, notifyFieldUser } from "./fieldContext";

/**
 * DEMONSTRATION CONTROLS for the Field Operations Portal walkthrough. They
 * stand in for other people acting in the central system — OPM publishing a
 * new form version, the supervisor changing a task, an OPM reviewer deciding
 * on a report — and every change is recorded as simulated. The same OPM
 * decisions can be made for real in the OPM workspace (coordinator.demo).
 */

const OPM_ME = "OPM M&E officer (simulated)";
const OPM_REVIEWER = "OPM coordinator (demonstration control)";
const SUPERVISOR = "S. Kato (fictional)";

export const DEMO_RETURN_NOTE =
  "The number of women reached is higher than the attendance register in the photo shows. Please check the register and correct the figures.";

/** True once the scripted central changes have been applied. */
export function centralChangesApplied(): boolean {
  const state = getState();
  const form = state.forms.find((f) => f.id === FIELD_JOURNEY.surveyFormId);
  const task = state.fieldTasks.find((t) => t.id === FIELD_JOURNEY.assistanceTaskId);
  return Boolean(form?.versions.some((v) => v.version === 3)) && (task?.version ?? 1) > 1;
}

/**
 * While the officer is offline, two things change centrally (SIMULATED):
 * OPM publishes version 3 of the antenatal survey, which retires version 2;
 * and the supervisor corrects the household allocation on the assistance task.
 * The device cannot know until it reconnects.
 */
export async function applyCentralChangesWhileOffline(): Promise<{ applied: boolean }> {
  await delay(300);
  const ctx = fieldContext();
  return mutate((draft) => {
    let applied = false;
    const form = draft.forms.find((f) => f.id === FIELD_JOURNEY.surveyFormId) as FieldForm | undefined;
    if (form && !form.versions.some((v) => v.version === 3)) {
      const current = form.versions.find((v) => v.status === "published");
      if (current) {
        current.status = "retired";
        current.retiredAt = now();
        const next: FormVersion = {
          version: 3,
          status: "published",
          createdAt: now(),
          publishedAt: now(),
          changeNote: "Adds a required question on whether a follow-up visit was booked.",
          questions: [
            ...current.questions.map((q) => ({ ...q })),
            { id: "q6", label: "Follow-up antenatal visit booked?", type: "choice", required: true },
          ],
        };
        form.versions.push(next);
        form.updatedAt = now();
        addAudit(draft, { actor: OPM_ME, action: "formRetired", category: "status", params: { name: form.ref, version: current.version }, entity: "form", entityId: form.id, entityRef: form.ref, note: "Superseded by version 3.", simulated: true });
        addAudit(draft, { actor: OPM_ME, action: "formPublished", category: "status", params: { name: form.ref, version: 3 }, entity: "form", entityId: form.id, entityRef: form.ref, note: next.changeNote, simulated: true });
        notifyFieldUser(draft, ctx.user.id, "decision", "fieldFormVersion", { ref: form.ref, version: 3 }, "form", form.id);
        applied = true;
      }
    }
    const task = draft.fieldTasks.find((t) => t.id === FIELD_JOURNEY.assistanceTaskId);
    if (task && task.version === 1 && task.status === "assigned" && task.allocation) {
      const from = task.allocation.quantity;
      task.allocation = { ...task.allocation, quantity: 1 };
      task.version = 2;
      task.versions.push({
        version: 2,
        at: now(),
        by: SUPERVISOR,
        note: "Household size corrected at the registration desk; allocation reduced to one kit.",
        changes: [{ field: "quantity", from: String(from), to: "1" }],
      });
      task.updatedAt = now();
      addAudit(draft, { actor: SUPERVISOR, action: "fieldTaskUpdated", category: "record", params: { name: task.ref, version: 2 }, entity: "fieldTask", entityId: task.id, entityRef: task.ref, note: "Household size corrected at the registration desk.", simulated: true });
      notifyFieldUser(draft, FIELD_USERS.officer, "decision", "fieldTaskUpdated", { ref: task.ref, version: 2 }, "fieldTask", task.id);
      applied = true;
    }
    return { applied };
  });
}

function ownReport(id: string) {
  const ctx = fieldContext();
  const r = getState().fieldReports.find((x) => x.id === id);
  if (!r || r.createdByUserId !== ctx.user.id) throw new ServiceError("NOT_PARTNER_RECORD");
  return r;
}

/** OPM returns the officer's report with a comment on the people-reached figures (SIMULATED). */
export async function demoOpmReturn(reportId: string): Promise<void> {
  await delay(500);
  ownReport(reportId);
  mutate((draft) => applyFieldReportReturn(draft, reportId, OPM_REVIEWER, DEMO_RETURN_NOTE, true, "reached"));
}

/** OPM accepts the corrected report; indicators, the map and reports then count it (SIMULATED). */
export async function demoOpmAccept(reportId: string): Promise<void> {
  await delay(500);
  const r = ownReport(reportId);
  const note = r.validationIssues.length ? "Checked against the corrected register; the flagged items are explained." : "Corrected figures match the register.";
  mutate((draft) => void applyFieldReportAcceptance(draft, reportId, OPM_REVIEWER, note, true));
}
