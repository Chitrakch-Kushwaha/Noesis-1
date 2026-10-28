import { test } from "node:test";
import assert from "node:assert/strict";
import { draftProblems, findTemplate, provider } from "../lib.mjs";

const t = findTemplate("lom.circular-dynamics.e.what-provides");
const base = { draftOf: t.id, baseVersion: t.version, origin: "ai-draft", status: "draft" };

test("fixture drafts pass the automated checks", async () => {
  const out = await provider("fixture").generate(t, 2);
  assert.deepEqual(draftProblems({ ...base, variations: out.variations }, t), []);
});
test("a draft can never be marked approved", () => {
  const p = draftProblems({ ...base, status: "approved", reviewedBy: "me", variations: [] }, t);
  assert.ok(p.some((x) => x.includes("status must be draft")));
  assert.ok(p.some((x) => x.includes("no approval fields")));
});
test("answers, new numbers and changed placeholders are rejected", async () => {
  const [v] = (await provider("fixture").generate(t, 1)).variations;
  assert.ok(draftProblems({ ...base, variations: [{ ...v, answer: "friction" }] }, t).some((x) => x.includes('unexpected field "answer"')));
  assert.ok(draftProblems({ ...base, variations: [{ ...v, stem: ["A car at 25 m/s on a curve of radius {{r}} m."] }] }, t).some((x) => x.includes("placeholders") || x.includes("number 25")));
  assert.ok(draftProblems({ ...base, variations: [{ ...v, hints: ["The answer is friction."] }] }, t).some((x) => x.includes("hints") || x.includes("answer statement")));
});
test("live providers need a key and an explicit model", () => {
  assert.throws(() => provider("gemini", {}), /GEMINI_API_KEY/);
  assert.throws(() => provider("gemini", { GEMINI_API_KEY: "x" }), /GEMINI_DRAFT_MODEL/);
  assert.throws(() => provider("openai", { OPENAI_API_KEY: "x" }), /OPENAI_DRAFT_MODEL/);
});
