// Representative adaptive-session journeys (docs/02): quick mastery (Straight Lines, reviewer preview),
// a misconception-driven detour and the return to the original question (Laws of Motion), and a
// foundation failure → Stuck → pause → exact resume (Motion in a Plane). The test reads which question
// is on screen from the browser's own IndexedDB and answers it through the ordinary, non-drag controls.
import { expect, test } from "@playwright/test";
import { entryById } from "@/src/content/catalog";
import { answerCurrent, instOf, onScreen, startSession } from "./helpers";

test.describe("adaptive sessions", () => {
  test("Journey 1 · quick mastery of Straight Lines in reviewer preview, with successors on the map", async ({ page }) => {
    await startSession(page, "/chapter/sl/try?preview=review", "12");
    await expect(page.getByTestId("preview-banner")).toBeVisible();
    const first = await onScreen(page);
    expect(first.skillId).toBe("sl.forms");
    expect(entryById.get(first.templateId!)!.template.difficulty).toBe("medium");
    const skills = new Set<string>();
    for (let q = 1; q <= 10; q++) {
      await expect(page.getByTestId("role-label")).toContainText(`Main question ${q}`);
      if (q === 2) await expect(page.getByTestId("role-label")).toContainText("hard");
      skills.add((await answerCurrent(page, "right")).skillId!);
    }
    expect(skills.size).toBe(5);
    await expect(page.getByTestId("summary")).toHaveAttribute("data-result", "mastered");
    await expect(page.getByTestId("preview-note")).toBeVisible();
    await expect(page.getByTestId("successors")).toContainText("Conic Sections");
    await expect(page.getByTestId("successors").locator("[data-label=Recommended]")).toContainText("Conic Sections");
    await page.getByTestId("summary-map").click();
    await expect(page.getByTestId("node-sl")).toHaveAttribute("data-state", "mastered");
    await expect(page.getByTestId("mastered-total")).toHaveText("1");
    // preview results are never shown as mastery once preview is off
    await page.getByTestId("preview-off").click();
    await expect(page.getByTestId("node-sl")).not.toHaveAttribute("data-state", "mastered");
    await expect(page.getByTestId("mastered-total")).toHaveText("0");
  });

  test("Journey 2 · a misconception-driven detour, exact resume mid-detour, and the return to the original question", async ({ page }) => {
    await startSession(page, "/chapter/lom/try", "11");
    // answer correctly until the session reaches resolving forces at hard (deterministic selection order)
    for (let guard = 0; guard < 8; guard++) {
      const o = await onScreen(page);
      if (o.skillId === "lom.resolve-forces") break;
      await answerCurrent(page, "right");
    }
    const q = await onScreen(page);
    expect(q).toMatchObject({ role: "main", skillId: "lom.resolve-forces" });
    await answerCurrent(page, "exhaust");
    // easy diagnostic on the same skill, answered with a recognised misconception
    expect(await onScreen(page)).toMatchObject({ role: "diagnostic", skillId: "lom.resolve-forces" });
    await answerCurrent(page, "exhaust");
    // the evidence implicates resolving vectors (Motion in a Plane, Class 11): probe, then detour
    expect(await onScreen(page)).toMatchObject({ role: "probe", skillId: "mip.resolution" });
    await answerCurrent(page, "exhaust");
    await expect(page.getByTestId("detour-intro")).toBeVisible();
    await expect(page.getByTestId("paused-card")).toContainText("Resolving forces");
    await expect(page.getByTestId("detour-path")).toBeVisible();
    await expect(page.getByTestId("crumbs")).toContainText("Paused");
    await page.getByTestId("detour-start").click();
    await expect(page.getByTestId("role-label")).toContainText("Detour practice");
    // quit mid-detour and come back: the same frame, question and seed
    const before = await onScreen(page);
    await page.reload();
    await expect(page.getByTestId("role-label")).toContainText("Detour practice");
    expect(await onScreen(page)).toMatchObject({ templateId: before.templateId, seed: before.seed, frames: 2 });
    await expect(page.getByTestId("crumbs")).toContainText("Resolving forces");
    for (let i = 0; i < 3; i++) await answerCurrent(page, "right");
    // back through the worked explanation, then a fresh variant of the same question
    await expect(page.getByTestId("worked")).toHaveAttribute("data-reason", "return");
    await page.getByTestId("worked-next").click();
    await page.getByTestId("worked-continue").click();
    const ret = await onScreen(page);
    expect(ret).toMatchObject({ role: "return", templateId: q.templateId, frames: 1 });
    expect(ret.seed).not.toBe(q.seed);
    await expect(page.getByTestId("role-label")).toContainText("Back to the paused question");
    await answerCurrent(page, "right");
    const next = await onScreen(page);
    expect(next.role).toBe("main");
    expect(entryById.get(next.templateId!)!.template.difficulty).toBe("medium");
    expect(next.mains).toBe(q.mains + 1); // remediation and return questions never count as main questions
  });

  test("Journey 3 · foundation failure, Stuck, pause, Continue from the map, recap and return", async ({ page }) => {
    await startSession(page, "/chapter/mip/try", "11");
    // the opener is the most central skill with medium content; answer correctly until resolving vectors appears
    for (let guard = 0; guard < 6 && (await onScreen(page)).skillId !== "mip.resolution"; guard++) await answerCurrent(page, "right");
    const q2 = await onScreen(page);
    expect(q2).toMatchObject({ role: "main", skillId: "mip.resolution" });
    await answerCurrent(page, "exhaust");
    expect(await onScreen(page)).toMatchObject({ role: "diagnostic", skillId: "mip.resolution" });
    await answerCurrent(page, "exhaust");
    expect(await onScreen(page)).toMatchObject({ role: "probe", skillId: "f.trig-ratios" });
    await answerCurrent(page, "exhaust");
    await expect(page.getByTestId("detour-intro")).toContainText("foundation lesson");
    await page.getByTestId("detour-start").click();
    await expect(page.getByTestId("lesson")).toHaveAttribute("data-variant", "main");
    await expect(page.getByTestId("triangle-explorer")).toBeVisible();
    await page.getByTestId("lesson-next").click();
    await page.getByTestId("te-mark-B").click(); // the live widget: θ moves to B and the labels swap
    await expect(page.getByTestId("stage-description")).toContainText("Adjacent to θ: BC");
    for (let i = 0; i < 4; i++) await page.getByTestId("lesson-next").click();
    await page.getByTestId("lesson-done").click();
    await answerCurrent(page, "exhaust");
    await answerCurrent(page, "exhaust");
    await expect(page.getByTestId("lesson")).toHaveAttribute("data-variant", "alternate");
    for (let i = 0; i < 3; i++) await page.getByTestId("lesson-next").click();
    await page.getByTestId("lesson-done").click();
    await answerCurrent(page, "exhaust");
    await answerCurrent(page, "exhaust");
    await expect(page.getByTestId("stuck")).toContainText("Trigonometric ratios in a right triangle");
    await page.getByTestId("stuck-pause").click();
    // the dashboard's Continue card names the exact place
    await expect(page.getByTestId("continue-card")).toContainText("Paused");
    await expect(page.getByTestId("continue-card")).toContainText("Trigonometric ratios");
    await page.getByTestId("continue-session").click();
    await expect(page.getByTestId("lesson")).toHaveAttribute("data-variant", "recap");
    await page.getByTestId("lesson-done").click();
    await answerCurrent(page, "right");
    await answerCurrent(page, "right");
    await expect(page.getByTestId("worked")).toHaveAttribute("data-reason", "return");
    await page.getByTestId("worked-continue").click();
    const ret = await onScreen(page);
    expect(ret).toMatchObject({ role: "return", templateId: q2.templateId, frames: 1 });
    await answerCurrent(page, "right");
    expect((await onScreen(page)).role).toBe("main");
  });

  test("invalid input never uses a try inside a session, and the class is never used to route forward", async ({ page }) => {
    await startSession(page, "/chapter/cur/try", "11");
    const o = await onScreen(page);
    const inst = instOf(o);
    if (inst.format === "quantity") {
      await page.getByTestId("answer-input").fill("3");
      await page.getByTestId("check").click();
      await expect(page.getByTestId("notice")).toContainText("doesn't use up a try");
      await expect(page.getByTestId("tries")).toContainText("3 tries left");
    }
    await answerCurrent(page, "exhaust");
    // no remediation content exists for these Class 12 prerequisites: a worked solution, never a forward detour
    const after = await onScreen(page);
    expect(after.frames).toBe(1);
  });
});
