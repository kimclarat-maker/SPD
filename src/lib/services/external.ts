"use client";

import type {
  BeneficiaryReview,
  DataExchange,
  DemoState,
  EntityType,
  IntegrationHealth,
  IntegrationId,
  IntegrationRun,
  Partner,
  RunOutcome,
  VerificationOutcome,
} from "@/lib/types";
import { addAudit, newId } from "@/lib/demo/store";

/**
 * SIMULATED external integrations. Nothing here contacts a real system. Each
 * function records what a live integration *would* have done as an
 * integration run, marks the audit entry as simulated, and returns a
 * scripted, fictional outcome. None of these results is a real government or
 * UNHCR verification. Replace each function with a real client once the
 * integration is approved and built.
 */

const DURATION: Record<RunOutcome, number> = {
  success: 1200,
  partial: 2400,
  mismatch: 1100,
  inconclusive: 1500,
  unavailable: 400,
  timeout: 30000,
};

export function recordRun(
  draft: DemoState,
  input: Omit<IntegrationRun, "id" | "at" | "durationMs">,
): IntegrationRun {
  const run: IntegrationRun = { id: newId("run"), at: new Date().toISOString(), durationMs: DURATION[input.outcome], ...input };
  draft.runs.unshift(run);
  const integration = draft.integrations.find((i) => i.id === input.integrationId);
  if (integration && integration.health !== "paused") integration.health = computeHealth(draft, input.integrationId);
  return run;
}

export function computeHealth(state: DemoState, id: IntegrationId): IntegrationHealth {
  const integration = state.integrations.find((i) => i.id === id);
  if (integration?.health === "paused") return "paused";
  const recent = state.runs.filter((r) => r.integrationId === id).slice(0, 3);
  if (recent.length === 0 || recent[0].outcome === "success") return "healthy";
  if (recent.length > 1 && recent[1].outcome !== "success") return "failing";
  return "degraded";
}

function takeScript<T>(script: T[] | undefined, fallback: T): T {
  if (script && script.length > 0) return script.shift() as T;
  return fallback;
}

/** Simulated URSB or NGO Bureau check of a partner's registration or operating permit. */
export function simulateRegistryCheck(
  draft: DemoState,
  partner: Partner,
  service: "ursb" | "ngoBureau",
  trigger: IntegrationRun["trigger"] = "workflow",
  forced?: VerificationOutcome,
): IntegrationRun {
  const current = partner.verification[service];
  const outcome = forced ?? takeScript(current.script, "match" as VerificationOutcome);
  const runOutcome: RunOutcome = outcome === "match" ? "success" : outcome === "mismatch" ? "mismatch" : outcome === "timeout" ? "timeout" : "unavailable";
  const integrationId: IntegrationId = service === "ursb" ? "ursb" : "ngo_bureau";
  const reference = outcome === "match" ? `SIM-${service === "ursb" ? "URSB" : "NGOB"}-${Math.floor(10000 + Math.random() * 89999)}` : undefined;
  const detail =
    outcome === "match"
      ? service === "ursb"
        ? "Registered name and number match the application (simulated)."
        : "Operating permit is valid for the stated areas (simulated)."
      : outcome === "mismatch"
        ? "Registry details differ from the application (simulated)."
        : outcome === "timeout"
          ? "The registry did not respond within 30 seconds (simulated)."
          : "The registry service is unavailable (simulated).";
  const run = recordRun(draft, {
    integrationId,
    operation: `${service === "ursb" ? "Verify registration" : "Verify operating permit"} ${partner.registrationNo}`,
    trigger,
    outcome: runOutcome,
    records: outcome === "match" || outcome === "mismatch" ? 1 : 0,
    errors: outcome === "match" ? 0 : 1,
    message: detail,
    related: { entity: "partner", id: partner.id },
  });
  partner.verification[service] = { ...current, outcome, at: run.at, reference, detail, simulated: true };
  addAudit(draft, {
    actor: null,
    action: "verificationRun",
    category: "integration",
    params: { name: partner.name, service: service === "ursb" ? "URSB" : "NGO Bureau", outcome },
    entity: "partner",
    entityId: partner.id,
    entityRef: partner.ref,
    simulated: true,
  });
  return run;
}

/** Simulated UNHCR ProGres v4 household verification request. */
export function simulateProgres(draft: DemoState, review: BeneficiaryReview, trigger: IntegrationRun["trigger"] = "workflow"): IntegrationRun {
  const outcome = takeScript(review.progres.script, "success" as const) as Exclude<BeneficiaryReview["progres"]["outcome"], "not_requested">;
  const detail =
    outcome === "success"
      ? "Household found and active; composition consistent with the distribution record (simulated)."
      : outcome === "inconclusive"
        ? "Record found, but household composition was last updated more than 12 months ago (simulated)."
        : "ProGres v4 did not accept the request: service unavailable (simulated).";
  const run = recordRun(draft, {
    integrationId: "progres",
    operation: `Verify household ${review.householdMasked}`,
    trigger,
    outcome,
    records: outcome === "unavailable" ? 0 : 1,
    errors: outcome === "unavailable" ? 1 : 0,
    message: detail,
    related: { entity: "review", id: review.id },
  });
  review.progres = { ...review.progres, outcome, at: run.at, detail, attempts: review.progres.attempts + 1 };
  addAudit(draft, {
    actor: null,
    action: "progresResult",
    category: "integration",
    params: { name: review.ref, outcome },
    entity: "review",
    entityId: review.id,
    entityRef: review.ref,
    simulated: true,
  });
  return run;
}

/** Simulated AMP or NIMES submission. NIMES returns a partial result the first time a report is sent. */
export function simulateExchangeSubmit(draft: DemoState, exchange: DataExchange, trigger: IntegrationRun["trigger"] = "workflow"): IntegrationRun {
  const previous = draft.runs.filter((r) => r.integrationId === exchange.target && r.related?.id === exchange.reportId);
  const outcome: RunOutcome = exchange.target === "nimes" && previous.length === 0 ? "partial" : "success";
  const rejected = outcome === "partial" ? 2 : 0;
  const run = recordRun(draft, {
    integrationId: exchange.target,
    operation: `${previous.length ? "Resubmit" : "Submit"} ${exchange.period} ${exchange.target === "amp" ? "funding and implementation data" : "indicator results"}`,
    trigger,
    outcome,
    records: exchange.records,
    errors: rejected,
    message:
      outcome === "partial"
        ? `${exchange.records - rejected} of ${exchange.records} records accepted; ${rejected} indicator units did not match the NIMES codebook (simulated).`
        : `${exchange.records} records accepted (simulated).`,
    related: { entity: "report", id: exchange.reportId },
  });
  exchange.status = outcome === "partial" ? "partial" : "accepted";
  exchange.submittedAt = run.at;
  exchange.runId = run.id;
  exchange.errors =
    outcome === "partial"
      ? [
          { field: "HLT-03 unit", message: "Expected \"visits\"; received \"consultations\"." },
          { field: "WSH-01 unit", message: "Expected \"sites\"; received \"water points\"." },
        ]
      : [];
  return run;
}

/** Simulated signature request; the signing service is not contacted. */
export function simulateSignatureRequest(draft: DemoState, input: { signer: string; document: string; entity: EntityType; entityId: string; entityRef: string }): void {
  addAudit(draft, {
    actor: null,
    action: "signatureRequestSent",
    category: "record",
    params: { name: input.document, signer: input.signer },
    entity: input.entity,
    entityId: input.entityId,
    entityRef: input.entityRef,
    simulated: true,
  });
}

/** Simulated SMS / email. Recorded in the audit trail as simulated; never delivered. */
export function simulateMessage(
  draft: DemoState,
  input: { channel: "sms" | "email"; recipient: string; entity: EntityType; entityId: string; entityRef: string },
): void {
  addAudit(draft, {
    actor: null,
    action: input.channel === "sms" ? "smsQueued" : "emailQueued",
    category: "record",
    params: { recipient: input.recipient },
    entity: input.entity,
    entityId: input.entityId,
    entityRef: input.entityRef,
    simulated: true,
  });
}
