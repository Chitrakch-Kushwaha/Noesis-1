// Triangle Explorer: a right triangle (or a vector and its axis shadows) whose marked acute angle θ can
// move between the two acute corners, so "opposite" and "adjacent" visibly swap. Pure and deterministic.
import { z } from "zod";
import { clamp, keyframesEvery, round, snap, type BaseAction, type WidgetModel } from "../types";

export const TriangleConfig = z.object({
  /** "triangle": a right triangle with the right angle at C. "vector": the hypotenuse as a vector from the origin, with axes. */
  mode: z.enum(["triangle", "vector"]).default("triangle"),
  hypotenuse: z.number().positive().default(5),
  /** angle at corner A, in degrees */
  angleDeg: z.number().min(5).max(85),
  /** which acute corner carries θ */
  marked: z.enum(["A", "B"]).default("A"),
  editable: z.boolean().default(true),
  angleRange: z.tuple([z.number(), z.number()]).default([10, 80]),
  angleStep: z.number().positive().default(1),
  /** label the sides by their role relative to θ (opposite, adjacent, hypotenuse) */
  showRoles: z.boolean().default(true),
  /** show side lengths and ratio values (hidden when a question asks for them) */
  showValues: z.boolean().default(false),
  showRatios: z.boolean().default(false),
  unit: z.string().default(""),
});
export type TriangleConfig = z.input<typeof TriangleConfig>;
type Cfg = z.output<typeof TriangleConfig>;

export type Side = "opposite" | "adjacent" | "hypotenuse";
export interface TEOverlay { highlight: Side[]; shadows: boolean; note: string | null }
export interface TEState {
  config: Cfg;
  angleDeg: number;
  marked: "A" | "B";
  showRatios: boolean;
  showValues: boolean;
  overlay: TEOverlay;
  /** an animated change of the angle at A, a pure function of time */
  sweep: { from: number; to: number } | null;
  playToken: number;
}
export type TEAction = { type: "set-angle"; deg: number } | { type: "mark"; at: "A" | "B" } | { type: "toggle-ratios" };

export const SWEEP_SECONDS = 2.5;
const emptyOverlay = (): TEOverlay => ({ highlight: [], shadows: false, note: null });

/** Angle at A at time t (follows a sweep while one is playing). */
export function angleAt(s: TEState, t: number) {
  if (!s.sweep) return s.angleDeg;
  const k = clamp(t / SWEEP_SECONDS, 0, 1);
  const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
  return s.sweep.from + (s.sweep.to - s.sweep.from) * e;
}

/** Side lengths and the ratios for the marked angle θ. */
export function geometry(s: TEState, t = 0) {
  const a = angleAt(s, t);
  const h = s.config.hypotenuse;
  const rad = (a * Math.PI) / 180;
  const ac = h * Math.cos(rad), bc = h * Math.sin(rad);
  const theta = s.marked === "A" ? a : 90 - a;
  const opposite = s.marked === "A" ? bc : ac, adjacent = s.marked === "A" ? ac : bc;
  return { angleA: a, theta, ac, bc, hyp: h, opposite, adjacent, sin: opposite / h, cos: adjacent / h, tan: opposite / adjacent };
}

/** Which segment plays each role: AC is horizontal, BC vertical, AB the hypotenuse. */
export const roleOf = (marked: "A" | "B", seg: "AC" | "BC" | "AB"): Side =>
  seg === "AB" ? "hypotenuse" : (seg === "BC") === (marked === "A") ? "opposite" : "adjacent";

function init(config: TriangleConfig | Cfg): TEState {
  const cfg = TriangleConfig.parse(config);
  return { config: cfg, angleDeg: cfg.angleDeg, marked: cfg.marked, showRatios: cfg.showRatios, showValues: cfg.showValues, overlay: emptyOverlay(), sweep: null, playToken: 0 };
}

function reduce(s: TEState, a: TEAction | BaseAction): TEState {
  const cfg = s.config;
  const setAngle = (deg: number) => round(clamp(snap(deg, cfg.angleStep), cfg.angleRange[0], cfg.angleRange[1]), 4);
  switch (a.type) {
    case "set-angle": return cfg.editable ? { ...s, angleDeg: setAngle(a.deg), sweep: null } : s;
    case "mark": return cfg.editable ? { ...s, marked: a.at } : s;
    case "toggle-ratios": return { ...s, showRatios: !s.showRatios };
    case "clear-overlay": return { ...s, overlay: emptyOverlay(), sweep: null };
    case "reset": return init(cfg);
    case "replace": return a.state as TEState;
    case "cue": {
      const args = a.args ?? {};
      const o = s.overlay;
      switch (a.cue) {
        case "set-angle": return { ...s, angleDeg: clamp(Number(args.deg), 5, 85), sweep: null };
        case "sweep": {
          const to = clamp(Number(args.to), 5, 85);
          return { ...s, sweep: { from: args.from !== undefined ? Number(args.from) : s.angleDeg, to }, angleDeg: to, playToken: s.playToken + 1 };
        }
        case "mark-angle": return { ...s, marked: args.at === "B" ? "B" : "A" };
        case "highlight-side": return { ...s, overlay: { ...o, highlight: (args.sides as Side[]) ?? [] } };
        case "show-ratios": return { ...s, showRatios: args.on !== false };
        case "show-values": return { ...s, showValues: args.on !== false };
        case "shadows": return { ...s, overlay: { ...o, shadows: args.on !== false } };
        case "note": return { ...s, overlay: { ...o, note: String(args.text ?? "") } };
        default: return s;
      }
    }
  }
}

const n2 = (x: number) => String(round(x, 2));

export const triangleExplorer: WidgetModel<TriangleConfig, TEState, TEAction> = {
  type: "triangle-explorer",
  interactive: true,
  dragInputs: true,
  configSchema: TriangleConfig as unknown as z.ZodType<TriangleConfig>,
  cues: {
    "set-angle": z.object({ deg: z.number() }),
    sweep: z.object({ from: z.number().optional(), to: z.number() }),
    "mark-angle": z.object({ at: z.enum(["A", "B"]) }),
    "highlight-side": z.object({ sides: z.array(z.enum(["opposite", "adjacent", "hypotenuse"])) }),
    "show-ratios": z.object({ on: z.boolean().optional() }),
    "show-values": z.object({ on: z.boolean().optional() }),
    shadows: z.object({ on: z.boolean().optional() }),
    note: z.object({ text: z.string() }),
  },
  init,
  reduce,
  timeline: (s) => (s.sweep ? { duration: SWEEP_SECONDS, keyframes: keyframesEvery(SWEEP_SECONDS, 5) } : { duration: 0, keyframes: [0] }),
  describe(s, t) {
    const g = geometry(s, t);
    const u = s.config.unit ? ` ${s.config.unit}` : "";
    const vector = s.config.mode === "vector";
    const opp = s.marked === "A" ? "BC" : "AC", adj = s.marked === "A" ? "AC" : "BC";
    let text = vector
      ? `A vector of length ${n2(g.hyp)}${u} from the origin at ${Math.round(g.angleA)}° above the x-axis. θ is marked at ${s.marked === "A" ? "the origin, between the vector and the x-axis" : "the tip, between the vector and the vertical"}.`
      : `A right triangle with the right angle at C. θ = ${Math.round(g.theta)}° is marked at corner ${s.marked}.`;
    text += ` Opposite θ: ${opp}${vector && s.marked === "A" ? " (the y-shadow)" : ""}. Adjacent to θ: ${adj}${vector && s.marked === "A" ? " (the x-shadow)" : ""}. Hypotenuse: AB.`;
    if (s.showValues) text += ` Lengths: opposite ${n2(g.opposite)}${u}, adjacent ${n2(g.adjacent)}${u}, hypotenuse ${n2(g.hyp)}${u}.`;
    if (s.showRatios) text += s.showValues ? ` sin θ = ${n2(g.sin)}, cos θ = ${n2(g.cos)}, tan θ = ${n2(g.tan)}.` : " sin θ = opposite ÷ hypotenuse, cos θ = adjacent ÷ hypotenuse, tan θ = opposite ÷ adjacent.";
    if (s.overlay.shadows) text += " The vector's shadows on the axes are its components.";
    if (s.overlay.highlight.length) text += ` Highlighted: ${s.overlay.highlight.join(" and ")}.`;
    if (s.overlay.note) text += ` ${s.overlay.note}`;
    return text;
  },
};
