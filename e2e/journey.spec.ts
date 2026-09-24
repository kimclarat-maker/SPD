import { expect, test, type Page } from "@playwright/test";

const DEMO_USER = "coordinator.demo";
const DEMO_PASS = "Demo-Coordinator-2026";

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email or assigned username").fill(DEMO_USER);
  await page.getByLabel("Password", { exact: true }).fill(DEMO_PASS);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/portal$/);
  await expect(page.getByRole("heading", { level: 1, name: "National overview" })).toBeVisible();
}

/** Open an action pill, optionally add a note, then confirm in the action's confirm step. */
async function decide(page: Page, button: string, note?: string) {
  await page.getByRole("button", { name: button, exact: true }).first().click();
  const panel = page.getByRole("group", { name: `Confirm: ${button}` });
  if (note) await panel.getByLabel(/Decision note|Resolution/).fill(note);
  await panel.getByRole("button", { name: button, exact: true }).click();
}

async function openTab(page: Page, name: string) {
  await page.getByRole("tab", { name, exact: true }).click();
}

test.describe.configure({ mode: "serial" });

test("landing page leads to sign-in and describes the first release honestly", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A clearer view of refugee services and interventions.");
  await expect(page.getByText("Illustrative preview", { exact: true })).toBeVisible();
  await expect(page.locator("#how-it-works ol > li")).toHaveCount(7);
  await expect(page.locator("#capabilities li")).toHaveCount(6);
  // Three planned portals, none of them linked.
  const audiences = page.locator("#who-it-serves li");
  await expect(audiences).toHaveCount(4);
  await expect(audiences.filter({ hasText: "Planned" })).toHaveCount(3);
  await expect(audiences.filter({ hasText: "Planned" }).locator("a")).toHaveCount(0);
  await page.getByRole("link", { name: "Staff sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("sign-in validates input without revealing whether an account exists", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("main [role=alert]")).toContainText("Enter your email or assigned username.");
  await expect(page.locator("main [role=alert]")).toContainText("Enter your password.");

  await page.getByLabel("Email or assigned username").fill("someone@example.org");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute("type", "text");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("main [role=alert]")).toContainText("The sign-in details are not correct.");
});

test("password recovery is simulated and shows the expired-link state", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await page.getByRole("button", { name: "Request reset instructions" }).click();
  await expect(page.getByText("Enter your email or assigned username.")).toBeVisible();
  await page.getByLabel("Email or assigned username").fill("anyone");
  await page.getByRole("button", { name: "Request reset instructions" }).click();
  await expect(page).toHaveURL(/\/forgot-password\/requested$/);
  await expect(page.getByText("no email has been sent", { exact: false })).toBeVisible();
  await page.getByRole("link", { name: "Preview the expired-link screen" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("This reset link has expired");
  await page.getByRole("link", { name: "Back to sign in" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
});

test("every dashboard alert opens its record", async ({ page }) => {
  await signIn(page);
  const links = page.locator("section", { has: page.getByRole("heading", { name: "Needs attention" }) }).locator("ul a");
  const count = await links.count();
  expect(count).toBeGreaterThan(5);
  const hrefs = await links.evaluateAll((els) => els.map((el) => el.getAttribute("href")!));
  for (const href of hrefs) {
    await page.goto(href);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("This record could not be found.")).toHaveCount(0);
    await expect(page.getByRole("tab", { name: "Audit timeline" })).toBeVisible();
  }
});

test("complete coordination journey updates every screen and the audit trail", async ({ page }) => {
  await signIn(page);

  // Intervention cannot be approved before its partner.
  await page.goto("/portal/interventions/i-0147");
  await expect(page.getByText("is not yet approved", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Approve intervention" })).toBeDisabled();

  // 1. Partner approval: verify documents, simulated e-signature, approve.
  await page.getByRole("link", { name: "Open partner record" }).click();
  await expect(page).toHaveURL(/\/portal\/partners\/p-kcha$/);
  await expect(page.getByRole("button", { name: "Approve partner" })).toBeDisabled();
  await openTab(page, "Documents");
  await page.getByRole("button", { name: /Approve document: Operating permit/ }).click();
  await page.getByRole("button", { name: /Approve document: Safeguarding policy/ }).click();
  await expect(page.getByRole("button", { name: /Approve document/ })).toHaveCount(0);
  await openTab(page, "Partnership agreement");
  await page.getByRole("button", { name: "Request e-signature (simulated)" }).click();
  await expect(page.getByText("simulated e-signature", { exact: false })).toBeVisible();
  await decide(page, "Approve partner", "Documents and agreement verified.");
  await expect(page.locator("header").getByText("Approved", { exact: true })).toBeVisible();

  // 2. Intervention approval releases the held field report.
  await page.goto("/portal/interventions/i-0147");
  await decide(page, "Approve intervention");
  await expect(page.locator("header").getByText("Approved", { exact: true })).toBeVisible();
  await openTab(page, "Field reports");
  await expect(page.getByText("Awaiting review")).toBeVisible();

  // 3. Field report review runs the simulated verification check.
  await page.getByRole("link", { name: "Outreach day and dignity kit distribution" }).click();
  await decide(page, "Accept report");
  await expect(page.locator("header").getByText("Accepted", { exact: true })).toBeVisible();
  await openTab(page, "Assistance exceptions from this report");
  await expect(page.getByRole("link", { name: "AEX-2026-0311" })).toBeVisible();

  // 4. Assistance exception decision (note required).
  await page.getByRole("link", { name: "AEX-2026-0311" }).click();
  await page.getByRole("button", { name: "Confirm assistance is valid" }).click();
  const confirmValid = page.getByRole("group", { name: "Confirm: Confirm assistance is valid" });
  await confirmValid.getByRole("button", { name: "Confirm assistance is valid" }).click();
  await expect(page.getByText("Add a note explaining this decision.")).toBeVisible();
  await confirmValid.getByLabel("Decision note").fill("Earlier kit was a hygiene kit, not a dignity kit.");
  await confirmValid.getByRole("button", { name: "Confirm assistance is valid" }).click();
  await expect(page.locator("header").getByText("Confirmed valid")).toBeVisible();

  // 5. Service case: the newly approved partner is now assignable.
  await page.goto("/portal/cases/sc-1184");
  await page.getByRole("button", { name: "Assign partner", exact: true }).click();
  await page.getByLabel("Approved partner").selectOption({ label: "Kagera Community Health Alliance" });
  await page.getByRole("group", { name: "Confirm: Assign partner" }).getByRole("button", { name: "Assign partner" }).click();
  await expect(page.locator("header").getByText("Assigned", { exact: true })).toBeVisible();
  await decide(page, "Notify requester (simulated)");
  await expect(page.getByText("No SMS or message was delivered.", { exact: false })).toBeVisible();
  await decide(page, "Record resolution", "Follow-up appointment booked at the health centre.");
  await expect(page.locator("header").getByText("Resolved", { exact: true })).toBeVisible();

  // 6. National report: checks pass, simulated signature, simulated sharing.
  await page.goto("/portal/reports/nr-2026-q3");
  await expect(page.getByText("0 outstanding", { exact: false })).toBeVisible();
  await expect(page.getByText("0 open", { exact: false })).toBeVisible();
  await expect(page.getByText("0 unassigned", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Sign report (simulated e-signature)" }).click();
  await page.getByLabel("Type your full name to sign").fill("Demo Coordinator");
  await page
    .getByRole("group", { name: "Confirm: Sign report (simulated e-signature)" })
    .getByRole("button", { name: "Sign report (simulated e-signature)" })
    .click();
  await expect(page.locator("header").getByText("Signed", { exact: true })).toBeVisible();
  await openTab(page, "Report figures");
  await expect(page.getByText("Figures frozen at sign-off", { exact: false })).toBeVisible();
  await decide(page, "Share with approved partners (simulated)");
  await expect(page.getByText("simulated data exchange", { exact: false })).toBeVisible();

  // Dashboard reflects the whole journey, and it survives a refresh.
  await page.goto("/portal");
  const journey = page.locator("section", { has: page.getByRole("heading", { name: "Coordination flow" }) });
  await expect(journey.getByText("6/6")).toBeVisible();
  await page.reload();
  await expect(journey.getByText("6/6")).toBeVisible();
  await expect(page.getByText("Assistance exception to decide: AEX-2026-0311")).toHaveCount(0);

  // Audit trail recorded each decision.
  await page.goto("/portal/audit");
  for (const text of [
    "Partner Kagera Community Health Alliance approved",
    "Intervention INT-2026-0147 approved",
    "Field report FR-2026-0932 accepted",
    "Assistance exception AEX-2026-0311 confirmed valid",
    "Service case SRV-2026-1184 resolved",
    "National report NR-2026-Q3 signed",
  ]) {
    await expect(page.getByRole("cell", { name: new RegExp(text) }).first()).toBeVisible();
  }

  // Simulated outbox holds the exchanges; nothing claims delivery.
  await page.goto("/portal/integrations");
  await expect(page.getByText("Nothing here has been delivered.", { exact: false })).toBeVisible();
  await expect(page.getByRole("cell", { name: /NR-2026-Q3/ }).first()).toBeVisible();
});

test("Arabic switches the interface to right-to-left and persists", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("group", { name: "Language" }).first().getByRole("button", { name: "العربية" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("رؤية أوضح لخدمات اللاجئين والتدخلات.");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "ar");
  await page.getByRole("group", { name: "اللغة" }).first().getByRole("button", { name: "English" }).click();
  await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
});
