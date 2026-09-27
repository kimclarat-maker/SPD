import { expect, test, type Locator, type Page } from "@playwright/test";

const COORDINATOR = { user: "coordinator.demo", pass: "Demo-Coordinator-2026" };
const ANALYST = { user: "analyst.demo", pass: "Demo-Analyst-2026" };

async function signIn(page: Page, account = COORDINATOR) {
  await page.goto("/sign-in");
  await page.getByLabel("Email or assigned username").fill(account.user);
  await page.getByLabel("Password", { exact: true }).fill(account.pass);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole("heading", { level: 1, name: "National overview" })).toBeVisible();
}

/** Open an action pill, optionally give a reason, then confirm in the action's confirm step. */
async function decide(page: Page, button: string, note?: string, noteLabel = "Reason") {
  await page.getByRole("button", { name: button, exact: true }).first().click();
  const panel = page.getByRole("group", { name: `Confirm: ${button}` });
  if (note) await panel.getByLabel(noteLabel, { exact: false }).fill(note);
  await panel.getByRole("button", { name: button, exact: true }).click();
  await expect(panel).toHaveCount(0);
}

/** Confirm a modal dialog that asks for a reason. */
async function confirmDialog(page: Page, confirmLabel: string, reason: string) {
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Reason").fill(reason);
  await dialog.getByRole("button", { name: confirmLabel, exact: true }).click();
  await expect(dialog).toBeHidden();
}

async function openTab(page: Page, name: RegExp | string) {
  await page.getByRole("tab", { name }).click();
}

/** Status badges in the record header (the workflow stepper repeats status names). */
const header = (page: Page): Locator => page.locator("main header").first().locator("[data-badge]");

test.describe.configure({ mode: "serial" });

test("landing page leads to sign-in", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "Staff sign in" }).first().click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("sign-in validates input without revealing whether an account exists", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("main [role=alert]")).toContainText("Enter your email or assigned username.");
  await page.getByLabel("Email or assigned username").fill("someone@example.org");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("main [role=alert]")).toContainText("The sign-in details are not correct.");
});

test("every Needs attention item opens its record", async ({ page }) => {
  await signIn(page);
  const links = page.locator("#attention").locator("xpath=ancestor::section[1]").locator("ul a");
  const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute("href")!));
  expect(hrefs.length).toBeGreaterThan(8);
  for (const href of hrefs) {
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("This record could not be found.")).toHaveCount(0);
  }
});

test("dashboard counts agree with the filtered lists", async ({ page }) => {
  await signIn(page);
  await page.getByLabel("District").selectOption("Isingiro");
  await expect(page).toHaveURL(/district=Isingiro/);
  for (const metric of ["Approved partners", "Active interventions", "Field reports awaiting review", "Open service cases"]) {
    await page.goto("/portal?district=Isingiro");
    const tile = page.getByRole("link", { name: new RegExp(metric) });
    const value = (await tile.locator("span").nth(2).textContent())!.trim();
    await tile.click();
    await expect(page.getByText(`Records: ${value}`, { exact: true })).toBeVisible();
  }
});

test("complete scenario: partner to national report, with a full audit history", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page);

  // The intervention is blocked while its partner is not approved.
  await page.goto("/portal/interventions/i-0147");
  await expect(page.getByText("Not eligible: not approved", { exact: false }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve", exact: true })).toBeDisabled();

  // 1. Partner: verify documents, run simulated URSB and NGO Bureau checks, approve.
  await page.goto("/portal/partners/p-kcha");
  await expect(page.getByRole("button", { name: "Approve partner" })).toBeDisabled();
  await openTab(page, /Submitted documents/);
  await page.getByRole("button", { name: "Verify: NGO operating permit" }).click();
  await confirmDialog(page, "Verify", "Permit number and expiry checked against the copy.");
  await page.getByRole("button", { name: "Verify: Safeguarding policy" }).click();
  await confirmDialog(page, "Verify", "Policy signed by the board and dated this year.");
  await openTab(page, "Registry verification");
  const card = (name: string) => page.getByRole("heading", { name }).locator("xpath=../..");
  await card("URSB business registry").getByRole("button", { name: "Run check" }).click();
  await expect(page.getByText("Registry check finished: Match.")).toBeVisible();
  await card("National NGO Bureau").getByRole("button", { name: "Run check" }).click();
  await expect(page.getByText("Registry check finished: Timed out.")).toBeVisible();
  await card("National NGO Bureau").getByRole("button", { name: "Run again" }).click();
  await expect(page.getByText("Registry check finished: Match.")).toBeVisible();
  await decide(page, "Approve partner", "Documents verified; URSB and NGO Bureau checks match (simulated).");
  await expect(header(page).getByText("Eligible for new interventions")).toBeVisible();

  // 2. Intervention: resolve the overlap warning.
  await page.goto("/portal/interventions/i-0147");
  await expect(page.getByText("Overlaps with INT-2026-0138", { exact: false })).toBeVisible();
  await decide(page, "Resolve overlap", "KCHA covers Juru and Rubondo; MHS keeps Base Camp clinic days.", "How the work is divided");
  await expect(page.getByText("Overlap with INT-2026-0138 (Mwangaza Health Services) resolved.")).toBeVisible();

  // 3. Approve the intervention; field reporting opens.
  await decide(page, "Approve", "Eligible partner, complete plan, overlap resolved.");
  await expect(header(page).getByText("Approved", { exact: true }).first()).toBeVisible();

  // 4. Offline field report: simulated device sync, then accept.
  await page.goto("/portal/field-reports/fr-0932");
  await expect(header(page).getByText("Awaiting sync")).toBeVisible();
  await decide(page, "Simulate device sync");
  await expect(page.getByText("Sync finished: Synced.")).toBeVisible();
  await decide(page, "Accept");
  await expect(page.getByText("Assistance records flagged for human review: 1.", { exact: false })).toBeVisible();

  // 5. The accepted report updates the intervention, indicator and map.
  await page.goto("/portal/interventions/i-0147");
  await expect(header(page).getByText("Active", { exact: true })).toBeVisible();
  await page.goto("/portal/surveys/indicators/ind-hlt-02");
  await openTab(page, /Trace to records/);
  await expect(page.getByRole("link", { name: "FR-2026-0932" })).toBeVisible();
  await page.goto("/portal/gis");
  await page.getByRole("tab", { name: /^Interventions/ }).click();
  await expect(page.getByRole("link", { name: /INT-2026-0147/ })).toBeVisible();

  // 6. Possible duplicate: restricted view with a reason, ProGres (simulated), human decision.
  await page.goto("/portal/beneficiaries/reviews/rv-0311");
  await expect(page.getByText("does not stop or delay the household's assistance", { exact: false }).first()).toBeVisible();
  await page.getByLabel("Reason for viewing").fill("Checking the household association for the duplicate flag.");
  await page.getByRole("button", { name: "View restricted details" }).click();
  await expect(page.getByText("HH-NKV-0418-72 (fictional)").first()).toBeVisible();
  await openTab(page, "ProGres v4");
  await page.getByRole("button", { name: "Request verification" }).click();
  await expect(page.getByText("returned: Unavailable.")).toBeVisible();
  await page.getByRole("button", { name: "Request again" }).click();
  await expect(page.getByText("returned: Verified.")).toBeVisible();
  await decide(page, "Confirm valid", "Separate households; the earlier kit went to the linked household HH-NKV-0418-73.");
  await expect(header(page).getByText("Confirmed valid")).toBeVisible();

  // 7. Service case: case-level access, assignment, information request, resolution.
  await page.goto("/portal/cases/sc-1184");
  await expect(page.getByText("Requester details are masked.", { exact: false })).toBeVisible();
  await decide(page, "Request case-level access", "Need the individual ID to book the photo appointment.", "Reason for access");
  await expect(page.getByText("Amina K. (fictional)")).toBeVisible();
  await page.getByRole("button", { name: "Assign team", exact: true }).click();
  await page.getByLabel("Assigned team").selectOption("Nakivale registration desk");
  await page.getByRole("group", { name: "Confirm: Assign team" }).getByRole("button", { name: "Assign team" }).click();
  await expect(header(page).getByText("Assigned", { exact: true })).toBeVisible();
  await decide(page, "Start work");
  await decide(page, "Request information", "Please bring the police letter for the lost ID.", "Message to the requester");
  await expect(header(page).getByText("Awaiting information")).toBeVisible();
  await decide(page, "Simulate requester reply");
  await decide(page, "Resolve", "Identity confirmed; replacement ID printed.", "Resolution");
  await expect(header(page).getByText("Resolved", { exact: true })).toBeVisible();
  await decide(page, "Close case");

  // 8. National report: generate, export, AMP and NIMES (simulated).
  await page.goto("/portal/reports/rep-q3");
  await decide(page, "Generate");
  await expect(page.getByText("Headline figures were frozen", { exact: false })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  const panel = (name: string) => page.getByRole("heading", { name }).locator("xpath=../..");
  await panel("Aid Management Platform (AMP)").getByRole("button", { name: "Prepare data" }).click();
  await panel("Aid Management Platform (AMP)").getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Submission result: Accepted.")).toBeVisible();
  await panel("National Integrated M&E System (NIMES)").getByRole("button", { name: "Prepare data" }).click();
  await panel("National Integrated M&E System (NIMES)").getByRole("button", { name: "Submit" }).click();
  await expect(page.getByText("Submission result: Partly accepted.")).toBeVisible();
  await panel("National Integrated M&E System (NIMES)").getByRole("button", { name: "Resubmit corrected data" }).click();
  await expect(page.getByText("Submission result: Accepted.")).toBeVisible();
  await expect(page.locator("main header").getByText("Submitted", { exact: true })).toBeVisible();
  await page.goto("/portal/integrations/nimes");
  await openTab(page, /^History/);
  await expect(page.locator("table [data-badge]", { hasText: "Partial failure" }).first()).toBeVisible();

  // 9. Audit trail holds the whole history; the walkthrough is complete and persists.
  await page.goto("/portal/audit");
  for (const text of [
    "Kagera Community Health Alliance approved",
    "INT-2026-0147: overlap with INT-2026-0138 resolved",
    "INT-2026-0147 approved",
    "FR-2026-0932 accepted",
    "BR-2026-0311: restricted details viewed",
    "BR-2026-0311: confirmed valid",
    "SRV-2026-1184: case-level access granted",
    "SRV-2026-1184 resolved",
    "exported as CSV",
    "submitted to NIMES",
  ]) {
    await expect(page.getByRole("cell", { name: new RegExp(text) }).first()).toBeVisible();
  }
  await page.goto("/portal");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Demonstration walkthrough" }).locator("xpath=../..").getByText("9/9")).toBeVisible();
});

test("sync conflict keeps both versions until a reviewer chooses", async ({ page }) => {
  await signIn(page);
  await page.goto("/portal/field-reports/fr-0929");
  await expect(page.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
  await openTab(page, "Sync conflict");
  await expect(page.getByRole("heading", { name: "Tablet NVWT-T04" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tablet NVWT-T09" })).toBeVisible();
  await page.getByRole("button", { name: "Resolve conflict" }).click();
  const panel = page.getByRole("group", { name: "Confirm: Resolve conflict" });
  await panel.getByLabel(/Tablet NVWT-T09/).check();
  await panel.getByLabel("Reason").fill("Afternoon visit repaired the fourth pump.");
  await panel.getByRole("button", { name: "Resolve conflict" }).click();
  await expect(page.getByText("Version from Tablet NVWT-T09 chosen", { exact: false })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Tablet NVWT-T04" })).toBeVisible();
});

test("a read-only regional role sees scoped data and permission-denied states", async ({ page }) => {
  await signIn(page, ANALYST);
  await page.goto("/portal/admin");
  await expect(page.getByRole("heading", { name: "You do not have access to this" })).toBeVisible();
  await page.goto("/portal/cases");
  await expect(page.getByRole("link", { name: "SRV-2026-1184" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "SRV-2026-1188" })).toBeVisible();
  await page.goto("/portal/partners/p-nvwt");
  await expect(page.getByText("Some actions are locked", { exact: false })).toBeVisible();
  // Out-of-scope record (Nakivale, South-West) opened directly by URL.
  await page.goto("/portal/interventions/i-0147");
  await expect(page.getByRole("heading", { name: "You do not have access to this" })).toBeVisible();
  await page.goto("/portal/beneficiaries?tab=reviews");
  await expect(page.getByText("The review queue is restricted", { exact: false })).toBeVisible();
});

test("Arabic switches the portal to right-to-left", async ({ page }) => {
  await signIn(page);
  await page.getByRole("group", { name: "Language" }).first().getByRole("button", { name: "العربية" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await page.getByRole("group", { name: "اللغة" }).first().getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});
