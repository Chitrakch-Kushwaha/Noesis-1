// Developer-fixture journeys (run with playwright.fixture.config.ts against `next dev` with
// NOESIS_TUTOR_FIXTURES=1). They exercise the live-tutor interface, the voice pipeline and every
// fallback with labelled canned data. This is fixture verification, not live verification.
import { expect, test, type Page } from "@playwright/test";
import { entryById, playerChapterFor } from "@/src/content/catalog";
import { instantiate } from "@/src/content/instantiate";
import { FIXTURE_TRANSCRIPT } from "@/src/tutor/providers/fixture";
import { enter, wrong } from "./helpers";

const GRAPH = "lim.derivative-rules.m.power-rule-tangent";
const url = (id: string) => `/chapter/${playerChapterFor(entryById.get(id)!.template)}/try?q=${id}&seed=7`;

/** records every microphone stream so the test can check it is released */
async function trackMic(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __streams: MediaStream[] };
    w.__streams = [];
    const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (c) => { const s = await real(c); w.__streams.push(s); return s; };
  });
}
const liveTracks = (page: Page) => page.evaluate(() => (window as unknown as { __streams: MediaStream[] }).__streams.flatMap((s) => s.getTracks()).filter((t) => t.readyState === "live").length);

async function openTutor(page: Page) {
  await page.goto(url(GRAPH));
  await expect(page.getByTestId("stage")).toBeVisible();
  await page.getByTestId("tutor-toggle").click();
  await expect(page.getByTestId("tutor-panel")).toHaveAttribute("data-mode", "fixture");
}
const say = async (page: Page, text: string) => { await page.getByTestId("tutor-text").fill(text); await page.getByTestId("tutor-send").click(); };

test.describe("tutor with the developer fixture", () => {
  test("is labelled as a fixture everywhere, never as a live tutor", async ({ page, request }) => {
    expect(await (await request.get("/api/tutor/features")).json()).toEqual({ mode: "fixture", text: true, voice: true, providerName: "developer fixture" });
    await openTutor(page);
    await expect(page.getByTestId("tutor-identity")).toContainText("Developer fixture. Not a live tutor");
    await expect(page.getByTestId("tutor-fixture-banner")).toBeVisible();
    await say(page, "How do I start?");
    await expect(page.getByTestId("tutor-msg-tutor").last()).toHaveAttribute("data-source", "fixture");
  });

  test("voice: opt-in, push-to-talk, editable transcript, captions, speaking follows playback, mic released", async ({ page }) => {
    await trackMic(page);
    await openTutor(page);
    await page.getByTestId("tutor-voice-start").click();
    await expect(page.getByTestId("tutor-mic-explainer")).toContainText("not stored");
    expect(await liveTracks(page)).toBe(0); // nothing is opened before the student asks
    await page.getByTestId("tutor-mic-allow").click();
    await page.getByTestId("tutor-ptt").click();
    await expect(page.getByTestId("tutor-recording")).toBeVisible();
    await expect(page.getByTestId("owl")).toHaveAttribute("data-owl-state", "listening");
    expect(await liveTracks(page)).toBe(1);
    await page.waitForTimeout(1200);
    await page.getByTestId("tutor-ptt-stop").click();
    expect(await liveTracks(page)).toBe(0); // released as soon as recording stops
    await expect(page.getByTestId("tutor-heard-text")).toHaveValue(FIXTURE_TRANSCRIPT);
    await page.getByTestId("tutor-heard-text").fill(`${FIXTURE_TRANSCRIPT} I think P is the key.`);
    await page.getByTestId("tutor-heard-send").click();

    await expect(page.getByTestId("tutor-msg-student").last()).toContainText("I think P is the key.");
    const reply = page.getByTestId("tutor-msg-tutor").last();
    await expect(reply).toHaveAttribute("data-source", "fixture");
    // the reply text is the caption; the badge says what is playing
    await expect(page.getByTestId("tutor-voice-badge")).toContainText("Test tone from the developer fixture, not a voice");
    await expect(page.getByTestId("owl")).toHaveAttribute("data-owl-state", "speaking");
    await expect(page.getByTestId("owl")).not.toHaveAttribute("data-owl-state", "speaking", { timeout: 8000 }); // follows the real end of playback
    await page.getByTestId("tutor-replay").click();
    await expect(page.getByTestId("owl")).toHaveAttribute("data-owl-state", "speaking");
    await page.getByTestId("tutor-stop").click();
    await expect(page.getByTestId("owl")).not.toHaveAttribute("data-owl-state", "speaking");

    // interrupting: starting to talk stops playback; closing the panel releases the microphone
    await page.getByTestId("tutor-replay").click();
    await page.getByTestId("tutor-ptt").click();
    await expect(page.getByTestId("owl")).toHaveAttribute("data-owl-state", "listening");
    await page.getByTestId("tutor-close").click();
    await expect.poll(() => liveTracks(page)).toBe(0);
  });

  test("a reply that arrives after the student's work changed is set aside", async ({ page }) => {
    const inst = instantiate(entryById.get(GRAPH)!.template, 7);
    await openTutor(page);
    await say(page, "fixture:delay where do I start");
    await expect(page.getByTestId("owl")).toHaveAttribute("data-owl-state", "waiting");
    await enter(page, inst, wrong(inst));
    await page.getByTestId("check").click();
    await expect(page.getByTestId("feedback-incorrect")).toBeVisible();
    await expect(page.getByTestId("tutor-msg-note").last()).toContainText("set that reply aside", { timeout: 8000 });
    await expect(page.locator("[data-banner=demo]")).toHaveCount(0);
  });

  test("leaks, unauthorised tools, malformed replies, errors and rate limits fall back to the lesson's own help", async ({ page }) => {
    await openTutor(page);
    for (const [trigger, reason] of [["fixture:leak", "answer-leak"], ["fixture:bad-tool", "unauthorised-tool"], ["fixture:malformed", "malformed"], ["fixture:error", "provider-error"], ["fixture:rate-limit", "rate-limited"]] as const) {
      await say(page, `${trigger} please`);
      const last = page.getByTestId("tutor-msg-tutor").last();
      await expect(last).toHaveAttribute("data-source", "authored");
      await expect(last.getByTestId("tutor-fallback")).toHaveAttribute("data-reason", reason);
    }
    await expect(page.getByTestId("owl")).toHaveAttribute("data-owl-state", "unavailable");
    await expect(page.locator("[data-testid=hints] .hint")).toHaveCount(0); // a rejected show_hint never revealed a hint
  });

  test("microphone denied: a clear note, and typing and the buttons keep working", async ({ page }) => {
    await page.addInitScript(() => { navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("denied", "NotAllowedError"); }; });
    await openTutor(page);
    await page.getByTestId("tutor-voice-start").click();
    await page.getByTestId("tutor-mic-allow").click();
    await page.getByTestId("tutor-ptt").click();
    await expect(page.getByTestId("tutor-mic-note")).toBeVisible();
    await expect(page.getByTestId("owl")).not.toHaveAttribute("data-owl-state", "listening");
    await say(page, "How do I start?");
    await expect(page.getByTestId("tutor-msg-tutor").last()).toHaveAttribute("data-source", "fixture");
    await page.getByTestId("tutor-next-hint").click();
    await expect(page.locator("[data-testid=hints] .hint")).toHaveCount(1);
  });
});
