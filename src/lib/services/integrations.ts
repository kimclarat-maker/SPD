"use client";

import type { DataExchange, DemoState, Integration, IntegrationHealth, IntegrationId, IntegrationRun, RunOutcome } from "@/lib/types";
import { addAudit, getState, mutate } from "@/lib/demo/store";
import { DAY_MS, delay, requirePermission, ServiceError } from "./core";
import { computeHealth, recordRun, simulateExchangeSubmit, simulateProgres, simulateRegistryCheck } from "./external";

/** Every integration in this phase is simulated; outcomes are fictional. */
export interface IntegrationRow extends Integration {
  status: IntegrationHealth;
  lastAttempt?: IntegrationRun;
  lastSuccess?: IntegrationRun;
  recordsProcessed: number;
  errors30d: number;
  failedRuns: number;
}

function toRow(state: DemoState, i: Integration): IntegrationRow {
  const runs = state.runs.filter((r) => r.integrationId === i.id);
  const since = Date.now() - 30 * DAY_MS;
  const recent = runs.filter((r) => new Date(r.at).getTime() >= since);
  const health = computeHealth(state, i.id);
  return {
    ...i,
    health,
    status: health,
    lastAttempt: runs[0],
    lastSuccess: runs.find((r) => r.outcome === "success"),
    recordsProcessed: recent.reduce((s, r) => s + r.records, 0),
    errors30d: recent.reduce((s, r) => s + r.errors, 0),
    failedRuns: recent.filter((r) => r.outcome !== "success").length,
  };
}

export async function listIntegrations(): Promise<IntegrationRow[]> {
  requirePermission("integration.view");
  const state = getState();
  return state.integrations.map((i) => toRow(state, i));
}

export async function getIntegration(id: string): Promise<{ integration: IntegrationRow; runs: IntegrationRun[]; exchanges: DataExchange[] }> {
  requirePermission("integration.view");
  const state = getState();
  const integration = state.integrations.find((i) => i.id === id);
  if (!integration) throw new ServiceError("NOT_FOUND");
  return {
    integration: toRow(state, integration),
    runs: state.runs.filter((r) => r.integrationId === id),
    exchanges: state.exchanges.filter((e) => e.target === id),
  };
}

/** Runs that failed and have not been followed by a successful retry. */
export function isRetryable(state: DemoState, run: IntegrationRun): boolean {
  return run.outcome !== "success" && !state.runs.some((r) => r.retryOf === run.id);
}

/**
 * Retries a failed run. When the run belongs to a workflow record (a partner
 * check, a ProGres request, an AMP/NIMES submission), the record is updated
 * with the new simulated result too.
 */
export async function retryRun(runId: string): Promise<RunOutcome> {
  await delay(1000);
  const actor = requirePermission("integration.retry");
  return mutate((draft) => {
    const run = draft.runs.find((r) => r.id === runId);
    if (!run) throw new ServiceError("NOT_FOUND");
    if (!isRetryable(draft, run)) throw new ServiceError("INVALID_STATE");
    const integration = draft.integrations.find((i) => i.id === run.integrationId)!;
    addAudit(draft, {
      actor,
      action: "integrationRetried",
      category: "integration",
      params: { name: integration.name, operation: run.operation },
      entity: "integration",
      entityId: integration.id,
      entityRef: integration.id.toUpperCase(),
      simulated: true,
    });

    let next: IntegrationRun;
    const related = run.related;
    const partner = related?.entity === "partner" ? draft.partners.find((p) => p.id === related.id) : undefined;
    const review = related?.entity === "review" ? draft.reviews.find((r) => r.id === related.id) : undefined;
    const exchange = related?.entity === "report" ? draft.exchanges.find((e) => e.reportId === related.id && e.target === run.integrationId) : undefined;
    if (partner && (run.integrationId === "ursb" || run.integrationId === "ngo_bureau")) {
      next = simulateRegistryCheck(draft, partner, run.integrationId === "ursb" ? "ursb" : "ngoBureau", "retry");
    } else if (review && run.integrationId === "progres") {
      next = simulateProgres(draft, review, "retry");
    } else if (exchange && (exchange.status === "partial" || exchange.status === "failed")) {
      next = simulateExchangeSubmit(draft, exchange, "retry");
    } else {
      const outcome = integration.retryScript.length ? integration.retryScript.shift()! : "success";
      next = recordRun(draft, {
        integrationId: integration.id,
        operation: run.operation,
        trigger: "retry",
        outcome,
        records: outcome === "success" ? Math.max(run.records, 1) : 0,
        errors: outcome === "success" ? 0 : 1,
        message: outcome === "success" ? "Retry completed (simulated)." : "Retry failed (simulated).",
      });
    }
    next.retryOf = run.id;
    return next.outcome;
  });
}

/** Simulated connectivity check; records a run so the history shows it. */
export async function testConnection(id: IntegrationId): Promise<RunOutcome> {
  await delay(700);
  const actor = requirePermission("integration.retry");
  return mutate((draft) => {
    const integration = draft.integrations.find((i) => i.id === id);
    if (!integration) throw new ServiceError("NOT_FOUND");
    const run = recordRun(draft, {
      integrationId: id,
      operation: "Connection test",
      trigger: "manual",
      outcome: "success",
      records: 0,
      errors: 0,
      message: "Endpoint reachable (simulated).",
    });
    addAudit(draft, {
      actor,
      action: "integrationTested",
      category: "integration",
      params: { name: integration.name },
      entity: "integration",
      entityId: id,
      entityRef: id.toUpperCase(),
      simulated: true,
    });
    return run.outcome;
  });
}
