// Phase 5 tutor on a phone: a bottom sheet that never hides the visual, the answer or Check for good.
import { expect, test } from "@playwright/test";
import { entryById, playerChapterFor } from "@/src/content/catalog";

const GRAPH = "lim.derivative-rules.m.power-rule-tangent";
const url = (id: string) => `/chapter/${playerChapterFor(entryById.get(id)!.template)}/try?q=${id}&seed=7`;

test("the tutor sheet keeps the visual, the answer and Check reachable, and can be minimised", async ({ page }) => {
  await page.goto(url(GRAPH));
  await page.getByTestId("tutor-toggle").click();
  const sheet = page.getByTestId("tutor-panel");
  await expect(sheet).toBeVisible();
  await expect(page.locator(".qmain")).toHaveAttribute("data-tutor", "sheet");

  // a demonstration scrolls the visual into view above the sheet
  await page.getByTestId("tutor-guide").click();
  await expect(page.locator("[data-banner=demo]")).toBeVisible();
  await page.waitForTimeout(600);
  const stage = (await page.getByTestId("stage").boundingBox())!;
  const top = (await sheet.boundingBox())!.y;
  expect(stage.y).toBeGreaterThanOrEqual(-1);
  expect(stage.y + stage.height * 0.6).toBeLessThan(top);

  // every control stays reachable: brought into view (as keyboard focus does), it is the element under its centre
  for (const id of ["answer-input", "check"]) {
    const el = page.getByTestId(id).first();
    if (!(await el.count())) continue;
    await el.evaluate((e) => e.scrollIntoView({ block: "nearest" })); // what keyboard focus does
    await page.waitForTimeout(100);
    const b = (await el.boundingBox())!;
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x!, y!)?.closest("[data-testid]")?.getAttribute("data-testid"), [b.x + b.width / 2, b.y + b.height / 2]);
    expect(hit, id).toBe(id);
  }

  await page.getByTestId("tutor-sheet-toggle").click();
  await expect(page.getByTestId("tutor-log")).toHaveCount(0);
  expect((await sheet.boundingBox())!.height).toBeLessThan(140);
  await page.getByTestId("tutor-sheet-toggle").click();
  await expect(page.getByTestId("tutor-log")).toBeVisible();
});
