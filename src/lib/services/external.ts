"use client";

import type { DemoState, EntityType, FieldReport, OutboxKind } from "@/lib/types";
import { addAudit, addOutbox } from "@/lib/demo/store";

/**
 * SIMULATED external integrations. Nothing here contacts a real system:
 * each function records what a live integration *would* have done in the
 * simulated outbox and marks the audit entry as simulated. Replace each
 * function with a real client when the integration is approved and built.
 */

/** Simulated registration/assistance-history check on a reported distribution. */
export function simulateVerification(draft: DemoState, report: FieldReport): number {
  addOutbox(draft, {
    kind: "verification",
    recipient: "Registration reference check (simulated)",
    message: `Check assistance history for distribution in ${report.ref}`,
    entity: "fieldReport",
    entityId: report.id,
  });
  let flagged = 0;
  for (const id of report.pendingExceptionIds) {
    const ex = draft.exceptions.find((e) => e.id === id);
    if (ex && ex.status === "waiting") {
      ex.status = "open";
      ex.detectedAt = new Date().toISOString();
      ex.updatedAt = ex.detectedAt;
      flagged += 1;
      addAudit(draft, {
        actor: null,
        action: "exceptionOpened",
        params: { name: ex.ref },
        entity: "exception",
        entityId: ex.id,
        simulated: true,
      });
    }
  }
  addAudit(draft, {
    actor: null,
    action: "verificationRun",
    params: { name: report.ref, count: flagged },
    entity: "fieldReport",
    entityId: report.id,
    simulated: true,
  });
  return flagged;
}

/** Simulated SMS / email notification. Queued in the outbox; never delivered. */
export function simulateNotification(
  draft: DemoState,
  input: { kind: Extract<OutboxKind, "sms" | "email">; recipient: string; message: string; entity: EntityType; entityId: string },
): void {
  addOutbox(draft, input);
}

/** Simulated electronic signature. Returns a fictional signature record immediately. */
export function simulateSignature(
  draft: DemoState,
  input: { signer: string; document: string; entity: EntityType; entityId: string },
): { signedBy: string; signedAt: string } {
  addOutbox(draft, {
    kind: "signature",
    recipient: input.signer,
    message: `Signature request: ${input.document}`,
    entity: input.entity,
    entityId: input.entityId,
  });
  return { signedBy: input.signer, signedAt: new Date().toISOString() };
}

/** Simulated data exchange with partner systems. */
export function simulateExchange(
  draft: DemoState,
  input: { recipients: string[]; payload: string; entity: EntityType; entityId: string },
): void {
  for (const recipient of input.recipients) {
    addOutbox(draft, {
      kind: "exchange",
      recipient: `${recipient} (simulated)`,
      message: input.payload,
      entity: input.entity,
      entityId: input.entityId,
    });
  }
}
