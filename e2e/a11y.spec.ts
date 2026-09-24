import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const publicPages = ["/", "/sign-in", "/forgot-password", "/forgot-password/requested", "/reset-password", "/about", "/privacy", "/accessibility"];
const portalPages = [
  "/portal",
  "/portal/partners/p-kcha",
  "/portal/interventions",
  "/portal/exceptions/ex-0311",
  "/portal/cases/sc-1184",
  "/portal/reports/nr-2026-q3",
  "/portal/audit",
  "/portal/analytics",
  "/portal/gis",
];

async function scan(page: import("@playwright/test").Page) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
  return results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length}) → ${v.nodes[0]?.target.join(" ")}`);
}

for (const path of publicPages) {
  test(`axe: ${path}`, async ({ page }) => {
    await page.goto(path);
    expect(await scan(page)).toEqual([]);
  });
}

test("axe: portal screens", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email or assigned username").fill("coordinator.demo");
  await page.getByLabel("Password", { exact: true }).fill("Demo-Coordinator-2026");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/portal$/);
  const problems: string[] = [];
  for (const path of portalPages) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    problems.push(...(await scan(page)).map((v) => `${path} ${v}`));
  }
  expect(problems).toEqual([]);
});
