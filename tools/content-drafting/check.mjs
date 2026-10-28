#!/usr/bin/env node
// Checks every file in content/drafts/ against its base template. Exit 1 if any draft has problems.
//   npm --prefix tools/content-drafting run check
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DRAFT_DIR, draftProblems, findTemplate } from "./lib.mjs";

const files = existsSync(DRAFT_DIR) ? readdirSync(DRAFT_DIR).filter((f) => f.endsWith(".draft.json")) : [];
let bad = 0;
for (const f of files) {
  let d;
  try { d = JSON.parse(readFileSync(join(DRAFT_DIR, f), "utf8")); } catch { console.log(`✗ ${f}: not valid JSON`); bad++; continue; }
  const p = draftProblems(d, findTemplate(d.draftOf));
  if (p.length) { bad++; console.log(`✗ ${f}`); for (const x of p) console.log(`    - ${x}`); }
  else console.log(`✓ ${f} (${d.variations.length} variations; needs human review)`);
}
console.log(files.length ? `${files.length - bad}/${files.length} drafts pass the automated checks.` : "No drafts in content/drafts/.");
process.exitCode = bad ? 1 : 0;
