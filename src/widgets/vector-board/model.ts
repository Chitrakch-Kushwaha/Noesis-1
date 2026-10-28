// Vector Board: vectors, forces, components and free-body diagrams. Pure and deterministic.
import { z } from "zod";
import { clamp, keyframesEvery, round, snap, type BaseAction, type WidgetModel } from "../types";

export const VectorSpec = z.object({
  id: z.string(),
  kind: z.string(), // weight | normal | friction | tension | applied | vector …
  label: z.string(),
  agent: z.string().optional(),
  magnitude: z.number().min(0),
  angleDeg: z.number(),
  locked: z.boolean().optional(),
  tone: z.enum(["force", "a", "b"]).optional(),
});
export type Vec = z.infer<typeof VectorSpec>;

export const VectorBoardConfig = z.object({
  scene: z.enum(["grid", "free", "floor", "incline", "hanging"]),
  inclineDeg: z.number().min(0).max(80).optional(),
  body: z.object({ label: z.string(), mass: z.number().positive() }).optional(),
  vectors: z.array(VectorSpec),
  allowAdd: z.boolean().default(false),
  allowEdit: z.boolean().default(true),
  kinds: z.array(z.object({ kind: z.string(), label: z.string() })).default([]),
  agents: z.array(z.string()).default([]),
  maxMagnitude: z.number().positive(),
  magnitudeStep: z.number().positive().default(0.5),
  angleStep: z.number().positive().default(5),
  unit: z.string().default("N"),
  showResultant: z.boolean().default(true),
  /** false when naming each force's agent is what the question asks */
  showAgents: z.boolean().default(true),
  showComponents: z.boolean().default(false),
  allowAxesToggle: z.boolean().default(false),
  predict: z.boolean().default(false),
  predictSeconds: z.number().positive().default(1.5),
  /** the body's velocity at t = 0 (m/s), so a moving body can be seen speeding up or slowing down */
  initialVelocity: z.object({ x: z.number(), y: z.number() }).default({ x: 0, y: 0 }),
  /** decorative rope drawn from the body (floor scene) */
  rope: z.object({ angleDeg: z.number() }).optional(),
});
export type VectorBoardConfig = z.input<typeof VectorBoardConfig>;
type Cfg = z.output<typeof VectorBoardConfig>;

export interface Overlay {
  highlight: string[];
  decompose: string | null;
  /** false: label components symbolically (hints and feedback must not give the answer away) */
  decomposeValues: boolean;
  project: { a: string; b: string } | null;
  meter: { needed: number; available: number; label: string; showValues: boolean } | null;
  compare: Vec[] | null; // an alternative force set, drawn dashed with its own predicted motion
  compareLabel: string | null;
  note: string | null;
}
export interface VBState {
  config: Cfg;
  vectors: Vec[];
  selected: string | null;
  axes: "standard" | "tilted";
  showComponents: boolean;
  overlay: Overlay;
  seq: number;
  /** bumps whenever a cue asks for the prediction to play */
  playToken: number;
}

export type VBAction =
  | { type: "add"; kind: string; agent?: string; magnitude?: number; angleDeg?: number }
  | { type: "remove"; id: string }
  | { type: "select"; id: string | null }
  | { type: "set"; id: string; magnitude?: number; angleDeg?: number; agent?: string; kind?: string }
  | { type: "rotate"; id: string; delta: number }
  | { type: "scale"; id: string; delta: number }
  | { type: "drag-to"; id: string; fx: number; fy: number }
  | { type: "toggle-components" }
  | { type: "set-axes"; axes: "standard" | "tilted" };

const emptyOverlay = (): Overlay => ({ highlight: [], decompose: null, decomposeValues: true, project: null, meter: null, compare: null, compareLabel: null, note: null });
const norm = (a: number) => round(((a % 360) + 540) % 360 - 180, 4); // (-180, 180]
const rad = (d: number) => (d * Math.PI) / 180;

export const components = (v: Vec) => ({ x: v.magnitude * Math.cos(rad(v.angleDeg)), y: v.magnitude * Math.sin(rad(v.angleDeg)) });

export function resultant(vs: Vec[]) {
  let x = 0, y = 0;
  for (const v of vs) { const c = components(v); x += c.x; y += c.y; }
  x = round(x, 9); y = round(y, 9);
  return { x, y, magnitude: Math.hypot(x, y), angleDeg: Math.hypot(x, y) < 1e-9 ? 0 : norm((Math.atan2(y, x) * 180) / Math.PI) };
}

/** Components of a vector along the chosen axes (tilted axes run along and perpendicular to the incline). */
export function axisComponents(v: Vec, axes: "standard" | "tilted", inclineDeg = 0) {
  // the incline rises to the right at θ; tilted axes: x′ up the slope (θ), y′ perpendicular out of the surface (θ + 90°)
  const theta = axes === "tilted" ? rad(inclineDeg) : 0;
  const a = rad(v.angleDeg) - theta;
  return { along: v.magnitude * Math.cos(a), perp: v.magnitude * Math.sin(a), axisAngleDeg: (theta * 180) / Math.PI };
}

/** Predicted displacement (m) and velocity after t seconds under the net force, from the initial velocity. */
export function predicted(vs: Vec[], mass: number, t: number, v0: { x: number; y: number } = { x: 0, y: 0 }) {
  const r = resultant(vs);
  const ax = r.x / mass, ay = r.y / mass;
  const vx = v0.x + ax * t, vy = v0.y + ay * t;
  return { ax, ay, dx: v0.x * t + 0.5 * ax * t * t, dy: v0.y * t + 0.5 * ay * t * t, at: Math.hypot(ax, ay), vx, vy, speed: Math.hypot(vx, vy) };
}

function describeAngle(deg: number): string {
  const d = norm(deg);
  const named: Record<string, string> = { "0": "to the right", "90": "straight up", "180": "to the left", "-180": "to the left", "-90": "straight down" };
  if (named[String(Math.round(d))] && Math.abs(d - Math.round(d)) < 1e-6) return named[String(Math.round(d))]!;
  return `at ${Math.round(d)}° from the rightward direction, ${d > 0 ? "anticlockwise" : "clockwise"}`;
}

const nextId = (s: VBState) => `v${s.seq + 1}`;

function reduce(s: VBState, a: VBAction | BaseAction): VBState {
  const cfg = s.config;
  const upd = (id: string, f: (v: Vec) => Vec): VBState => ({ ...s, vectors: s.vectors.map((v) => (v.id === id && !v.locked ? f(v) : v)) });
  const clampMag = (m: number) => clamp(round(snap(m, cfg.magnitudeStep / 10), 4), 0, cfg.maxMagnitude);
  switch (a.type) {
    case "add": {
      if (!cfg.allowAdd) return s;
      const kind = cfg.kinds.find((k) => k.kind === a.kind);
      const id = nextId(s);
      const v: Vec = { id, kind: a.kind, label: kind?.label ?? a.kind, agent: a.agent ?? "none", magnitude: clampMag(a.magnitude ?? cfg.maxMagnitude / 3), angleDeg: norm(a.angleDeg ?? 0) };
      return { ...s, vectors: [...s.vectors, v], selected: id, seq: s.seq + 1 };
    }
    case "remove":
      if (!cfg.allowAdd) return s;
      return { ...s, vectors: s.vectors.filter((v) => v.id !== a.id || v.locked), selected: s.selected === a.id ? null : s.selected };
    case "select": return { ...s, selected: a.id };
    case "set":
      if (!cfg.allowEdit) return s;
      return upd(a.id, (v) => ({
        ...v,
        magnitude: a.magnitude !== undefined ? clampMag(a.magnitude) : v.magnitude,
        angleDeg: a.angleDeg !== undefined ? norm(a.angleDeg) : v.angleDeg,
        agent: a.agent ?? v.agent,
        kind: a.kind ?? v.kind,
        label: a.kind ? cfg.kinds.find((k) => k.kind === a.kind)?.label ?? a.kind : v.label,
      }));
    case "rotate": return cfg.allowEdit ? upd(a.id, (v) => ({ ...v, angleDeg: norm(v.angleDeg + a.delta) })) : s;
    case "scale": return cfg.allowEdit ? upd(a.id, (v) => ({ ...v, magnitude: clampMag(v.magnitude + a.delta) })) : s;
    case "drag-to": {
      if (!cfg.allowEdit) return s;
      const m = clampMag(snap(Math.hypot(a.fx, a.fy), cfg.magnitudeStep));
      const ang = norm(snap((Math.atan2(a.fy, a.fx) * 180) / Math.PI, cfg.angleStep));
      return upd(a.id, (v) => ({ ...v, magnitude: m, angleDeg: ang }));
    }
    case "toggle-components": return { ...s, showComponents: !s.showComponents };
    case "set-axes": return { ...s, axes: a.axes };
    case "clear-overlay": return { ...s, overlay: emptyOverlay() };
    case "reset": return init(cfg);
    case "replace": return a.state as VBState;
    case "cue": return applyCue(s, a.cue, a.args ?? {});
  }
}

function toVec(x: unknown, i: number): Vec {
  const r = x as Partial<Vec>;
  return { id: r.id ?? `c${i}`, kind: r.kind ?? "force", label: r.label ?? r.kind ?? "force", agent: r.agent, magnitude: Number(r.magnitude ?? 0), angleDeg: Number(r.angleDeg ?? 0), tone: r.tone };
}

function applyCue(s: VBState, cue: string, args: Record<string, unknown>): VBState {
  const o = { ...s.overlay };
  switch (cue) {
    case "highlight": return { ...s, overlay: { ...o, highlight: (args.ids as string[]) ?? [] } };
    case "decompose": return { ...s, axes: (args.axes as "standard" | "tilted") ?? s.axes, overlay: { ...o, decompose: String(args.id), decomposeValues: args.values !== false } };
    case "tilted-axes": return { ...s, axes: "tilted" };
    case "components": return { ...s, showComponents: true };
    case "project": return { ...s, overlay: { ...o, project: { a: String(args.a), b: String(args.b) } } };
    case "meter": return { ...s, overlay: { ...o, meter: { needed: Number(args.needed), available: Number(args.available), label: String(args.label ?? "friction"), showValues: args.showValues !== false } } };
    case "compare":
      return { ...s, overlay: { ...o, compare: ((args.vectors as unknown[]) ?? []).map(toVec), compareLabel: (args.label as string) ?? "correct forces" }, playToken: s.playToken + 1 };
    case "predict": return { ...s, playToken: s.playToken + 1 };
    case "predict-omit": {
      const omit = new Set((args.ids as string[]) ?? []);
      return { ...s, overlay: { ...o, compare: s.vectors.filter((v) => !omit.has(v.id)), compareLabel: (args.label as string) ?? "without that force" }, playToken: s.playToken + 1 };
    }
    case "set": return {
      ...s,
      vectors: s.vectors.map((v) => v.id === args.id ? { ...v, magnitude: args.magnitude !== undefined ? Number(args.magnitude) : v.magnitude, angleDeg: args.angleDeg !== undefined ? norm(Number(args.angleDeg)) : v.angleDeg } : v),
      playToken: args.play ? s.playToken + 1 : s.playToken,
    };
    case "add-vector": {
      const v = toVec(args.vector, s.seq + 1);
      return { ...s, vectors: [...s.vectors.filter((x) => x.id !== v.id), { ...v, locked: true }], seq: s.seq + 1 };
    }
    case "student-diagram": {
      // consequence of a submitted diagram: play the student's own forces against the correct set
      return { ...s, overlay: { ...o, compare: ((args.correct as unknown[]) ?? []).map(toVec), compareLabel: "a correct diagram" }, playToken: s.playToken + 1 };
    }
    case "note": return { ...s, overlay: { ...o, note: String(args.text ?? "") } };
    default: return s;
  }
}

function init(config: VectorBoardConfig | Cfg): VBState {
  const cfg = VectorBoardConfig.parse(config);
  return {
    config: cfg,
    vectors: cfg.vectors.map((v) => ({ ...v, angleDeg: norm(v.angleDeg) })),
    selected: null,
    axes: "standard",
    showComponents: cfg.showComponents,
    overlay: emptyOverlay(),
    seq: cfg.vectors.length,
    playToken: 0,
  };
}

const vecArgs = z.array(z.object({ kind: z.string().optional(), label: z.string().optional(), agent: z.string().optional(), magnitude: z.union([z.number(), z.string()]), angleDeg: z.union([z.number(), z.string()]), id: z.string().optional() }));

export const vectorBoard: WidgetModel<VectorBoardConfig, VBState, VBAction> = {
  type: "vector-board",
  interactive: true,
  dragInputs: true,
  configSchema: VectorBoardConfig as unknown as z.ZodType<VectorBoardConfig>,
  cues: {
    highlight: z.object({ ids: z.array(z.string()) }),
    decompose: z.object({ id: z.string(), axes: z.enum(["standard", "tilted"]).optional(), values: z.boolean().optional() }),
    "tilted-axes": z.object({}),
    components: z.object({}),
    project: z.object({ a: z.string(), b: z.string() }),
    meter: z.object({ needed: z.union([z.number(), z.string()]), available: z.union([z.number(), z.string()]), label: z.string().optional(), showValues: z.boolean().optional() }),
    compare: z.object({ vectors: vecArgs, label: z.string().optional() }),
    predict: z.object({}),
    "predict-omit": z.object({ ids: z.array(z.string()), label: z.string().optional() }),
    set: z.object({ id: z.string(), magnitude: z.union([z.number(), z.string()]).optional(), angleDeg: z.union([z.number(), z.string()]).optional(), play: z.boolean().optional() }),
    "add-vector": z.object({ vector: vecArgs.element }),
    "student-diagram": z.object({ correct: vecArgs }),
    note: z.object({ text: z.string() }),
  },
  init,
  reduce,
  timeline: (s) => (s.config.predict && s.config.body ? { duration: s.config.predictSeconds, keyframes: keyframesEvery(s.config.predictSeconds, 6) } : { duration: 0, keyframes: [0] }),
  describe(s, t) {
    const unit = s.config.unit;
    const agentText = (v: Vec) => (!s.config.showAgents ? "" : v.agent && v.agent !== "none" ? ` (from ${v.agent})` : v.agent === "none" ? " (no agent)" : "");
    const parts = s.vectors.map((v) => `${v.label}${agentText(v)}: ${round(v.magnitude, 2)} ${unit} ${describeAngle(v.angleDeg)}`);
    const r = resultant(s.vectors);
    let text = parts.length ? parts.join("; ") + "." : "No vectors yet.";
    if (s.config.showResultant) text += r.magnitude < 1e-6 ? ` The resultant is zero.` : ` Resultant ${round(r.magnitude, 2)} ${unit} ${describeAngle(r.angleDeg)}.`;
    if (s.config.predict && s.config.body) {
      const v0 = s.config.initialVelocity;
      const p = predicted(s.vectors, s.config.body.mass, t, v0);
      const moving = Math.hypot(v0.x, v0.y) > 1e-9;
      if (p.at < 1e-6) text += moving ? ` Predicted motion: keeps moving at a constant ${round(Math.hypot(v0.x, v0.y), 2)} m/s.` : " Predicted motion: stays at rest.";
      else text += ` Predicted acceleration ${round(p.at, 2)} m/s²; after ${t.toFixed(2)} s its speed is ${round(p.speed, 2)} m/s and it has moved ${round(Math.hypot(p.dx, p.dy), 2)} m.`;
      if (s.overlay.compare) {
        const c = predicted(s.overlay.compare, s.config.body.mass, t, v0);
        text += ` With ${s.overlay.compareLabel ?? "the other forces"}: speed ${round(c.speed, 2)} m/s.`;
      }
    }
    if (s.overlay.note) text += ` ${s.overlay.note}`;
    return text;
  },
  answer: (s) => s.vectors.filter((v) => !v.locked).map((v) => ({ kind: v.kind, agent: v.agent ?? "none", magnitude: v.magnitude, angleDeg: v.angleDeg })),
};
