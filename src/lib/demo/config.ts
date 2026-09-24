/**
 * Demonstration mode is opt-in through NEXT_PUBLIC_RPCMS_DEMO=true (see .env).
 * When it is off, the demonstration account does not exist and sign-in is refused.
 */
export const DEMO_ENABLED = process.env.NEXT_PUBLIC_RPCMS_DEMO === "true";

/** Fictional account for the prototype walkthrough. Not a real credential. */
export const demoAccount = DEMO_ENABLED
  ? {
      username: "coordinator.demo",
      password: "Demo-Coordinator-2026",
      displayName: "Demo Coordinator (fictional)",
    }
  : null;
