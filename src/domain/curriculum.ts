// Pure curriculum access. No React, no browser APIs (docs/01 dependency rule).
import { z } from "zod";
import chaptersJson from "@/content/curriculum/chapters.json";
import skillsJson from "@/content/curriculum/skills.json";
import foundationsJson from "@/content/curriculum/foundations.json";
import linksJson from "@/content/curriculum/related-links.json";
import generatedJson from "@/content/curriculum/curriculum.generated.json";

const Chapter = z.object({
  id: z.string(),
  title: z.string(),
  subject: z.enum(["physics", "maths"]),
  class: z.union([z.literal(11), z.literal(12)]),
});
const Skill = z.object({
  id: z.string(),
  chapter: z.string(),
  title: z.string(),
  required: z.boolean(),
  widget: z.string(),
  prereqs: z.array(z.string()),
});
const Foundation = z.object({
  id: z.string(),
  title: z.string(),
  level: z.enum(["pre-11", "bridge-11"]),
  widget: z.string(),
  prereqs: z.array(z.string()),
});
const Link = z.object({ a: z.string(), b: z.string(), note: z.string() });
const ChapterEdge = z.object({ from: z.string(), to: z.string(), via: z.array(z.string()) });

export type Chapter = z.infer<typeof Chapter>;
export type Skill = z.infer<typeof Skill>;
export type Foundation = z.infer<typeof Foundation>;
export type RelatedLink = z.infer<typeof Link>;
export type ChapterEdge = z.infer<typeof ChapterEdge>;
export type Subject = Chapter["subject"];
export type ClassLevel = Chapter["class"];

export const chapters: readonly Chapter[] = z.array(Chapter).length(24).parse(chaptersJson.chapters);
export const skills: readonly Skill[] = z.array(Skill).parse(skillsJson.skills);
export const foundations: readonly Foundation[] = z.array(Foundation).parse(foundationsJson.foundations);
export const relatedLinks: readonly RelatedLink[] = z.array(Link).parse(linksJson.links);
/** Every derived chapter → chapter dependency with the skill edges that justify it. */
export const chapterEdges: readonly ChapterEdge[] = z.array(ChapterEdge).parse(generatedJson.chapterEdges);

export const chapterById = new Map(chapters.map((c) => [c.id, c]));
export const skillById = new Map(skills.map((s) => [s.id, s]));
export const foundationById = new Map(foundations.map((f) => [f.id, f]));

export function getChapter(id: string): Chapter {
  const c = chapterById.get(id);
  if (!c) throw new Error(`Unknown chapter ${id}`);
  return c;
}

// ---------- views ----------
export type ViewId = "physics11" | "physics12" | "maths11" | "maths12";
export interface RoadmapView {
  id: ViewId;
  label: string; // "Class 11 Physics"
  short: string; // "Physics 11"
  subject: Subject;
  classLevel: ClassLevel;
}
/** Order as specified for Phase 1: Class 11 Physics, Class 12 Physics, Class 11 Maths, Class 12 Maths. */
export const VIEWS: readonly RoadmapView[] = [
  { id: "physics11", label: "Class 11 Physics", short: "Physics 11", subject: "physics", classLevel: 11 },
  { id: "physics12", label: "Class 12 Physics", short: "Physics 12", subject: "physics", classLevel: 12 },
  { id: "maths11", label: "Class 11 Maths", short: "Maths 11", subject: "maths", classLevel: 11 },
  { id: "maths12", label: "Class 12 Maths", short: "Maths 12", subject: "maths", classLevel: 12 },
];
export const viewIdOf = (c: Chapter): ViewId => `${c.subject}${c.class}` as ViewId;
export const viewOfChapter = (id: string): RoadmapView => VIEWS.find((v) => v.id === viewIdOf(getChapter(id)))!;
export const chaptersInView = (v: ViewId): Chapter[] => chapters.filter((c) => viewIdOf(c) === v);
export const isViewId = (s: unknown): s is ViewId => VIEWS.some((v) => v.id === s);

// ---------- graph queries ----------
const out = new Map<string, Set<string>>(chapters.map((c) => [c.id, new Set<string>()]));
const inc = new Map<string, Set<string>>(chapters.map((c) => [c.id, new Set<string>()]));
for (const e of chapterEdges) {
  out.get(e.from)!.add(e.to);
  inc.get(e.to)!.add(e.from);
}
export const directPrereqChapters = (id: string): string[] => [...(inc.get(id) ?? [])];
export const directSuccessorChapters = (id: string): string[] => [...(out.get(id) ?? [])];

/** Is there a path a ⇝ b in the derived chapter graph, optionally restricted to nodes passing `ok`? */
export function reaches(a: string, b: string, ok: (id: string) => boolean = () => true): boolean {
  const stack = [...(out.get(a) ?? [])].filter(ok);
  const seen = new Set<string>();
  while (stack.length) {
    const x = stack.pop()!;
    if (x === b) return true;
    if (seen.has(x)) continue;
    seen.add(x);
    for (const y of out.get(x) ?? []) if (ok(y)) stack.push(y);
  }
  return false;
}

export function ancestorChapters(id: string): Set<string> {
  const seen = new Set<string>();
  const stack = [...(inc.get(id) ?? [])];
  while (stack.length) {
    const x = stack.pop()!;
    if (seen.has(x)) continue;
    seen.add(x);
    stack.push(...(inc.get(x) ?? []));
  }
  return seen;
}

export const skillsOfChapter = (id: string): Skill[] => skills.filter((s) => s.chapter === id);

export interface PrereqDetail {
  chapterId: string;
  links: { prereq: string; prereqTitle: string; skill: string; skillTitle: string }[];
}
/** Direct prerequisite chapters with the exact skill links (for the chapter preview). */
export function prerequisiteDetails(id: string): PrereqDetail[] {
  return chapterEdges
    .filter((e) => e.to === id)
    .map((e) => ({
      chapterId: e.from,
      links: e.via.map((v) => {
        const [prereq, skill] = v.split(" → ") as [string, string];
        return { prereq, prereqTitle: skillById.get(prereq)?.title ?? prereq, skill, skillTitle: skillById.get(skill)?.title ?? skill };
      }),
    }))
    .sort((a, b) => getChapter(a.chapterId).class - getChapter(b.chapterId).class);
}

/** Foundation micro-skills that the chapter's skills use directly. */
export function foundationsUsedBy(id: string): Foundation[] {
  const ids = new Set(skillsOfChapter(id).flatMap((s) => s.prereqs).filter((p) => foundationById.has(p)));
  return [...ids].map((f) => foundationById.get(f)!);
}

export function relatedOf(id: string): { chapterId: string; note: string }[] {
  return relatedLinks
    .filter((l) => l.a === id || l.b === id)
    .map((l) => ({ chapterId: l.a === id ? l.b : l.a, note: l.note }));
}
