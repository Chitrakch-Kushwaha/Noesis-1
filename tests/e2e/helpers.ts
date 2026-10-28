// Shared helpers for session journeys: read which question is on screen from the browser's own
// IndexedDB (test-only) and answer it through the ordinary, non-drag controls.
import { expect, type Page } from "@playwright/test";
import { entryById } from "@/src/content/catalog";
import { instantiate, SI_SYMBOL, type QuestionInstance } from "@/src/content/instantiate";
import type { CheckInput, CheckSpec, DiagramForce } from "@/src/checking/types";

export interface OnScreen { sessionId: string; step: string; role?: string; templateId?: string; seed?: number; skillId?: string; frames: number; mains: number }

/** Test-only: read the newest unfinished session's top frame from IndexedDB. */
export async function onScreen(page: Page): Promise<OnScreen> {
  return page.evaluate(() => new Promise<OnScreen>((resolve, reject) => {
    const req = indexedDB.open("noesis");
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const tx = req.result.transaction("sessions");
      const all = tx.objectStore("sessions").getAll();
      all.onsuccess = () => {
        type S = { id: string; status: string; updatedAt: number; frames: { step: { kind: string; itemId?: string }; items: { id: string; role: string; templateId: string; seed: number; skillId: string; outcome?: string }[] }[] };
        const s = (all.result as S[]).sort((a, b) => b.updatedAt - a.updatedAt)[0]!;
        const f = s.frames[s.frames.length - 1]!;
        const it = f.step.kind === "question" ? f.items.find((i) => i.id === f.step.itemId) : undefined;
        resolve({ sessionId: s.id, step: f.step.kind, role: it?.role, templateId: it?.templateId, seed: it?.seed, skillId: it?.skillId, frames: s.frames.length, mains: s.frames[0]!.items.filter((i) => i.role === "main" && i.outcome).length });
      };
    };
  }));
}

export const instOf = (o: OnScreen) => instantiate(entryById.get(o.templateId!)!.template, o.seed!);

export async function enter(page: Page, inst: QuestionInstance, input: CheckInput) {
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
          if (items.indexOf(want[i]!) <= i) break;
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
        await page.getByTestId(`vb-mag-v${i + 1}`).fill(String(Math.round(f.magnitude * 100) / 100));
        await page.getByTestId(`vb-ang-v${i + 1}`).fill(String(f.angleDeg));
      }
      return;
    }
    default: await page.getByTestId("answer-input").fill(input as string);
  }
}

/** A wrong answer: a recognised wrong method when the template has one, else a plainly wrong value. */
export function wrong(inst: QuestionInstance, k = 0): CheckInput {
  const b = inst.selfTest.buggy;
  if (b.length) return b[k % b.length]!.input;
  const spec = inst.check as CheckSpec;
  if (spec.kind === "single-choice") return spec.options.find((o) => o.id !== spec.correct)!.id;
  if (spec.kind === "quantity") return `${Math.abs(spec.value) * 1.37 + 1} ${SI_SYMBOL[spec.dimension]}`;
  if (spec.kind === "number") return String(Math.abs(spec.value) * 1.37 + 1);
  throw new Error(`no wrong answer for ${inst.templateId}`);
}

export async function answerCurrent(page: Page, how: "right" | "wrong" | "exhaust") {
  await expect(page.getByTestId("check")).toBeVisible();
  const o = await onScreen(page);
  const inst = instOf(o);
  const tries = how === "exhaust" ? 3 : 1;
  for (let k = 0; k < tries; k++) {
    if (inst.format === "diagram" && k > 0) await page.getByTestId("tr-reset").click();
    await enter(page, inst, how === "right" ? inst.selfTest.correct[0]! : wrong(inst, k));
    await page.getByTestId("check").click();
    if (how === "right") await expect(page.getByTestId("feedback-correct")).toBeVisible();
    else if (k < tries - 1) await expect(page.getByTestId("tries")).toContainText(`${2 - k} ${2 - k === 1 ? "try" : "tries"} left`);
  }
  if (how !== "wrong") {
    await expect(page.getByTestId("saved")).toContainText("Saved to this device");
    await page.getByTestId("continue").click();
  }
  return o;
}

export async function startSession(page: Page, path: string, cls: "11" | "12") {
  await page.goto(path);
  await page.getByTestId(`class-${cls}`).click();
  await expect(page.getByTestId("role-label")).toContainText("Main question 1");
}

