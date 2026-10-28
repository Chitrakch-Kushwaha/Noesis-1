#!/usr/bin/env node
// One small live call to confirm the drafting provider works and returns the expected shape.
// It runs only when the key is in your shell AND you pass --confirm; otherwise it reports "pending".
//   GEMINI_API_KEY=... GEMINI_DRAFT_MODEL=... npm --prefix tools/content-drafting run verify -- --confirm
import { arg, draftProblems, findTemplate, provider } from "./lib.mjs";

const which = arg("provider") ?? "gemini";
const keyVar = which === "openai" ? "OPENAI_API_KEY" : "GEMINI_API_KEY";
if (which !== "fixture" && !process.env[keyVar]) { console.log(`PENDING: ${keyVar} is not set in this shell. No call was made.`); process.exit(0); }
if (which !== "fixture" && !process.argv.includes("--confirm")) { console.log("PENDING: pass --confirm to make one real, billable call. No call was made."); process.exit(0); }
const t = findTemplate("lom.circular-dynamics.e.what-provides");
const p = provider(which);
const out = await p.generate(t, 1);
const problems = draftProblems({ draftOf: t.id, baseVersion: t.version, origin: "ai-draft", status: "draft", variations: out?.variations ?? [] }, t);
console.log(problems.length ? `FAIL (${p.name} ${p.model}): ${problems.join("; ")}` : `PASS (${p.name} ${p.model}): one variation in the expected shape.`);
process.exitCode = problems.length ? 1 : 0;
