#!/usr/bin/env node
// Drafts wording variations of one human-authored template for later human review.
//   npm --prefix tools/content-drafting run draft -- --template <id> [--count 5] [--provider gemini|openai|fixture] [--model <id>]
// Output: content/drafts/<template>.<timestamp>.draft.json with origin ai-draft and status draft. Nothing
// here edits content/templates/ or the app's manifest; a reviewer copies wording they accept into a
// template, which then goes through `npm run content:validate` and `npm run content:review` as usual.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { arg, DRAFT_DIR, draftProblems, findTemplate, LIMITS, promptHash, provider } from "./lib.mjs";

const id = arg("template");
const count = Math.min(LIMITS.count, Math.max(1, Number(arg("count") ?? 5)));
const which = arg("provider") ?? (process.argv.includes("--fixture") ? "fixture" : "gemini");
if (!id) { console.error("Usage: npm --prefix tools/content-drafting run draft -- --template <id> [--count 5] [--provider gemini|openai|fixture]"); process.exit(2); }
const t = findTemplate(id);
if (!t) { console.error(`No template with id ${id} in content/templates/.`); process.exit(1); }
if (t.provenance?.origin !== "human") { console.error("Drafts are made only from human-authored templates."); process.exit(1); }

const env = { ...process.env };
if (arg("model")) env[which === "openai" ? "OPENAI_DRAFT_MODEL" : "GEMINI_DRAFT_MODEL"] = arg("model");
let p;
try { p = provider(which, env); } catch (e) { console.error(e.message); process.exit(1); }

const out = await p.generate(t, count).catch((e) => { console.error(`Drafting failed: ${e.message}`); process.exit(1); });
const draft = {
  $comment: which === "fixture" ? "FIXTURE OUTPUT for testing the tool. Not real drafting." : "AI-drafted wording. Needs human review; never shipped as is.",
  draftOf: t.id, baseVersion: t.version, origin: "ai-draft", status: "draft",
  provider: p.name, model: p.model, promptHash: promptHash(t, count), createdAt: new Date().toISOString(),
  variations: Array.isArray(out?.variations) ? out.variations.slice(0, count) : [],
};
const problems = draftProblems(draft, t);
mkdirSync(DRAFT_DIR, { recursive: true });
const file = join(DRAFT_DIR, `${t.id}.${Date.now()}.draft.json`);
writeFileSync(file, JSON.stringify(draft, null, 2) + "\n");
console.log(`Wrote ${file.replace(/^.*content\//, "content/")} (${draft.variations.length} variations, ${which}).`);
if (problems.length) { console.log(`It has ${problems.length} problem(s) to fix or discard before review:`); for (const x of problems) console.log(`  - ${x}`); process.exitCode = 1; }
else console.log("It passes the draft checks. A person must still review it before any wording is used.");
