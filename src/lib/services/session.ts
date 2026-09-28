"use client";

import { CASEWORKER_ROLES, FIELD_ROLES, type DemoSession } from "@/lib/types";
import { DEMO_ENABLED, demoAccounts } from "@/lib/demo/config";
import { addAudit, getState, mutate } from "@/lib/demo/store";

/**
 * PROTOTYPE ONLY. This is a demonstration sign-in that compares against
 * fictional accounts and keeps a flag in local storage. It provides no
 * security and must be replaced by the institution's identity provider
 * (with multi-factor authentication) before any real use.
 */
const SESSION_KEY = "rpcms-demo-session-v2";

export type SignInResult = { ok: true; session: DemoSession } | { ok: false; reason: "invalid" | "disabled" | "deactivated" };

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
  if (!DEMO_ENABLED || demoAccounts.length === 0) return { ok: false, reason: "disabled" };

  const account = demoAccounts.find((a) => a.username.toLowerCase() === username.trim().toLowerCase() && a.password === password);
  // Same response for unknown accounts and wrong passwords, so account existence is never revealed.
  if (!account) return { ok: false, reason: "invalid" };

  const user = getState().users.find((u) => u.id === account.userId);
  if (user?.status === "deactivated") return { ok: false, reason: "deactivated" };

  const session: DemoSession = {
    userId: account.userId,
    username: account.username,
    displayName: account.displayName,
    role: user?.role ?? account.role,
    scope: user?.scope ?? { level: "national", ids: [] },
    signedInAt: new Date().toISOString(),
    demo: true,
    partnerId: user?.partnerId,
  };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore — the session will not survive a refresh
  }
  mutate((draft) => {
    const u = draft.users.find((x) => x.id === account.userId);
    if (u) u.lastActiveAt = session.signedInAt;
    addAudit(draft, { actor: session.displayName, action: "signedIn", category: "session", params: {}, entity: "session" });
  });
  return { ok: true, session };
}

/**
 * Where a signed-in user works. Each workspace is closed to the others:
 * partner users never open the OPM workspace, field and caseworker users
 * never open the OPM or Partner Portal, and OPM users never open either.
 */
export function homeFor(session: Pick<DemoSession, "partnerId" | "role"> | null): "/portal" | "/partner" | "/field" | "/caseworker" {
  if (session && FIELD_ROLES.includes(session.role)) return "/field";
  if (session && CASEWORKER_ROLES.includes(session.role)) return "/caseworker";
  return session?.partnerId ? "/partner" : "/portal";
}

/** `audit: false` ends the session without writing to the central audit trail (a field device signing out offline). */
export async function signOut(options: { audit?: boolean } = {}): Promise<void> {
  const session = getSession();
  if (session && options.audit !== false) {
    mutate((draft) => addAudit(draft, { actor: session.displayName, action: "signedOut", category: "session", params: {}, entity: "session" }));
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
