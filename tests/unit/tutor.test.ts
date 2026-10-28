import { describe, expect, it } from "vitest";
import { entryById } from "@/src/content/catalog";
import { instantiate, type QuestionInstance } from "@/src/content/instantiate";
import type { ClientState, TutorAction, TutorRequest } from "@/src/tutor/contract";
import { answerForms, buildMaterial, instanceFor, permissionsFor, TutorContextError } from "@/src/tutor/context";
import { leakProblem, textProblem, validateProviderOutput } from "@/src/tutor/guard";
import { runTurn } from "@/src/tutor/orchestrator";
import { authoredHintsProvider, authoredOutput } from "@/src/tutor/providers/authored";
import { FIXTURE_TRIGGERS, fixtureProvider } from "@/src/tutor/providers/fixture";
import { rebuildState, tutorTargets, widgetSnapshot } from "@/src/tutor/snapshot";
import { WIDGETS } from "@/src/widgets/registry";

const FBD = "lom.fbd.m.box-pulled-by-rope";
const GRAPH = "lim.derivative-rules.m.power-rule-tangent";
const key = (id: string, seed = 7) => ({ templateId: id, version: entryById.get(id)!.template.version, seed });
const inst = (id: string, seed = 7) => instantiate(entryById.get(id)!.template, seed);
const state = (p: Partial<ClientState> = {}): ClientState => ({ hintsShown: 0, phase: "answering", attempts: [], ...p });
const req = (id: string, action: TutorAction, s: Partial<ClientState> = {}, message?: string): TutorRequest => ({ requestId: "r1", question: key(id), action, state: state(s), history: [], ...(message ? { message } : {}) });
const material = (id: string, action: TutorAction, s: Partial<ClientState> = {}) => buildMaterial(inst(id), key(id), state(s), action, "Skill").material;
const freshSnapshot = (q: QuestionInstance) => { const m = WIDGETS[q.widget.type]!; return widgetSnapshot(q.widget.type, m.init(m.configSchema.parse(q.widget.config))); };

describe("question context is rebuilt from identifiers", () => {
  it("rejects unknown questions and stale versions", () => {
    expect(() => instanceFor({ templateId: "lom.nope.m.x", version: 1, seed: 1 })).toThrow(TutorContextError);
    expect(() => instanceFor({ ...key(FBD), version: 999 })).toThrow(/changed/);
    expect(instanceFor(key(FBD)).templateId).toBe(FBD);
  });
  it("re-checks reported answers: a claimed 'correct' phase without a correct answer is ignored", () => {
    const q = inst(GRAPH);
    const m = buildMaterial(q, key(GRAPH), state({ phase: "correct", attempts: ["x^2"] }), "begin", "Skill").material;
    expect(m.permissions.solutionAllowed).toBe(false);
    expect(m.solution).toBeNull();
    expect(m.attempts).toHaveLength(1);
    expect(m.attempts[0]!.status).toBe("incorrect");
  });
  it("accepts the end of the question only when the lesson would allow it", () => {
    const q = inst(GRAPH);
    expect(buildMaterial(q, key(GRAPH), state({ phase: "exhausted" }), "begin", "S").material.permissions.solutionAllowed).toBe(false);
    expect(buildMaterial(q, key(GRAPH), state({ phase: "exhausted", attempts: ["x"] }), "begin", "S").material.permissions.solutionAllowed).toBe(true);
    const right = q.selfTest.correct[0]!;
    const solved = buildMaterial(q, key(GRAPH), state({ phase: "answering", attempts: [right] }), "begin", "S").material;
    expect(solved.permissions.solutionAllowed).toBe(true);
    expect(solved.answerText).toBe(q.answerText);
  });
  it("contains only this question: no progress, class or other chapters", () => {
    const m = material(FBD, "begin");
    const s = JSON.stringify(m);
    expect(Object.keys(m).sort()).toEqual(["answerLabel", "attempts", "format", "hints", "options", "permissions", "question", "answerText", "skill", "solution", "stem", "visual"].sort());
    expect(s).not.toMatch(/class|mastery|chapterId|sessionId/i);
  });
});

describe("hint and reveal permissions", () => {
  it("only the next hint, only on request, and never the solution while the question is open", () => {
    const q = inst(FBD);
    const p0 = permissionsFor(q, { hintsShown: 0, phase: "answering" }, "begin", []);
    expect(p0).toMatchObject({ hintsConsumed: 0, nextHintLevel: null, hintLevelAllowed: 0, solutionAllowed: false });
    const p1 = permissionsFor(q, { hintsShown: 1, phase: "answering" }, "next-hint", []);
    expect(p1).toMatchObject({ nextHintLevel: 2, hintLevelAllowed: 2 });
    expect(permissionsFor(q, { hintsShown: 3, phase: "answering" }, "next-hint", []).nextHintLevel).toBeNull();
    expect(permissionsFor(q, { hintsShown: 0, phase: "exhausted" }, "begin", []).solutionAllowed).toBe(true);
  });
  it("material carries consumed hints only (plus the one being consumed) and no solution text", () => {
    const m = material(FBD, "explain-mistake", { hintsShown: 1 });
    expect(m.hints.map((h) => h.level)).toEqual([1]);
    expect(m.solution).toBeNull();
    expect(m.answerText).toBeNull();
    expect(material(FBD, "next-hint", { hintsShown: 1 }).hints.map((h) => h.level)).toEqual([1, 2]);
  });
});

describe("visual snapshots are validated against the question", () => {
  it("rebuilds a student's free-body diagram and enumerates its forces as targets", () => {
    const q = inst(FBD);
    const snap = { vectors: [{ id: "v1", kind: "weight", label: "Weight", agent: "Earth", magnitude: 10, angleDeg: -90 }] };
    const r = rebuildState("vector-board", q.widget.config, snap);
    expect(r.trusted).toBe(true);
    expect(tutorTargets("vector-board", r.state).map((t) => t.id)).toEqual(["force:v1"]);
  });
  it("ignores a tampered snapshot (magnitude beyond the board, or an agent the question doesn't offer)", () => {
    const q = inst(FBD);
    expect(rebuildState("vector-board", q.widget.config, { vectors: [{ id: "v1", kind: "weight", label: "W", agent: "Earth", magnitude: 1e6, angleDeg: 0 }] }).trusted).toBe(false);
    expect(rebuildState("vector-board", q.widget.config, { vectors: [{ id: "v1", kind: "weight", label: "W", agent: "Moon", magnitude: 5, angleDeg: 0 }] }).trusted).toBe(false);
    expect(rebuildState("vector-board", q.widget.config, "<svg onload=alert(1)>").trusted).toBe(false);
  });
  it("graph targets include the point and its tangent", () => {
    const q = inst(GRAPH);
    const r = rebuildState("graph-plot", q.widget.config, freshSnapshot(q));
    expect(r.trusted).toBe(true);
    expect(tutorTargets("graph-plot", r.state).map((t) => t.id)).toEqual(expect.arrayContaining(["point:P", "tangent:P"]));
  });
});

describe("output guard", () => {
  const m = material(GRAPH, "ask", { hintsShown: 1 });
  const forms = answerForms(inst(GRAPH));
  it("accepts short grounded guidance with a permitted tool", () => {
    const g = validateProviderOutput({ kind: "guidance", say: "Move point P and compare how the slope changes.", tools: [{ name: "highlight", args: { target: "tangent:P" } }] }, m, forms);
    expect(g).toMatchObject({ ok: true });
  });
  it("rejects malformed shapes, extra fields and wrong types", () => {
    expect(validateProviderOutput({ say: 42 }, m, forms)).toMatchObject({ ok: false, reason: "malformed" });
    expect(validateProviderOutput({ kind: "guidance", say: "Hi there friend.", tools: [], extra: 1 }, m, forms)).toMatchObject({ ok: false, reason: "malformed" });
    expect(validateProviderOutput({ kind: "guidance", say: "Look.", tools: [{ name: "run_code", args: { src: "x" } }] }, m, forms)).toMatchObject({ ok: false, reason: "malformed" });
  });
  it("rejects links, markup, code and long lectures", () => {
    expect(textProblem("See https://example.com for the method.")).toBe("link");
    expect(textProblem("Look at <b>this</b> line on the graph.")).toBe("markup or code");
    expect(textProblem("One. Two. Three. Four. Five. Six sentences here.")).toBe("too many sentences");
  });
  it("rejects the answer's own forms, 'the answer is' phrasing and numbers the student hasn't seen", () => {
    const q = inst("kin.acceleration.m.vt-area");
    const mq = buildMaterial(q, key("kin.acceleration.m.vt-area"), state(), "ask", "S").material;
    const f = answerForms(q);
    const v = q.check.kind === "quantity" ? q.check.value : 0;
    expect(leakProblem(`It travels ${v} m in total.`, mq, f)?.reason).toBe("answer-leak");
    expect(leakProblem("The answer is the area, so add the shapes.", mq, f)?.reason).toBe("answer-leak");
    expect(leakProblem("Try 7381.25 as a guess.", mq, f)?.reason).toBe("ungrounded");
    expect(leakProblem("Split the region into a rectangle and a triangle.", mq, f)).toBeNull();
  });
  it("rejects tools that aren't permitted: later hints, unknown targets, tools in a redirect", () => {
    expect(validateProviderOutput({ kind: "guidance", say: "Here is a helpful nudge.", tools: [{ name: "show_hint", args: { level: 3 } }] }, m, forms)).toMatchObject({ ok: false, reason: "unauthorised-tool" });
    expect(validateProviderOutput({ kind: "guidance", say: "Here is a helpful nudge.", tools: [{ name: "highlight", args: { target: "force:zz" } }] }, m, forms)).toMatchObject({ ok: false, reason: "unauthorised-tool" });
    expect(validateProviderOutput({ kind: "redirect", say: "Let's stay on this question.", tools: [{ name: "highlight", args: { target: "point:P" } }] }, m, forms)).toMatchObject({ ok: false, reason: "unauthorised-tool" });
  });
});

describe("authored provider wraps the hint ladder and cues", () => {
  it("next hint is the authored hint, with its visual cue and counted as a hint", async () => {
    const q = inst(FBD);
    const m = buildMaterial(q, key(FBD), state({ hintsShown: 0 }), "next-hint", "S").material;
    const r = await runTurn(authoredHintsProvider, m, req(FBD, "next-hint"), { answerForms: [], timeoutMs: 1000 });
    expect(r.text).toBe(q.hints[0]!.text);
    expect(r.assistance).toBe("hint");
    expect(r.source).toBe("authored");
    expect(r.grounding).toEqual(["hint:1"]);
  });
  it("'Help me begin' orients without counting as assistance; typed questions are redirected", async () => {
    const m = material(FBD, "begin");
    const r = await runTurn(authoredHintsProvider, m, req(FBD, "begin"), { answerForms: [], timeoutMs: 1000 });
    expect(r.assistance).toBe("none");
    const a = await runTurn(authoredHintsProvider, material(FBD, "ask"), req(FBD, "ask", {}, "what is friction?"), { answerForms: [], timeoutMs: 1000 });
    expect(a.assistance).toBe("none");
    expect(a.text).toMatch(/live tutor/);
  });
  it("guides through a free-body diagram: highlights a force and asks which object exerts it", () => {
    const q = inst(FBD);
    const snap = { vectors: [{ id: "v1", kind: "tension", label: "Tension", agent: "rope", magnitude: 10, angleDeg: 30 }] };
    const { material: m } = buildMaterial(q, key(FBD), state({ snapshot: snap }), "guide-visual", "S");
    const out = authoredOutput(m, { action: "guide-visual" });
    expect(out.say).toMatch(/Which object is exerting this force/);
    expect(out.tools).toEqual([{ name: "highlight", args: { target: "force:v1" } }]);
  });
  it("explains the last mistake with the lesson's own misconception feedback", async () => {
    const q = inst(GRAPH);
    const wrong = q.selfTest.buggy[0]!;
    const m = buildMaterial(q, key(GRAPH), state({ attempts: [wrong.input] }), "explain-mistake", "S").material;
    const r = await runTurn(authoredHintsProvider, m, req(GRAPH, "explain-mistake", { attempts: [wrong.input] }), { answerForms: [], timeoutMs: 1000 });
    expect(r.text).toBe(m.attempts[0]!.feedback);
  });
});

describe("live-provider turns fall back to authored guidance on any failure", () => {
  const run = (message: string, timeoutMs = 2000, signal?: AbortSignal) => {
    const q = inst(GRAPH);
    const m = buildMaterial(q, key(GRAPH), state({ snapshot: freshSnapshot(q) }), "ask", "S").material;
    return runTurn(fixtureProvider, m, req(GRAPH, "ask", { snapshot: freshSnapshot(q) }, message), { answerForms: answerForms(q), timeoutMs, signal });
  };
  it("a valid fixture reply passes the guard and is labelled as fixture output", async () => {
    const r = await run("how do I start?");
    expect(r.source).toBe("fixture");
    expect(r.fallback).toBeUndefined();
    expect(r.assistance).toBe("demonstration");
    expect(r.tools[0]!.name).toBe("highlight");
  });
  it.each([
    [FIXTURE_TRIGGERS.malformed, "malformed"],
    [FIXTURE_TRIGGERS.leak, "answer-leak"],
    [FIXTURE_TRIGGERS.tool, "unauthorised-tool"],
    [FIXTURE_TRIGGERS.error, "provider-error"],
    [FIXTURE_TRIGGERS.ratelimit, "rate-limited"],
  ])("%s → authored fallback (%s)", async (msg, reason) => {
    const r = await run(msg);
    expect(r.source).toBe("authored");
    expect(r.fallback?.reason).toBe(reason);
    expect(r.tools.every((t) => t.name !== "show_hint" || t.args.level <= 0)).toBe(true);
  });
  it("times out slow providers and honours cancellation", async () => {
    expect((await run(FIXTURE_TRIGGERS.slow, 50)).fallback?.reason).toBe("timeout");
    const ctrl = new AbortController();
    const p = run(FIXTURE_TRIGGERS.slow, 5000, ctrl.signal);
    ctrl.abort();
    expect((await p).fallback?.reason).toBe("cancelled");
  });
});
