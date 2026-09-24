"use client";

import type { Integration, OutboxMessage } from "@/lib/types";
import { addAudit, getState, mutate } from "@/lib/demo/store";
import { currentActor, delay, now, ServiceError } from "./core";

/** Every integration in this phase is simulated; statuses are fictional. */
export async function listIntegrations(): Promise<Integration[]> {
  return [...getState().integrations];
}

export async function getIntegration(id: string): Promise<{ integration: Integration }> {
  const integration = getState().integrations.find((i) => i.id === id);
  if (!integration) throw new ServiceError("NOT_FOUND");
  return { integration };
}

export async function listOutbox(): Promise<OutboxMessage[]> {
  return [...getState().outbox];
}

export async function retryIntegration(id: string): Promise<void> {
  await delay(800);
  const actor = currentActor();
  mutate((draft) => {
    const integration = draft.integrations.find((i) => i.id === id);
    if (!integration) throw new ServiceError("NOT_FOUND");
    integration.status = "healthy";
    integration.lastSyncAt = now();
    integration.updatedAt = now();
    addAudit(draft, {
      actor,
      action: "integrationRetried",
      params: { name: integration.name },
      entity: "integration",
      entityId: id,
      simulated: true,
    });
  });
}
