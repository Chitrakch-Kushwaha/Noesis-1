import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const views = [
  ["physics11", "Class 11 Physics", ["kin", "mip", "lom", "wep", "rot", "osc"]],
  ["physics12", "Class 12 Physics", ["ecf", "epc", "cur", "mcm", "emi", "opt"]],
  ["maths11", "Class 11 Maths", ["set", "rel", "trg", "sl", "con", "lim"]],
  ["maths12", "Class 12 Maths", ["cnd", "aod", "int", "aoi", "vec", "tdg"]],
] as const;

async function sceneTransform(page: Page) {
  return page.getByTestId("roadmap-scene").evaluate((el) => (el as HTMLElement).style.transform);
}

test.describe("navigation", () => {
  test("four selectable views, each with its six chapters", async ({ page }) => {
    await page.goto("/map");
    for (const [id, label, chs] of views) {
      await page.getByTestId(`tab-${id}`).click();
      await expect(page.getByRole("tab", { name: label })).toHaveAttribute("aria-selected", "true");
      await expect(page.getByRole("heading", { level: 1, name: label })).toBeVisible();
      for (const c of chs) await expect(page.getByTestId(`node-${c}`)).toBeVisible();
      await expect(page.locator(".node")).toHaveCount(6);
    }
  });

  test("legend states what solid and dotted connectors mean", async ({ page }) => {
    await page.goto("/map");
    const legend = page.getByTestId("legend");
    await expect(legend).toContainText("Solid arrow: prerequisite.");
    await expect(legend).toContainText("Dotted line: related concept.");
    await expect(legend).toContainText("it can never trigger remediation");
    await expect(page.locator('[data-kind="related"] text').first()).toHaveText("related");
  });

  test("chapter preview shows skills, prerequisites, progress and Try a question; non-playable chapters are labelled", async ({ page }) => {
    await page.goto("/map?view=physics12");
    await page.getByTestId("node-ecf").click();
    const p = page.getByTestId("chapter-preview");
    await expect(p.getByRole("heading", { name: "Electric Charges and Fields" })).toBeFocused();
    await expect(p).toContainText("Torque on a dipole in a uniform field");
    await expect(p).toContainText("System of Particles and Rotational Motion");
    await expect(p).toContainText("0/8 skills tried");
    await expect(p.getByRole("button", { name: "Try a question" })).toBeDisabled();
    await expect(p).toContainText("coming soon");
    await expect(p).not.toContainText(/\bphase\b|awaiting|content review/i);
    await expect(page.getByTestId("node-ecf")).toContainText("Preview only");
    await page.keyboard.press("Escape");
    await expect(p).toHaveCount(0);
    await expect(page.getByTestId("node-ecf")).toBeFocused();
  });

  test("ghost node jumps to the other view and selects the chapter", async ({ page }) => {
    await page.goto("/map?view=physics12");
    await page.getByRole("button", { name: /Builds on: System of Particles and Rotational Motion/ }).click();
    await expect(page.getByRole("tab", { name: "Class 11 Physics" })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("chapter-preview")).toContainText("System of Particles and Rotational Motion");
    await expect(page.getByTestId("node-rot")).toHaveAttribute("data-selected", "true");
  });

  test("selection animates the prerequisite path and dims the rest", async ({ page }) => {
    await page.goto("/map?view=physics12");
    await page.getByTestId("node-cur").click();
    for (const e of ["p:ecf>epc", "p:epc>cur", "p:rot>ecf", "p:cur>mcm"])
      await expect(page.locator(`[data-edge="${e}"] .edge`)).toHaveClass(/edge--onpath/);
    await expect(page.locator(`[data-edge="p:mcm>emi"] .edge`)).toHaveClass(/edge--dim/);
    await expect(page.getByTestId("node-opt")).toHaveAttribute("data-dim", "true");
    const flowing = await page.locator(".edge-flow--active").evaluateAll((els) => els.map((e) => getComputedStyle(e).animationName));
    expect(flowing.length).toBeGreaterThan(0);
    expect(flowing.every((n) => n === "edge-flow")).toBe(true);
  });

  test("search finds a skill and opens its chapter in the right view", async ({ page }) => {
    await page.goto("/map");
    await page.keyboard.press("/");
    await expect(page.getByTestId("search")).toBeFocused();
    await page.keyboard.type("kirchhoff");
    await expect(page.getByRole("option").first()).toContainText("Kirchhoff's rules");
    await page.keyboard.press("Enter");
    await expect(page.getByRole("tab", { name: "Class 12 Physics" })).toHaveAttribute("aria-selected", "true");
    await expect(page.locator('[data-skill="cur.kirchhoff"]')).toHaveAttribute("data-hl", "true");
  });

  test("pan, zoom and fit change the camera", async ({ page }) => {
    await page.goto("/map");
    await page.waitForTimeout(300);
    const t0 = await sceneTransform(page);
    const vp = page.getByTestId("roadmap-viewport");
    const box = (await vp.boundingBox())!;
    await page.mouse.move(box.x + 60, box.y + box.height - 160);
    await page.mouse.down();
    await page.mouse.move(box.x + 260, box.y + box.height - 60, { steps: 8 });
    await page.mouse.up();
    const t1 = await sceneTransform(page);
    expect(t1).not.toBe(t0);
    await page.mouse.wheel(0, 200); // plain wheel pans
    expect(await sceneTransform(page)).not.toBe(t1);
    const z0 = await page.getByTestId("zoom-readout").innerText();
    await page.getByRole("button", { name: "Zoom in" }).click();
    await page.waitForTimeout(350);
    expect(await page.getByTestId("zoom-readout").innerText()).not.toBe(z0);
    await page.getByTestId("fit").click();
    await page.waitForTimeout(500);
    const t2 = await sceneTransform(page);
    expect(t2).not.toBe(t1);
  });
});

test.describe("keyboard access", () => {
  test("arrow keys move between chapters, Enter opens, shortcuts zoom and switch views", async ({ page }) => {
    await page.goto("/map");
    await page.getByTestId("node-kin").focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByTestId("node-mip")).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("chapter-preview")).toContainText("Motion in a Plane");
    await page.keyboard.press("Escape");
    const z0 = await page.getByTestId("zoom-readout").innerText();
    await page.keyboard.press("+");
    await page.waitForTimeout(350);
    expect(await page.getByTestId("zoom-readout").innerText()).not.toBe(z0);
    await page.keyboard.press("3");
    await expect(page.getByRole("tab", { name: "Class 11 Maths" })).toHaveAttribute("aria-selected", "true");
    await page.getByRole("tab", { name: "Class 11 Maths" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Class 12 Maths" })).toBeFocused();
    await expect(page.getByRole("tab", { name: "Class 12 Maths" })).toHaveAttribute("aria-selected", "true");
  });

  test("list view is a complete keyboard-usable equivalent", async ({ page }) => {
    await page.goto("/map");
    await page.keyboard.press("l");
    const list = page.getByTestId("list-view");
    await expect(list.getByRole("heading", { level: 2 })).toHaveCount(4);
    await expect(list.getByRole("button", { name: /^Open preview:/ })).toHaveCount(24);
    await list.getByRole("button", { name: "Open preview: Applications of Derivatives" }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("chapter-preview")).toContainText("Applications of Derivatives");
    await expect(page.getByRole("tab", { name: "Class 12 Maths" })).toHaveAttribute("aria-selected", "true");
  });
});

test.describe("diagnostic attempt and persistence", () => {
  test("a weak-prerequisite student can try a question; progress survives refresh", async ({ page }) => {
    await page.goto("/map?view=physics12");
    await page.getByTestId("node-cur").click();
    await expect(page.getByTestId("try-question")).toHaveText("Start a session");
    await page.getByTestId("try-question").click();
    // first launch asks the class once (used only to prevent forward routing)
    await page.getByTestId("class-11").click();
    await expect(page.getByTestId("role-label")).toContainText("Main question 1");
    await expect(page.getByTestId("intro")).toHaveText("This question helps us find the best place for you to begin.");
    // invalid input does not use a try
    await page.getByTestId("answer-input").fill("3");
    await page.getByTestId("check").click();
    await expect(page.getByTestId("notice")).toContainText("doesn't use up a try");
    await expect(page.getByTestId("tries")).toContainText("3 tries left");
    const unit = (await page.getByTestId("stem").innerText()).includes("voltmeter") ? "V" : "A";
    for (let i = 0; i < 3; i++) {
      await page.getByTestId("answer-input").fill(`0.00${i + 1} ${unit}`);
      await page.getByTestId("check").click();
    }
    await expect(page.getByTestId("feedback-exhausted")).toBeVisible();
    await expect(page.getByTestId("saved")).toContainText("Saved to this device");
    await page.getByTestId("back-to-map").click();
    await expect(page.getByTestId("node-cur")).toHaveAttribute("data-state", "needs-review");
    await expect(page.getByTestId("stat-medium")).toContainText("1");
    await page.reload();
    await expect(page.getByTestId("node-cur")).toHaveAttribute("data-state", "needs-review");
    await expect(page.getByTestId("progress-panel")).toContainText("scheduled");
  });

  test("a correct first try records an independent answer and the chapter becomes Learning", async ({ page }) => {
    await page.goto("/chapter/kin/try?q=kin.acceleration.m.vt-area&seed=7");
    const stem = await page.getByTestId("stem").innerText();
    const n = (stem.match(/\d+(\.\d+)?/g) ?? []).map(Number);
    await page.getByTestId("answer-input").fill(`${((n[0]! + n[1]!) / 2) * n[2]!} m`);
    await page.getByTestId("check").click();
    await expect(page.getByTestId("feedback-correct")).toContainText("Correct.");
    await expect(page.getByTestId("saved")).toContainText("Saved");
    await page.getByTestId("back-to-map").click();
    await expect(page.getByTestId("node-kin")).toHaveAttribute("data-state", "learning");
    await expect(page.getByTestId("stat-medium")).toContainText("1 first try");
    // the progress underline animates from the last-seen value to the new one
    await expect.poll(async () => page.locator('[data-testid="node-kin"] .node__fill').evaluate((e) => getComputedStyle(e).transform)).not.toBe("matrix(0, 0, 0, 1, 0, 0)");
  });

  test("mastered state renders from imported progress, and recommendations light up", async ({ page }) => {
    await page.goto("/map");
    const file = {
      app: "noesis", schema: 1, exportedAt: new Date().toISOString(),
      attempts: [], flashcards: [], chapters: [{ chapterId: "kin", mastered: true, masteredAt: Date.now() }],
    };
    await page.getByTestId("import-file").setInputFiles({ name: "progress.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(file)) });
    await expect(page.getByText("Progress imported.")).toBeVisible();
    await expect(page.getByTestId("node-kin")).toHaveAttribute("data-state", "mastered");
    await page.reload();
    await expect(page.getByTestId("node-kin")).toHaveAttribute("data-state", "mastered");
    await expect(page.getByTestId("node-mip")).toContainText("Recommended");
    await expect(page.getByTestId("mastered-total")).toHaveText("1");
    await expect(page.locator('[data-edge="p:kin>mip"] .edge')).toHaveClass(/edge--recommended/);
    // a bad file changes nothing
    await page.getByTestId("import-file").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from("{\"nope\":1}") });
    await expect(page.getByText("nothing was changed")).toBeVisible();
    await expect(page.getByTestId("node-kin")).toHaveAttribute("data-state", "mastered");
  });
});

test.describe("reduced motion", () => {
  test.use({ reducedMotion: "reduce" });
  test("no arrival or flow animations run; state still changes and is announced", async ({ page }) => {
    await page.goto("/map");
    await expect(page.getByTestId("roadmap-scene")).toHaveAttribute("data-intro", "off");
    await page.getByTestId("node-lom").click();
    const running = await page.evaluate(() => document.getAnimations().filter((a) => a.playState === "running").length);
    expect(running).toBe(0);
    await expect(page.getByTestId("announcer")).toContainText("Laws of Motion selected");
    await expect(page.locator(`[data-edge="p:mip>lom"] .edge`)).toHaveClass(/edge--onpath/);
  });
  test("the in-app setting can force reduced motion", async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: "no-preference" });
    const page = await ctx.newPage();
    await page.goto("/map");
    await page.getByTestId("motion-setting").selectOption("reduced");
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");
    await expect(page.getByTestId("roadmap-scene")).toHaveAttribute("data-intro", "off");
    await ctx.close();
  });
});

test.describe("accessibility (axe)", () => {
  const check = async (page: Page) => {
    // @axe-core/playwright is typed against a newer playwright-core; the runtime API is identical.
    const r = await new AxeBuilder({ page: page as never }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(", ")}`)).toEqual([]);
  };
  test("dashboard, preview, list view and question screen", async ({ page }) => {
    await page.goto("/map");
    await page.waitForTimeout(1500);
    await check(page);
    await page.getByTestId("node-kin").click();
    // let the preview's opening transition finish: axe measures contrast mid-fade otherwise
    await expect(page.getByTestId("chapter-preview")).toBeVisible();
    await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished)));
    await check(page);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("chapter-preview")).toHaveCount(0); // closing transition finished
    await page.keyboard.press("l");
    await check(page);
    await page.goto("/chapter/set/try");
    await check(page);
  });
});

test.describe("animation performance", () => {
  test("panning stays smooth, including with 4× CPU throttling", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "CDP throttling is Chromium-only");
    await page.goto("/map?view=maths12");
    await page.waitForTimeout(1500);
    const cdp = await page.context().newCDPSession(page);
    const measure = async () => {
      const vp = (await page.getByTestId("roadmap-viewport").boundingBox())!;
      await page.evaluate(() => {
        (window as unknown as { __frames: number[] }).__frames = [];
        let last = performance.now();
        const loop = (t: number) => { (window as unknown as { __frames: number[] }).__frames.push(t - last); last = t; if ((window as unknown as { __frames: number[] }).__frames.length < 240) requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      });
      await page.mouse.move(vp.x + 40, vp.y + vp.height - 140);
      await page.mouse.down();
      for (let i = 0; i < 60; i++) await page.mouse.move(vp.x + 40 + (i % 30) * 12, vp.y + vp.height - 140 - (i % 15) * 6);
      await page.mouse.up();
      for (let i = 0; i < 20; i++) await page.mouse.wheel(0, 30);
      const frames = await page.evaluate(() => (window as unknown as { __frames: number[] }).__frames.slice(5));
      frames.sort((a, b) => a - b);
      return { p50: frames[Math.floor(frames.length * 0.5)]!, p95: frames[Math.floor(frames.length * 0.95)]!, n: frames.length };
    };
    const normal = await measure();
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
    const slow = await measure();
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });
    test.info().annotations.push({ type: "frames", description: JSON.stringify({ normal, throttled4x: slow }) });
    console.log("frame timing (ms)", JSON.stringify({ normal, throttled4x: slow }));
    expect(normal.p50).toBeLessThan(18); // 60 fps median
    expect(normal.p95).toBeLessThan(34); // at worst an occasional single dropped frame
    expect(slow.p50).toBeLessThan(34); // ≥ 30 fps median under 4× CPU throttle (mid-range phone proxy)
    expect(slow.p95).toBeLessThan(50);
  });
});
