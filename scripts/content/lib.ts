// Node-only helpers for the content tools: loading template files, content hashes, approval gating
// and manifest generation. Nothing here is bundled into the student app.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { PLAYABLE_STATUSES, type Template } from "@/src/content/schema";
import { validateTemplate, type Issue } from "@/src/content/validate";
import { validateLesson } from "@/src/content/validateLesson";
import type { LessonEntry } from "@/src/content/lessons";
import { Catalogue } from "@/src/content/misconceptions";
import type { Manifest } from "@/src/content/catalog";
import { foundationById, skillById } from "@/src/domain/curriculum";
import { coverageTemplateFiles } from "@/src/content/coverageQuestions";

export const ROOT = join(__dirname, "..", "..");
export const TEMPLATE_DIR = join(ROOT, "content", "templates");
export const MANIFEST_PATH = join(ROOT, "src", "content", "generated", "templates.json");
/** Just the chapter ids with playable questions: the roadmap needs only this, not the whole manifest. */
export const PLAYABLE_PATH = join(ROOT, "src", "content", "generated", "playable-chapters.json");
export const LESSON_DIR = join(ROOT, "content", "lessons");
export const LESSONS_PATH = join(ROOT, "src", "content", "generated", "lessons.json");
export const CATALOGUE_DIR = join(ROOT, "content", "misconceptions");
export const CATALOGUES_PATH = join(ROOT, "src", "content", "generated", "misconceptions.json");

/** Every misconception catalogue file, validated; the merged list ships to the planner. */
export function loadCatalogues(): { catalogues: Catalogue[]; issues: Issue[] } {
  const issues: Issue[] = [];
  const catalogues: Catalogue[] = [];
  for (const f of loadTemplateFiles(CATALOGUE_DIR)) {
    const r = Catalogue.safeParse(f.raw);
    if (!r.success) { for (const i of r.error.issues) issues.push({ level: "error", templateId: f.rel, where: i.path.join("."), message: i.message }); continue; }
    for (const m of r.data.misconceptions) for (const s of m.implicates) {
      if (!skillById.has(s) && !foundationById.has(s)) issues.push({ level: "error", templateId: f.rel, where: `misconceptions.${m.tag}`, message: `implicates unknown skill ${s}` });
    }
    catalogues.push(r.data);
  }
  catalogues.sort((a, b) => a.chapter.localeCompare(b.chapter));
  return { catalogues, issues };
}
export const playableChapters = (m: Manifest) => [...new Set(m.templates.map((e) => e.template.chapterId))].sort();

export interface TemplateFile { file: string; rel: string; raw: Record<string, unknown> }

export function loadTemplateFiles(dir = TEMPLATE_DIR): TemplateFile[] {
  const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith(".json") ? [join(d, e.name)] : []));
  const disk = walk(dir).sort().map((file) => ({ file, rel: relative(ROOT, file).replace(/\\/g, "/"), raw: JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown> }));
  // The coverage bank is virtual only for the question-template directory. Other
  // callers (misconceptions and lessons) must retain their JSON-only schema.
  return dir === TEMPLATE_DIR ? [...disk, ...coverageTemplateFiles()] : disk;
}

function canonical(x: unknown): string {
  if (Array.isArray(x)) return `[${x.map(canonical).join(",")}]`;
  if (x && typeof x === "object") return `{${Object.keys(x).sort().map((k) => `${JSON.stringify(k)}:${canonical((x as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(x);
}

/** Hash of everything a student sees or is checked against. Status and review metadata are excluded,
 *  so recording an approval doesn't change the hash, but any later content edit does. */
export function contentHash(raw: Record<string, unknown>): string {
  const { status: _s, provenance: _p, $comment: _c, ...content } = raw;
  void _s; void _p; void _c;
  return `sha256:${createHash("sha256").update(canonical(content)).digest("hex")}`;
}

/** Approved content counts toward mastery only while it is byte-for-byte what the reviewer approved. */
export function approvalState(raw: Record<string, unknown>): "approved" | "changed-since-approval" | "not-approved" {
  const prov = raw.provenance as { contentHash?: string | null; reviewedBy?: string | null } | undefined;
  if (raw.status !== "approved") return "not-approved";
  return prov?.reviewedBy && prov.contentHash === contentHash(raw) ? "approved" : "changed-since-approval";
}

export interface ValidationRun { issues: Issue[]; manifest: Manifest; files: number; lessons: { generatedBy: string; lessons: LessonEntry[] }; lessonFiles: number; catalogues: Catalogue[] }

export const loadLessonFiles = (dir = LESSON_DIR): TemplateFile[] => { try { return loadTemplateFiles(dir); } catch { return []; } };
const knownSkill = (id: string) => skillById.has(id) || foundationById.has(id);
export function validateAll(files = loadTemplateFiles(), lessonFiles = loadLessonFiles()): ValidationRun {
  const issues: Issue[] = [];
  const cat = loadCatalogues();
  issues.push(...cat.issues);
  /** Chapters (and "f" for foundations) whose misconception catalogue the planner reads. */
  const CATALOGUED = new Set(cat.catalogues.map((c) => c.chapter));
  const tagSet = new Set(cat.catalogues.flatMap((c) => c.misconceptions.map((m) => m.tag)));
  const knownTag = (t: string) => tagSet.has(t);
  const entries: Manifest["templates"] = [];
  const ids = new Map<string, string>();
  for (const f of files) {
    const res = validateTemplate(f.raw, { file: f.rel });
    issues.push(...res.issues);
    const t = res.template;
    if (!t) continue;
    if (ids.has(t.id)) issues.push({ level: "error", templateId: t.id, where: "id", message: `Duplicate id (also in ${ids.get(t.id)})` });
    ids.set(t.id, f.rel);
    const state = approvalState(f.raw);
    if (state === "changed-since-approval") {
      issues.push({ level: "error", templateId: t.id, where: "status", message: "Marked approved, but the content has changed since it was reviewed (or the approval record is incomplete). Re-review it with npm run content:review." });
    }
    if (!knownSkill(t.primarySkillId)) issues.push({ level: "error", templateId: t.id, where: "primarySkillId", message: `Unknown skill or foundation ${t.primarySkillId}` });
    if (CATALOGUED.has(t.chapterId)) {
      // the detour planner can only use evidence it knows how to interpret
      const tags = [...t.misconceptionRules.flatMap((r) => r.tags), ...(t.options ?? []).flatMap((o) => o.tags ?? [])];
      for (const tag of new Set(tags)) if (!knownTag(tag) && tag !== "dimension-mismatch") issues.push({ level: "warning", templateId: t.id, where: `tags.${tag}`, message: `Tag "${tag}" is not in a misconception catalogue, so it can't guide a detour` });
    }
    if (res.issues.some((i) => i.level === "error") || state === "changed-since-approval" || !knownSkill(t.primarySkillId)) continue;
    if (!PLAYABLE_STATUSES.includes(t.status)) continue; // drafts and retired templates never ship
    entries.push({ template: t as Template, hash: contentHash(f.raw), countsTowardMastery: state === "approved" });
  }
  entries.sort((a, b) => a.template.id.localeCompare(b.template.id));

  // duplicates across templates: the same wording, or the same solver and parameter space
  const byStem = new Map<string, string>();
  const bySolver = new Map<string, string>();
  for (const f of files) {
    const raw = f.raw as { id?: string; stem?: string[]; solver?: string; parameters?: unknown; options?: unknown; status?: string };
    if (!raw.id || !Array.isArray(raw.stem) || raw.status === "retired") continue;
    const stemKey = raw.stem.join(" ").toLowerCase().replace(/\s+/g, " ").trim();
    const other = byStem.get(stemKey);
    if (other) issues.push({ level: "error", templateId: raw.id, where: "stem", message: `Same wording as ${other}: write a distinct question` });
    else byStem.set(stemKey, raw.id);
    const solverKey = `${raw.solver}|${JSON.stringify(raw.parameters)}|${JSON.stringify(raw.options ?? null)}`;
    const twin = bySolver.get(solverKey);
    if (twin) issues.push({ level: "warning", templateId: raw.id, where: "parameters", message: `Same solver and parameter space as ${twin}: students would meet near-identical variations` });
    else bySolver.set(solverKey, raw.id);
  }

  const lessons: LessonEntry[] = [];
  for (const f of lessonFiles) {
    const res = validateLesson(f.raw, { file: f.rel, knownSkill });
    issues.push(...res.issues);
    const l = res.lesson;
    if (!l) continue;
    if (lessons.some((x) => x.lesson.skillId === l.skillId)) issues.push({ level: "error", templateId: l.id, where: "skillId", message: "Only one lesson per skill" });
    const state = approvalState(f.raw);
    if (state === "changed-since-approval") issues.push({ level: "error", templateId: l.id, where: "status", message: "Marked approved, but the lesson has changed since it was reviewed. Re-review it with npm run content:review." });
    if (res.issues.some((i) => i.level === "error") || state === "changed-since-approval" || !PLAYABLE_STATUSES.includes(l.status)) continue;
    lessons.push({ lesson: l, hash: contentHash(f.raw), approved: state === "approved" });
  }
  lessons.sort((a, b) => a.lesson.id.localeCompare(b.lesson.id));
  return { issues, manifest: { generatedBy: "npm run content:validate", templates: entries }, files: files.length, lessons: { generatedBy: "npm run content:validate", lessons }, lessonFiles: lessonFiles.length, catalogues: cat.catalogues };
}

// ---------------------------------------------------------------- human review decisions (content:review)

export interface Decision {
  reviewer: string;
  decision: "approved" | "changes-requested";
  note: string;
  /** seeds the reviewer marked as reviewed in the review tool; approval needs every review seed */
  reviewedSeeds: number[];
  /** the reviewer ticked "I personally reviewed every variation and its visual" */
  attested: boolean;
  now: Date;
}

export class ReviewError extends Error {}

/** Apply a reviewer's decision to a template file's JSON. Pure: returns the new JSON, never writes. */
export function applyDecision(raw: Record<string, unknown>, d: Decision, reviewSeeds: number[]): Record<string, unknown> {
  const reviewer = d.reviewer.trim();
  if (reviewer.length < 2) throw new ReviewError("Enter your name as the reviewer.");
  const prov = { ...(raw.provenance as Record<string, unknown>) };
  const log = [...((prov.reviewLog as unknown[]) ?? [])];
  const at = d.now.toISOString();
  if (d.decision === "changes-requested") {
    if (!d.note.trim()) throw new ReviewError("Say what needs to change.");
    log.push({ at, by: reviewer, decision: "changes-requested", note: d.note.trim() });
    // an approval no longer stands once changes are requested
    return { ...raw, status: raw.status === "approved" ? "in-review" : raw.status, provenance: { ...prov, reviewedBy: null, reviewedAt: null, contentHash: null, reviewLog: log } };
  }
  if (!d.attested) throw new ReviewError("Confirm that you personally reviewed every variation and its visual.");
  const missing = reviewSeeds.filter((s) => !d.reviewedSeeds.includes(s));
  if (missing.length) throw new ReviewError(`Mark every variation as reviewed first (${missing.length} left).`);
  const isLesson = String(raw.id).endsWith(".lesson");
  const errors = (isLesson ? validateLesson(raw).issues : validateTemplate(raw).issues).filter((i) => i.level === "error");
  if (errors.length) throw new ReviewError(`This ${isLesson ? "lesson" : "template"} has ${errors.length} validation errors; it can't be approved until they are fixed.`);
  if (!PLAYABLE_STATUSES.includes(raw.status as never) && raw.status !== "auto-checked" && raw.status !== "draft") throw new ReviewError(`A ${String(raw.status)} template can't be approved.`);
  log.push({ at, by: reviewer, decision: "approved", note: d.note.trim() || "Approved." });
  const next = { ...raw, status: "approved" };
  return { ...next, provenance: { ...prov, reviewedBy: reviewer, reviewedAt: at.slice(0, 10), contentHash: contentHash(next), reviewLog: log } };
}
