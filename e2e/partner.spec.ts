import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const PARTNER_ADMIN = { user: "partner.admin.demo", pass: "Demo-Partner-2026" };
const PARTNER_STAFF = { user: "partner.staff.demo", pass: "Demo-Staff-2026" };
const SUSPENDED = { user: "partner.suspended.demo", pass: "Demo-Suspended-2026" };
const COORDINATOR = { user: "coordinator.demo", pass: "Demo-Coordinator-2026" };

async function signIn(page: Page, account: { user: string; pass: string }, landing: RegExp) {
  await page.goto("/sign-in");
  await page.getByLabel("Email or assigned username").fill(account.user);
  await page.getByLabel("Password", { exact: true }).fill(account.pass);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(landing);
}

async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
}

/** Open an action pill, optionally fill its note, then confirm. */
async function decide(page: Page, button: string, note?: string, noteLabel = "Reason") {
  await page.getByRole("button", { name: button, exact: true }).first().click();
  const panel = page.getByRole("group", { name: `Confirm: ${button}` });
  if (note) await panel.getByLabel(noteLabel, { exact: false }).fill(note);
  await panel.getByRole("button", { name: button, exact: true }).click();
  await expect(panel).toHaveCount(0);
}

/** Runs a walkthrough demonstration control (a simulated OPM decision) from the dashboard. */
async function simulateOpm(page: Page, label: string) {
  await page.goto("/partner");
  await page.getByRole("button", { name: label }).click();
  await expect(page.getByText("Simulated OPM decision recorded.").first()).toBeVisible();
}

async function uploadOnDocumentPage(page: Page, fileName: string) {
  await page.getByRole("tab", { name: /^(Upload|Replace)$/ }).click();
  await page.locator("input[type=file]").setInputFiles({ name: fileName, mimeType: "application/pdf", buffer: Buffer.from("fictional") });
  await page.getByLabel("Note for OPM").fill("Current signed copy.");
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText("Version recorded (simulated upload).")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("partner accounts open the Partner Portal and cannot open the OPM workspace", async ({ page }) => {
  await signIn(page, PARTNER_ADMIN, /\/partner$/);
  await expect(page.getByRole("heading", { level: 1, name: "Partner dashboard" })).toBeVisible();
  await page.goto("/portal/partners");
  await expect(page).toHaveURL(/\/partner$/);
  // Another organisation's document is refused by the service layer.
  await page.goto("/partner/documents/doc-p-mhs-1");
  await expect(page.getByText("This record is not available to you")).toBeVisible();
  await page.goto("/partner/interventions/i-0138");
  await expect(page.getByText("This record is not available to you")).toBeVisible();
});

test("the complete partner journey, connected to the OPM workspace", async ({ page }) => {
  test.setTimeout(420_000);
  await signIn(page, PARTNER_ADMIN, /\/partner$/);

  // 1. Complete the profile and submit the accreditation application.
  await page.goto("/partner/profile");
  await page.getByRole("button", { name: "Fill missing details (demo)" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Profile draft saved.")).toBeVisible();
  for (const doc of ["doc-p-uchi-2", "doc-p-uchi-3", "doc-p-uchi-4"]) {
    await page.goto(`/partner/documents/${doc}`);
    await uploadOnDocumentPage(page, `${doc}.pdf`);
  }
  await page.goto("/partner/accreditation");
  await decide(page, "Submit application");
  await expect(page.getByText("Application submitted to OPM.")).toBeVisible();
  await signOut(page);

  // 2. OPM asks for a missing document — decided for real in the OPM workspace.
  await signIn(page, COORDINATOR, /\/portal$/);
  await page.goto("/portal/partners/p-uchi");
  await expect(page.getByRole("heading", { level: 1, name: "Ubuntu Community Health Initiative" })).toBeVisible();
  await page.getByRole("button", { name: "Request changes", exact: true }).click();
  const panel = page.getByRole("group", { name: "Confirm: Request changes" });
  await panel.getByLabel("Also request a document").selectOption("Tax compliance certificate");
  await panel.getByLabel("Reason").fill("Please add a current tax compliance certificate.");
  await panel.getByRole("button", { name: "Request changes", exact: true }).click();
  await expect(panel).toHaveCount(0);
  await signOut(page);

  await signIn(page, PARTNER_ADMIN, /\/partner$/);
  await expect(page.getByText("OPM requested changes to your accreditation application").first()).toBeVisible();
  await page.goto("/partner/accreditation");
  await expect(page.getByText("Please add a current tax compliance certificate.").first()).toBeVisible();
  await page.getByRole("link", { name: "Tax compliance certificate" }).first().click();
  await uploadOnDocumentPage(page, "tax-compliance.pdf");
  await page.goto("/partner/accreditation");
  await decide(page, "Resubmit application", "Tax compliance certificate uploaded.", "Your response to OPM");
  await expect(page.getByText("Application resubmitted to OPM.")).toBeVisible();

  // 3. OPM approval appears on the dashboard.
  await simulateOpm(page, "Simulate OPM checks and approval");
  await expect(page.locator("main").getByText("Approved", { exact: true }).first()).toBeVisible();

  // 4. Draft and submit an intervention proposal.
  await page.goto("/partner/proposals/new");
  await page.getByRole("button", { name: "Use example proposal (demo)" }).click();
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page).toHaveURL(/\/partner\/proposals\/i-/);
  await page.getByLabel("Attachment title").fill("Budget breakdown");
  await page.locator("input[type=file]").setInputFiles({ name: "budget.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("fictional") });
  await page.getByRole("button", { name: "Attach", exact: true }).click();
  await expect(page.getByRole("link", { name: /Budget breakdown/ }).first()).toBeVisible();
  const proposalUrl = page.url();
  await decide(page, "Submit to OPM");
  await expect(page.getByText("Proposal submitted to OPM.")).toBeVisible();

  // 5. OPM raises the overlap; the partner revises and resubmits; OPM approves.
  await simulateOpm(page, "Simulate OPM review (overlap)");
  await page.goto(proposalUrl);
  await expect(page.getByText("OPM requested changes").first()).toBeVisible();
  await page.getByLabel("How will you coordinate with the overlapping work?").fill("We will serve Rubondo only and refer clients to the Base Camp clinic run by the other partners.");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Proposal saved.")).toBeVisible();
  await decide(page, "Resubmit to OPM", "Service points divided; referral pathway added.", "What did you change?");
  await expect(page.getByText("Revised proposal sent back to OPM.")).toBeVisible();
  await simulateOpm(page, "Simulate OPM approval");
  await page.goto(proposalUrl);
  await expect(page.getByText("Approved: now an active intervention")).toBeVisible();
  const interventionId = proposalUrl.split("/").pop()!;

  // 6. Field report, returned by OPM, corrected and accepted.
  await page.goto(`/partner/field-reports/new?intervention=${interventionId}`);
  await page.getByRole("button", { name: "use example values (demo)" }).click();
  await page.getByRole("button", { name: "Submit to OPM" }).click();
  await expect(page).toHaveURL(/\/partner\/field-reports\/fr-/);
  const reportUrl = page.url();
  await simulateOpm(page, "Simulate OPM return for correction");
  await page.goto(reportUrl);
  await expect(page.getByText("OPM returned this report for correction")).toBeVisible();
  await page.getByLabel("Children").fill("45");
  await page.getByLabel("What did you correct?").fill("Children reached corrected to match the attendance sheet.");
  await page.getByRole("button", { name: "Resubmit to OPM" }).click();
  await expect(page.getByText("Corrected report sent back to OPM.")).toBeVisible();
  await simulateOpm(page, "Simulate OPM acceptance");
  await page.goto(reportUrl);
  await expect(page.getByText("Accepted by OPM.")).toBeVisible();
  await page.getByRole("tab", { name: /Version history/ }).click();
  await expect(page.getByText("Version 2").first()).toBeVisible();

  // 7. Simulated ProGres verification and an assistance entry flagged as a possible duplicate.
  await page.goto("/partner/beneficiaries?tab=verification");
  await page.getByLabel("Beneficiary reference").fill("UG-NKV-0418-72");
  await page.getByLabel("Purpose").fill("Confirm eligibility for a dignity kit.");
  await page.getByRole("button", { name: "Request verification (simulated)" }).click();
  await expect(page.getByText("Verification requested.")).toBeVisible();
  await page.getByRole("button", { name: /Collect result \(simulated\)/ }).first().click();
  await expect(page.getByText("ProGres v4 result: Verified (simulated).")).toBeVisible();
  await page.getByRole("tab", { name: /Assistance delivered/ }).click();
  await page.getByLabel("Verified reference").selectOption({ index: 1 });
  await page.getByLabel("Assistance type").fill("Dignity kit");
  await page.getByLabel("Unit", { exact: false }).first().fill("kit");
  await page.getByLabel("Responsible staff member").fill("D. Mugisha (fictional)");
  await page.getByRole("button", { name: "Record assistance" }).click();
  await expect(page.getByText("Possible duplicate: sent for OPM review")).toBeVisible();

  // 8. Expenditure update, MoU signature, partner report.
  await page.goto(`/partner/finance?intervention=${interventionId}`);
  await page.getByRole("button", { name: "New expenditure update" }).click();
  await page.getByRole("button", { name: "Use example entries (demo)" }).click();
  await page.getByRole("button", { name: "Submit for OPM review" }).click();
  await expect(page.getByText("Expenditure update submitted to OPM.")).toBeVisible();
  await simulateOpm(page, "Simulate OPM sending the MoU for signature");
  await page.goto("/partner/agreements");
  await page.getByRole("link", { name: /Memorandum of understanding/ }).click();
  await expect(page.getByText("Your signature is requested")).toBeVisible();
  await page.getByRole("button", { name: "Sign", exact: true }).click();
  await page.getByLabel("Type your full name to sign").fill("A. Nakato");
  await page.getByLabel("I am authorised to sign for my organisation.").check();
  await page.getByRole("button", { name: "Sign (simulated)" }).click();
  await expect(page.getByText("Signed (simulated). OPM can see the signature.")).toBeVisible();
  await page.goto("/partner/reports");
  await page.getByLabel("Report title").fill("Quarterly progress report");
  await page.getByRole("button", { name: "Generate report" }).click();
  await expect(page.getByText("Report generated.")).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);

  // Every walkthrough step is complete.
  await page.goto("/partner");
  await expect(page.getByText("8/8")).toBeVisible();
  await signOut(page);

  // The partner's work is in the OPM queues and record histories.
  await signIn(page, COORDINATOR, /\/portal$/);
  await page.goto(`/portal/interventions/${interventionId}`);
  await page.getByRole("tab", { name: /Partner updates/ }).click();
  await expect(page.getByText("Expenditure updates")).toBeVisible();
  await page.goto("/portal/beneficiaries?tab=reviews");
  await expect(page.getByText("assistance entry from the Partner Portal").or(page.getByText(/AS-2026-/)).first()).toBeVisible();
  await page.goto("/portal/audit");
  await expect(page.getByText("submitted by the partner").first()).toBeVisible();
});

test("partner staff see only what their permissions allow", async ({ page }) => {
  await signIn(page, PARTNER_STAFF, /\/partner$/);
  await page.goto("/partner/beneficiaries");
  await expect(page.getByText("You do not have permission for this")).toBeVisible();
  await page.goto("/partner/profile");
  await expect(page.getByText("Only your partner administrator can edit the organisation profile.")).toBeVisible();
});

test("a suspended partner sees the reason and cannot submit proposals", async ({ page }) => {
  await signIn(page, SUSPENDED, /\/partner$/);
  await page.goto("/partner/accreditation");
  await expect(page.getByText("Accreditation suspended").first()).toBeVisible();
  await expect(page.getByText(/Reason:\s*Audited financial statement overdue\./)).toBeVisible();
  await page.goto("/partner/proposals");
  await expect(page.getByText("Proposals are paused while accreditation is suspended")).toBeVisible();
});

test("axe: partner screens", async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page, PARTNER_ADMIN, /\/partner$/);
  const pages = [
    "/partner",
    "/partner/profile",
    "/partner/accreditation",
    "/partner/documents",
    "/partner/documents/doc-p-uchi-1",
    "/partner/agreements",
    "/partner/proposals",
    "/partner/proposals/new",
    "/partner/interventions",
    "/partner/field-reports",
    "/partner/surveys",
    "/partner/beneficiaries",
    "/partner/finance",
    "/partner/reports",
    "/partner/messages",
    "/partner/team",
  ];
  const problems: string[] = [];
  for (const path of pages) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    problems.push(...results.violations.map((v) => `${path} ${v.id}: ${v.help} → ${v.nodes[0]?.target.join(" ")}`));
  }
  expect(problems).toEqual([]);
});
