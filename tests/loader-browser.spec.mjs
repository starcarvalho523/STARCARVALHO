import { test, expect } from "playwright/test";
const overlay = page => page.locator(".star-loader-overlay");
test.beforeEach(async ({ page }) => {
  await page.goto("/loader-verification");
  await expect(page.getByRole("heading", { name: "Loader verification" })).toBeVisible();
});
test("slow RSC navigation holds old page, frosted backdrop and focus until final commit", async ({ page }, info) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.getByText("Slow navigation", { exact: true }).click();
  await expect(overlay(page)).toBeVisible();
  await expect(page.getByTestId("period")).toHaveText("today");
  await expect(page.locator("body")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  const blur = await page.locator(".star-loader-backdrop").evaluate(el => getComputedStyle(el).backdropFilter);
  expect(blur).toContain("blur(14px)");
  await page.screenshot({ path: "test-results/loader-" + info.project.name + ".png" });
  await expect(overlay(page)).toBeHidden();
  await expect(page.getByTestId("period")).toHaveText("7");
  await expect(page.locator("main")).not.toHaveAttribute("inert");
  expect(errors).toEqual([]);
});
test("fast routes still have a perceptible minimum", async ({ page }) => {
  const start = Date.now();
  await page.getByText("Fast navigation", { exact: true }).click();
  await expect(overlay(page)).toBeVisible();
  await expect(overlay(page)).toBeHidden();
  expect(Date.now() - start).toBeGreaterThanOrEqual(900);
  await expect(page.getByTestId("period")).toHaveText("30");
});
test("all period filters finish with the final server data", async ({ page }) => {
  for (const period of ["7","30","90","180","365","all","today"]) {
    await page.getByLabel("Period", { exact: true }).selectOption(period);
    await expect(overlay(page)).toBeVisible();
    await expect(overlay(page)).toBeHidden();
    await expect(page.getByTestId("period")).toHaveText(period);
  }
});
test("server action and GET form wait for their refreshed result", async ({ page }) => {
  await page.getByRole("button", { name: "Save and refresh" }).click();
  await expect(overlay(page)).toBeVisible();
  await expect(overlay(page)).toBeHidden();
  await expect(page.getByTestId("revision")).toHaveText("1");
  await page.getByRole("button", { name: "GET filter" }).click();
  await expect(overlay(page)).toBeVisible();
  await expect(overlay(page)).toBeHidden();
  await expect(page.getByTestId("period")).toHaveText("all");
});
test("overlapping client data and failures commit before reveal; background is ignored", async ({ page }) => {
  await page.route("**/loader-data-a", async route => {
    await new Promise(resolve => setTimeout(resolve, 500));
    await route.fulfill({ json: { value: "first" } });
  });
  await page.route("**/loader-data-b", async route => {
    await new Promise(resolve => setTimeout(resolve, 2200));
    await route.fulfill({ json: { value: "second" } });
  });
  await page.getByRole("button", { name: "Load overlapping data" }).click();
  await expect(overlay(page)).toBeVisible();
  await expect(overlay(page)).toBeHidden();
  await expect(page.getByTestId("result")).toHaveText("firstsecond");
  await page.route("**/loader-data-b", route => route.abort());
  await page.getByRole("button", { name: "Load overlapping data" }).click();
  await expect(overlay(page)).toBeVisible();
  await expect(overlay(page)).toBeHidden();
  await expect(page.getByTestId("result")).toHaveText("visible error");
  await page.route("**/loader-background", async route => {
    await new Promise(resolve => setTimeout(resolve, 1000));
    await route.fulfill({ json: {} });
  });
  await page.getByRole("button", { name: "Background request" }).click();
  await expect(overlay(page)).toHaveCount(0);
});
test("reduced motion suppresses decorative animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByText("Slow navigation", { exact: true }).click();
  await expect(overlay(page)).toBeVisible();
  const animation = await page.locator(".star-loader-logo-wrap").evaluate(el => getComputedStyle(el).animationName);
  expect(animation).toBe("none");
  await expect(overlay(page)).toBeHidden();
});
