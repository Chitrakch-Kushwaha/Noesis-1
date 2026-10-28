// Graph Plot: functions, points, tangents, secants, areas and extrema. Functions are parsed by the same
// safe expression engine used for checking (no eval). Animations (sweeps, secant → tangent) are pure functions of t.
import { z } from "zod";
import { compile, type Compiled } from "@/src/checking/expr/evaluate";
import { parseExpression, type Node } from "@/src/checking/expr/parse";
import { clamp, keyframesEvery, round, snap, type BaseAction, type WidgetModel } from "../types";

const Range = z.tuple([z.number(), z.number()]);
const FnSpec = z.object({ id: z.string(), expr: z.string(), label: z.string().optional(), tone: z.enum(["main", "muted", "hidden"]).default("main"), domain: Range.optional() });
const ParamSpec = z.object({ value: z.number(), min: z.number(), max: z.number(), step: z.number().positive(), label: z.string().optional() });
const PointSpec = z.object({ id: z.string(), label: z.string(), on: z.string().optional(), x: z.number(), y: z.number().optional(), draggable: z.boolean().default(false), step: z.number().positive().default(0.1), xRange: Range.optional(), yRange: Range.optional() });
const Bound = z.union([z.number(), z.string()]);
const AreaSpec = z.object({ id: z.string(), top: Bound, bottom: Bound.default(0), from: Bound, to: Bound, tone: z.enum(["good", "bad", "neutral"]).default("good"), label: z.string().optional(), showValue: z.boolean().default(true) });

export const GraphPlotConfig = z.object({
  xRange: Range,
  yRange: Range,
  xLabel: z.string().default("x"),
  yLabel: z.string().default("y"),
  variable: z.string().default("x"),
  functions: z.array(FnSpec).default([]),
  params: z.record(z.string(), ParamSpec).default({}),
  points: z.array(PointSpec).default([]),
  line: z.object({ through: z.tuple([z.string(), z.string()]), showEquation: z.boolean().default(true) }).optional(),
  tangent: z.object({ at: z.string(), showSlope: z.boolean().default(true) }).optional(),
  areas: z.array(AreaSpec).default([]),
  extrema: z.object({ fn: z.string() }).optional(),
  equation: z.object({ fn: z.string() }).optional(),
});
export type GraphPlotConfig = z.input<typeof GraphPlotConfig>;
type Cfg = z.output<typeof GraphPlotConfig>;
export type AreaSpec = z.output<typeof AreaSpec>;

export type GPAnim =
  | { kind: "sweep-area"; area: AreaSpec }
  | { kind: "secant"; fn: string; x: number; h0: number }
  | { kind: "move-point"; point: string; from: number; to: number };

export interface GPOverlay { areas: AreaSpec[]; tangentAt: string | null; slopeTriangle: { fn: string; x1: number; x2: number; tone: "good" | "bad" } | null; highlight: string[]; markers: { x: number; y: number; label: string; tone: "good" | "bad" }[]; note: string | null }
export interface GPState { config: Cfg; params: Record<string, number>; points: Record<string, { x: number; y: number }>; overlay: GPOverlay; anim: GPAnim | null; playToken: number; extra: { id: string; expr: string; tone: "good" | "bad"; label?: string }[] }
export type GPAction = { type: "set-param"; name: string; value: number } | { type: "move-point"; id: string; x: number; y?: number };

const emptyOverlay = (): GPOverlay => ({ areas: [], tangentAt: null, slopeTriangle: null, highlight: [], markers: [], note: null });
export const ANIM_SECONDS = 2;

// compiled-function cache keyed by expression
const cache = new Map<string, { ast: Node; f: Compiled }>();
export function fnOf(cfg: Cfg, id: string, extra: GPState["extra"] = []): { ast: Node; f: Compiled } | null {
  const spec = cfg.functions.find((f) => f.id === id) ?? extra.find((f) => f.id === id);
  if (!spec) return null;
  const key = `${spec.expr}|${cfg.variable}|${Object.keys(cfg.params).join(",")}`;
  let c = cache.get(key);
  if (!c) {
    const ast = parseExpression(spec.expr, { variables: [cfg.variable, ...Object.keys(cfg.params)] }).ast;
    c = { ast, f: compile(ast) };
    cache.set(key, c);
  }
  return c;
}
export function evalFn(s: GPState, id: string, x: number): number {
  let c: ReturnType<typeof fnOf>;
  try { c = fnOf(s.config, id, s.extra); } catch { return NaN; }
  if (!c) return NaN;
  const spec = s.config.functions.find((f) => f.id === id);
  if (spec?.domain && (x < spec.domain[0] - 1e-12 || x > spec.domain[1] + 1e-12)) return NaN;
  return c.f({ ...s.params, [s.config.variable]: x });
}
export function slopeAt(s: GPState, id: string, x: number): number {
  const h = 1e-5 * Math.max(1, Math.abs(x));
  return (evalFn(s, id, x + h) - evalFn(s, id, x - h)) / (2 * h);
}
const bound = (s: GPState, b: number | string) => (typeof b === "number" ? b : s.points[b]?.x ?? Number(b));
const level = (s: GPState, b: number | string, x: number) => (typeof b === "number" ? b : evalFn(s, b, x));
/** Signed area between top and bottom over [from, to] by Simpson's rule. */
export function areaOf(s: GPState, a: Pick<AreaSpec, "top" | "bottom" | "from" | "to">, toOverride?: number): number {
  const lo = bound(s, a.from), hi = toOverride ?? bound(s, a.to);
  const n = 200, h = (hi - lo) / n;
  if (!Number.isFinite(h) || h === 0) return 0;
  let sum = 0;
  for (let i = 0; i <= n; i++) {
    const x = lo + i * h;
    const v = level(s, a.top, x) - level(s, a.bottom, x);
    sum += (i === 0 || i === n ? 1 : i % 2 ? 4 : 2) * (Number.isFinite(v) ? v : 0);
  }
  return (sum * h) / 3;
}
/** Local extrema found from sign changes of the numerical derivative, refined by bisection. */
export function extremaOf(s: GPState, id: string): { x: number; y: number; kind: "max" | "min" }[] {
  const [lo, hi] = s.config.xRange, n = 400, out: { x: number; y: number; kind: "max" | "min" }[] = [];
  let px = lo, pd = slopeAt(s, id, lo);
  for (let i = 1; i <= n; i++) {
    const x = lo + ((hi - lo) * i) / n, d = slopeAt(s, id, x);
    if (Number.isFinite(pd) && Number.isFinite(d) && Math.sign(pd) !== Math.sign(d) && pd !== 0) {
      let a = px, b = x;
      for (let k = 0; k < 50; k++) { const m = (a + b) / 2; if (Math.sign(slopeAt(s, id, m)) === Math.sign(pd)) a = m; else b = m; }
      const xm = (a + b) / 2;
      out.push({ x: round(xm, 6), y: round(evalFn(s, id, xm), 6), kind: pd > 0 ? "max" : "min" });
    }
    px = x; pd = d;
  }
  return out;
}
export function lineThrough(s: GPState) {
  const l = s.config.line;
  if (!l) return null;
  const p = s.points[l.through[0]]!, q = s.points[l.through[1]]!;
  if (Math.abs(q.x - p.x) < 1e-12) return { vertical: true as const, x: p.x, slope: Infinity, intercept: NaN };
  const m = (q.y - p.y) / (q.x - p.x);
  return { vertical: false as const, x: NaN, slope: round(m, 9), intercept: round(p.y - m * p.x, 9) };
}

function placePoints(cfg: Cfg, params: Record<string, number>, prev?: GPState["points"]): GPState["points"] {
  const out: GPState["points"] = {};
  const tmp = { config: cfg, params, points: {}, overlay: emptyOverlay(), anim: null, playToken: 0, extra: [] } as GPState;
  for (const p of cfg.points) {
    const x = prev?.[p.id]?.x ?? p.x;
    out[p.id] = { x, y: p.on ? evalFn(tmp, p.on, x) : prev?.[p.id]?.y ?? p.y ?? 0 };
  }
  return out;
}

function reduce(s: GPState, a: GPAction | BaseAction): GPState {
  const cfg = s.config;
  switch (a.type) {
    case "set-param": {
      const spec = cfg.params[a.name];
      if (!spec) return s;
      const params = { ...s.params, [a.name]: round(clamp(snap(a.value, spec.step), spec.min, spec.max), 9) };
      return { ...s, params, points: placePoints(cfg, params, s.points) };
    }
    case "move-point": {
      const spec = cfg.points.find((p) => p.id === a.id);
      if (!spec?.draggable) return s;
      const [xl, xh] = spec.xRange ?? cfg.xRange;
      const x = round(clamp(snap(a.x, spec.step), xl, xh), 9);
      let y = s.points[a.id]!.y;
      if (spec.on) y = evalFn(s, spec.on, x);
      else if (a.y !== undefined) { const [yl, yh] = spec.yRange ?? cfg.yRange; y = round(clamp(snap(a.y, spec.step), yl, yh), 9); }
      return { ...s, points: { ...s.points, [a.id]: { x, y } } };
    }
    case "clear-overlay": return { ...s, overlay: emptyOverlay(), anim: null, extra: [] };
    case "reset": return init(cfg);
    case "replace": return a.state as GPState;
    case "cue": {
      const args = a.args ?? {};
      const o = { ...s.overlay };
      switch (a.cue) {
        case "area": {
          const area = AreaSpec.parse({ id: args.id ?? `a${o.areas.length}`, ...args });
          return { ...s, overlay: { ...o, areas: [...o.areas.filter((x) => x.id !== area.id), area] } };
        }
        case "sweep-area": {
          const area = AreaSpec.parse({ id: args.id ?? `a${o.areas.length}`, ...args });
          return { ...s, overlay: { ...o, areas: [...o.areas.filter((x) => x.id !== area.id), area] }, anim: { kind: "sweep-area", area }, playToken: s.playToken + 1 };
        }
        case "clear-areas": return { ...s, overlay: { ...o, areas: [] } };
        case "tangent": return { ...s, overlay: { ...o, tangentAt: String(args.point) } };
        case "secant-to-tangent": return { ...s, overlay: { ...o, tangentAt: null }, anim: { kind: "secant", fn: String(args.fn), x: Number(args.x), h0: Number(args.h0 ?? 2) }, playToken: s.playToken + 1 };
        case "slope-triangle": return { ...s, overlay: { ...o, slopeTriangle: { fn: String(args.fn), x1: Number(args.x1), x2: Number(args.x2), tone: (args.tone as "good" | "bad") ?? "good" } } };
        case "move-point": {
          const id = String(args.point), to = Number(args.x);
          const from = s.points[id]?.x ?? to;
          const tmp = reduce({ ...s, config: { ...cfg, points: cfg.points.map((p) => (p.id === id ? { ...p, draggable: true } : p)) } }, { type: "move-point", id, x: to });
          return { ...tmp, config: s.config, anim: { kind: "move-point", point: id, from, to }, playToken: s.playToken + 1 };
        }
        case "set-param": return reduce(s, { type: "set-param", name: String(args.name), value: Number(args.value) });
        case "marker": return { ...s, overlay: { ...o, markers: [...o.markers, { x: Number(args.x), y: Number(args.y), label: String(args.label ?? ""), tone: (args.tone as "good" | "bad") ?? "good" }] } };
        case "highlight": return { ...s, overlay: { ...o, highlight: (args.ids as string[]) ?? [] } };
        case "add-function": {
          // e.g. the student's own answer drawn against the true curve; constants such as C are set to 0
          let expr = String(args.expr ?? "");
          for (const c of (args.constants as string[]) ?? []) expr = expr.replace(new RegExp(`\\b${c}\\b`, "g"), "0");
          try { parseExpression(expr, { variables: [cfg.variable, ...Object.keys(cfg.params)] }); } catch { return s; }
          const id = String(args.id ?? "extra");
          return { ...s, extra: [...s.extra.filter((f) => f.id !== id), { id, expr, tone: (args.tone as "good" | "bad") ?? "good", label: args.label as string | undefined }] };
        }
        case "derivative-dots": {
          const fn = String(args.fn), n = Number(args.count ?? 7);
          const [lo, hi] = cfg.xRange;
          const dots = Array.from({ length: n }, (_, i) => lo + ((hi - lo) * (i + 0.5)) / n).map((x) => ({ x: round(x, 6), y: round(slopeAt(s, fn, x), 6), label: "", tone: "good" as const }));
          return { ...s, overlay: { ...o, markers: [...o.markers, ...dots] } };
        }
        case "student-tangent": {
          // the student's derivative used as a tangent at a point: if it is wrong, the line cuts across the curve
          const pt = s.points[String(args.point)];
          if (!pt) return s;
          let m: number;
          try { m = compile(parseExpression(String(args.expr), { variables: [cfg.variable, ...((args.constants as string[]) ?? [])] }).ast)({ [cfg.variable]: pt.x }); } catch { return s; }
          if (!Number.isFinite(m)) return s;
          const expr = `${round(pt.y, 9)} + ${round(m, 9)}*(${cfg.variable} - ${round(pt.x, 9)})`;
          return { ...s, extra: [...s.extra.filter((f) => f.id !== "student-tangent"), { id: "student-tangent", expr, tone: "bad", label: String(args.label ?? "tangent using your f′") }] };
        }
        case "note": return { ...s, overlay: { ...o, note: String(args.text ?? "") } };
        default: return s;
      }
    }
  }
}

function init(config: GraphPlotConfig | Cfg): GPState {
  const cfg = GraphPlotConfig.parse(config);
  for (const f of cfg.functions) fnOf(cfg, f.id); // every function must parse with the safe parser (throws otherwise)
  const params = Object.fromEntries(Object.entries(cfg.params).map(([k, v]) => [k, v.value]));
  return { config: cfg, params, points: placePoints(cfg, params), overlay: emptyOverlay(), anim: null, playToken: 0, extra: [] };
}

/** Animation progress 0→1 at time t (ease-out), or 1 without an animation. */
export const progress = (s: GPState, t: number) => (s.anim ? 1 - Math.pow(1 - Math.min(1, Math.max(0, t / ANIM_SECONDS)), 2) : 1);
/** Where an animated point is drawn at time t. */
export function pointAt(s: GPState, id: string, t: number) {
  const p = s.points[id]!;
  if (s.anim?.kind !== "move-point" || s.anim.point !== id) return p;
  const x = s.anim.from + (s.anim.to - s.anim.from) * progress(s, t);
  const spec = s.config.points.find((q) => q.id === id)!;
  return { x, y: spec.on ? evalFn(s, spec.on, x) : p.y };
}
/** Current secant step for the secant → tangent animation. */
export const secantH = (s: GPState, t: number) => (s.anim?.kind === "secant" ? s.anim.h0 * Math.pow(1 - progress(s, t), 1.5) + 1e-3 : null);

const r2 = (x: number) => round(x, 2);
const B = z.union([z.number(), z.string()]);
export const graphPlot: WidgetModel<GraphPlotConfig, GPState, GPAction> = {
  type: "graph-plot",
  interactive: true,
  dragInputs: true,
  configSchema: GraphPlotConfig as unknown as z.ZodType<GraphPlotConfig>,
  cues: {
    area: z.object({ id: z.string().optional(), top: B, bottom: B.optional(), from: B, to: B, tone: z.enum(["good", "bad", "neutral"]).optional(), label: z.string().optional(), showValue: z.boolean().optional() }),
    "sweep-area": z.object({ id: z.string().optional(), top: B, bottom: B.optional(), from: B, to: B, tone: z.enum(["good", "bad", "neutral"]).optional(), label: z.string().optional(), showValue: z.boolean().optional() }),
    "clear-areas": z.object({}),
    tangent: z.object({ point: z.string() }),
    "secant-to-tangent": z.object({ fn: z.string(), x: B, h0: B.optional() }),
    "slope-triangle": z.object({ fn: z.string(), x1: B, x2: B, tone: z.enum(["good", "bad"]).optional() }),
    "move-point": z.object({ point: z.string(), x: B }),
    "set-param": z.object({ name: z.string(), value: B }),
    marker: z.object({ x: B, y: B, label: z.string().optional(), tone: z.enum(["good", "bad"]).optional() }),
    highlight: z.object({ ids: z.array(z.string()) }),
    "add-function": z.object({ id: z.string().optional(), expr: z.string(), tone: z.enum(["good", "bad"]).optional(), label: z.string().optional(), constants: z.array(z.string()).optional() }),
    "derivative-dots": z.object({ fn: z.string(), count: B.optional() }),
    "student-tangent": z.object({ point: z.string(), expr: z.string(), label: z.string().optional(), constants: z.array(z.string()).optional() }),
    note: z.object({ text: z.string() }),
  },
  init,
  reduce,
  timeline: (s) => (s.anim ? { duration: ANIM_SECONDS, keyframes: keyframesEvery(ANIM_SECONDS, 8) } : { duration: 0, keyframes: [0] }),
  describe(s, t) {
    const parts: string[] = [];
    for (const [k, v] of Object.entries(s.params)) parts.push(`${s.config.params[k]?.label ?? k} = ${r2(v)}`);
    for (const p of s.config.points) {
      const q = pointAt(s, p.id, t);
      let txt = `${p.label} at (${r2(q.x)}, ${r2(q.y)})`;
      if (s.config.tangent?.at === p.id && p.on) txt += `, slope of the tangent ${r2(slopeAt(s, p.on, q.x))}`;
      parts.push(txt);
    }
    const ln = lineThrough(s);
    if (ln) parts.push(ln.vertical ? `line x = ${r2(ln.x)}` : `line y = ${r2(ln.slope)}x + ${r2(ln.intercept)}`);
    for (const a of [...s.config.areas, ...s.overlay.areas]) {
      const to = s.anim?.kind === "sweep-area" && s.anim.area.id === a.id ? bound(s, a.from) + (bound(s, a.to) - bound(s, a.from)) * progress(s, t) : undefined;
      const tone = a.tone === "bad" ? "coral" : a.tone === "neutral" ? "grey" : "orange";
      parts.push(a.showValue === false ? `${a.label ?? `${tone} shaded region`} shown` : `${a.label ?? "shaded area"} = ${r2(areaOf(s, a, to))}`);
    }
    const h = secantH(s, t);
    if (h !== null && s.anim?.kind === "secant") {
      const x = s.anim.x;
      parts.push(`secant from x = ${r2(x)} to ${r2(x + h)}, slope ${r2((evalFn(s, s.anim.fn, x + h) - evalFn(s, s.anim.fn, x)) / h)}`);
    }
    if (s.config.extrema) for (const e of extremaOf(s, s.config.extrema.fn)) parts.push(`local ${e.kind === "max" ? "maximum" : "minimum"} at (${r2(e.x)}, ${r2(e.y)})`);
    for (const f of s.extra) parts.push(`${f.label ?? (f.tone === "bad" ? "your answer" : "reference curve")} drawn: y = ${f.expr}`);
    if (s.overlay.markers.length) parts.push(`${s.overlay.markers.length} marked points: ${s.overlay.markers.slice(0, 7).map((m) => `(${r2(m.x)}, ${r2(m.y)})`).join(", ")}`);
    if (s.overlay.note) parts.push(s.overlay.note);
    return parts.join("; ") + ".";
  },
};
