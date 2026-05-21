import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";

const scenarioUrl = pathToFileURL(
  path.join(__dirname, "../scenarios/mobile-sidebar.html"),
).toString();

test.beforeEach(async ({ page }) => {
  await page.goto(scenarioUrl);
});

test("mobile dashboard controls stay inside the sidebar viewport", async ({ page }) => {
  const sidebar = page.locator("[data-qa='fixture-root']");
  const overflow = await sidebar.evaluate((root) => {
    const rootBox = root.getBoundingClientRect();
    return Array.from(root.querySelectorAll<HTMLElement>("button, article, section, nav"))
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.left < rootBox.left - 1 || box.right > rootBox.right + 1;
      })
      .map((el) => ({
        className: el.className,
        text: el.textContent?.trim(),
      }));
  });

  expect(overflow).toEqual([]);
  await expect(sidebar).toHaveScreenshot("kb-manager-mobile-dashboard.png");
});

test("mobile review controls fit without horizontal overflow", async ({ page }) => {
  const review = page.locator("[data-qa='kb-review']");
  const overflow = await review.evaluate((root) => {
    const rootBox = root.getBoundingClientRect();
    return Array.from(root.querySelectorAll<HTMLElement>("button, .kb-cleanup-row, .kb-cleanup-actions"))
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.left < rootBox.left - 1 || box.right > rootBox.right + 1;
      })
      .map((el) => el.textContent?.trim());
  });

  expect(overflow).toEqual([]);
  await expect(review).toHaveScreenshot("kb-manager-mobile-review.png");
});

test("mobile sidebar has no serious accessibility violations", async ({ page }) => {
  const results = await new AxeBuilder({ page })
    .include("[data-qa='fixture-root']")
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();

  const serious = results.violations.filter((violation) =>
    violation.impact === "serious" || violation.impact === "critical",
  );
  expect(serious).toEqual([]);
});
