import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const OFFICER = { user: "field.officer.demo", pass: "Demo-Field-2026" };
const SUPERVISOR = { user: "field.supervisor.demo", pass: "Demo-Supervisor-2026" };

async function signIn(page: Page, account: { user: string; pass: string }, landing: RegExp) {
  await page.goto("/sign-in");
  await page.getByLabel("Email or assigned username").fill(account.user);
  await page.getByLabel("Password", { exact: true }).fill(account.pass);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(landing);
}

/** Records the device has uploaded, as the central (shared demonstration) store holds them. */
async function centralFromDevice(page: Page) {
  return page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("rpcms-demo-state-v2") ?? "{}");
    const fromDevice = (list: { clientRecordId?: string }[] = []) => list.filter((r) => r.clientRecordId?.startsWith("dev-")).length;
    return { reports: fromDevice(state.fieldReports), assistance: fromDevice(state.assistance) };
  });
}

async function scan(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) → ${v.nodes[0]?.target.join(" ")}`);
}

test.describe.configure({ mode: "serial" });

test("field accounts open only the Field Operations Portal and only assigned work", async ({ page }) => {
  await signIn(page, OFFICER, /\/field$/);
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  await page.goto("/portal/partners");
  await expect(page).toHaveURL(/\/field$/);
  // Same organisation, other settlement: not assigned.
  await page.goto("/field/intervention?id=i-0111");
  await expect(page.getByText("This intervention is not assigned to you")).toBeVisible();
  // Another organisation's intervention.
  await page.goto("/field/intervention?id=i-0147");
  await expect(page.getByText("This intervention is not assigned to you")).toBeVisible();
  // The supervisor role screen is not available to an officer.
  await page.goto("/field/team");
  await expect(page.getByText("You are not authorised for this")).toBeVisible();
});

test("the connected offline scenario, from assigned work to OPM acceptance", async ({ page }) => {
  test.setTimeout(360_000);
  await signIn(page, OFFICER, /\/field$/);

  // 1. Open the assigned intervention while online.
  await page.getByRole("link", { name: "Open INT-2026-0138" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Reproductive health mobile clinic" })).toBeVisible();
  await expect(page.getByText("Approved plan — read only")).toBeVisible();

  // 2. The device goes offline (and two things change centrally, simulated).
  await page.goto("/field");
  await page.getByRole("button", { name: "Go offline (simulated)" }).click();
  await expect(page.getByText("Offline (simulated)").first()).toBeVisible();
  const before = await centralFromDevice(page);

  // 3a. GPS-tagged visit report, saved offline.
  await page.getByRole("link", { name: "Visit report", exact: true }).click();
  await page.getByRole("button", { name: "Start visit report" }).click();
  await page.getByLabel("Activity type").fill("Outreach clinic monitoring visit");
  await page.getByRole("button", { name: /Use Juru outreach point \(simulated\)/ }).click();
  await expect(page.getByText(/Check the position before you submit/)).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Observations").fill("Clinic opened on time; 40 clients waiting at 9:00.");
  await page.getByLabel("Work completed").fill("Antenatal consultations and referrals.");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Women", { exact: true }).fill("52");
  await page.getByLabel("Men", { exact: true }).fill("8");
  await page.getByLabel("Children", { exact: true }).fill("21");
  await page.getByLabel(/HLT-01/).fill("5");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator('input[type=file][accept="image/*,application/pdf"]').setInputFiles("public/field-icons/icon-512.png");
  await expect(page.getByText("On this device").first()).toBeVisible();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Save offline" }).click();
  await expect(page.getByText("Saved offline. It will be sent when you sync.")).toBeVisible();

  // 3b. Survey collected offline on the cached form version (2).
  await page.goto("/field");
  await page.getByRole("link", { name: "Survey", exact: true }).click();
  await page.getByRole("button", { name: "Start survey response" }).click();
  await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Juru outreach point" }).check();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("radio", { name: "Yes" }).check();
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Antenatal referrals made").fill("3");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByLabel("Client satisfaction (1 to 5)").fill("4");
  await page.getByRole("button", { name: "Next" }).click();
  await page.getByRole("button", { name: "Review answers" }).click();
  await page.getByRole("button", { name: "Save offline" }).click();
  await expect(page.getByText("Saved offline. It will be sent when you sync.")).toBeVisible();

  // 3c. Assistance delivery recorded on the device (task version 1: two kits).
  await page.goto("/field");
  await page.getByRole("link", { name: "Assistance task", exact: true }).click();
  await page.getByRole("button", { name: "Record the delivery" }).click();
  await expect(page.getByLabel("Quantity")).toHaveValue("2");
  await page.getByRole("button", { name: "Record on this device" }).click();
  await expect(page.getByText("Recorded locally. It will be sent when you sync.")).toBeVisible();

  // 4. All three are unsynced, and the central system has not changed.
  await page.goto("/field/sync");
  await expect(page.getByRole("heading", { name: /Saved offline, waiting for a connection \(3\)/ })).toBeVisible();
  expect(await centralFromDevice(page)).toEqual(before);
  await page.reload();
  await expect(page.getByRole("heading", { name: /Saved offline, waiting for a connection \(3\)/ })).toBeVisible();

  // 5. Connectivity returns; the officer starts the sync.
  await page.goto("/field");
  await page.getByRole("button", { name: "Go back online" }).click();
  await page.goto("/field/sync");
  await page.getByRole("button", { name: "Sync now (3)" }).click();
  await expect(page.getByText("Received: 1 · Rejected: 1 · Conflicts: 1 · Interrupted: 0", { exact: true })).toBeVisible({ timeout: 30_000 });

  // 6–7a. The survey was rejected: its form version was retired. Move the answers and finish.
  await expect(page.getByText("Rejected: form version retired")).toBeVisible();
  await page.getByRole("button", { name: "Move answers to version 3" }).click();
  await expect(page.getByText("New in this version")).toBeVisible();
  await expect(page.getByText("Version 3", { exact: true })).toBeVisible();
  await page.getByRole("radio", { name: "Yes" }).check();
  await page.getByRole("button", { name: "Review answers" }).click();
  await page.getByRole("button", { name: "Submit response" }).click();
  await expect(page.getByText("Response sent. See its status above.")).toBeVisible({ timeout: 20_000 });

  // 7b. The delivery conflicts with the supervisor's change. Keep both versions; send what was delivered.
  await page.goto("/field/sync");
  await expect(page.getByRole("table", { name: "Your copy compared with the central version" })).toBeVisible();
  await page.getByLabel("Why this choice?").fill("Two kits were handed over before the allocation changed.");
  await page.getByRole("button", { name: "Record decision" }).click();
  await expect(page.getByText("Decision recorded and sent.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("heading", { name: /Reached the central system \(3\)/ })).toBeVisible();
  expect(await centralFromDevice(page)).toEqual({ reports: before.reports + 2, assistance: before.assistance + 1 });

  // 8. OPM returns the report with a comment on people reached.
  await page.goto("/field");
  await page.getByRole("button", { name: "OPM returns the report" }).click();
  await expect(page.getByText("The report was returned with a comment on people reached.")).toBeVisible();

  // 9. Correct and resubmit; the comment is shown beside the field; OPM accepts.
  await page.getByRole("link", { name: "Correct the report" }).click();
  await page.getByRole("button", { name: "Correct and resubmit" }).click();
  await page.getByRole("button", { name: /3\. People reached/ }).click();
  await expect(page.getByText("Reviewer comment")).toBeVisible();
  await page.getByLabel("Women", { exact: true }).fill("47");
  await page.getByRole("button", { name: /6\. Review and submit/ }).click();
  await page.getByLabel("What did you correct?").fill("Recounted from the register photo: 47 women.");
  await page.getByRole("button", { name: "Resubmit correction" }).click();
  await expect(page.getByText("Sent. See the status below.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Version 2", { exact: true })).toBeVisible();
  await page.goto("/field");
  await page.getByRole("button", { name: "OPM accepts the report" }).click();
  await expect(page.getByText("Walkthrough complete")).toBeVisible();

  // The acceptance counts in the intervention's indicators.
  await page.goto("/field/intervention?id=i-0138");
  await expect(page.getByText(/HLT-01/).first()).toBeVisible();
  await expect(page.getByText(/Last accepted report/)).toBeVisible();
});

test("a genuine offline reload opens from the service worker and keeps drafts", async ({ page, context }) => {
  test.setTimeout(180_000);
  await signIn(page, OFFICER, /\/field$/);
  await page.goto("/field/intervention?id=i-0138");
  await expect(page.getByRole("heading", { level: 1, name: "Reproductive health mobile clinic" })).toBeVisible();
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker?.getRegistration("/field");
      if (!reg?.active) return false;
      const cache = await caches.open("rpcms-field-v1-pages");
      return Boolean((await cache.match("/field/report")) && (await cache.match("/field/sync")) && (await cache.match("/field/intervention")));
    },
    null,
    { timeout: 90_000, polling: 1000 },
  );

  // The page that registered the worker is claimed by it; wait until it is controlled.
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), null, { timeout: 30_000 });
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: "Reproductive health mobile clinic" })).toBeVisible();
  await expect(page.getByText("Offline", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/as saved on this device/)).toBeVisible();

  await page.getByRole("button", { name: "Start a visit" }).click();
  await expect(page).toHaveURL(/\/field\/report\?id=/);
  await page.getByLabel("Activity type").fill("Draft written with no connection");
  await expect(page.getByText(/Saved on this device at/)).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Activity type")).toHaveValue("Draft written with no connection");
  await context.setOffline(false);
});

test("the supervisor assigns work in the settlement and sees the team", async ({ page }) => {
  await signIn(page, SUPERVISOR, /\/field$/);
  await page.goto("/field/team");
  await expect(page.getByRole("heading", { level: 1, name: "Team and review" })).toBeVisible();
  await page.getByLabel("Task title").fill("Check the new shade shelter at Rubondo");
  await page.getByRole("button", { name: "Assign", exact: true }).click();
  await expect(page.getByText("Task assigned. The officer is notified.")).toBeVisible();
  await expect(page.getByText("Check the new shade shelter at Rubondo")).toBeVisible();
});

test("axe: field screens", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, OFFICER, /\/field$/);
  const paths = [
    "/field",
    "/field/task?id=ft-0412",
    "/field/interventions",
    "/field/intervention?id=i-0138",
    "/field/reports",
    "/field/surveys",
    "/field/verify",
    "/field/assistance",
    "/field/map",
    "/field/issues",
    "/field/issue?new=safeguarding",
    "/field/sync",
    "/field/notifications",
    "/field/account",
  ];
  const problems: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    problems.push(...(await scan(page)).map((v) => `${path} ${v}`));
  }
  // The guided report form, step by step.
  await page.goto("/field/task?id=ft-0412");
  await page.getByRole("button", { name: "Start visit report" }).click();
  await expect(page.getByLabel("Activity type")).toBeVisible();
  problems.push(...(await scan(page)).map((v) => `report form ${v}`));
  expect(problems).toEqual([]);
});
