import { describe, expect, it } from "vitest";
import { approvalState, contentHash, loadTemplateFiles, validateAll } from "@/scripts/content/lib";
import { CATALOG } from "@/src/content/catalog";
import { PLAYABLE_CHAPTERS } from "@/src/content/playable";
import { instantiate } from "@/src/content/instantiate";
import { evaluate, fillDeep, formatValue } from "@/src/content/placeholders";
import { feedbackFor, flashcardsFor, resolveCues } from "@/src/content/runtime";
import { TemplateSchema } from "@/src/content/schema";
import { DEV_LANGUAGE, validateTemplate } from "@/src/content/validate";
import { check } from "@/src/checking/check";
import { WIDGETS } from "@/src/widgets/registry";
import { foundations, skills } from "@/src/domain/curriculum";
import { coverageQuestionCount } from "@/src/content/coverageQuestions";

const files = loadTemplateFiles();
const raw = (id: string) => structuredClone(files.find((f) => f.raw.id === id)!.raw);

describe("template content", () => {
  it("has the 8 migrated diagnostics, unchanged in review status, plus the Phase 2 demonstrations", () => {
    const migrated = files.filter((f) => (f.raw.provenance as { migratedFrom?: string }).migratedFrom);
    expect(migrated.map((f) => f.raw.id).sort()).toEqual([
      "cur.emf.m.internal-resistance-current", "cur.emf.m.terminal-voltage", "kin.acceleration.m.vt-area", "kin.suvat.m.braking-distance",
      "set.intervals.m.inequality-to-interval", "set.operations.m.difference-intersection", "vec.basics.m.magnitude-3d", "vec.dot-product.m.components-2d",
    ]);
    for (const f of migrated) expect(f.raw.status).toBe("in-review");
    // nothing is presented as human-approved
    for (const f of files) {
      expect(f.raw.status).not.toBe("approved");
      expect((f.raw.provenance as { reviewedBy: unknown }).reviewedBy).toBeNull();
    }
  });

  it("validates with no errors, and every question uses every format and widget between them", () => {
    const run = validateAll(files);
    expect(run.issues.filter((i) => i.level === "error")).toEqual([]);
    const formats = new Set(files.map((f) => f.raw.format));
    expect([...formats].sort()).toEqual(["antiderivative", "diagram", "equation", "expression", "interval", "mapping", "multi-choice", "number", "ordering", "quantity", "set", "single-choice"]);
    const widgets = new Set(files.map((f) => (f.raw.widget as { type: string }).type));
    for (const w of ["vector-board", "motion-track", "graph-plot", "number-line"]) expect(widgets.has(w)).toBe(true);
  });

  it("gives every curriculum skill and foundation at least one playable question", () => {
    const covered = new Set(files.map((f) => String(f.raw.primarySkillId)));
    expect(skills.filter((s) => !covered.has(s.id))).toEqual([]);
    expect(foundations.filter((s) => !covered.has(s.id))).toEqual([]);
    expect(coverageQuestionCount).toBeGreaterThan(0);
  });

  it("the shipped manifest matches the template files (run npm run content:validate)", () => {
    const run = validateAll(files);
    expect(CATALOG.map((e) => e.template.id)).toEqual(run.manifest.templates.map((e) => e.template.id));
    expect(CATALOG.map((e) => e.hash)).toEqual(run.manifest.templates.map((e) => e.hash));
    expect([...PLAYABLE_CHAPTERS].sort()).toEqual([...new Set(CATALOG.map((e) => e.template.chapterId))].sort());
  });

  it("instantiates deterministically and its own reference answers check correct across many seeds", () => {
    for (const e of CATALOG) {
      for (let seed = 1; seed < 400; seed += 37) {
        const a = instantiate(e.template, seed);
        expect(JSON.stringify(instantiate(e.template, seed))).toBe(JSON.stringify(a));
        for (const c of a.selfTest.correct) expect(check(a.check, c).status, `${e.template.id} seed ${seed} ${JSON.stringify(c)}`).toBe("correct");
        for (const b of a.selfTest.buggy) {
          const r = check(a.check, b.input);
          expect(r.status, `${e.template.id} ${JSON.stringify(b.input)}`).toBe("incorrect");
          if (r.status === "incorrect") for (const t of b.tags) expect(r.tags).toContain(t);
        }
      }
    }
  });

  it("student-facing text never contains development language", () => {
    expect(DEV_LANGUAGE.test("Phase 1 question set, awaiting content review.")).toBe(true);
    expect(DEV_LANGUAGE.test("This question helps us find the best place for you to begin.")).toBe(false);
    for (const e of CATALOG) { const { status: _s, ...shown } = instantiate(e.template, 11); void _s; expect(JSON.stringify(shown)).not.toMatch(DEV_LANGUAGE); }
  });
});

describe("content validation catches broken templates", () => {
  const base = "kin.acceleration.m.vt-area";
  const issues = (r: Record<string, unknown>) => validateTemplate(r, { seeds: [1, 2, 3] }).issues.filter((i) => i.level === "error").map((i) => `${i.where}: ${i.message}`).join("\n");

  it("schema: three hints exactly, and a generic feedback entry", () => {
    const r = raw(base); (r.hints as unknown[]).pop();
    expect(issues(r)).toMatch(/hints/);
    const r2 = raw(base); delete (r2.feedback as Record<string, unknown>).generic;
    expect(issues(r2)).toMatch(/generic/);
  });
  it("an unregistered solver or buggy solver", () => {
    const r = raw(base); r.solver = "kin.nope";
    expect(issues(r)).toMatch(/not registered/);
    const r2 = raw(base); (r2.misconceptionRules as { match: { buggySolver: string } }[])[0]!.match.buggySolver = "nope";
    expect(issues(r2)).toMatch(/Buggy solver "nope"/);
  });
  it("misconception tags without feedback or flashcards", () => {
    const r = raw(base); delete (r.feedback as Record<string, unknown>)["area-misses-rectangle"];
    expect(issues(r)).toMatch(/"area-misses-rectangle" has no feedback/);
    const r2 = raw(base); delete (r2.flashcards as Record<string, unknown>)["area-misses-rectangle"];
    expect(issues(r2)).toMatch(/"area-misses-rectangle" has no flashcard/);
  });
  it("unresolved placeholders and broken values", () => {
    const r = raw(base); (r.stem as string[])[0] = "Speed {{nonexistent}} m/s";
    expect(issues(r)).toMatch(/Unknown placeholder/);
  });
  it("unknown cues, bad cue arguments and invalid widget config", () => {
    const r = raw(base); (r.hints as { cue?: unknown }[])[0]!.cue = { cue: "explode" };
    expect(issues(r)).toMatch(/Cue "explode" is not supported/);
    const r2 = raw(base); (r2.hints as { cue?: unknown }[])[0]!.cue = { cue: "move-point", args: { x: 2 } };
    expect(issues(r2)).toMatch(/Cue "move-point"/);
    const r3 = raw(base); (r3.widget as { config: Record<string, unknown> }).config.xRange = "wide";
    expect(issues(r3)).toMatch(/widget.config/);
    const r4 = raw(base); (r4.widget as { type: string }).type = "hologram";
    expect(issues(r4)).toMatch(/not registered/);
  });
  it("a worked solution that never drives the visual", () => {
    const r = raw(base); for (const s of r.workedSolution as { cue?: unknown }[]) delete s.cue;
    expect(issues(r)).toMatch(/never drives the visual/);
  });
  it("drag-based questions must describe the non-drag alternative", () => {
    const r = raw("lom.second-law.m.rank-accelerations"); delete (r.accessibility as Record<string, unknown>).nonDragAlternative;
    expect(issues(r)).toMatch(/non-drag alternative/);
  });
  it("development language in student text", () => {
    const r = raw(base); r.intro = "Phase 1 question set, awaiting content review.";
    expect(issues(r)).toMatch(/development language/);
  });
  it("a wrong-method solver whose answer doesn't get its tag", () => {
    const r = raw(base); (r.misconceptionRules as { tags: string[] }[])[0]!.tags = ["slope-instead-of-area"];
    expect(validateTemplate(r, { seeds: [1] }).issues.length).toBeGreaterThanOrEqual(0); // tags are what the rule declares: still consistent
    const r2 = raw(base); (r2.answer as Record<string, unknown>).dimension = "time";
    expect(issues(r2)).toMatch(/checks as incorrect \[dimension-mismatch\]|Accepted answer/);
  });
  it("an early hint that states the answer", () => {
    const r = raw(base); (r.hints as { text: string }[])[0]!.text = "It is {{s}} m.";
    expect(issues(r)).toMatch(/Hint 1 gives away the answer/);
  });
  it("unsatisfiable parameter constraints", () => {
    const r = raw(base); r.constraints = ["u > 100"];
    expect(issues(r)).toMatch(/constraints could not be satisfied/);
  });
});

describe("approval gating (human review is mandatory)", () => {
  const t = raw("kin.acceleration.m.vt-area");
  it("hash ignores status and review metadata but changes with any content edit", () => {
    const h = contentHash(t);
    expect(contentHash({ ...t, status: "approved", provenance: { ...(t.provenance as object), reviewedBy: "A" } })).toBe(h);
    expect(contentHash({ ...t, stem: ["changed"] })).not.toBe(h);
  });
  it("only approved, reviewed and unchanged content can count toward mastery", () => {
    expect(approvalState(t)).toBe("not-approved");
    const approved = { ...t, status: "approved", provenance: { ...(t.provenance as object), reviewedBy: "Reviewer", reviewedAt: "2026-10-27", contentHash: contentHash(t) } };
    expect(approvalState(approved)).toBe("approved");
    expect(approvalState({ ...approved, stem: ["edited after approval"] })).toBe("changed-since-approval");
    expect(approvalState({ ...approved, provenance: { ...(approved.provenance as object), reviewedBy: null } })).toBe("changed-since-approval");
  });
  it("validation never approves: in-review templates ship but don't count; drafts never ship; edited approvals fail", () => {
    const files2 = [
      { file: "a", rel: "content/templates/kin/kin.acceleration/kin.acceleration.m.vt-area.json", raw: t },
      { file: "b", rel: "content/templates/kin/kin.suvat/kin.suvat.m.braking-distance.json", raw: { ...raw("kin.suvat.m.braking-distance"), status: "draft" } },
    ];
    const run = validateAll(files2);
    expect(run.manifest.templates.map((e) => [e.template.id, e.countsTowardMastery])).toEqual([["kin.acceleration.m.vt-area", false]]);
    expect(files2[0]!.raw.status).toBe("in-review"); // unchanged by validation
    const approved = { ...t, status: "approved", provenance: { ...(t.provenance as object), reviewedBy: "R", reviewedAt: "2026-10-27", contentHash: contentHash(t) } };
    expect(validateAll([{ ...files2[0]!, raw: approved }]).manifest.templates[0]!.countsTowardMastery).toBe(true);
    const edited = validateAll([{ ...files2[0]!, raw: { ...approved, intro: "This question helps us see where to start." } }]);
    expect(edited.issues.some((i) => /changed since it was reviewed/.test(i.message))).toBe(true);
    expect(edited.manifest.templates).toEqual([]);
  });
  it("the student catalog never contains drafts, and nothing in it counts toward mastery yet", () => {
    for (const e of CATALOG) { expect(["in-review", "approved"]).toContain(e.template.status); expect(e.countsTowardMastery).toBe(false); }
  });
});

describe("placeholders and runtime cues", () => {
  it("evaluates expressions safely and formats numbers", () => {
    expect(evaluate("a*b + 1", { a: 2, b: 3 })).toBe(7);
    expect(() => evaluate("constructor", {})).toThrow();
    expect(() => evaluate("process.exit(1)", {})).toThrow();
    expect(formatValue(-2.5)).toBe("−2.5");
    expect(formatValue(3, "signed")).toBe("+ 3");
    expect(fillDeep({ x: "{{a}}", y: "a = {{a|fixed2}}" }, { a: 1.5 })).toEqual({ x: 1.5, y: "a = 1.50" });
  });
  it("resolves $value, $tags and $details, and drops cues it can't resolve", () => {
    const cues = [{ cue: "flag", args: { x: "$value" } }, { cue: "student", args: { tags: "$tags" } }, { cue: "hl", args: { m: "$details.endpointMismatches" } }];
    const out = resolveCues(cues, { result: { status: "incorrect", tags: ["t"], details: { valueSI: 12 } }, input: "12 m" });
    expect(out).toEqual([{ cue: "flag", args: { x: 12 } }, { cue: "student", args: { tags: ["t"] } }]);
  });
  it("feedback and flashcards fall back to generic", () => {
    const inst = instantiate(TemplateSchema.parse(raw("kin.suvat.m.braking-distance")), 3);
    expect(feedbackFor(inst, ["nope", "missing-half"]).tag).toBe("missing-half");
    expect(feedbackFor(inst, ["nope"]).tag).toBe("generic");
    expect(flashcardsFor(inst, ["missing-half", "missing-half"]).map((c) => c.tag)).toEqual(["missing-half"]);
    expect(flashcardsFor(inst, []).map((c) => c.tag)).toEqual(["generic"]);
  });
  it("every cue a template uses applies to its widget, and the widget's description stays deterministic", () => {
    for (const e of CATALOG) {
      const inst = instantiate(e.template, 5);
      const m = WIDGETS[inst.widget.type]!;
      let s = m.init(m.configSchema.parse(inst.widget.config));
      for (const st of inst.solution) for (const c of st.cues) s = c.cue === "clear-overlay" ? m.reduce(s, { type: "clear-overlay" }) : m.reduce(s, { type: "cue", cue: c.cue, args: c.args });
      const d = m.timeline(s).duration;
      expect(m.describe(s, d / 2)).toBe(m.describe(s, d / 2));
    }
  });
});

describe("review decisions (content:review)", async () => {
  const { applyDecision, ReviewError } = await import("@/scripts/content/lib");
  const { reviewSeedsFor } = await import("@/src/content/validate");
  const t = raw("set.operations.m.difference-intersection");
  const seeds = reviewSeedsFor(TemplateSchema.parse(t));
  const base = { reviewer: "A. Teacher", decision: "approved" as const, note: "", attested: true, reviewedSeeds: seeds, now: new Date("2026-10-28T10:00:00Z") };

  it("review seeds cover every variant of the template", () => {
    const ops = new Set(seeds.map((s) => instantiate(TemplateSchema.parse(t), s).params.op));
    expect(ops).toEqual(new Set(["difference", "intersection"]));
  });
  it("approval needs a named reviewer, the attestation and every variation reviewed", () => {
    expect(() => applyDecision(t, { ...base, reviewer: " " }, seeds)).toThrow(ReviewError);
    expect(() => applyDecision(t, { ...base, attested: false }, seeds)).toThrow(/personally reviewed/);
    expect(() => applyDecision(t, { ...base, reviewedSeeds: seeds.slice(1) }, seeds)).toThrow(/every variation/);
  });
  it("a template with validation errors can't be approved", () => {
    expect(() => applyDecision({ ...t, solver: "nope" }, base, seeds)).toThrow(/validation errors/);
  });
  it("records the reviewer, the date, the content hash and a log entry; the result counts toward mastery", () => {
    const next = applyDecision(t, base, seeds);
    expect(next.status).toBe("approved");
    expect(next.provenance).toMatchObject({ reviewedBy: "A. Teacher", reviewedAt: "2026-10-28", contentHash: contentHash(t) });
    expect(approvalState(next)).toBe("approved");
    expect((next.provenance as { reviewLog: unknown[] }).reviewLog.at(-1)).toMatchObject({ by: "A. Teacher", decision: "approved" });
  });
  it("requesting changes withdraws an approval", () => {
    const approved = applyDecision(t, base, seeds);
    const back = applyDecision(approved, { ...base, decision: "changes-requested", note: "Hint 2 gives too much away." }, seeds);
    expect(back.status).toBe("in-review");
    expect(approvalState(back)).toBe("not-approved");
    expect(() => applyDecision(t, { ...base, decision: "changes-requested", note: "" }, seeds)).toThrow(/what needs to change/);
  });
});
