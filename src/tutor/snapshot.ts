// What the tutor may know about the student's work on the visual, and what it may point at.
// The browser sends a small structured snapshot; the server validates it against the question's own
// widget config (bounds included), rebuilds a model state and describes it with the widget's own
// `describe()`. Highlight targets are enumerated from that rebuilt state, so a tutor can only point at
// things that exist in the current question.
import { z } from "zod";
import type { CueRef } from "@/src/content/schema";
import { WIDGETS } from "@/src/widgets/registry";
import type { GPState } from "@/src/widgets/graph-plot/model";
import type { MTState } from "@/src/widgets/motion-track/model";
import type { NLState } from "@/src/widgets/number-line/model";
import type { TEState } from "@/src/widgets/triangle-explorer/model";
import type { VBState } from "@/src/widgets/vector-board/model";

export interface TutorTarget { id: string; label: string; cues: CueRef[] }

const num = z.number().finite();
const id = z.string().min(1).max(40);
const Snapshots = {
  "vector-board": z.object({
    vectors: z.array(z.object({ id, kind: z.string().max(30), label: z.string().max(40), agent: z.string().max(30).optional(), magnitude: num.min(0), angleDeg: num, locked: z.boolean().optional() })).max(12),
  }),
  "graph-plot": z.object({ points: z.record(id, z.object({ x: num, y: num })), params: z.record(id, num) }),
  "motion-track": z.object({
    lanes: z.array(z.object({ id, x0: num, v0: num, a: num })).max(6),
    projectile: z.object({ speed: num, angleDeg: num, y0: num }).optional(),
  }),
  "number-line": z.object({ pieces: z.array(z.object({ lo: z.number(), hi: z.number(), loClosed: z.boolean(), hiClosed: z.boolean() })).max(4) }),
  "triangle-explorer": z.object({ angleDeg: num, marked: z.enum(["A", "B"]) }),
} as const;
type SnapType = keyof typeof Snapshots;
const hasSnapshot = (t: string): t is SnapType => t in Snapshots;

/** Browser side: the structured part of the student's work that the tutor may see. */
export function widgetSnapshot(type: string, state: unknown): unknown {
  switch (type) {
    case "vector-board": { const s = state as VBState; return { vectors: s.vectors.map((v) => ({ id: v.id, kind: v.kind, label: v.label, agent: v.agent, magnitude: v.magnitude, angleDeg: v.angleDeg, locked: v.locked })) }; }
    case "graph-plot": { const s = state as GPState; return { points: s.points, params: s.params }; }
    case "motion-track": { const s = state as MTState; return { lanes: s.lanes.map((l) => ({ id: l.id, x0: l.x0, v0: l.v0, a: l.a })), projectile: s.projectile ? { speed: s.projectile.speed, angleDeg: s.projectile.angleDeg, y0: s.projectile.y0 } : undefined }; }
    case "number-line": { const s = state as NLState; return { pieces: s.pieces }; }
    case "triangle-explorer": { const s = state as TEState; return { angleDeg: s.angleDeg, marked: s.marked }; }
    default: return undefined;
  }
}

const inRange = (v: number, r: [number, number] | undefined, slack = 0) => !r || (v >= Math.min(r[0], r[1]) - slack && v <= Math.max(r[0], r[1]) + slack);

/**
 * Server side: rebuild a model state from the question's config and a validated snapshot. Anything
 * that doesn't validate, or names elements the question doesn't have, is ignored and the fresh state
 * is used instead (so a tampered snapshot can never make the tutor describe a different question).
 */
export function rebuildState(type: string, config: Record<string, unknown>, snapshot: unknown): { state: unknown; trusted: boolean } {
  const model = WIDGETS[type];
  if (!model) return { state: undefined, trusted: false };
  const fresh = model.init(model.configSchema.parse(config));
  if (!hasSnapshot(type) || snapshot === undefined) return { state: fresh, trusted: false };
  if (JSON.stringify(snapshot).length > 8000) return { state: fresh, trusted: false };
  const parsed = Snapshots[type].safeParse(snapshot);
  if (!parsed.success) return { state: fresh, trusted: false };
  const p = parsed.data;
  switch (type) {
    case "vector-board": {
      const s = fresh as VBState;
      const v = (p as z.infer<(typeof Snapshots)["vector-board"]>).vectors;
      const locked = new Map(s.vectors.filter((x) => x.locked).map((x) => [x.id, x]));
      // locked vectors must match the question; student vectors must respect the board's limits
      const okLocked = [...locked.values()].every((l) => v.some((x) => x.id === l.id && Math.abs(x.magnitude - l.magnitude) < 1e-6 && Math.abs(x.angleDeg - l.angleDeg) < 1e-6));
      const okFree = v.filter((x) => !locked.has(x.id)).every((x) => x.magnitude <= s.config.maxMagnitude + 1e-9 && (!x.agent || x.agent === "none" || s.config.agents.includes(x.agent)) && (s.config.kinds.length === 0 || s.config.kinds.some((k) => k.kind === x.kind)));
      if (!okLocked || !okFree || (!s.config.allowAdd && v.length !== s.vectors.length)) return { state: fresh, trusted: false };
      return { state: { ...s, vectors: v.map((x) => ({ ...x, locked: locked.has(x.id) || undefined })) }, trusted: true };
    }
    case "graph-plot": {
      const s = fresh as GPState;
      const q = p as z.infer<(typeof Snapshots)["graph-plot"]>;
      const okPts = Object.keys(q.points).every((k) => k in s.points) && Object.entries(q.points).every(([, v]) => inRange(v.x, s.config.xRange as [number, number], 1e-6));
      const okParams = Object.entries(q.params).every(([k, v]) => { const spec = s.config.params[k]; return spec && v >= spec.min - 1e-9 && v <= spec.max + 1e-9; });
      if (!okPts || !okParams) return { state: fresh, trusted: false };
      return { state: { ...s, points: { ...s.points, ...q.points }, params: { ...s.params, ...q.params } }, trusted: true };
    }
    case "motion-track": {
      const s = fresh as MTState;
      const q = p as z.infer<(typeof Snapshots)["motion-track"]>;
      if (q.lanes.length !== s.lanes.length || q.lanes.some((l, i) => l.id !== s.lanes[i]!.id)) return { state: fresh, trusted: false };
      const ok = q.lanes.every((l, i) => {
        const o = s.lanes[i]!;
        return (["x0", "v0", "a"] as const).every((k) => l[k] === o[k] || (s.config.editable.includes(k) && inRange(l[k], s.config.ranges[k])));
      });
      if (!ok) return { state: fresh, trusted: false };
      let projectile = s.projectile;
      if (q.projectile && s.projectile) {
        const okP = (["speed", "angleDeg", "y0"] as const).every((k) => q.projectile![k] === s.projectile![k] || (s.config.editable2d.includes(k) && inRange(q.projectile![k], s.config.ranges2d[k])));
        if (!okP) return { state: fresh, trusted: false };
        projectile = { ...s.projectile, ...q.projectile };
      }
      return { state: { ...s, lanes: s.lanes.map((o, i) => ({ ...o, ...q.lanes[i]! })), projectile }, trusted: true };
    }
    case "number-line": {
      const s = fresh as NLState;
      const q = p as z.infer<(typeof Snapshots)["number-line"]>;
      const [lo, hi] = s.config.range;
      const ok = q.pieces.length <= s.config.maxPieces && q.pieces.every((x) => (x.lo === -Infinity || inRange(x.lo, [lo, hi])) && (x.hi === Infinity || inRange(x.hi, [lo, hi])) && x.lo <= x.hi);
      if (!ok) return { state: fresh, trusted: false };
      return { state: { ...s, pieces: q.pieces }, trusted: true };
    }
    case "triangle-explorer": {
      const s = fresh as TEState;
      const q = p as z.infer<(typeof Snapshots)["triangle-explorer"]>;
      if (q.angleDeg <= 0 || q.angleDeg >= 90) return { state: fresh, trusted: false };
      return { state: { ...s, angleDeg: q.angleDeg, marked: q.marked }, trusted: true };
    }
  }
  return { state: fresh, trusted: false };
}

/** The elements of the current visual a tutor may highlight, with the authored cue each one uses. */
export function tutorTargets(type: string, state: unknown): TutorTarget[] {
  switch (type) {
    case "vector-board": {
      const s = state as VBState;
      return s.vectors.map((v) => ({
        id: `force:${v.id}`,
        // agents are hidden when naming them is what the question asks
        label: `${v.label}${s.config.showAgents && v.agent && v.agent !== "none" ? ` (from ${v.agent})` : ""}`,
        cues: [{ cue: "highlight", args: { ids: [v.id] } }],
      }));
    }
    case "graph-plot": {
      const s = state as GPState;
      const out: TutorTarget[] = [];
      for (const p of s.config.points) out.push({ id: `point:${p.id}`, label: `point ${p.label}`, cues: [{ cue: "highlight", args: { ids: [p.id] } }] });
      if (s.config.tangent) out.push({ id: `tangent:${s.config.tangent.at}`, label: `the tangent at ${s.config.tangent.at}`, cues: [{ cue: "tangent", args: { point: s.config.tangent.at } }] });
      for (const f of s.config.functions) if (f.tone !== "hidden") out.push({ id: `curve:${f.id}`, label: f.label ?? "the curve", cues: [{ cue: "highlight", args: { ids: [f.id] } }] });
      for (const a of s.config.areas) out.push({ id: `area:${a.id}`, label: a.label ?? "the shaded region", cues: [{ cue: "sweep-area", args: { id: `tutor-${a.id}`, top: a.top, bottom: a.bottom, from: a.from, to: a.to, tone: "neutral", showValue: false } }] });
      return out;
    }
    case "motion-track": {
      const s = state as MTState;
      return s.config.mode === "1d" ? s.lanes.map((l) => ({ id: `lane:${l.id}`, label: l.label, cues: [{ cue: "highlight", args: { id: l.id } }] })) : [];
    }
    case "number-line": {
      const s = state as NLState;
      const out: TutorTarget[] = [];
      s.pieces.forEach((p, i) => {
        if (Number.isFinite(p.lo)) out.push({ id: `endpoint:${i}:lo`, label: `the left endpoint of interval ${i + 1}`, cues: [{ cue: "highlight-endpoints", args: { mismatches: [{ piece: i, end: "lo" }] } }] });
        if (Number.isFinite(p.hi)) out.push({ id: `endpoint:${i}:hi`, label: `the right endpoint of interval ${i + 1}`, cues: [{ cue: "highlight-endpoints", args: { mismatches: [{ piece: i, end: "hi" }] } }] });
      });
      return out;
    }
    case "triangle-explorer":
      return (["opposite", "adjacent", "hypotenuse"] as const).map((side) => ({ id: `side:${side}`, label: `the ${side} side`, cues: [{ cue: "highlight-side", args: { sides: [side] } }] }));
    default:
      return [];
  }
}

/** A text description of the rebuilt state (the widget's own describe, at time 0), bounded. */
export function describeState(type: string, state: unknown): string {
  const model = WIDGETS[type];
  if (!model || state === undefined) return "";
  try { return model.describe(state, 0).slice(0, 700); } catch { return ""; }
}
