import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Locator, type Page } from "@playwright/test";

const OFFICER = { user: "field.officer.demo", pass: "Demo-Field-2026" };
const CASEWORKER = { user: "caseworker.demo", pass: "Demo-Caseworker-2026" };

async function signIn(page: Page, account: { user: string; pass: string }, landing: RegExp) {
  await page.goto("/sign-in");
  await page.getByLabel("Email or assigned username").fill(account.user);
  await page.getByLabel("Password", { exact: true }).fill(account.pass);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(landing);
}

/** The RecordPage action pattern: click the trigger pill, fill its confirm panel, then submit inside that panel. */
async function runAction(page: Page, label: string, fill?: (group: Locator) => Promise<void>) {
  await page.getByRole("button", { name: label, exact: true }).click();
  const group = page.getByRole("group", { name: new RegExp(label) });
  if (fill) await fill(group);
  await group.getByRole("button", { name: label, exact: true }).click();
}

async function scan(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) → ${v.nodes[0]?.target.join(" ")}`);
}

test.describe.configure({ mode: "serial" });

test("caseworker accounts open only the Caseworker Portal", async ({ page }) => {
  await signIn(page, CASEWORKER, /\/caseworker$/);
  await expect(page.getByRole("heading", { level: 1, name: "My work" })).toBeVisible();
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/caseworker$/);
  await page.goto("/field");
  await expect(page).toHaveURL(/\/caseworker$/);
});

test("a field referral reaches the caseworker's team queue", async ({ page }) => {
  test.setTimeout(120_000);

  // The field officer refers a service need.
  await signIn(page, OFFICER, /\/field$/);
  await page.goto("/field/issue?new=referral");
  await expect(page).toHaveURL(/\/field\/issue\?id=/);
  await page.getByLabel("Service needed").selectOption("verification");
  await page.getByLabel(/^Description/).fill("Household asks to verify their registration status after a long absence.");
  await page.getByLabel(/The person agreed to be referred/).check();
  await page.getByRole("button", { name: "Send" }).click();
  await expect(page.getByText("Sent. Its status will show here.")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Nakivale registration desk (caseworkers)")).toBeVisible();

  // The caseworker's team queue picks it up without any OPM step in between.
  await signIn(page, CASEWORKER, /\/caseworker$/);
  await page.goto("/caseworker/queue");
  await expect(page.getByText("Verification")).toBeVisible();
});

test("the caseworker claims, works and closes a referred case", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, CASEWORKER, /\/caseworker$/);

  // Claim the seeded referral from the team queue — it was the only one, so the queue empties.
  await page.goto("/caseworker/queue");
  await page.getByRole("button", { name: "Claim this case" }).first().click();
  await expect(page.getByText("No cases waiting in the team queue.")).toBeVisible();

  // It now shows up in My cases.
  await page.goto("/caseworker/cases");
  await page.getByRole("link", { name: /SRV-2026-1195/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "SRV-2026-1195" })).toBeVisible();
  await expect(page.getByText("Claimed by Demo Caseworker (fictional)")).toBeVisible();

  // Requester details start masked; case-level access unmasks them, with a logged reason.
  await expect(page.getByText("Requester details are masked")).toBeVisible();
  await runAction(page, "Request case-level access", async (group) => {
    await group.getByLabel(/reason/i).fill("Confirming identity before contacting the requester.");
  });
  await expect(page.getByText("Case-level access granted and logged.")).toBeVisible();

  // Start work, message the requester, add an internal note.
  await page.getByRole("button", { name: "Start work", exact: true }).click();
  await expect(page.getByText("In progress", { exact: true }).first()).toBeVisible();

  await page.getByRole("tab", { name: /Messages/ }).click();
  await page.getByLabel("Message to the requester").fill("Please come to the registration desk with your documents.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Message queued by SMS (simulated).")).toBeVisible();

  await page.getByRole("tab", { name: "Internal notes" }).click();
  await page.getByLabel("Add an internal note").fill("Spoke with the requester's neighbour to confirm the household is still in the settlement.");
  await page.getByRole("button", { name: "Add comment" }).click();
  await expect(page.getByText("Spoke with the requester's neighbour")).toBeVisible();

  // Resolve and close.
  await runAction(page, "Resolve", async (group) => {
    await group.getByLabel("Resolution").fill("Registration status verified and confirmed to the requester.");
  });
  await expect(page.getByText("Resolved", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: "Close case", exact: true }).click();
  await page.getByRole("group", { name: /Close case/ }).getByRole("button", { name: "Close case", exact: true }).click();
  await expect(page.getByText("Closed", { exact: true }).first()).toBeVisible();
});

test("axe: caseworker screens", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, CASEWORKER, /\/caseworker$/);
  const paths = ["/caseworker", "/caseworker/queue", "/caseworker/cases", "/caseworker/cases/sc-1197"];
  const problems: string[] = [];
  for (const path of paths) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    problems.push(...(await scan(page)).map((v) => `${path} ${v}`));
  }
  expect(problems).toEqual([]);
});
