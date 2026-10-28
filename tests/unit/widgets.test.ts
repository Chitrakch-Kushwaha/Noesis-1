import { describe, expect, it } from "vitest";
import { initialTransport, transportReduce, type TransportState } from "@/src/widgets/transport";
import { axisComponents, predicted, resultant, vectorBoard, type VBState } from "@/src/widgets/vector-board/model";
import { laneAt, motionTrack, projectileAt, projectileFacts, type MTState } from "@/src/widgets/motion-track/model";
import { areaOf, evalFn, extremaOf, graphPlot, lineThrough, pointAt, secantH, slopeAt, type GPState } from "@/src/widgets/graph-plot/model";
import { contains, numberLine, testX, type NLState } from "@/src/widgets/number-line/model";
import { WIDGETS } from "@/src/widgets/registry";
import { angleAt, geometry, roleOf, type TEState } from "@/src/widgets/triangle-explorer/model";

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThanOrEqual(tol * Math.max(1, Math.abs(b)));

describe("transport", () => {
  const T = (): TransportState => transportReduce(initialTransport(), { type: "timeline", duration: 2, keyframes: [0, 0.5, 1, 1.5, 2] });
  it("plays, pauses, ticks to the end and stops", () => {
    let s = transportReduce(T(), { type: "play" });
    s = transportReduce(s, { type: "tick", dt: 0.3 });
    expect(s.t).toBeCloseTo(0.3);
    s = transportReduce(s, { type: "pause" });
    expect(transportReduce(s, { type: "tick", dt: 1 }).t).toBeCloseTo(0.3);
    s = transportReduce(transportReduce(s, { type: "play" }), { type: "tick", dt: 5 });
    expect(s).toMatchObject({ t: 2, playing: false });
  });
  it("steps between keyframes in both directions", () => {
    let s = transportReduce(T(), { type: "scrub", t: 0.7 });
    s = transportReduce(s, { type: "stepForward" });
    expect(s.t).toBe(1);
    s = transportReduce(s, { type: "stepBack" });
    expect(s.t).toBe(0.5);
    s = transportReduce(transportReduce(s, { type: "scrub", t: 2 }), { type: "stepForward" });
    expect(s.t).toBe(2);
  });
  it("scrubs within bounds, resets, replays from the start", () => {
    expect(transportReduce(T(), { type: "scrub", t: 9 }).t).toBe(2);
    expect(transportReduce(T(), { type: "scrub", t: -1 }).t).toBe(0);
    const playingEnd = transportReduce(transportReduce(T(), { type: "scrub", t: 2 }), { type: "play" });
    expect(playingEnd).toMatchObject({ t: 0, playing: true });
    expect(transportReduce(transportReduce(T(), { type: "scrub", t: 1 }), { type: "reset" })).toMatchObject({ t: 0, playing: false });
    expect(transportReduce(transportReduce(T(), { type: "scrub", t: 1 }), { type: "replay" })).toMatchObject({ t: 0, playing: true });
  });
  it("reduced motion: an autoplaying cue jumps straight to its final state", () => {
    const s = transportReduce(initialTransport(), { type: "timeline", duration: 1.5, keyframes: [0, 1.5], autoplay: true, reduced: true });
    expect(s).toMatchObject({ t: 1.5, playing: false });
    const full = transportReduce(initialTransport(), { type: "timeline", duration: 1.5, keyframes: [0, 1.5], autoplay: true });
    expect(full).toMatchObject({ t: 0, playing: true });
  });
  it("a zero-length timeline never plays", () => {
    expect(transportReduce(initialTransport(), { type: "play" }).playing).toBe(false);
  });
});

describe("vector board model", () => {
  const cfg = {
    scene: "incline" as const, inclineDeg: 30, body: { label: "block", mass: 4 }, maxMagnitude: 50, allowAdd: true, predict: true,
    kinds: [{ kind: "friction", label: "Friction" }, { kind: "normal", label: "Normal" }], agents: ["Earth", "plank", "none"],
    vectors: [{ id: "W", kind: "weight", label: "Weight", agent: "Earth", magnitude: 39.2, angleDeg: -90, locked: true }],
  };
  const s0 = vectorBoard.init(cfg) as VBState;
  it("computes the resultant and the predicted motion exactly", () => {
    const r = resultant([{ id: "a", kind: "f", label: "", magnitude: 3, angleDeg: 0 }, { id: "b", kind: "f", label: "", magnitude: 4, angleDeg: 90 }]);
    near(r.magnitude, 5); near(r.angleDeg, (Math.atan2(4, 3) * 180) / Math.PI, 1e-6);
    const p = predicted(s0.vectors, 4, 1.5);
    near(p.ay, -9.8); near(p.dy, 0.5 * -9.8 * 2.25);
  });
  it("resolves the weight along tilted incline axes", () => {
    const c = axisComponents(s0.vectors[0]!, "tilted", 30);
    near(c.along, -39.2 * 0.5, 1e-9); // mg sin θ down the slope
    near(c.perp, -39.2 * Math.cos(Math.PI / 6), 1e-9); // mg cos θ into the surface
  });
  it("supports add, rotate, scale, drag, agent labels and removal through the same reducer as the keyboard", () => {
    let s = vectorBoard.reduce(s0, { type: "add", kind: "normal", agent: "plank" }) as VBState;
    const id = s.selected!;
    s = vectorBoard.reduce(s, { type: "set", id, magnitude: 33.95, angleDeg: 60 }) as VBState;
    s = vectorBoard.reduce(s, { type: "rotate", id, delta: 5 }) as VBState;
    s = vectorBoard.reduce(s, { type: "scale", id, delta: 0.5 }) as VBState;
    const v = s.vectors.find((x) => x.id === id)!;
    expect(v).toMatchObject({ agent: "plank", angleDeg: 65 });
    near(v.magnitude, 34.45, 1e-9);
    s = vectorBoard.reduce(s, { type: "drag-to", id, fx: 0, fy: 20.2 }) as VBState;
    expect(s.vectors.find((x) => x.id === id)).toMatchObject({ magnitude: 20, angleDeg: 90 }); // snapped
    s = vectorBoard.reduce(s, { type: "set", id: "W", magnitude: 1 }) as VBState;
    expect(s.vectors[0]!.magnitude).toBe(39.2); // locked vectors never change
    s = vectorBoard.reduce(s, { type: "remove", id }) as VBState;
    expect(s.vectors).toHaveLength(1);
  });
  it("cues: highlight, decompose, meter, predict-without and compare", () => {
    let s = vectorBoard.reduce(s0, { type: "cue", cue: "decompose", args: { id: "W", axes: "tilted" } }) as VBState;
    expect(s).toMatchObject({ axes: "tilted", overlay: { decompose: "W" } });
    s = vectorBoard.reduce(s, { type: "cue", cue: "meter", args: { needed: 19.6, available: 22.07 } }) as VBState;
    expect(s.overlay.meter).toEqual({ needed: 19.6, available: 22.07, label: "friction", showValues: true });
    const before = s.playToken;
    s = vectorBoard.reduce(s, { type: "cue", cue: "compare", args: { vectors: [{ kind: "weight", magnitude: 39.2, angleDeg: -90 }, { kind: "normal", magnitude: 39.2, angleDeg: 90 }] } }) as VBState;
    expect(s.overlay.compare).toHaveLength(2);
    expect(s.playToken).toBe(before + 1);
    expect(resultant(s.overlay.compare!).magnitude).toBeCloseTo(0);
  });
  it("describes the diagram for screen readers and exports the student's forces", () => {
    let s = vectorBoard.reduce(s0, { type: "add", kind: "friction", agent: "none", magnitude: 10, angleDeg: 30 }) as VBState;
    expect(vectorBoard.describe(s, 0)).toMatch(/Weight \(from Earth\): 39\.2 N straight down; Friction \(no agent\): 10 N at 30°/);
    expect(vectorBoard.answer!(s)).toEqual([{ kind: "friction", agent: "none", magnitude: 10, angleDeg: 30 }]);
    s = vectorBoard.reduce(s, { type: "reset" }) as VBState;
    expect(s.vectors).toHaveLength(1);
  });
});

describe("motion track model", () => {
  it("matches the equations of motion and stops at rest when braking", () => {
    const lane = { id: "car", label: "car", x0: 0, v0: 20, a: -4 };
    near(laneAt(lane, 2, true).x, 20 * 2 - 0.5 * 4 * 4);
    const end = laneAt(lane, 100, true);
    near(end.x, (20 * 20) / (2 * 4)); expect(end.v).toBe(0); expect(end.stopped).toBe(true);
    near(laneAt(lane, 10, false).x, 200 - 200); // without stopAtRest it reverses
  });
  it("projectile: range, apex and landing time match the formulas", () => {
    const p = { x0: 0, y0: 0, speed: 20, angleDeg: 30, g: 9.8 };
    const f = projectileFacts(p);
    near(f.range, (400 * Math.sin(Math.PI / 3)) / 9.8, 1e-9);
    near(f.apexHeight, (400 * 0.25) / (2 * 9.8), 1e-9);
    near(f.tLand, (2 * 20 * 0.5) / 9.8, 1e-9);
    expect(projectileAt(p, f.tLand + 1)).toMatchObject({ y: 0, landed: true });
  });
  it("is deterministic: the same time gives the same state, however it was reached", () => {
    const s = motionTrack.init({ mode: "1d", lanes: [{ id: "c", label: "car", x0: 0, v0: 12, a: -3 }], stopAtRest: true, editable: ["v0"] }) as MTState;
    const viaScrub = motionTrack.describe(s, 1.37);
    let tr = transportReduce(initialTransport(), { type: "timeline", ...motionTrack.timeline(s) });
    tr = transportReduce(tr, { type: "play" });
    for (let i = 0; i < 137; i++) tr = transportReduce(tr, { type: "tick", dt: 0.01 });
    expect(motionTrack.describe(s, tr.t)).toBe(viaScrub);
  });
  it("edits within ranges and supports cues", () => {
    let s = motionTrack.init({ mode: "1d", lanes: [{ id: "c", label: "car", x0: 0, v0: 12, a: -3 }], editable: ["v0"], ranges: { x0: [-10, 10], v0: [0, 30], a: [-10, 10] } }) as MTState;
    s = motionTrack.reduce(s, { type: "set-lane", lane: "c", key: "v0", value: 99 }) as MTState;
    expect(s.lanes[0]!.v0).toBe(30);
    s = motionTrack.reduce(s, { type: "set-lane", lane: "c", key: "a", value: 1 }) as MTState;
    expect(s.lanes[0]!.a).toBe(-3); // not editable
    s = motionTrack.reduce(s, { type: "cue", cue: "ghost-lane", args: { lane: { id: "g", label: "constant speed", x0: 0, v0: 12, a: 0 } } }) as MTState;
    s = motionTrack.reduce(s, { type: "cue", cue: "flag", args: { x: 24, label: "stops", tone: "good" } }) as MTState;
    expect(s.overlay.ghostLanes).toHaveLength(1);
    expect(s.overlay.flags[0]).toMatchObject({ x: 24 });
    expect(motionTrack.describe(s, 1)).toMatch(/constant speed: x = 12 m/);
  });
});

describe("graph plot model", () => {
  const cfg = {
    xRange: [-4, 4] as [number, number], yRange: [-10, 20] as [number, number],
    functions: [{ id: "f", expr: "a*x^3 - 3x" }],
    params: { a: { value: 1, min: 0, max: 3, step: 0.5 } },
    points: [{ id: "P", label: "P", on: "f", x: 2, draggable: true, step: 0.1 }, { id: "A", label: "A", x: 0, y: 1, draggable: true }, { id: "B", label: "B", x: 2, y: 5, draggable: true }],
    line: { through: ["A", "B"] as [string, string] },
    tangent: { at: "P" },
    extrema: { fn: "f" },
  };
  const s0 = graphPlot.init(cfg) as GPState;
  it("slope, area and extrema agree with calculus", () => {
    near(slopeAt(s0, "f", 2), 3 * 4 - 3, 1e-6);
    near(areaOf(s0, { top: "f", bottom: 0, from: 0, to: 2 }), 2 ** 4 / 4 - 1.5 * 4, 1e-9);
    const ex = extremaOf(s0, "f");
    expect(ex.map((e) => e.kind)).toEqual(["max", "min"]);
    near(ex[0]!.x, -1, 1e-6); near(ex[1]!.x, 1, 1e-6);
    expect(lineThrough(s0)).toMatchObject({ slope: 2, intercept: 1 });
  });
  it("moving a point on a curve keeps it on the curve; parameters update the curve", () => {
    let s = graphPlot.reduce(s0, { type: "move-point", id: "P", x: 1.04 }) as GPState;
    expect(s.points.P!.x).toBeCloseTo(1); // snapped to step 0.1
    near(s.points.P!.y, evalFn(s, "f", 1));
    s = graphPlot.reduce(s, { type: "set-param", name: "a", value: 2 }) as GPState;
    near(s.points.P!.y, 2 - 3);
  });
  it("animations are pure functions of time (sweep, secant → tangent, move-point)", () => {
    let s = graphPlot.reduce(s0, { type: "cue", cue: "sweep-area", args: { id: "A1", top: "f", from: 0, to: 2, label: "area" } }) as GPState;
    expect(graphPlot.timeline(s).duration).toBeGreaterThan(0);
    expect(graphPlot.describe(s, 0)).toMatch(/area = 0\b/);
    expect(graphPlot.describe(s, 2)).toBe(graphPlot.describe(s, 2));
    s = graphPlot.reduce(s0, { type: "cue", cue: "secant-to-tangent", args: { fn: "f", x: 1, h0: 2 } }) as GPState;
    expect(secantH(s, 0)).toBeCloseTo(2.001);
    expect(secantH(s, 2)).toBeCloseTo(0.001);
    s = graphPlot.reduce(s0, { type: "cue", cue: "move-point", args: { point: "P", x: -1 } }) as GPState;
    expect(pointAt(s, "P", 0).x).toBeCloseTo(2);
    expect(pointAt(s, "P", 2).x).toBeCloseTo(-1);
  });
  it("rejects unsafe function text through the safe parser", () => {
    expect(() => graphPlot.init({ ...cfg, functions: [{ id: "f", expr: "constructor" }] })).toThrow();
  });
});

describe("number line model", () => {
  const s0 = numberLine.init({ range: [-6, 6], step: 1, pieces: [{ lo: -1, hi: 4, loClosed: true, hiClosed: true }] }) as NLState;
  it("moves and toggles endpoints, keeps lo < hi, supports infinity and unions", () => {
    let s = numberLine.reduce(s0, { type: "toggle", index: 0, end: "lo" }) as NLState;
    expect(s.pieces[0]!.loClosed).toBe(false);
    s = numberLine.reduce(s, { type: "move", index: 0, end: "lo", value: 9 }) as NLState;
    expect(s.pieces[0]!.lo).toBe(3);
    s = numberLine.reduce(s, { type: "set-infinite", index: 0, end: "hi", infinite: true }) as NLState;
    expect(s.pieces[0]).toMatchObject({ hi: Infinity, hiClosed: false });
    s = numberLine.reduce(s0, { type: "add-piece" }) as NLState;
    expect(s.pieces).toHaveLength(2);
    expect(numberLine.answer!(numberLine.reduce(s0, { type: "set-union", union: [{ lo: 2, hi: 3, loClosed: true, hiClosed: false }, { lo: -1, hi: 2, loClosed: true, hiClosed: false }] }))).toEqual([{ lo: -1, hi: 3, loClosed: true, hiClosed: false }]);
  });
  it("test-point sweep reports membership deterministically", () => {
    const s = numberLine.reduce(s0, { type: "cue", cue: "test-point", args: { from: -6, to: 6 } }) as NLState;
    expect(testX(s, 0)).toBe(-6);
    expect(testX(s, 1.5)).toBe(0);
    expect(contains(s.pieces, 4)).toBe(true);
    expect(contains([{ lo: -1, hi: 4, loClosed: false, hiClosed: true }], -1)).toBe(false);
    expect(numberLine.describe(s, 1.5)).toMatch(/x = 0 is in the set/);
  });
  it("highlights endpoint mistakes passed from the checker", () => {
    const s = numberLine.reduce(s0, { type: "cue", cue: "highlight-endpoints", args: { mismatches: [{ piece: 0, end: "lo" }] } }) as NLState;
    expect(s.overlay.highlight).toEqual([{ piece: 0, end: "lo" }]);
    expect(numberLine.reduce(s, { type: "toggle", index: 0, end: "lo" }).overlay.highlight).toEqual([]);
  });
});

describe("registry", () => {
  it("marks interactive models and figures correctly", () => {
    // every model is an interactive one except the static figure adapter
    expect(Object.entries(WIDGETS).filter(([, m]) => !m.interactive).map(([k]) => k)).toEqual(["figure"]);
    for (const w of ["graph-plot", "motion-track", "number-line", "triangle-explorer", "vector-board", "rigid-body", "oscillator"]) expect(WIDGETS[w]?.interactive, w).toBe(true);
    expect(WIDGETS.figure!.interactive).toBe(false);
  });
});

describe("triangle explorer (Phase 3 foundation widget)", () => {
  const te = WIDGETS["triangle-explorer"]!;
  const s0 = te.init({ mode: "triangle", hypotenuse: 5, angleDeg: 37 });
  it("moving θ between the acute corners swaps opposite and adjacent", () => {
    expect(roleOf("A", "BC")).toBe("opposite");
    expect(roleOf("A", "AC")).toBe("adjacent");
    expect(roleOf("B", "BC")).toBe("adjacent");
    expect(roleOf("B", "AC")).toBe("opposite");
    expect(roleOf("B", "AB")).toBe("hypotenuse");
    const atB = te.reduce(s0, { type: "mark", at: "B" }) as TEState;
    expect(geometry(atB).theta).toBeCloseTo(53, 6);
    expect(te.describe(atB, 0)).toMatch(/Adjacent to θ: BC/);
    expect(te.describe(s0, 0)).toMatch(/Adjacent to θ: AC/);
  });
  it("hides lengths and ratio values unless the lesson or solution shows them", () => {
    expect(te.describe(s0, 0)).not.toMatch(/0\.6|0\.8/);
    const shown = [{ cue: "show-values" }, { cue: "show-ratios" }].reduce((s, c) => te.reduce(s, { type: "cue", cue: c.cue }), s0);
    expect(te.describe(shown, 0)).toMatch(/sin θ = 0\.6/);
  });
  it("a sweep is a pure function of time with a scrubbable timeline", () => {
    const sw = te.reduce(s0, { type: "cue", cue: "sweep", args: { from: 20, to: 60 } }) as TEState;
    expect(te.timeline(sw).duration).toBeGreaterThan(0);
    expect(angleAt(sw, 0)).toBe(20);
    expect(angleAt(sw, te.timeline(sw).duration)).toBe(60);
    expect(te.describe(sw, 1.1)).toBe(te.describe(sw, 1.1));
  });
});

describe("answer-safe display options (hints and feedback never give the answer away)", () => {
  it("vector board: symbolic decomposition, hidden meter values and hidden agents", () => {
    const s0 = vectorBoard.init({ scene: "incline", inclineDeg: 30, body: { label: "block", mass: 2 }, maxMagnitude: 30, showAgents: false, vectors: [{ id: "W", kind: "weight", label: "Weight", agent: "Earth", magnitude: 19.6, angleDeg: -90, locked: true }] } as never);
    const s = vectorBoard.reduce(s0, { type: "cue", cue: "decompose", args: { id: "W", axes: "tilted", values: false } }) as VBState;
    expect(s.overlay.decomposeValues).toBe(false);
    expect((vectorBoard.reduce(s, { type: "cue", cue: "decompose", args: { id: "W" } }) as VBState).overlay.decomposeValues).toBe(true);
    expect((vectorBoard.reduce(s0, { type: "cue", cue: "meter", args: { needed: 9.8, available: 12, showValues: false } }) as VBState).overlay.meter?.showValues).toBe(false);
    expect(vectorBoard.describe(s0, 0)).not.toMatch(/Earth/);
  });
  it("graph plot: an area can be shown without its value", () => {
    const s0 = graphPlot.init({ xRange: [0, 4], yRange: [0, 10], functions: [{ id: "f", expr: "2x" }] } as never);
    const s = graphPlot.reduce(s0, { type: "cue", cue: "area", args: { id: "A", top: "f", from: 0, to: 3, showValue: false } }) as GPState;
    expect(graphPlot.describe(s, 0)).not.toMatch(/= 9/);
    const s2 = graphPlot.reduce(s0, { type: "cue", cue: "area", args: { id: "A", top: "f", from: 0, to: 3 } }) as GPState;
    expect(graphPlot.describe(s2, 0)).toMatch(/= 9/);
  });
  it("motion track: numbers stay hidden until the solution reveals them", () => {
    const s0 = motionTrack.init({ mode: "1d", lanes: [{ id: "c", label: "Car", x0: 0, v0: 12, a: -2 }], stopAtRest: true, hideNumbers: true } as never) as MTState;
    expect(motionTrack.describe(s0, 6)).not.toMatch(/36/);
    expect(motionTrack.describe(motionTrack.reduce(s0, { type: "cue", cue: "reveal" }), 6)).toMatch(/x = 36/);
  });
});
