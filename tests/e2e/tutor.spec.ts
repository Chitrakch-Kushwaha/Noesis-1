// Phase 5 tutor journeys against the production build, where live AI is off: the tutor runs on the
// lesson's own hints and cues, on the device. (The developer-fixture voice journey is in
// tutor-fixture.spec.ts and runs against a development server.)
import { expect, test, type Page } from "@playwright/test";
import { entryById, playerChapterFor } from "@/src/content/catalog";
import { instantiate } from "@/src/content/instantiate";
import type { DiagramForce } from "@/src/checking/types";
import { enter, wrong } from "./helpers";

const SEED = 7;
const FBD = "lom.fbd.m.box-pulled-by-rope";
const GRAPH = "lim.derivative-rules.m.power-rule-tangent";
const q = (id: string) => instantiate(entryById.get(id)!.template, SEED);
const url = (id: string) => `/chapter/${playerChapterFor(entryById.get(id)!.template)}/try?q=${id}&seed=${SEED}`;

async function open(page: Page, id: string) {
  await page.goto(url(id));
  await expect(page.getByTestId("stage")).toBeVisible();
}
async function attempts(page: Page) {
  return page.evaluate(() => new Promise<{ templateId: string; outcome: string; tutorAssists?: number; hintsUsed: number }[]>((resolve) => {
    const r = indexedDB.open("noesis");
    r.onsuccess = () => { const g = r.result.transaction("attempts").objectStore("attempts").getAll(); g.onsuccess = () => resolve(g.result); };
  }));
}
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

test.describe("tutor (authored mode, production build)", () => {
  test("force diagram: guided highlight on a copy, back to my work, and the help makes the answer assisted", async ({ page }) => {
    const turnCalls: string[] = [];
    page.on("request", (r) => { if (r.url().includes("/api/tutor/") && !r.url().endsWith("/features")) turnCalls.push(r.url()); });
    const inst = q(FBD);
    await open(page, FBD);
    const forces = inst.selfTest.correct[0] as DiagramForce[];
    await enter(page, inst, forces);
    const mine = await page.getByTestId("vb-mag-v1").inputValue();

    await page.getByTestId("tutor-toggle").click();
    const panel = page.getByTestId("tutor-panel");
    await expect(panel).toBeVisible();
    await expect(page.getByTestId("tutor-identity")).toContainText("No AI");
    await expect(page.getByTestId("tutor-state")).toHaveAttribute("data-state", "ready");
    await expect(page.getByTestId("tutor-text-off")).toBeVisible();
    await expect(page.getByTestId("tutor-voice-start")).toHaveCount(0);

    // the rail sits beside the lesson and never covers the visual, the answer or Check
    const p = (await panel.boundingBox())!;
    for (const id of ["stage", "check"]) expect(overlaps(p, (await page.getByTestId(id).boundingBox())!), id).toBe(false);

    await page.getByTestId("tutor-guide").click();
    await expect(page.getByTestId("tutor-msg-tutor").last()).toContainText(/highlighted|Which object/i);
    await expect(page.getByTestId("tutor-state")).toHaveAttribute("data-state", "guiding");
    await expect(page.getByTestId("owl")).toHaveAttribute("data-owl-state", "guiding");
    await expect(page.locator("[data-banner=demo]")).toBeVisible();

    await page.getByRole("button", { name: "Back to my work" }).click();
    await expect(page.locator("[data-banner=demo]")).toHaveCount(0);
    await expect(page.getByTestId("vb-mag-v1")).toHaveValue(mine);
    await expect(page.getByTestId(`vb-row-v${forces.length}`)).toBeVisible();

    await page.getByTestId("check").click();
    await expect(page.getByTestId("saved")).toBeVisible();
    const rec = (await attempts(page)).find((a) => a.templateId.startsWith(FBD))!;
    expect(rec.outcome).toBe("assisted");
    expect(rec.tutorAssists).toBe(1);
    expect(turnCalls).toEqual([]); // authored help never leaves the device
  });

  test("graph: the tutor points at P on a copy; next hint and explain-my-mistake use the lesson's own help", async ({ page }) => {
    const inst = q(GRAPH);
    await open(page, GRAPH);
    await page.getByTestId("tutor-toggle").click();
    await expect(page.getByTestId("tutor-explain")).toBeDisabled(); // nothing to explain yet

    await page.getByTestId("tutor-begin").click();
    await expect(page.getByTestId("tutor-msg-tutor").last()).toHaveAttribute("data-source", "authored");
    await expect(page.locator("[data-banner=demo]")).toHaveCount(0); // orientation changes nothing

    await page.getByTestId("tutor-guide").click();
    await expect(page.getByTestId("tutor-msg-tutor").last()).toContainText(/point P|tangent|slope/i);
    await expect(page.locator("[data-banner=demo]")).toBeVisible();
    await page.getByRole("button", { name: "Back to my work" }).click();

    await page.getByTestId("tutor-next-hint").click();
    await expect(page.locator("[data-testid=hints] .hint")).toHaveCount(1);
    await expect(page.getByTestId("tutor-msg-tutor").last()).toContainText(inst.hints[0]!.text.slice(0, 20));

    await enter(page, inst, wrong(inst));
    await page.getByTestId("check").click();
    await expect(page.getByTestId("feedback-incorrect")).toBeVisible();
    await expect(page.getByTestId("tutor-explain")).toBeEnabled();
    await page.getByTestId("tutor-explain").click();
    await expect(page.getByTestId("tutor-msg-tutor").last()).toHaveAttribute("data-source", "authored");
    await expect(page.getByTestId("tutor-state")).not.toHaveAttribute("data-state", "waiting");
  });

  test("with no live tutor and no microphone: the features route says authored, live routes are absent, the mic is never touched", async ({ page, request }) => {
    expect(await (await request.get("/api/tutor/features")).json()).toEqual({ mode: "authored", text: false, voice: false, providerName: null });
    expect((await request.post("/api/tutor/turn", { data: {} })).status()).toBe(404);
    expect((await request.post("/api/tutor/speak", { data: {} })).status()).toBe(404);
    const res = await request.get(url(FBD));
    expect(res.headers()["permissions-policy"]).toContain("microphone=()");
    expect(res.headers()["content-security-policy"]).toContain("connect-src 'self'");

    await page.addInitScript(() => {
      (window as unknown as { __mic: number }).__mic = 0;
      const md = navigator.mediaDevices;
      if (md) md.getUserMedia = async () => { (window as unknown as { __mic: number }).__mic++; throw new DOMException("denied", "NotAllowedError"); };
    });
    await open(page, FBD);
    await page.getByTestId("tutor-toggle").click();
    await page.getByTestId("tutor-begin").click();
    await page.getByTestId("tutor-next-hint").click();
    await expect(page.locator("[data-testid=hints] .hint")).toHaveCount(1);
    expect(await page.evaluate(() => (window as unknown as { __mic: number }).__mic)).toBe(0);
  });

  test("hide the owl (remembered), close releases the panel, and reduced motion keeps the owl still", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, GRAPH);
    await page.getByTestId("tutor-toggle").click();
    await page.getByTestId("tutor-guide").click();
    const owl = page.getByTestId("owl");
    await expect(owl).toHaveAttribute("data-reduced", "true");
    const a = await owl.innerHTML();
    await page.waitForTimeout(700);
    expect(await owl.innerHTML()).toBe(a); // no looping animation under reduced motion

    await page.getByTestId("tutor-hide-owl").click();
    await expect(owl).toHaveCount(0);
    await page.reload();
    await page.getByTestId("tutor-toggle").click();
    await expect(page.getByTestId("tutor-panel")).toBeVisible();
    await expect(page.getByTestId("owl")).toHaveCount(0);
    await page.getByTestId("tutor-hide-owl").click();
    await expect(page.getByTestId("owl")).toBeVisible();

    await page.getByTestId("tutor-close").click();
    await expect(page.getByTestId("tutor-panel")).toHaveCount(0);
    await expect(page.getByTestId("tutor-toggle")).toHaveText(/Ask the tutor/);
  });
});
