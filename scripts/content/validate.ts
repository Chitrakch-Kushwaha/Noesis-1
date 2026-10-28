// npm run content:validate — validates every template and writes the student manifest.
// Flags: --check (fail if the manifest on disk is out of date instead of rewriting it), --quiet.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { join } from "node:path";
import { coverage, coverageMarkdown, readinessJson } from "./coverage";
import { CATALOGUES_PATH, LESSONS_PATH, MANIFEST_PATH, PLAYABLE_PATH, playableChapters, ROOT, validateAll } from "./lib";

const args = new Set(process.argv.slice(2));
const { issues, manifest, files, lessons, lessonFiles, catalogues } = validateAll();
const errors = issues.filter((i) => i.level === "error");
const warnings = issues.filter((i) => i.level === "warning");

const byTemplate = new Map<string, typeof issues>();
for (const i of issues) byTemplate.set(i.templateId, [...(byTemplate.get(i.templateId) ?? []), i]);
for (const [id, list] of byTemplate) {
  if (args.has("--quiet") && !list.some((i) => i.level === "error")) continue;
  // collapse the same message repeated across seeds
  const seen = new Map<string, number>();
  for (const i of list) { const k = `${i.level}|${i.where.replace(/^seed \d+ ?/, "")}|${i.message}`; seen.set(k, (seen.get(k) ?? 0) + 1); }
  console.log(`\n${id}`);
  for (const [k, n] of seen) { const [lvl, where, msg] = k.split("|"); console.log(`  ${lvl === "error" ? "✗" : "!"} ${where || "seeds"}: ${msg}${n > 1 ? ` (×${n})` : ""}`); }
}

const outputs: [string, string][] = [
  [MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n"],
  [PLAYABLE_PATH, JSON.stringify(playableChapters(manifest)) + "\n"],
  [LESSONS_PATH, JSON.stringify(lessons, null, 2) + "\n"],
  [CATALOGUES_PATH, JSON.stringify({ generatedBy: "npm run content:validate", catalogues }) + "\n"],
  [join(ROOT, "src", "content", "generated", "readiness.json"), JSON.stringify(readinessJson(coverage(manifest, lessons.lessons))) + "\n"],
  [join(ROOT, "docs", "generated", "content-coverage.md"), coverageMarkdown(coverage(manifest, lessons.lessons), manifest, lessons.lessons)],
];
if (errors.length === 0) {
  for (const [path, out] of outputs) {
    let stale = false;
    try { stale = readFileSync(path, "utf8") !== out; } catch { stale = true; }
    if (!stale) continue;
    if (args.has("--check")) { console.error(`\n✗ ${relative(ROOT, path)} is out of date. Run npm run content:validate.`); process.exit(1); }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, out);
  }
}

const counts = manifest.templates.reduce((m, e) => ({ ...m, [e.template.status]: (m[e.template.status] ?? 0) + 1 }), {} as Record<string, number>);
console.log(`\nContent validation: ${files} template files, ${errors.length} errors, ${warnings.length} warnings.`);
console.log(`Manifest: ${manifest.templates.length} playable (${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ") || "none"}); ${manifest.templates.filter((e) => e.countsTowardMastery).length} count toward mastery. Lessons: ${lessons.lessons.length} playable, ${lessons.lessons.filter((l) => l.approved).length} approved.`);
if (errors.length) { console.error("✗ Fix the errors above. The manifest was not updated."); process.exit(1); }
console.log("✓ Content valid.");
