import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { CATALOG, entryById, playerChapterFor } from "@/src/content/catalog";
import { instantiate, type QuestionInstance } from "@/src/content/instantiate";
import { check } from "@/src/checking/check";
import type { CheckInput, DiagramForce } from "@/src/checking/types";

const SEED = 7;
const q = (id: string, seed = SEED) => instantiate(entryById.get(id)!.template, seed);
const url = (id: string, seed = SEED) => `/chapter/${playerChapterFor(entryById.get(id)!.template)}/try?q=${id}&seed=${seed}`;
/** Development or review language must never reach a learner. */
const DEV_LANGUAGE = /phase \d|later phase|awaiting|content review|in-review|not yet reviewed|\bdraft\b|lorem|todo/i;

async function open(page: Page, id: string, seed = SEED) {
  await page.goto(url(id, seed));
  await expect(page.getByTestId("stage")).toBeVisible();
  // each template's own intro (the Phase 2 diagnostics all use the placement intro)
  await expect(page.getByTestId("intro")).toHaveText(q(id, seed).intro);
}

/** Enter an answer through the ordinary (non-drag) controls for its format. */
async function enter(page: Page, inst: QuestionInstance, input: CheckInput) {
  switch (inst.format) {
    case "single-choice": await page.locator(`[data-testid=choices] input[value="${input as string}"]`).check(); return;
    case "multi-choice":
      for (const box of await page.locator("[data-testid=choices] input").all()) {
        const v = await box.getAttribute("value");
        if ((input as string[]).includes(v!)) await box.check(); else await box.uncheck();
      }
      return;
    case "ordering": {
      const want = input as string[];
      for (let i = 0; i < want.length; i++) {
        for (let guard = 0; guard < 6; guard++) {
          const items = await page.locator(".order-item").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.slice(6)));
          const at = items.indexOf(want[i]!);
          if (at <= i) break;
          await page.getByTestId(`order-${want[i]}`).getByRole("button", { name: /up$/ }).click();
        }
      }
      return;
    }
    case "mapping":
      for (const [item, target] of Object.entries(input as Record<string, string>)) await page.getByTestId(`map-select-${item}`).selectOption(target);
      return;
    case "diagram": {
      const forces = input as DiagramForce[];
      for (let i = 0; i < forces.length; i++) {
        const f = forces[i]!;
        await page.getByTestId("vb-add-kind").selectOption(f.kind);
        await page.getByTestId("vb-add-agent").selectOption(f.agent);
        await page.getByTestId("vb-add").click();
        const id = `v${i + 1}`;
        await page.getByTestId(`vb-mag-${id}`).fill(String(Math.round(f.magnitude * 100) / 100));
        await page.getByTestId(`vb-ang-${id}`).fill(String(f.angleDeg));
      }
      return;
    }
    default: await page.getByTestId("answer-input").fill(input as string);
  }
}

test.describe("every question renders and accepts its answer through non-drag controls", () => {
  for (const e of CATALOG) {
    test(`${e.template.id}`, async ({ page }) => {
      const inst = q(e.template.id);
      await open(page, e.template.id);
      const text = await page.locator("main").innerText();
      expect(text).not.toMatch(DEV_LANGUAGE);
      expect(text).not.toMatch(/\{\{|NaN|undefined/);
      await expect(page.getByTestId("transport")).toBeVisible();
      await expect(page.getByTestId("stage-description")).not.toBeEmpty();
      const answer = inst.selfTest.correct[0]!;
      expect(check(inst.check, answer).status).toBe("correct");
      await enter(page, inst, answer);
      await page.getByTestId("check").click();
      await expect(page.getByTestId("feedback-correct")).toBeVisible();
      await expect(page.getByTestId("saved")).toContainText("Saved to this device");
      expect(await page.locator("main").innerText()).not.toMatch(DEV_LANGUAGE);
    });
  }
});

test.describe("checking rules in the player", () => {
  test("missing units and unparseable input don't use a try; a wrong method gets its misconception feedback and a consequence", async ({ page }) => {
    const id = "kin.acceleration.m.vt-area";
    const inst = q(id);
    await open(page, id);
    await page.getByTestId("answer-input").fill("40");
    await page.getByTestId("check").click();
    await expect(page.getByTestId("notice")).toContainText("doesn't use up a try");
    await expect(page.getByTestId("tries")).toContainText("3 tries left");
    await page.getByTestId("answer-input").fill("((3 m");
    await page.getByTestId("check").click();
    await expect(page.getByTestId("notice")).toBeVisible();
    await expect(page.getByTestId("tries")).toContainText("3 tries left");
    const wrong = inst.selfTest.buggy.find((b) => b.tags.includes("area-uses-final-velocity"))!;
    await page.getByTestId("answer-input").fill(wrong.input as string);
    await page.getByTestId("check").click();
    await expect(page.getByTestId("feedback-incorrect")).toHaveAttribute("data-tag", "area-uses-final-velocity");
    await expect(page.getByTestId("tries")).toContainText("2 tries left");
    await expect(page.getByTestId("stage-banner")).toContainText("What your answer would mean");
    await expect(page.getByTestId("gp-region-over")).toBeVisible();
    // the visual never reveals the answer before it is solved
    await expect(page.getByTestId("stage-description")).not.toContainText(String(inst.check.kind === "quantity" ? inst.check.value : "x"));
    await page.getByTestId("back-to-mine").click();
    await expect(page.getByTestId("gp-region-over")).toHaveCount(0);
    // wrong dimension is tagged and uses a try
    await page.getByTestId("answer-input").fill("40 s");
    await page.getByTestId("check").click();
    await expect(page.getByTestId("feedback-incorrect")).toHaveAttribute("data-tag", "dimension-mismatch");
    await expect(page.getByTestId("tries")).toContainText("1 try left");
  });

  test("checking runs in a worker", async ({ page }) => {
    const workers: string[] = [];
    page.on("worker", (w) => workers.push(w.url()));
    await open(page, "lim.derivative-rules.m.power-rule-tangent");
    await page.getByTestId("answer-input").fill("x");
    await page.getByTestId("check").click();
    await expect(page.getByTestId("feedback-incorrect")).toBeVisible();
    expect(workers.length).toBeGreaterThan(0);
  });

  test("equivalent forms are accepted: an equation of a line in another form", async ({ page }) => {
    const id = "sl.forms.m.line-through-two-points";
    const inst = q(id);
    await open(page, id);
    const m = Number(inst.params.m), c = Number(inst.params.y1) - m * Number(inst.params.x1);
    await page.getByTestId("answer-input").fill(`2y - ${2 * m}x = ${2 * c}`);
    await expect(page.getByTestId("answer-preview")).toBeVisible();
    await page.getByTestId("check").click();
    await expect(page.getByTestId("feedback-correct")).toBeVisible();
  });
});

test.describe("hints, misconception feedback and solutions drive the live visual", () => {
  test("three progressive hints, then the worked and alternative solutions step through the same visual", async ({ page }) => {
    const id = "lom.friction.h.incline-will-it-slide";
    await open(page, id);
    for (let i = 0; i < 3; i++) await page.getByTestId("hint").click();
    await expect(page.getByTestId("hints").locator(".hint")).toHaveCount(3);
    await expect(page.getByTestId("hint")).toBeDisabled();
    await expect(page.getByTestId("vb-components-W")).toBeVisible(); // hint 2 decomposed the weight
    await expect(page.getByTestId("vb-components-W")).toContainText("sin θ"); // symbolically, not the answer
    await page.getByTestId("give-up").click();
    await expect(page.getByTestId("feedback-exhausted")).toBeVisible();
    await page.getByTestId("solution-open").click();
    await expect(page.getByTestId("stage-banner")).toContainText("step 1 of 4");
    const d1 = await page.getByTestId("stage-description").innerText();
    await page.getByTestId("sol-next").click();
    await expect(page.getByTestId("stage-description")).toContainText("Normal");
    expect(await page.getByTestId("stage-description").innerText()).not.toBe(d1);
    await page.getByTestId("sol-next").click();
    await expect(page.getByTestId("stage-description")).toContainText("Friction");
    await page.getByTestId("sol-prev").click();
    await expect(page.getByTestId("stage-description")).not.toContainText("Friction");
    await page.getByTestId("back-to-mine").click();
    await expect(page.getByTestId("stage-banner")).toHaveCount(0);
  });

  test("a wrong free-body diagram plays its predicted motion against the real motion", async ({ page }) => {
    const id = "lom.fbd.m.box-pulled-by-rope";
    const inst = q(id);
    await open(page, id);
    const full = inst.selfTest.correct[0] as DiagramForce[];
    await enter(page, inst, full.filter((f) => f.kind !== "normal")); // omit the normal force
    await page.getByTestId("check").click();
    await expect(page.getByTestId("feedback-incorrect")).toHaveAttribute("data-tag", "missing-normal");
    await expect(page.getByTestId("vb-compare")).toBeVisible();
    await expect(page.getByTestId("vb-resultant")).toBeVisible();
    await expect(page.getByTestId("stage-description")).toContainText(/net|Resultant/i);
    // the student's diagram is kept, so it can be corrected
    await expect(page.getByTestId("vb-row-v1")).toBeVisible();
  });

  test("a misconception option on a choice question plays its consequence", async ({ page }) => {
    await open(page, "lom.first-law.m.after-the-push");
    await page.locator('[data-testid=choices] input[value="c"]').check();
    await page.getByTestId("check").click();
    await expect(page.getByTestId("feedback-incorrect")).toHaveAttribute("data-tag", "extra-force-of-motion");
    await expect(page.getByTestId("vb-compare")).toBeVisible();
  });
});

test.describe("consequences play out the student's own answer, never the correct one", () => {
  test("braking: the car stops at the student's distance, with the deceleration that would need", async ({ page }) => {
    const id = "kin.suvat.m.braking-distance";
    const inst = q(id);
    const correct = inst.check.kind === "quantity" ? inst.check.value : 0;
    await open(page, id);
    const wrong = inst.selfTest.buggy.find((b) => b.tags.includes("missing-half"))!;
    await page.getByTestId("answer-input").fill(wrong.input as string);
    await page.getByTestId("check").click();
    await expect(page.getByTestId("stage-description")).toContainText(`To stop at ${Number((correct * 2).toPrecision(3))} m`);
    await expect(page.getByTestId("stage-description")).not.toContainText(`${correct} m`);
  });
  test("projectile: the launch speed the student's range would need", async ({ page }) => {
    const id = "mip.projectile.m.range";
    const inst = q(id);
    await open(page, id);
    await page.getByTestId("answer-input").fill(inst.selfTest.buggy[0]!.input as string);
    await page.getByTestId("check").click();
    await expect(page.getByTestId("stage-description")).toContainText("To land");
  });
  test("derivative: the student's f′ drawn as a tangent at P", async ({ page }) => {
    await open(page, "lim.derivative-rules.m.power-rule-tangent");
    await page.getByTestId("answer-input").fill("x^2");
    await page.getByTestId("check").click();
    await expect(page.getByTestId("gp-curve-student-tangent")).toBeVisible();
    await expect(page.getByTestId("gp-curve-student")).toBeVisible();
  });
  test("after the last try, the correct state is shown next to the student's", async ({ page }) => {
    const id = "lom.fbd.m.box-pulled-by-rope";
    const inst = q(id);
    await open(page, id);
    const full = inst.selfTest.correct[0] as DiagramForce[];
    await enter(page, inst, full.slice(0, 2));
    for (let i = 0; i < 3; i++) { await page.getByTestId("check").click(); await expect(page.getByTestId("tries")).toHaveCount(i < 2 ? 1 : 0); }
    await expect(page.getByTestId("stage-banner")).toContainText("The correct answer");
    await expect(page.getByTestId("vb-compare")).toBeVisible();
  });
});

test.describe("transport: deterministic pause, step, scrub, replay and reset", () => {
  test("braking car", async ({ page }) => {
    await open(page, "kin.suvat.m.braking-distance");
    const time = page.getByTestId("tr-time");
    await page.getByTestId("tr-forward").click();
    const t1 = await time.innerText();
    const d1 = await page.getByTestId("stage-description").innerText();
    await page.getByTestId("tr-forward").click();
    await page.getByTestId("tr-back").click();
    await expect(time).toHaveText(t1);
    await expect(page.getByTestId("stage-description")).toHaveText(d1); // same time, same state
    await page.getByTestId("tr-play").click();
    await page.waitForTimeout(300);
    await page.getByTestId("tr-play").click(); // pause
    const paused = await time.innerText();
    await page.waitForTimeout(300);
    await expect(time).toHaveText(paused);
    await page.getByTestId("tr-scrub").fill("0");
    await expect(time).toContainText("0.00 s /");
    await page.getByTestId("tr-replay").click();
    await expect(page.getByTestId("tr-play")).toHaveText("Pause");
    await page.getByTestId("tr-reset").click();
    await expect(time).toContainText("0.00 s /");
  });
});

test.describe("keyboard and pointer routes give the same answer", () => {
  test("number line: keyboard endpoints and typed text stay in sync", async ({ page }) => {
    await open(page, "set.intervals.m.inequality-to-interval");
    await expect(page.getByTestId("answer-input")).toHaveValue("");
    const h = page.getByTestId("nl-handle-0-hi");
    await h.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByTestId("answer-input")).toHaveValue("[−9, −7]");
    await page.keyboard.press("Enter"); // toggle included
    await expect(page.getByTestId("answer-input")).toHaveValue("[−9, −7)");
    await page.getByTestId("answer-input").fill("(-2, 5]");
    await expect(page.getByTestId("nl-input-0-lo")).toHaveValue("-2");
    await expect(page.getByTestId("nl-closed-0-lo")).not.toBeChecked();
  });

  test("number line: dragging an endpoint moves it", async ({ page }) => {
    await open(page, "set.intervals.m.inequality-to-interval");
    const h = page.getByTestId("nl-handle-0-hi");
    const b = (await h.boundingBox())!;
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 120, b.y + b.height / 2, { steps: 8 });
    await page.mouse.up();
    expect(Number(await page.getByTestId("nl-input-0-hi").inputValue())).toBeGreaterThan(-8);
  });

  test("an endpoint mistake is rung on the number line", async ({ page }) => {
    const id = "set.intervals.m.inequality-to-interval";
    const inst = q(id);
    await open(page, id);
    const wrong = inst.selfTest.buggy.find((b) => b.tags.includes("open-closed-confusion"))!;
    await page.getByTestId("answer-input").fill(wrong.input as string);
    await page.getByTestId("check").click();
    await expect(page.getByTestId("feedback-incorrect")).toHaveAttribute("data-tag", "open-closed-confusion");
    await expect(page.getByTestId("nl-endpoint-highlight")).toBeVisible();
  });

  test("vector tip: arrow keys and dragging both change the force", async ({ page }) => {
    const id = "lom.fbd.m.box-pulled-by-rope";
    await open(page, id);
    await page.getByTestId("vb-add-kind").selectOption("tension");
    await page.getByTestId("vb-add-agent").selectOption("rope");
    await page.getByTestId("vb-add").click();
    const h = page.getByTestId("vb-handle-v1");
    const before = Number(await h.getAttribute("aria-valuenow"));
    await h.focus();
    await page.keyboard.press("ArrowUp");
    await expect.poll(async () => Number(await h.getAttribute("aria-valuenow"))).toBeGreaterThan(before);
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByTestId("vb-ang-v1")).not.toHaveValue("0");
    const b = (await h.boundingBox())!;
    const mag = Number(await page.getByTestId("vb-mag-v1").inputValue());
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
    await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2 + 60, b.y + b.height / 2 + 10, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => Number(await page.getByTestId("vb-mag-v1").inputValue())).not.toBe(mag);
  });

  test("ordering: keyboard, buttons and pointer drag", async ({ page }) => {
    const id = "lom.second-law.m.rank-accelerations";
    await open(page, id);
    const ids = () => page.locator(".order-item").evaluateAll((els) => els.map((e) => e.getAttribute("data-testid")!.slice(6)));
    const start = await ids();
    await page.getByTestId(`order-${start[1]}`).getByRole("button", { name: /up$/ }).click();
    expect((await ids())[0]).toBe(start[1]);
    await page.getByTestId(`order-${start[1]}`).getByRole("button", { name: /down$/ }).focus();
    await page.keyboard.press("Alt+ArrowDown");
    expect((await ids())[1]).toBe(start[1]);
    const from = (await page.getByTestId(`order-handle-${start[3]}`).boundingBox())!;
    const to = (await page.getByTestId(`order-${(await ids())[0]}`).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + 60, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    expect((await ids())[0]).toBe(start[3]);
  });

  test("mapping: lists and pointer drag set the same answer", async ({ page }) => {
    const id = "lom.connected-bodies.m.who-exerts-each-force";
    await open(page, id);
    await page.getByTestId("map-select-wA").selectOption("earth");
    const from = (await page.getByTestId("map-handle-tA").boundingBox())!;
    const to = (await page.getByTestId("map-target-string").boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 });
    await page.mouse.up();
    await expect(page.getByTestId("map-select-tA")).toHaveValue("string");
    await page.getByTestId("map-select-nA").selectOption("table");
    await page.getByTestId("check").click();
    await expect(page.getByTestId("feedback-correct")).toBeVisible();
  });

  test("graph point: arrow keys move it along the curve", async ({ page }) => {
    await open(page, "lim.derivative-rules.m.power-rule-tangent");
    const x = page.getByTestId("gp-x-P");
    const before = await x.inputValue();
    await page.getByTestId("gp-handle-P").focus();
    await page.keyboard.press("ArrowRight");
    await expect(x).not.toHaveValue(before);
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("consequences jump to their end state and are described in text", async ({ page }) => {
    const id = "kin.suvat.m.braking-distance";
    const inst = q(id);
    await open(page, id);
    await page.getByTestId("answer-input").fill(inst.selfTest.buggy[0]!.input as string);
    await page.getByTestId("check").click();
    await expect(page.getByTestId("feedback-incorrect")).toBeVisible();
    await expect(page.getByTestId("tr-play")).toHaveText("Play");
    const t = await page.getByTestId("tr-time").innerText();
    const [now, total] = t.split("/").map((s) => s.trim());
    expect(now).toBe(total);
    await expect(page.getByTestId("stage-announce")).toContainText("stopped");
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    expect(running).toBe(0);
  });
});

test.describe("saved attempts, flashcards and reasoning", () => {
  test("an exhausted attempt is saved, schedules flashcards, and the map shows Needs review after a refresh", async ({ page }) => {
    const id = "cur.emf.m.terminal-voltage";
    const inst = q(id);
    await open(page, id);
    const wrongs = inst.selfTest.buggy.map((b) => b.input as string);
    for (let i = 0; i < 3; i++) {
      await page.getByTestId("answer-input").fill(wrongs[i % wrongs.length]!);
      await page.getByTestId("check").click();
      await expect(page.getByTestId("feedback-incorrect")).toBeVisible();
    }
    await expect(page.getByTestId("feedback-exhausted")).toBeVisible();
    await expect(page.getByTestId("saved")).toContainText("flashcard");
    await page.getByTestId("back-to-map").click();
    await expect(page.getByTestId("node-cur")).toHaveAttribute("data-state", "needs-review");
    await page.reload();
    await expect(page.getByTestId("node-cur")).toHaveAttribute("data-state", "needs-review");
  });

  test("written reasoning is saved as advisory only and never changes the outcome", async ({ page }) => {
    const id = "lom.friction.h.incline-will-it-slide";
    const inst = q(id);
    await open(page, id);
    await page.getByTestId("reasoning-text").fill("The block is at rest so friction balances mg sin θ.");
    await page.getByTestId("answer-input").fill(inst.selfTest.correct[0] as string);
    await page.getByTestId("check").click();
    await expect(page.getByTestId("self-check")).toBeVisible();
    await expect(page.getByTestId("saved")).toBeVisible();
    const rec = await page.evaluate(() => new Promise<unknown>((resolve) => {
      const r = indexedDB.open("noesis");
      r.onsuccess = () => { const tx = r.result.transaction("attempts"); const g = tx.objectStore("attempts").getAll(); g.onsuccess = () => resolve(g.result); };
    }));
    const a = (rec as { templateId: string; outcome: string; countsTowardMastery: boolean; reasoning?: { scored: boolean; text: string } }[]).find((x) => x.templateId.startsWith(id))!;
    expect(a.outcome).toBe("independent");
    expect(a.countsTowardMastery).toBe(false); // in-review content never counts
    expect(a.reasoning).toMatchObject({ scored: false });
  });
});

test.describe("accessibility (axe) on the player", () => {
  const axe = async (page: Page) => {
    const r = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
  };
  for (const id of ["lom.fbd.m.box-pulled-by-rope", "kin.suvat.m.braking-distance", "set.intervals.m.union-from-inequality", "lom.connected-bodies.m.who-exerts-each-force", "lom.second-law.m.rank-accelerations", "lim.derivative-rules.m.power-rule-tangent"]) {
    test(id, async ({ page }) => {
      await open(page, id);
      await axe(page);
      for (let i = 0; i < 3; i++) await page.getByTestId("hint").click();
      await page.getByTestId("give-up").click();
      await page.getByTestId("solution-open").click();
      await axe(page);
    });
  }
});

test.describe("widget frame timing", () => {
  test("dragging a force and playing a simulation stay smooth under 4× CPU throttling", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "CDP throttling is Chromium-only");
    await open(page, "lom.fbd.m.box-pulled-by-rope");
    await page.getByTestId("vb-add-kind").selectOption("tension");
    await page.getByTestId("vb-add").click();
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const record = () => page.evaluate(() => {
      const w = window as unknown as { __f: number[] };
      w.__f = [];
      let last = performance.now();
      const loop = (t: number) => { w.__f.push(t - last); last = t; if (w.__f.length < 150) requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
    const stats = async () => {
      await page.waitForFunction(() => (window as unknown as { __f: number[] }).__f.length >= 150, undefined, { timeout: 20_000 });
      const f = (await page.evaluate(() => (window as unknown as { __f: number[] }).__f)).slice(5).sort((a, b) => a - b);
      return { p50: f[Math.floor(f.length * 0.5)]!, p95: f[Math.floor(f.length * 0.95)]! };
    };
    // drag
    const h = (await page.getByTestId("vb-handle-v1").boundingBox())!;
    await record();
    await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
    await page.mouse.down();
    for (let i = 0; i < 60; i++) await page.mouse.move(h.x + h.width / 2 + Math.sin(i / 6) * 80, h.y + h.height / 2 - i, { steps: 1 });
    await page.mouse.up();
    const drag = await stats();
    // playback
    await record();
    await page.getByTestId("tr-replay").click();
    const play = await stats();
    console.log(`frame timing under 4x throttle: drag p50 ${drag.p50.toFixed(1)} ms p95 ${drag.p95.toFixed(1)} ms; playback p50 ${play.p50.toFixed(1)} ms p95 ${play.p95.toFixed(1)} ms`);
    expect(drag.p50).toBeLessThanOrEqual(34);
    expect(play.p50).toBeLessThanOrEqual(34);
    expect(play.p95).toBeLessThanOrEqual(50);
  });
});
