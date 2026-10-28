// Adaptive session engine (docs/04). These tests use FIXTURE content: synthetic template ids marked
// approved inside the test only. They never touch the shipped manifest and never imply human approval.
import { describe, expect, it } from "vitest";
import raw from "@/config/learning.config.json";
import { CONFIG, maxAttempts, parseConfig } from "@/src/domain/config";
import { classOf } from "@/src/engine/graph";
import type { EngineContent, EngineTemplate } from "@/src/engine/content";
import { evaluateMastery } from "@/src/engine/mastery";
import { planDetour } from "@/src/engine/planner";
import {
  breadcrumb, canRetry, chooseStuck, completeItem, continueStep, currentItem, detourPath, mainItems, pauseSession, reconcile,
  resumeSession, SessionRecord, startSession, topFrame, updateLive, type Env, type Session,
} from "@/src/engine/session";
import { skills } from "@/src/domain/curriculum";
import type { Difficulty, Outcome } from "@/src/domain/progress";

// ------------------------------------------------------------------ fixtures
const T = (skillId: string, difficulty: Difficulty, n: number, approved = true): EngineTemplate => ({
  id: `fixture.${skillId}.${difficulty[0]}.${n}`, version: 1, skillId, chapterId: skillId.split(".")[0]!, difficulty, approved, status: approved ? "approved" : "in-review",
});
const pack = (skillIds: string[], per: Partial<Record<Difficulty, number>>, approved = true) =>
  skillIds.flatMap((s) => (Object.entries(per) as [Difficulty, number][]).flatMap(([d, n]) => Array.from({ length: n }, (_, i) => T(s, d, i + 1, approved))));
const LOM = skills.filter((s) => s.chapter === "lom").map((s) => s.id);
const SL = skills.filter((s) => s.chapter === "sl").map((s) => s.id);
const MIP = skills.filter((s) => s.chapter === "mip").map((s) => s.id);
const CONTENT: EngineContent = {
  templates: [
    ...pack(LOM, { easy: 2, medium: 2, hard: 2 }),
    ...pack(SL, { medium: 1, hard: 2 }),
    ...pack(MIP, { easy: 2, medium: 2, hard: 2 }),
    ...pack(["f.trig-ratios"], { easy: 3 }),
  ],
  lessons: [
    { id: "f.trig-ratios.lesson", skillId: "f.trig-ratios", hasAlternate: true, hasRecap: true, approved: true },
    { id: "lom.resolve-forces.lesson", skillId: "lom.resolve-forces", hasAlternate: false, hasRecap: false, approved: true },
    { id: "lom.fbd.lesson", skillId: "lom.fbd", hasAlternate: false, hasRecap: false, approved: true },
  ],
};
let clock = 1_000;
const env = (over: Partial<Env> = {}): Env => ({ content: CONTENT, now: (clock += 1000), ...over });
const start = (chapterId: string, o: { studentClass?: 11 | 12; preview?: boolean; content?: EngineContent; cfg?: Env["cfg"] } = {}) =>
  startSession({ id: `ses_${chapterId}`, chapterId, seed: 4242, studentClass: o.studentClass ?? 11, preview: o.preview }, env({ content: o.content ?? CONTENT, cfg: o.cfg }));

function answer(s: Session, outcome: Outcome, tags: string[] = [], e: Env = env()): Session {
  const it = currentItem(s);
  if (!it) throw new Error(`no question on screen; step is ${JSON.stringify(topFrame(s).step)}`);
  return completeItem(s, it.id, { outcome, tags, attemptsUsed: outcome === "independent" ? 1 : outcome === "assisted" ? 2 : 3, hintsUsed: 0 }, e);
}
const step = (s: Session) => topFrame(s).step;
const role = (s: Session) => currentItem(s)?.role;

// ------------------------------------------------------------------ configuration
describe("runtime configuration", () => {
  it("is validated and drives the rules", () => {
    expect(CONFIG.session.mainQuestionCap).toBe(16);
    expect(maxAttempts()).toBe(3);
    expect(() => parseConfig({ ...raw, mastery: { ...raw.mastery, minIndependentCorrectInWindow: 12 } })).toThrow(/minIndependentCorrectInWindow/);
    expect(() => parseConfig({ ...raw, attempts: { ...raw.attempts, invalidInputConsumesAttempt: true } })).toThrow();
  });
  it("changing thresholds changes mastery without code changes", () => {
    const mains = Array.from({ length: 8 }, (_, i) => ({ skillId: SL[i % 5]!, difficulty: (i ? "hard" : "medium") as Difficulty, outcome: "independent" as Outcome, eligible: true }));
    expect(evaluateMastery(mains, SL).mastered).toBe(false); // window of 10 not full
    const looser = parseConfig({ ...raw, mastery: { ...raw.mastery, windowSize: 8, minIndependentCorrectInWindow: 6 } });
    expect(evaluateMastery(mains, SL, looser).mastered).toBe(true);
  });
});

// ------------------------------------------------------------------ mastery evidence
describe("mastery rule", () => {
  const ten = (o: Partial<{ outcome: Outcome; eligible: boolean; difficulty: Difficulty }>[] = []) =>
    Array.from({ length: 10 }, (_, i) => ({ skillId: SL[i % 5]!, difficulty: (i ? "hard" : "medium") as Difficulty, outcome: "independent" as Outcome, eligible: true, ...(o[i] ?? {}) }));
  it("needs 10 answered, 8 independent and 2 hard independent in the window, and every required skill covered", () => {
    expect(evaluateMastery(ten(), SL).mastered).toBe(true);
    expect(evaluateMastery(ten([{}, { outcome: "assisted" }, { outcome: "assisted" }]), SL).mastered).toBe(true); // 8 of 10
    expect(evaluateMastery(ten([{}, { outcome: "assisted" }, { outcome: "assisted" }, { outcome: "exhausted" }]), SL).mastered).toBe(false); // 7 of 10
    const mediumOnly = ten(Array.from({ length: 10 }, (_, i) => ({ difficulty: (i < 9 ? "medium" : "hard") as Difficulty })));
    expect(evaluateMastery(mediumOnly, SL).hardIndependentInWindow).toBe(1);
    expect(evaluateMastery(mediumOnly, SL).mastered).toBe(false);
    expect(evaluateMastery(ten().map((m) => ({ ...m, skillId: SL[0]! })), SL).uncovered).toHaveLength(4);
  });
  it("unapproved content never counts, however well answered", () => {
    const r = evaluateMastery(ten(Array.from({ length: 10 }, () => ({ eligible: false }))), SL);
    expect(r.mastered).toBe(false);
    expect(r.independentInWindow).toBe(0);
    expect(r.ineligibleIndependent).toBe(10);
  });
});

// ------------------------------------------------------------------ selection and quick mastery
describe("main-question selection", () => {
  it("starts at medium on the most central skill with medium content, steps up after independent answers, and masters at Q10 (Journey 1)", () => {
    let s = start("sl", { studentClass: 12 });
    const first = currentItem(s)!;
    expect(first.role).toBe("main");
    expect(first.difficulty).toBe("medium");
    expect(first.skillId).toBe("sl.slope"); // most same-chapter dependents among skills with medium content
    s = answer(s, "independent");
    expect(currentItem(s)!.difficulty).toBe("hard");
    const seen: string[] = [first.skillId];
    for (let q = 2; q <= 10; q++) {
      seen.push(currentItem(s)!.skillId);
      s = answer(s, q === 4 ? "assisted" : "independent", q === 4 ? ["angle-formula-missing-modulus"] : []);
    }
    expect(new Set(seen.slice(0, 6)).size).toBe(5); // uncovered required skills come first (the assisted one is re-asked: +3 uncovered, +2 needs review)
    expect(s.status).toBe("mastered");
    expect(step(s)).toMatchObject({ kind: "done", result: "mastered" });
    expect(mainItems(s)).toHaveLength(10);
    // no template repeats while unused ones remain
    const ids = mainItems(s).map((m) => m.templateId);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("in-review content can't master a chapter, but reviewer preview (labelled, per session) can", () => {
    const inReview: EngineContent = { ...CONTENT, templates: pack(SL, { medium: 1, hard: 2 }, false) };
    let s = start("sl", { content: inReview });
    for (let q = 0; q < 16; q++) s = answer(s, "independent", [], env({ content: inReview }));
    expect(s.status).toBe("notYet");
    expect(mainItems(s).every((m) => !m.eligible)).toBe(true);
    let p = start("sl", { content: inReview, preview: true });
    for (let q = 0; q < 10; q++) p = answer(p, "independent", [], env({ content: inReview }));
    expect(p.status).toBe("mastered");
    expect(p.preview).toBe(true);
  });
  it("ends with Not yet at the 16-question cap", () => {
    let s = start("sl");
    for (let q = 0; q < 16; q++) s = answer(s, q % 2 ? "independent" : "assisted");
    expect(mainItems(s)).toHaveLength(16);
    expect(step(s)).toMatchObject({ kind: "done", result: "notYet", why: "cap" });
  });
  it("offers a fresh variation once every unused template has been asked", () => {
    const thin: EngineContent = { ...CONTENT, templates: pack(SL, { medium: 1 }) };
    let s = start("sl", { content: thin });
    for (let q = 0; q < 7; q++) s = answer(s, "independent", [], env({ content: thin }));
    expect(mainItems(s).filter((m) => m.repeat).length).toBe(2);
    expect(new Set(mainItems(s).map((m) => m.seed)).size).toBe(7);
  });
});

// ------------------------------------------------------------------ remediation
describe("remediation after an exhausted question", () => {
  it("easy diagnostic independent → worked solution, next main steps down (floor medium)", () => {
    let s = start("lom");
    s = answer(s, "independent"); // Q1 medium → hard
    expect(currentItem(s)!.difficulty).toBe("hard");
    const q2 = currentItem(s)!;
    s = answer(s, "exhausted", ["static-friction-always-max"]);
    expect(role(s)).toBe("diagnostic");
    expect(currentItem(s)!.skillId).toBe(q2.skillId);
    expect(currentItem(s)!.difficulty).toBe("easy");
    s = answer(s, "independent");
    expect(step(s)).toMatchObject({ kind: "worked", reason: "within-skill", itemId: q2.id });
    s = continueStep(s, env());
    expect(role(s)).toBe("main");
    expect(currentItem(s)!.difficulty).toBe("medium");
    expect(mainItems(s)).toHaveLength(2); // the diagnostic never enters the mastery window
  });

  it("Journey 2: friction → resolving forces → free-body diagrams, then back by worked solutions and fresh variants", () => {
    let s = start("lom");
    for (let q = 0; q < 3; q++) s = answer(s, "independent");
    // force the friction question onto the screen for the scenario
    s = withMain(s, "lom.friction", "hard");
    const q4 = currentItem(s)!;
    s = answer(s, "exhausted", ["normal-equals-weight", "static-friction-always-max", "sin-cos-swap-incline"]);
    expect(role(s)).toBe("diagnostic");
    s = answer(s, "assisted", ["normal-equals-weight", "extra-force-of-motion"]);
    // planner: resolve-forces (nearest of the best-supported candidates) is probed first
    expect(role(s)).toBe("probe");
    expect(currentItem(s)!.skillId).toBe("lom.resolve-forces");
    s = answer(s, "assisted");
    expect(s.frames).toHaveLength(2);
    expect(topFrame(s)).toMatchObject({ mode: "detour", depth: 1, skillId: "lom.resolve-forces", reason: { fromSkill: "lom.friction" } });
    expect(step(s)).toEqual({ kind: "detour-intro" });
    s = continueStep(s, env());
    expect(step(s)).toMatchObject({ kind: "lesson", lessonId: "lom.resolve-forces.lesson" });
    s = continueStep(s, env());
    expect(role(s)).toBe("detour");
    s = answer(s, "independent"); // D1
    s = answer(s, "exhausted", ["extra-force-of-motion"]); // D2
    // both easy resolve-forces variants are used (probe, D1), so the easy diagnostic is skipped and the planner runs
    if (role(s) === "diagnostic") s = answer(s, "exhausted", ["extra-force-of-motion"]);
    expect(role(s)).toBe("probe");
    expect(currentItem(s)!.skillId).toBe("lom.fbd");
    s = answer(s, "exhausted", ["extra-force-of-motion"]);
    expect(s.frames.map((f) => f.skillId)).toEqual([null, "lom.resolve-forces", "lom.fbd"]);
    expect(breadcrumb(s).map((c) => [c.skillId, c.paused])).toEqual([["lom.friction", true], ["lom.resolve-forces", true], ["lom.fbd", false]]);
    s = continueStep(continueStep(s, env()), env()); // intro, explainer
    s = answer(s, "independent");
    s = answer(s, "assisted");
    s = answer(s, "independent"); // mini-mastery: 2 of 3, last independent → pop
    expect(s.frames).toHaveLength(2);
    expect(step(s)).toMatchObject({ kind: "worked", reason: "return", then: "return-question" });
    s = continueStep(s, env());
    const ret1 = currentItem(s)!;
    expect(ret1.role).toBe("return");
    s = answer(s, "independent");
    s = answer(s, "independent"); // D3 → resolve-forces mini-mastery met → pop to main
    expect(s.frames).toHaveLength(1);
    expect(step(s)).toMatchObject({ kind: "worked", itemId: q4.id, reason: "return" });
    s = continueStep(s, env());
    const ret = currentItem(s)!;
    expect(ret).toMatchObject({ role: "return", templateId: q4.templateId, difficulty: "hard", returnOf: q4.id });
    expect(ret.seed).not.toBe(q4.seed);
    s = answer(s, "independent");
    expect(role(s)).toBe("main");
    expect(currentItem(s)!.difficulty).toBe("medium"); // stepped down after the exhausted main question
    expect(mainItems(s)).toHaveLength(4); // remediation and return items never count as main questions
    expect(s.learned).toEqual(["lom.fbd", "lom.resolve-forces"]);
  });
});

/** Replace the main question on screen with one for a given skill (scenario setup only). */
function withMain(s0: Session, skillId: string, difficulty: Difficulty): Session {
  const s = structuredClone(s0);
  const it = currentItem(s)!;
  const t = CONTENT.templates.find((x) => x.skillId === skillId && x.difficulty === difficulty && !s.frames[0]!.items.some((i) => i.templateId === x.id))!;
  Object.assign(it, { skillId, difficulty, templateId: t.id });
  return s;
}

// ------------------------------------------------------------------ guards
describe("detour guards", () => {
  it("cycle guard: never plans a skill already on the stack", () => {
    const p = planDetour({ skillId: "lom.friction", tags: ["normal-equals-weight"], onStack: new Set(["lom.resolve-forces"]), excluded: new Set(), studentClass: 11, hasContent: () => true, strength: () => 0, isIndependent: () => false });
    expect(p.kind).toBe("candidates");
    if (p.kind === "candidates") expect(p.candidates.map((c) => c.skillId)).not.toContain("lom.resolve-forces");
  });
  it("class guard: a Class 11 student is never routed into Class 12 remediation", () => {
    for (const sk of skills.filter((x) => classOf(x.id) === 11)) {
      const p = planDetour({ skillId: sk.id, tags: [], onStack: new Set(), excluded: new Set(), studentClass: 11, hasContent: () => true, strength: () => 0, isIndependent: () => false });
      if (p.kind === "candidates") for (const c of p.candidates) expect(classOf(c.skillId) ?? 11).toBe(11);
    }
    const ahead = planDetour({ skillId: "cur.emf", tags: [], onStack: new Set(), excluded: new Set(), studentClass: 11, hasContent: (id) => classOf(id) === 12, strength: () => 0, isIndependent: () => false });
    expect(ahead.kind).not.toBe("candidates");
  });
  it("unavailable content: no probe for a candidate without easy content; a guided example instead", () => {
    const noEasy: EngineContent = { ...CONTENT, templates: CONTENT.templates.filter((t) => t.difficulty !== "easy" || t.skillId === "lom.friction") };
    let s = start("lom", { content: noEasy });
    s = withMainIn(s, noEasy, "lom.friction", "medium");
    s = answer(s, "exhausted", ["normal-equals-weight"], env({ content: noEasy }));
    s = answer(s, "exhausted", ["normal-equals-weight"], env({ content: noEasy })); // diagnostic
    expect(step(s)).toMatchObject({ kind: "worked", reason: "no-content" });
  });
  it("depth limit: at the maximum depth a failed probe goes to Stuck instead of a deeper frame", () => {
    const shallow = parseConfig({ ...raw, detour: { ...raw.detour, maxDepth: 1 } });
    const e = (): Env => env({ cfg: shallow });
    let s = start("lom", { cfg: shallow });
    s = withMain(s, "lom.friction", "medium");
    s = answer(s, "exhausted", ["normal-equals-weight"], e());
    s = answer(s, "exhausted", ["normal-equals-weight"], e());
    s = answer(s, "exhausted", [], e()); // probe resolve-forces → depth 1 detour
    expect(topFrame(s).depth).toBe(1);
    s = continueStep(continueStep(s, e()), e());
    // detour item, then (when an unused easy variant exists) a diagnostic, then the probe of lom.fbd, which would be depth 2
    for (let i = 0; i < 4 && currentItem(s); i++) s = answer(s, "exhausted", ["extra-force-of-motion"], e());
    expect(s.frames).toHaveLength(2);
    expect(step(s)).toMatchObject({ kind: "stuck", reason: "depth", skillId: "lom.fbd" });
    expect(canRetry(s, e())).toBe(false);
    s = chooseStuck(s, "back", e());
    expect(step(s)).toMatchObject({ kind: "worked", reason: "back-anyway" });
    expect(s.gaps).toMatchObject([{ skillId: "lom.fbd", forSkill: "lom.resolve-forces" }]);
  });
  it("sibling limit: after two sibling detours under one question, a guided example", () => {
    let s = start("mip");
    s = withMainIn(s, CONTENT, "mip.resolution", "medium");
    const q = currentItem(s)!;
    s = answer(s, "exhausted", ["sin-cos-swap"]);
    s = answer(s, "exhausted", ["opposite-adjacent-confusion"]); // diagnostic
    for (let round = 0; round < 2; round++) {
      s = answer(s, "exhausted"); // probe → detour/foundation
      expect(s.frames).toHaveLength(2);
      s = continueStep(s, env()); // intro
      if (step(s).kind === "lesson") s = continueStep(s, env());
      for (let i = 0; i < 3 && s.frames.length === 2; i++) s = answer(s, "independent");
      expect(s.frames).toHaveLength(1);
      s = continueStep(s, env()); // worked → return question
      s = answer(s, "exhausted"); // the return question fails again → next sibling (or guided)
    }
    expect(s.frames[0]!.remediation?.detoured).toHaveLength(2);
    expect(step(s)).toMatchObject({ kind: "worked", reason: "guided" });
    expect(q.id).toBeTruthy();
  });
});

function withMainIn(s0: Session, content: EngineContent, skillId: string, difficulty: Difficulty): Session {
  const s = structuredClone(s0);
  const it = currentItem(s)!;
  const t = content.templates.find((x) => x.skillId === skillId && x.difficulty === difficulty)!;
  Object.assign(it, { skillId, difficulty, templateId: t.id });
  return s;
}

// ------------------------------------------------------------------ Journey 3: foundation, stuck, pause and resume
describe("foundation frames, Stuck and exact resume (Journey 3)", () => {
  it("repeats the micro-lesson once, then Stuck; Pause keeps the stack; Continue gives a recap and new practice", () => {
    let s = start("mip");
    s = answer(s, "independent");
    s = withMainIn(s, CONTENT, "mip.resolution", "hard");
    const q2 = currentItem(s)!;
    s = answer(s, "exhausted", ["sin-cos-swap", "tan-for-component"]);
    s = answer(s, "exhausted", ["opposite-adjacent-confusion"]); // diagnostic
    expect(currentItem(s)!.skillId).toBe("f.trig-ratios"); // probe
    s = answer(s, "exhausted");
    expect(topFrame(s)).toMatchObject({ mode: "foundation", depth: 1, skillId: "f.trig-ratios" });
    expect(detourPath("mip.resolution", "f.trig-ratios")).toEqual(["mip.resolution", "f.trig-ratios"]);
    s = continueStep(s, env());
    expect(step(s)).toMatchObject({ kind: "lesson", variant: "main" });
    s = continueStep(s, env());
    s = answer(s, "independent"); s = answer(s, "exhausted"); s = answer(s, "assisted"); // 1 of 3
    expect(step(s)).toMatchObject({ kind: "lesson", variant: "alternate" });
    s = continueStep(s, env());
    s = answer(s, "exhausted"); s = answer(s, "exhausted"); // can no longer reach 2 of 3
    expect(step(s)).toMatchObject({ kind: "stuck", reason: "foundation", skillId: "f.trig-ratios" });
    expect(canRetry(s, env())).toBe(true);
    s = chooseStuck(s, "pause", env());
    expect(s.status).toBe("paused");
    // persisted and reloaded
    const reloaded = SessionRecord.parse(JSON.parse(JSON.stringify(s)));
    expect(reloaded).toEqual(s);
    let r = resumeSession(reloaded, env());
    expect(r.status).toBe("active");
    expect(step(r)).toMatchObject({ kind: "lesson", variant: "recap" });
    r = continueStep(r, env());
    r = answer(r, "independent"); r = answer(r, "independent"); // 2 independent → pop
    expect(r.frames).toHaveLength(1);
    expect(step(r)).toMatchObject({ kind: "worked", itemId: q2.id, reason: "return" });
    r = continueStep(r, env());
    expect(currentItem(r)).toMatchObject({ role: "return", templateId: q2.templateId });
    r = answer(r, "independent");
    expect(role(r)).toBe("main");
    expect(r.gaps).toEqual([]);
  });

  it("Back to the question anyway keeps the gap open and avoids skills that build on it", () => {
    let s = start("mip");
    s = withMainIn(s, CONTENT, "mip.resolution", "medium");
    s = answer(s, "exhausted", ["sin-cos-swap"]);
    s = answer(s, "exhausted", ["opposite-adjacent-confusion"]);
    s = answer(s, "exhausted");
    s = continueStep(continueStep(s, env()), env());
    for (let i = 0; i < 2; i++) s = answer(s, "exhausted");
    s = continueStep(s, env()); // alternate lesson
    for (let i = 0; i < 2; i++) s = answer(s, "exhausted");
    s = chooseStuck(s, "back", env());
    expect(s.gaps).toMatchObject([{ skillId: "f.trig-ratios", forSkill: "mip.resolution", kind: "foundation-gap" }]);
    s = continueStep(s, env());
    for (let q = 0; q < 6; q++) {
      expect(["mip.resolution", "mip.velocity-2d", "mip.projectile", "mip.ucm"]).not.toContain(currentItem(s)!.skillId);
      s = answer(s, "independent");
    }
  });
});

// ------------------------------------------------------------------ persistence-facing behaviour
describe("exact resume and idempotence", () => {
  it("completing the same question twice changes nothing; live state round-trips", () => {
    const s = start("lom");
    const it = currentItem(s)!;
    const live = { attempts: [{ input: "12 N", result: { status: "incorrect", tags: ["x"] } }], hintsShown: 1, gaveUp: false, text: "15 N", choice: [], mapping: {}, reasoning: "", selfCheck: [], widget: { a: 1 } };
    const withLive = updateLive(s, it.id, live, env());
    expect(SessionRecord.parse(JSON.parse(JSON.stringify(withLive)))).toEqual(withLive);
    const done = completeItem(withLive, it.id, { outcome: "assisted", tags: [], attemptsUsed: 2, hintsUsed: 1 }, env());
    expect(completeItem(done, it.id, { outcome: "assisted", tags: [], attemptsUsed: 2, hintsUsed: 1 }, env())).toBe(done);
    expect(mainItems(done)).toHaveLength(1);
    expect(mainItems(done)[0]!.live).toBeUndefined();
    expect(pauseSession(done, env()).status).toBe("paused");
  });
  it("substitutes a retired template for the question in progress", () => {
    const s = start("lom");
    const it = currentItem(s)!;
    const without: EngineContent = { ...CONTENT, templates: CONTENT.templates.filter((t) => t.id !== it.templateId) };
    const r = reconcile(s, env({ content: without }));
    expect(r.substituted).toBe(true);
    expect(currentItem(r.session)!.substitutedFor).toBe(it.templateId);
  });
});
