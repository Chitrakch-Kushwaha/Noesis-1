import { expect, test } from "@playwright/test";

test.describe("phone layout", () => {
  test("no horizontal overflow; tabs, search and canvas fit; progress panel collapses", async ({ page }) => {
    await page.goto("/map");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await expect(page.getByRole("tab", { name: "Class 11 Physics" })).toBeVisible();
    await expect(page.getByTestId("search")).toBeVisible();
    const peek = page.getByRole("button", { name: /Progress ·/ });
    await expect(peek).toBeVisible();
    await expect(peek).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#progress-panel-body")).toHaveAttribute("inert", "");
    await peek.click();
    await expect(peek).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByRole("heading", { name: "Questions attempted" })).toBeInViewport();
    await peek.click();
    await expect(page.getByTestId("legend")).toContainText("Show legend"); // collapsed by default on phones
  });

  test("tapping a chapter opens the preview as a bottom sheet with Try a question", async ({ page }) => {
    await page.goto("/map");
    await page.getByTestId("node-kin").tap();
    const sheet = page.getByTestId("chapter-preview");
    await expect(sheet).toBeVisible();
    const box = (await sheet.boundingBox())!;
    const vh = page.viewportSize()!.height;
    expect(Math.round(box.y + box.height)).toBeGreaterThanOrEqual(vh - 2);
    await expect(sheet.getByTestId("try-question")).toBeVisible();
  });

  test("question screen stacks the visual above the prompt", async ({ page }) => {
    await page.goto("/chapter/vec/try");
    await page.getByTestId("class-skip").click();
    const stage = (await page.locator(".qstage").boundingBox())!;
    const prompt = (await page.locator(".qprompt").boundingBox())!;
    expect(prompt.y).toBeGreaterThan(stage.y + stage.height - 2);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  for (const id of ["lom.fbd.m.box-pulled-by-rope", "lom.second-law.m.rank-accelerations", "set.intervals.m.union-from-inequality", "lom.connected-bodies.m.who-exerts-each-force"]) {
    test(`lesson player on a phone: ${id}`, async ({ page }) => {
      await page.goto(`/chapter/${id.split(".")[0]}/try?q=${id}&seed=7`);
      const stage = (await page.locator(".qstage").boundingBox())!;
      const prompt = (await page.locator(".qprompt").boundingBox())!;
      expect(prompt.y).toBeGreaterThan(stage.y + stage.height - 2); // visual above the question
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      await expect(page.getByTestId("transport")).toBeVisible();
      const small = await page.locator(".qshell button:visible, .qshell select:visible").evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().height < 32).map((e) => e.textContent));
      expect(small).toEqual([]);
    });
  }
});
