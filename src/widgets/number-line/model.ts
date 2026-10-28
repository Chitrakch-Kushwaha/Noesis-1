// Number Line: positions, inequalities, intervals and unions. Its answer is the same interval union the
// interval checker uses, so typed and dragged answers are checked identically.
import { z } from "zod";
import { normaliseUnion } from "@/src/checking/check";
import type { Interval } from "@/src/checking/types";
import { clamp, keyframesEvery, round, snap, type BaseAction, type WidgetModel } from "../types";

const Piece = z.object({ lo: z.number(), hi: z.number(), loClosed: z.boolean(), hiClosed: z.boolean() });
export const NumberLineConfig = z.object({
  range: z.tuple([z.number(), z.number()]),
  step: z.number().positive().default(1),
  maxPieces: z.number().int().min(1).max(4).default(3),
  pieces: z.array(Piece).default([]),
  editable: z.boolean().default(true),
});
export type NumberLineConfig = z.input<typeof NumberLineConfig>;
type Cfg = z.output<typeof NumberLineConfig>;
export type End = "lo" | "hi";

export interface NLOverlay { target: Interval[] | null; highlight: { piece: number; end: End }[]; test: { from: number; to: number } | null; note: string | null }
export interface NLState { config: Cfg; pieces: Interval[]; overlay: NLOverlay; playToken: number }
export type NLAction =
  | { type: "add-piece" }
  | { type: "remove-piece"; index: number }
  | { type: "move"; index: number; end: End; value: number }
  | { type: "toggle"; index: number; end: End }
  | { type: "set-infinite"; index: number; end: End; infinite: boolean }
  | { type: "set-union"; union: Interval[] };

const emptyOverlay = (): NLOverlay => ({ target: null, highlight: [], test: null, note: null });
/** numbers including ±∞ (zod's number() rejects infinities), or numeric text */
const NumLike = z.union([z.custom<number>((v) => typeof v === "number" && !Number.isNaN(v)), z.string()]);
export const TEST_SECONDS = 3;

/** Is x in the union? */
export const contains = (u: Interval[], x: number) => u.some((i) => (x > i.lo || (x === i.lo && i.loClosed)) && (x < i.hi || (x === i.hi && i.hiClosed)));

function fix(p: Interval, cfg: Cfg): Interval {
  const lo = Number.isFinite(p.lo) ? round(clamp(snap(p.lo, cfg.step), cfg.range[0], cfg.range[1]), 9) : -Infinity;
  const hi = Number.isFinite(p.hi) ? round(clamp(snap(p.hi, cfg.step), cfg.range[0], cfg.range[1]), 9) : Infinity;
  return { lo, hi, loClosed: Number.isFinite(lo) && p.loClosed, hiClosed: Number.isFinite(hi) && p.hiClosed };
}

function reduce(s: NLState, a: NLAction | BaseAction): NLState {
  const cfg = s.config;
  const edit = (i: number, f: (p: Interval) => Interval): NLState => {
    if (!cfg.editable || !s.pieces[i]) return s;
    return { ...s, pieces: s.pieces.map((p, j) => (j === i ? fix(f(p), cfg) : p)), overlay: { ...s.overlay, highlight: [] } };
  };
  switch (a.type) {
    case "add-piece": {
      if (!cfg.editable || s.pieces.length >= cfg.maxPieces) return s;
      const [lo, hi] = cfg.range, used = s.pieces.length ? Math.max(...s.pieces.map((p) => (Number.isFinite(p.hi) ? p.hi : lo))) : lo;
      const start = Math.min(hi - 2 * cfg.step, used + cfg.step);
      return { ...s, pieces: [...s.pieces, fix({ lo: start, hi: start + 2 * cfg.step, loClosed: true, hiClosed: true }, cfg)] };
    }
    case "remove-piece": return cfg.editable ? { ...s, pieces: s.pieces.filter((_, j) => j !== a.index) } : s;
    case "move": return edit(a.index, (p) => {
      if (a.end === "lo") return { ...p, lo: Math.min(a.value, Number.isFinite(p.hi) ? p.hi - cfg.step : a.value) };
      return { ...p, hi: Math.max(a.value, Number.isFinite(p.lo) ? p.lo + cfg.step : a.value) };
    });
    case "toggle": return edit(a.index, (p) => (a.end === "lo" ? { ...p, loClosed: !p.loClosed } : { ...p, hiClosed: !p.hiClosed }));
    case "set-infinite": return edit(a.index, (p) => {
      if (a.end === "lo") return { ...p, lo: a.infinite ? -Infinity : Math.max(cfg.range[0], (Number.isFinite(p.hi) ? p.hi : cfg.range[1]) - 2 * cfg.step), loClosed: false };
      return { ...p, hi: a.infinite ? Infinity : Math.min(cfg.range[1], (Number.isFinite(p.lo) ? p.lo : cfg.range[0]) + 2 * cfg.step), hiClosed: false };
    });
    case "set-union": return cfg.editable ? { ...s, pieces: a.union.slice(0, cfg.maxPieces).map((p) => ({ ...p })), overlay: { ...s.overlay, highlight: [] } } : s;
    case "clear-overlay": return { ...s, overlay: emptyOverlay() };
    case "reset": return init(cfg);
    case "replace": return a.state as NLState;
    case "cue": {
      const args = a.args ?? {};
      switch (a.cue) {
        case "highlight-endpoints": return { ...s, overlay: { ...s.overlay, highlight: (args.mismatches as { piece: number; end: End }[]) ?? [] } };
        case "show-target": return { ...s, overlay: { ...s.overlay, target: (args.union as Interval[]).map((p) => ({ ...p, lo: Number(p.lo), hi: Number(p.hi) })) } };
        case "test-point": return { ...s, overlay: { ...s.overlay, test: { from: Number(args.from ?? cfg.range[0]), to: Number(args.to ?? cfg.range[1]) } }, playToken: s.playToken + 1 };
        case "note": return { ...s, overlay: { ...s.overlay, note: String(args.text ?? "") } };
        default: return s;
      }
    }
  }
}

function init(config: NumberLineConfig | Cfg): NLState {
  const cfg = NumberLineConfig.parse(config);
  return { config: cfg, pieces: cfg.pieces.map((p) => ({ ...p })), overlay: emptyOverlay(), playToken: 0 };
}

export const testX = (s: NLState, t: number) => (s.overlay.test ? s.overlay.test.from + (s.overlay.test.to - s.overlay.test.from) * Math.min(1, t / TEST_SECONDS) : null);

const show = (x: number) => (x === Infinity ? "∞" : x === -Infinity ? "−∞" : String(round(x, 4)).replace("-", "−"));
export const formatUnion = (u: Interval[]) => (u.length ? u.map((i) => `${i.loClosed ? "[" : "("}${show(i.lo)}, ${show(i.hi)}${i.hiClosed ? "]" : ")"}`).join(" ∪ ") : "∅");

export const numberLine: WidgetModel<NumberLineConfig, NLState, NLAction> = {
  type: "number-line",
  interactive: true,
  dragInputs: true,
  configSchema: NumberLineConfig as unknown as z.ZodType<NumberLineConfig>,
  cues: {
    "highlight-endpoints": z.object({ mismatches: z.array(z.object({ piece: z.number(), end: z.enum(["lo", "hi"]) })) }),
    "show-target": z.object({ union: z.array(z.object({ lo: NumLike, hi: NumLike, loClosed: z.boolean(), hiClosed: z.boolean() })) }),
    "test-point": z.object({ from: z.union([z.number(), z.string()]).optional(), to: z.union([z.number(), z.string()]).optional() }),
    note: z.object({ text: z.string() }),
  },
  init,
  reduce,
  timeline: (s) => (s.overlay.test ? { duration: TEST_SECONDS, keyframes: keyframesEvery(TEST_SECONDS, 12) } : { duration: 0, keyframes: [0] }),
  describe(s, t) {
    let txt = s.pieces.length ? `Your set on the number line: ${formatUnion(s.pieces)}.` : "No interval drawn yet.";
    const x = testX(s, t);
    if (x !== null) {
      const ref = s.overlay.target ?? s.pieces;
      txt += ` Test point x = ${round(x, 2)} is ${contains(ref, x) ? "in" : "not in"} the set.`;
    }
    if (s.overlay.highlight.length) txt += ` Check the ${s.overlay.highlight.length === 1 ? "highlighted endpoint" : "highlighted endpoints"}: included or not?`;
    if (s.overlay.target) txt += ` The correct set is ${formatUnion(s.overlay.target)}.`;
    if (s.overlay.note) txt += ` ${s.overlay.note}`;
    return txt;
  },
  answer: (s) => normaliseUnion(s.pieces),
};
