// Oscillator: a spring–mass system or a simple pendulum in SHM, x(t) = A cos(ωt + φ), with the reference
// circle (phasor), displacement/velocity/acceleration graphs and energy bars. Pure and deterministic.
import { z } from "zod";
import { keyframesEvery, round, type BaseAction, type WidgetModel } from "../types";

export const OscillatorConfig = z.object({
  system: z.enum(["spring", "pendulum"]),
  mass: z.number().positive().default(1),
  /** spring constant (N/m) */
  k: z.number().positive().default(10),
  /** pendulum length (m) and g */
  length: z.number().positive().default(1),
  g: z.number().positive().default(9.8),
  /** amplitude: metres for a spring, metres of arc for a pendulum (small angles) */
  amplitude: z.number().positive(),
  phaseDeg: z.number().default(0),
  periods: z.number().positive().default(2),
  editable: z.array(z.enum(["amplitude", "mass", "k", "length", "phaseDeg"])).default([]),
  showValues: z.boolean().default(true),
});
export type OscillatorConfig = z.input<typeof OscillatorConfig>;
type Cfg = z.output<typeof OscillatorConfig>;

type Key = "amplitude" | "mass" | "k" | "length" | "phaseDeg";
export interface OSOverlay { highlight: string[]; note: string | null; marker: number | null; ghost: { key: Key; value: number; label: string } | null }
export interface OSState { config: Cfg; p: Record<Key, number>; showValues: boolean; overlay: OSOverlay; playToken: number }
export type OSAction = { type: "set"; key: Key; value: number };

const emptyOverlay = (): OSOverlay => ({ highlight: [], note: null, marker: null, ghost: null });

export function omegaOf(c: Cfg, p: Record<Key, number>) {
  return c.system === "spring" ? Math.sqrt(p.k / p.mass) : Math.sqrt(c.g / p.length);
}
/** Motion at time t for parameters p (defaults to the current state's). */
export function stateAt(s: OSState, t: number, p: Record<Key, number> = s.p) {
  const c = s.config, w = omegaOf(c, p), ph = (p.phaseDeg * Math.PI) / 180;
  const x = p.amplitude * Math.cos(w * t + ph), v = -p.amplitude * w * Math.sin(w * t + ph), a = -w * w * x;
  // spring: ½kx²; pendulum (small angles): ½(mg/L)x² with x the arc length
  const kEff = c.system === "spring" ? p.k : (p.mass * c.g) / p.length;
  const pe = 0.5 * kEff * x * x, ke = 0.5 * p.mass * v * v;
  return { x, v, a, omega: w, period: (2 * Math.PI) / w, frequency: w / (2 * Math.PI), pe, ke, total: 0.5 * kEff * p.amplitude * p.amplitude, phase: w * t + ph };
}

function init(config: OscillatorConfig | Cfg): OSState {
  const c = OscillatorConfig.parse(config);
  return { config: c, p: { amplitude: c.amplitude, mass: c.mass, k: c.k, length: c.length, phaseDeg: c.phaseDeg }, showValues: c.showValues, overlay: emptyOverlay(), playToken: 0 };
}

function reduce(s: OSState, a: OSAction | BaseAction): OSState {
  switch (a.type) {
    case "set": return s.config.editable.includes(a.key) ? { ...s, p: { ...s.p, [a.key]: a.key === "phaseDeg" ? a.value : Math.max(1e-3, a.value) } } : s;
    case "clear-overlay": return { ...s, overlay: emptyOverlay() };
    case "reset": return init(s.config);
    case "replace": return a.state as OSState;
    case "cue": {
      const args = a.args ?? {}, o = s.overlay;
      switch (a.cue) {
        case "highlight": return { ...s, overlay: { ...o, highlight: (args.ids as string[]) ?? [] } };
        case "note": return { ...s, overlay: { ...o, note: String(args.text ?? "") } };
        case "marker": return { ...s, overlay: { ...o, marker: Number(args.t) } };
        case "ghost": return { ...s, overlay: { ...o, ghost: { key: args.key as Key, value: Number(args.value), label: String(args.label ?? "compare") } }, playToken: s.playToken + 1 };
        case "set": return { ...s, p: { ...s.p, [String(args.key)]: Number(args.value) }, playToken: s.playToken + 1 };
        case "reveal": return { ...s, showValues: true };
        case "play": return { ...s, playToken: s.playToken + 1 };
        default: return s;
      }
    }
  }
}

const n = (x: number, d = 3) => String(Number(x.toPrecision(d)));
export const durationOf = (s: OSState) => {
  const periods = [stateAt(s, 0).period];
  if (s.overlay.ghost) periods.push(stateAt(s, 0, { ...s.p, [s.overlay.ghost.key]: s.overlay.ghost.value }).period);
  return round(Math.max(...periods) * s.config.periods, 4);
};

export const oscillator: WidgetModel<OscillatorConfig, OSState, OSAction> = {
  type: "oscillator",
  interactive: true,
  dragInputs: false,
  configSchema: OscillatorConfig as unknown as z.ZodType<OscillatorConfig>,
  cues: {
    highlight: z.object({ ids: z.array(z.string()) }),
    note: z.object({ text: z.string() }),
    marker: z.object({ t: z.union([z.number(), z.string()]) }),
    ghost: z.object({ key: z.enum(["amplitude", "mass", "k", "length", "phaseDeg"]), value: z.union([z.number(), z.string()]), label: z.string().optional() }),
    set: z.object({ key: z.enum(["amplitude", "mass", "k", "length", "phaseDeg"]), value: z.union([z.number(), z.string()]) }),
    reveal: z.object({}),
    play: z.object({}),
  },
  init,
  reduce,
  timeline: (s) => { const d = durationOf(s); return { duration: d, keyframes: keyframesEvery(d, 8) }; },
  describe(s, t) {
    const c = s.config, q = stateAt(s, t), v = s.showValues;
    const sys = c.system === "spring" ? `A ${n(s.p.mass)} kg block on a spring (k = ${n(s.p.k)} N/m)` : `A pendulum of length ${n(s.p.length)} m (bob ${n(s.p.mass)} kg)`;
    let text = `${sys}, amplitude ${n(s.p.amplitude)} m, phase ${n(s.p.phaseDeg)}°.`;
    text += v ? ` Period ${n(q.period)} s, ω = ${n(q.omega)} rad/s. At t = ${n(t, 2)} s: x = ${n(q.x)} m, v = ${n(q.v)} m/s, a = ${n(q.a)} m/s²; KE ${n(q.ke)} J, PE ${n(q.pe)} J (total ${n(q.total)} J).`
      : ` At t = ${n(t, 2)} s it is ${Math.abs(q.x) < 1e-9 ? "at the centre" : q.x > 0 ? "right of the centre" : "left of the centre"}, moving ${q.v > 0 ? "right" : q.v < 0 ? "left" : "nowhere (turning point)"}.`;
    if (s.overlay.ghost) { const g = stateAt(s, t, { ...s.p, [s.overlay.ghost.key]: s.overlay.ghost.value }); text += ` ${s.overlay.ghost.label}: period ${n(g.period)} s.`; }
    if (s.overlay.note) text += ` ${s.overlay.note}`;
    return text;
  },
};
