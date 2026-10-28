// Phase 3 pilot content: coverage of the nine Laws of Motion skills, the journey support packs,
// lessons, misconception catalogues and hand-worked golden answers. Nothing here approves content.
import { describe, expect, it } from "vitest";
import golden from "@/content/golden/phase3.json";
import { loadLessonFiles, validateAll } from "@/scripts/content/lib";
import { CATALOG } from "@/src/content/catalog";
import { LESSONS } from "@/src/content/lessons";
import { CATALOGUES, implicates } from "@/src/content/misconceptions";
import { SOLVERS } from "@/src/content/solvers";
import { validateLesson } from "@/src/content/validateLesson";
import { skills } from "@/src/domain/curriculum";
import { shippedContent } from "@/src/engine/content";
import { hasRemediationContent } from "@/src/engine/session";

const byDifficulty = (skillId: string) => ({
  easy: CATALOG.filter((e) => e.template.primarySkillId === skillId && e.template.difficulty === "easy").length,
  medium: CATALOG.filter((e) => e.template.primarySkillId === skillId && e.template.difficulty === "medium").length,
  hard: CATALOG.filter((e) => e.template.primarySkillId === skillId && e.template.difficulty === "hard").length,
});

describe("Laws of Motion pilot coverage", () => {
  const lom = skills.filter((s) => s.chapter === "lom" && s.required).map((s) => s.id);
  it("covers all nine required skills with an easy diagnostic and at least one main-question template", () => {
    expect(lom).toHaveLength(9);
    for (const id of lom) {
      const n = byDifficulty(id);
      expect(n.easy, `${id} easy`).toBeGreaterThanOrEqual(1);
      expect(n.medium + n.hard, `${id} main`).toBeGreaterThanOrEqual(1);
    }
    for (const id of ["lom.resolve-forces", "lom.momentum-conservation", "lom.circular-dynamics"]) {
      const n = byDifficulty(id);
      expect([n.easy, n.medium, n.hard].every((x) => x >= 1), id).toBe(true);
    }
  });
  it("has enough distinct main templates for a full 16-question session without repeating one", () => {
    expect(CATALOG.filter((e) => e.template.chapterId === "lom" && e.template.difficulty !== "easy").length).toBeGreaterThanOrEqual(16);
  });
  it("detour targets reached by the pilot's misconceptions have probe content and, where planned, a lesson", () => {
    const content = shippedContent();
    for (const id of ["lom.resolve-forces", "lom.fbd", "f.trig-ratios", "mip.resolution"]) expect(hasRemediationContent(content, id), id).toBe(true);
    for (const id of ["lom.resolve-forces", "lom.fbd", "f.trig-ratios"]) expect(LESSONS.some((l) => l.lesson.skillId === id), id).toBe(true);
  });
});

describe("journey support packs", () => {
  it("Straight Lines: a medium opener and a hard template for each of the five skills (Journey 1)", () => {
    expect(byDifficulty("sl.forms").medium).toBeGreaterThanOrEqual(1);
    for (const id of ["sl.slope", "sl.angle-between", "sl.forms", "sl.general-form", "sl.distance"]) expect(byDifficulty(id).hard, id).toBeGreaterThanOrEqual(1);
  });
  it("Motion in a Plane / trig foundation: resolution at every difficulty and three foundation practice templates (Journey 3)", () => {
    const r = byDifficulty("mip.resolution");
    expect([r.easy, r.medium, r.hard].every((x) => x >= 1)).toBe(true);
    expect(byDifficulty("f.trig-ratios").easy).toBeGreaterThanOrEqual(3);
    expect(byDifficulty("mip.vector-addition").medium).toBeGreaterThanOrEqual(1);
    expect(implicates("opposite-adjacent-confusion")).toContain("f.trig-ratios");
  });
});

describe("lessons and catalogues", () => {
  it("every lesson validates; micro-lessons carry an alternate representation; foundations get a recap", () => {
    const files = loadLessonFiles();
    expect(files.length).toBeGreaterThanOrEqual(3);
    for (const f of files) expect(validateLesson(f.raw, { file: f.rel }).issues.filter((i) => i.level === "error"), String(f.raw.id)).toEqual([]);
    const trig = LESSONS.find((l) => l.lesson.skillId === "f.trig-ratios")!.lesson;
    expect(trig.kind).toBe("micro-lesson");
    expect(trig.alternate?.widget?.config.mode).toBe("vector");
    expect(trig.recap?.length).toBeGreaterThan(0);
  });
  it("catches broken lessons", () => {
    const raw = structuredClone(loadLessonFiles().find((f) => f.raw.id === "f.trig-ratios.lesson")!.raw);
    delete (raw as Record<string, unknown>).alternate;
    (raw.steps as { text: string }[])[0]!.text = "TODO write this";
    const errs = validateLesson(raw).issues.filter((i) => i.level === "error").map((i) => i.message).join("\n");
    expect(errs).toMatch(/alternate representation/);
    expect(errs).toMatch(/development language/);
  });
  it("every tag a pilot or pack template can produce is catalogued, so it can guide a detour", () => {
    const run = validateAll();
    expect(run.issues.filter((i) => i.level === "error")).toEqual([]);
    expect(run.issues.filter((i) => i.where.startsWith("tags."))).toEqual([]);
    for (const c of CATALOGUES) for (const m of c.misconceptions) expect(m.implicates.length).toBeGreaterThan(0);
  });
  it("nothing is approved automatically: templates, lessons and catalogues all await named review", () => {
    expect(CATALOG.every((e) => e.template.status === "in-review" && !e.countsTowardMastery)).toBe(true);
    expect(LESSONS.every((l) => l.lesson.status === "in-review" && !l.approved && l.lesson.provenance.reviewedBy === null)).toBe(true);
    expect(CATALOGUES.every((c) => c.status !== "approved")).toBe(true);
  });
});

describe("golden answers (hand-worked, independent of the solvers)", () => {
  type Case = { solver: string; params: Record<string, number | string>; expect?: number; expectReference?: string; expectForces?: Record<string, number> };
  for (const c of golden.cases as unknown as Case[]) {
    it(`${c.solver} ${JSON.stringify(c.params)}`, () => {
      const a = SOLVERS[c.solver]!.solve(c.params).answer;
      if (c.expect !== undefined) expect(Math.abs((a.value as number) - c.expect)).toBeLessThan(Math.max(1e-3, Math.abs(c.expect) * 1e-4));
      if (c.expectReference) expect(a.reference).toBe(c.expectReference);
      if (c.expectForces) {
        const req = (a.rules as { required: { kind: string; magnitude: number }[] }).required;
        for (const [kind, mag] of Object.entries(c.expectForces)) expect(req.find((r) => r.kind === kind)!.magnitude).toBeCloseTo(mag, 2);
      }
    });
  }
});
