"use client";

import type { DemoSession } from "@/lib/types";
import { DEMO_ENABLED, demoAccount } from "@/lib/demo/config";
import { addAudit, mutate } from "@/lib/demo/store";

/**
 * PROTOTYPE ONLY. This is a demonstration sign-in that compares against a
 * fictional account and keeps a flag in local storage. It provides no
 * security and must be replaced by the institution's identity provider
 * (with multi-factor authentication) before any real use.
 */
const SESSION_KEY = "rpcms-demo-session";

export type SignInResult = { ok: true; session: DemoSession } | { ok: false; reason: "invalid" | "disabled" };

export function getSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as DemoSession) : null;
  } catch {
    return null;
  }
}

export async function signIn(username: string, password: string): Promise<SignInResult> {
  await new Promise((resolve) => setTimeout(resolve, 400));
  if (!DEMO_ENABLED || !demoAccount) return { ok: false, reason: "disabled" };

  const matches =
    username.trim().toLowerCase() === demoAccount.username.toLowerCase() && password === demoAccount.password;
  // Same response for unknown accounts and wrong passwords, so account existence is never revealed.
  if (!matches) return { ok: false, reason: "invalid" };

  const session: DemoSession = {
    username: demoAccount.username,
    displayName: demoAccount.displayName,
    role: "opm_national_coordinator",
    signedInAt: new Date().toISOString(),
    demo: true,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore — the session will not survive a refresh
  }
  mutate((draft) => addAudit(draft, { actor: session.displayName, action: "signedIn", params: {}, entity: "session" }));
  return { ok: true, session };
}

export async function signOut(): Promise<void> {
  const session = getSession();
  if (session) {
    mutate((draft) => addAudit(draft, { actor: session.displayName, action: "signedOut", params: {}, entity: "session" }));
  }
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/**
 * Simulated password recovery. Always resolves the same way whether or not an
 * account matches, and never sends anything.
 */
export async function requestPasswordReset(identifier: string): Promise<{ simulated: true }> {
  void identifier;
  await new Promise((resolve) => setTimeout(resolve, 500));
  return { simulated: true };
}
