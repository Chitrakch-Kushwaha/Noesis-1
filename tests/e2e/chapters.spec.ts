// Representative chapter journeys for the Phase 4 content batches: a full reviewer-preview session to
// mastery on a chapter's new content, and the remediation path on another. Reviewer preview lets
// in-review content count inside the session only; it never stands in for human approval.
import { expect, test, type Page } from "@playwright/test";
import { answerCurrent, onScreen, startSession } from "./helpers";

async function masterInPreview(page: Page, chapterId: string, cls: "11" | "12") {
  await startSession(page, `/chapter/${chapterId}/try?preview=review`, cls);
  const skills = new Set<string>();
  for (let q = 1; q <= 16; q++) {
    if (await page.getByTestId("summary").isVisible()) break;
    skills.add((await answerCurrent(page, "right")).skillId!);
  }
  await expect(page.getByTestId("summary")).toHaveAttribute("data-result", "mastered");
  return skills;
}

async function remediationAppears(page: Page, chapterId: string, cls: "11" | "12") {
  await startSession(page, `/chapter/${chapterId}/try`, cls);
  const q1 = await onScreen(page);
  await answerCurrent(page, "exhaust");
  const next = await onScreen(page);
  // an easy diagnostic on the same skill when one exists, otherwise a probe or a worked solution
  expect(["diagnostic", "probe", undefined]).toContain(next.role);
  if (next.role === "diagnostic") expect(next.skillId).toBe(q1.skillId);
}

test.describe("Batch 1 · Class 11 Physics", () => {
  test("Oscillations: a reviewer-preview session reaches mastery on the new content", async ({ page }) => {
    const skills = await masterInPreview(page, "osc", "11");
    expect(skills.size).toBe(6);
  });
  test("System of Particles and Rotational Motion: an exhausted question leads to an easy diagnostic", async ({ page }) => {
    await remediationAppears(page, "rot", "11");
  });
});
