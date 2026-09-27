"use client";

import type { DemoState, Intervention, Partner } from "@/lib/types";
import { DEMO_ENABLED } from "@/lib/demo/config";
import { PARTNER_JOURNEY } from "@/lib/demo/seed";
import { getState, mutate } from "@/lib/demo/store";
import { delay, ServiceError } from "./core";
import { applyPartnerApproval, applyPartnerChangesRequest, OPEN_APPLICATION, partnerDocuments } from "./partners";
import { applyInterventionApproval, applyInterventionDecision, applyOverlapResolution, APPROVED_WORK, evidenceDocuments, findOverlaps } from "./interventions";
import { applyFieldReportAcceptance, applyFieldReportReturn, REVIEWABLE } from "./fieldReports";
import { applySignatureRequest, applyStepDecision, currentStep, prepareMou } from "./documents";
import { applyFinancialDecision } from "./partnerReview";
import { simulateRegistryCheck } from "./external";
import { partnerContext } from "./partnerContext";

/**
 * The Partner Portal demonstration walkthrough. Each step links to the exact
 * record where the partner acts. Where the next move belongs to OPM, the step
 * offers a DEMONSTRATION CONTROL that applies the same OPM decision logic the
 * OPM workspace uses, recorded as simulated and attributed to a fictional
 * partnerships officer. The same decision can instead be made for real in the
 * OPM workspace by signing in as coordinator.demo.
 */

const OPM_OFFICER = "R. Nansubuga, partnerships officer (fictional)";

export type WalkthroughKey = "profile" | "documentRequest" | "approval" | "proposal" | "overlap" | "fieldReport" | "assistance" | "closing";

export type OpmStep =
  | "requestDocument"
  | "approvePartner"
  | "requestOverlapChanges"
  | "approveProposal"
  | "returnFieldReport"
  | "acceptFieldReport"
  | "sendMou"
  | "acceptFinance";

export interface WalkthroughStep {
  key: WalkthroughKey;
  done: boolean;
  href: string;
  /** The next move is OPM's: offer the demonstration control. */
  opm?: OpmStep;
}

function journeyIntervention(state: DemoState, p: Partner): Intervention | undefined {
  const own = state.interventions.filter((i) => i.partnerId === p.id && i.status !== "draft");
  return own.find((i) => APPROVED_WORK.includes(i.status)) ?? own.find((i) => ["submitted", "coordination_review", "changes_requested"].includes(i.status)) ?? own[0];
}

function has(state: DemoState, partnerId: string, action: string, entityId?: string): boolean {
  return state.audit.some((a) => a.action === action && (entityId ? a.entityId === entityId : a.entityId === partnerId));
}

export function buildWalkthrough(state: DemoState, p: Partner): WalkthroughStep[] {
  const intervention = journeyIntervention(state, p);
  const draftProposal = state.interventions.find((i) => i.partnerId === p.id && i.status === "draft");
  const reports = state.fieldReports.filter((r) => r.interventionId === intervention?.id && r.kind !== "survey" && r.status !== "draft");
  const correctedAccepted = reports.some((r) => r.status === "accepted" && (r.history ?? []).length >= 2);
  const reviewable = reports.find((r) => REVIEWABLE.includes(r.status));
  const mou = state.documents.find((d) => d.category === "mou" && d.related?.entity === "partner" && d.related.id === p.id);
  const finance = (intervention?.financialUpdates ?? []).find((f) => f.status === "submitted" || f.status === "accepted");
  const docRequested = has(state, p.id, "partnerDocumentRequested");
  const resubmitted = has(state, p.id, "partnerResubmittedByPartner");

  const steps: WalkthroughStep[] = [];
  steps.push({
    key: "profile",
    done: p.status !== "draft",
    href: p.status === "draft" ? "/partner/profile" : "/partner/accreditation",
    opm: OPEN_APPLICATION.includes(p.status) && !docRequested ? "requestDocument" : undefined,
  });
  steps.push({
    key: "documentRequest",
    done: resubmitted,
    href: "/partner/accreditation",
    opm: OPEN_APPLICATION.includes(p.status) && docRequested && resubmitted ? "approvePartner" : undefined,
  });
  steps.push({ key: "approval", done: p.status === "approved" || p.status === "suspended", href: "/partner" });
  steps.push({
    key: "proposal",
    done: Boolean(intervention),
    href: intervention ? `/partner/proposals/${intervention.id}` : draftProposal ? `/partner/proposals/${draftProposal.id}` : "/partner/proposals/new",
    opm: intervention && ["submitted", "coordination_review"].includes(intervention.status) && (intervention.revisions ?? []).length <= 1 && !has(state, p.id, "interventionChangesRequested", intervention.id) ? "requestOverlapChanges" : undefined,
  });
  steps.push({
    key: "overlap",
    done: Boolean(intervention && APPROVED_WORK.includes(intervention.status)),
    href: intervention ? `/partner/proposals/${intervention.id}` : "/partner/proposals",
    opm: intervention && ["submitted", "coordination_review"].includes(intervention.status) && (intervention.revisions ?? []).length >= 2 ? "approveProposal" : undefined,
  });
  steps.push({
    key: "fieldReport",
    done: correctedAccepted,
    href: reviewable ? `/partner/field-reports/${reviewable.id}` : reports[0] ? `/partner/field-reports/${reports[0].id}` : intervention ? `/partner/field-reports/new?intervention=${intervention.id}` : "/partner/field-reports",
    opm: reviewable ? ((reviewable.history ?? []).length >= 2 ? "acceptFieldReport" : "returnFieldReport") : undefined,
  });
  steps.push({
    key: "assistance",
    done: state.verifications.some((v) => v.partnerId === p.id && v.status === "verified") && state.assistance.some((a) => a.partnerId === p.id && a.reviewId),
    href: "/partner/beneficiaries",
  });
  steps.push({
    key: "closing",
    done: Boolean(finance) && (mou?.signature.status === "signed" || mou?.signature.status === "declined") && state.partnerReports.some((r) => r.partnerId === p.id),
    href: !finance && intervention ? `/partner/finance?intervention=${intervention.id}` : mou && mou.signature.status === "requested" ? `/partner/agreements/${mou.id}` : "/partner/reports",
    opm:
      p.status === "approved" && (!mou || mou.signature.status === "not_requested")
        ? "sendMou"
        : (intervention?.financialUpdates ?? []).some((f) => f.status === "submitted")
          ? "acceptFinance"
          : undefined,
  });
  return steps;
}

export async function getWalkthrough(): Promise<{ steps: WalkthroughStep[]; isJourneyPartner: boolean; enabled: boolean }> {
  const state = getState();
  const ctx = partnerContext(state);
  return { steps: buildWalkthrough(state, ctx.partner), isJourneyPartner: ctx.partner.id === PARTNER_JOURNEY.partnerId, enabled: DEMO_ENABLED && ctx.isAdmin };
}

/** Runs the OPM decision the walkthrough is waiting for. SIMULATED and labelled as such in the audit trail. */
export async function simulateOpmStep(step: OpmStep): Promise<void> {
  if (!DEMO_ENABLED) throw new ServiceError("FORBIDDEN");
  await delay(700);
  const ctx = partnerContext();
  if (!ctx.isAdmin) throw new ServiceError("FORBIDDEN");
  mutate((draft) => {
    const p = draft.partners.find((x) => x.id === ctx.partner.id)!;
    const intervention = journeyIntervention(draft, p);
    const actor = OPM_OFFICER;
    switch (step) {
      case "requestDocument": {
        if (!OPEN_APPLICATION.includes(p.status)) throw new ServiceError("INVALID_STATE");
        p.assignedReviewer ??= actor;
        applyPartnerChangesRequest(
          draft,
          p,
          actor,
          `Completeness review: the application is complete except for a current ${PARTNER_JOURNEY.requestedDocument.toLowerCase()}. Please upload it and resubmit.`,
          PARTNER_JOURNEY.requestedDocument,
          true,
        );
        return;
      }
      case "approvePartner": {
        if (!OPEN_APPLICATION.includes(p.status)) throw new ServiceError("INVALID_STATE");
        for (const d of partnerDocuments(draft, p.id).filter((x) => x.status === "in_review")) {
          if (!currentStep(d)) d.route = [{ id: `s-${d.id}`, role: "Partnerships officer" }];
          applyStepDecision(draft, d, actor, "approved", "Checked against the uploaded copy. Content verified by OPM; the file itself is not authenticated in this prototype.", true);
        }
        p.status = "verification";
        simulateRegistryCheck(draft, p, "ursb", "workflow", "match");
        simulateRegistryCheck(draft, p, "ngoBureau", "workflow", "match");
        applyPartnerApproval(draft, p, actor, "Documents verified and registry checks matched (simulated). Accredited for 12 months.", true);
        return;
      }
      case "requestOverlapChanges": {
        if (!intervention || !["submitted", "coordination_review"].includes(intervention.status)) throw new ServiceError("INVALID_STATE");
        intervention.status = "coordination_review";
        intervention.assignedTo ??= actor;
        const others = findOverlaps(draft, intervention).filter((o) => !o.resolved).map((o) => o.intervention.ref);
        applyInterventionDecision(
          draft,
          intervention.id,
          actor,
          others.length
            ? `This proposal overlaps with ${others.join(", ")} in the same settlement and sector. Explain how you will divide service points or coordinate referrals with the other partner, then resubmit.`
            : "Please confirm how this work is coordinated with other health partners in the settlement, then resubmit.",
          "changes_requested",
          true,
        );
        return;
      }
      case "approveProposal": {
        if (!intervention || !["submitted", "coordination_review"].includes(intervention.status)) throw new ServiceError("INVALID_STATE");
        intervention.status = "coordination_review";
        intervention.assignedTo ??= actor;
        for (const o of findOverlaps(draft, intervention).filter((x) => !x.resolved)) {
          applyOverlapResolution(draft, intervention.id, o.intervention.id, actor, intervention.overlapResponse || "Work divided between partners by service point; referrals agreed.", true);
        }
        for (const d of evidenceDocuments(draft, intervention.id).filter((x) => x.status === "in_review")) {
          if (!currentStep(d)) d.route = [{ id: `s-${d.id}`, role: "Coordination review" }];
          applyStepDecision(draft, d, actor, "approved", "Reviewed with the proposal.", true);
        }
        applyInterventionApproval(draft, intervention.id, actor, "Overlap addressed; plan, budget and indicators meet coordination requirements.", true);
        return;
      }
      case "returnFieldReport": {
        const r = draft.fieldReports.find((x) => x.interventionId === intervention?.id && x.kind !== "survey" && REVIEWABLE.includes(x.status));
        if (!r) throw new ServiceError("INVALID_STATE");
        applyFieldReportReturn(draft, r.id, actor, "Please check the number of children reached against the attendance sheet and attach the signed attendance sheet.", true);
        return;
      }
      case "acceptFieldReport": {
        const r = draft.fieldReports.find((x) => x.interventionId === intervention?.id && x.kind !== "survey" && REVIEWABLE.includes(x.status));
        if (!r) throw new ServiceError("INVALID_STATE");
        applyFieldReportAcceptance(draft, r.id, actor, "Correction received; figures match the attendance sheet.", true);
        return;
      }
      case "sendMou": {
        if (p.status !== "approved") throw new ServiceError("INVALID_STATE");
        const mou = prepareMou(draft, p, actor);
        while (mou.status === "in_review" && currentStep(mou)) {
          const step = currentStep(mou)!;
          applyStepDecision(draft, mou, actor, "approved", step.role === "Legal review" ? "Standard clauses; operating areas match the accreditation." : "Approved for signature.", true);
        }
        const signatory = draft.users.find((u) => u.partnerId === p.id && u.status === "active" && (u.partnerPermissions ?? []).includes("agreements.sign"));
        applySignatureRequest(draft, mou, actor, `${signatory?.name ?? "Authorised signatory"}, ${p.name}`);
        return;
      }
      case "acceptFinance": {
        const f = (intervention?.financialUpdates ?? []).find((x) => x.status === "submitted");
        if (!intervention || !f) throw new ServiceError("INVALID_STATE");
        applyFinancialDecision(draft, intervention.id, f.id, true, actor, "Expenditure matches the budget lines and supporting documents.", true);
        return;
      }
    }
  });
}
