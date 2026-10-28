// Motion Track: 1-D lanes and 2-D projectile motion. Positions are exact analytic functions of time,
// so pausing, stepping, scrubbing and replaying are deterministic.
import { z } from "zod";
import { clamp, keyframesEvery, round, snap, type BaseAction, type WidgetModel } from "../types";

const Lane = z.object({ id: z.string(), label: z.string(), x0: z.number(), v0: z.number(), a: z.number() });
export type Lane = z.infer<typeof Lane>;
const Range = z.tuple([z.number(), z.number()]);

export const MotionTrackConfig = z.object({
  mode: z.enum(["1d", "2d"]),
  lanes: z.array(Lane).default([]),
  stopAtRest: z.boolean().default(false),
  editable: z.array(z.enum(["x0", "v0", "a"])).default([]),
  ranges: z.object({ x0: Range.default([-10, 10]), v0: Range.default([-20, 20]), a: Range.default([-10, 10]) }).default({ x0: [-10, 10], v0: [-20, 20], a: [-10, 10] }),
  steps: z.object({ x0: z.number().default(0.5), v0: z.number().default(0.5), a: z.number().default(0.25) }).default({ x0: 0.5, v0: 0.5, a: 0.25 }),
  projectile: z.object({ x0: z.number().default(0), y0: z.number().default(0), speed: z.number().positive(), angleDeg: z.number(), g: z.number().positive().default(9.8) }).optional(),
  editable2d: z.array(z.enum(["speed", "angleDeg", "y0"])).default([]),
  ranges2d: z.object({ speed: Range.default([1, 40]), angleDeg: Range.default([5, 85]), y0: Range.default([0, 40]) }).default({ speed: [1, 40], angleDeg: [5, 85], y0: [0, 40] }),
  duration: z.number().positive().optional(),
  xRange: Range.optional(),
  unit: z.string().default("m"),
  /** hide distances until the solution reveals them, so playing the simulation can't give the answer away */
  hideNumbers: z.boolean().default(false),
});
export type MotionTrackConfig = z.input<typeof MotionTrackConfig>;
type Cfg = z.output<typeof MotionTrackConfig>;

export interface MTOverlay {
  flags: { x: number; label: string; tone: "good" | "bad" }[];
  ghostLanes: Lane[];
  tangentAt: number | null; // time
  areaTo: number | null; // time
  highlight: string | null;
  note: string | null;
}
export interface MTState { config: Cfg; lanes: Lane[]; projectile: Cfg["projectile"]; overlay: MTOverlay; playToken: number; revealed: boolean }
export type MTAction =
  | { type: "set-lane"; lane: string; key: "x0" | "v0" | "a"; value: number }
  | { type: "set-projectile"; key: "speed" | "angleDeg" | "y0"; value: number };

const sig3 = (x: number) => String(Number(x.toPrecision(3)));
const emptyOverlay = (): MTOverlay => ({ flags: [], ghostLanes: [], tangentAt: null, areaTo: null, highlight: null, note: null });

/** Time at which the lane comes to rest (only when braking with stopAtRest), else Infinity. */
export function stopTime(l: Lane, stopAtRest: boolean) {
  if (!stopAtRest || l.a === 0 || Math.sign(l.a) === Math.sign(l.v0) || l.v0 === 0) return Infinity;
  return -l.v0 / l.a;
}
export function laneAt(l: Lane, t: number, stopAtRest: boolean) {
  const ts = stopTime(l, stopAtRest);
  const tt = Math.min(t, ts);
  return { x: l.x0 + l.v0 * tt + 0.5 * l.a * tt * tt, v: t >= ts ? 0 : l.v0 + l.a * tt, stopped: t >= ts };
}
export function projectileAt(p: NonNullable<Cfg["projectile"]>, t: number) {
  const a = (p.angleDeg * Math.PI) / 180;
  const vx = p.speed * Math.cos(a), vy0 = p.speed * Math.sin(a);
  const tLand = (vy0 + Math.sqrt(vy0 * vy0 + 2 * p.g * p.y0)) / p.g;
  const tt = Math.min(t, tLand);
  return { x: p.x0 + vx * tt, y: Math.max(0, p.y0 + vy0 * tt - 0.5 * p.g * tt * tt), vx, vy: vy0 - p.g * tt, tLand, landed: t >= tLand };
}
export const projectileFacts = (p: NonNullable<Cfg["projectile"]>) => {
  const a = (p.angleDeg * Math.PI) / 180;
  const vy0 = p.speed * Math.sin(a);
  const end = projectileAt(p, Infinity);
  return { tLand: end.tLand, range: end.x - p.x0, apexHeight: p.y0 + (vy0 * vy0) / (2 * p.g), apexTime: vy0 / p.g };
};

export function duration(s: MTState): number {
  if (s.config.duration) return s.config.duration;
  if (s.config.mode === "2d" && s.projectile) return round(projectileFacts(s.projectile).tLand, 4);
  const stops = [...s.lanes, ...s.overlay.ghostLanes].map((l) => stopTime(l, s.config.stopAtRest)).filter(Number.isFinite);
  return stops.length ? round(Math.max(...stops) * 1.15, 4) : 5;
}

function reduce(s: MTState, a: MTAction | BaseAction): MTState {
  const cfg = s.config;
  switch (a.type) {
    case "set-lane": {
      if (!cfg.editable.includes(a.key)) return s;
      const [lo, hi] = cfg.ranges[a.key];
      const v = round(clamp(snap(a.value, cfg.steps[a.key] / 10), lo, hi), 6);
      return { ...s, lanes: s.lanes.map((l) => (l.id === a.lane ? { ...l, [a.key]: v } : l)) };
    }
    case "set-projectile": {
      if (!s.projectile || !cfg.editable2d.includes(a.key)) return s;
      const [lo, hi] = cfg.ranges2d[a.key];
      return { ...s, projectile: { ...s.projectile, [a.key]: round(clamp(a.value, lo, hi), 6) } };
    }
    case "clear-overlay": return { ...s, overlay: emptyOverlay() };
    case "reset": return init(cfg);
    case "replace": return a.state as MTState;
    case "cue": {
      const args = a.args ?? {};
      const o = { ...s.overlay };
      switch (a.cue) {
        case "flag": return { ...s, overlay: { ...o, flags: [...o.flags, { x: Number(args.x), label: String(args.label ?? ""), tone: (args.tone as "good" | "bad") ?? "good" }] } };
        case "ghost-lane": {
          const g = args.lane as Lane;
          return { ...s, overlay: { ...o, ghostLanes: [...o.ghostLanes.filter((l) => l.id !== g.id), { id: g.id ?? "ghost", label: g.label ?? "", x0: Number(g.x0), v0: Number(g.v0), a: Number(g.a) }] }, playToken: s.playToken + 1 };
        }
        case "tangent": return { ...s, overlay: { ...o, tangentAt: Number(args.t) } };
        case "area": return { ...s, overlay: { ...o, areaTo: args.t === undefined ? null : Number(args.t) } };
        case "highlight": return { ...s, overlay: { ...o, highlight: String(args.id) } };
        case "set-lane": return { ...s, lanes: s.lanes.map((l) => (l.id === args.lane ? { ...l, [String(args.key)]: Number(args.value) } : l)), playToken: s.playToken + 1 };
        case "play": return { ...s, playToken: s.playToken + 1 };
        case "reveal": return { ...s, revealed: true };
        case "stop-at": {
          // the student's stopping distance played out: the first lane brakes just hard enough to stop there
          const l = s.lanes[0], x = Number(args.x);
          if (!l || !(x > l.x0) || l.v0 === 0) return s;
          const a = -(l.v0 * l.v0) / (2 * (x - l.x0));
          const text = `To stop at ${sig3(x)} ${cfg.unit}, the car would brake at only ${sig3(Math.abs(a))} ${cfg.unit}/s².`;
          return { ...s, lanes: s.lanes.map((ln, i) => (i === 0 ? { ...ln, a: round(a, 9), label: String(args.label ?? "your answer") } : ln)), overlay: { ...o, note: text }, playToken: s.playToken + 1 };
        }
        case "land-at": {
          // the student's range played out: the launch speed that would land the ball there
          const p = s.projectile, x = Number(args.x);
          if (!p || !(x > 0)) return s;
          const sin2 = Math.sin((2 * p.angleDeg * Math.PI) / 180);
          if (p.y0 !== 0 || sin2 <= 0) return s;
          const speed = Math.sqrt((x * p.g) / sin2);
          const text = `To land ${sig3(x)} m away at this angle, the ball would need a launch speed of ${sig3(speed)} m/s.`;
          return { ...s, projectile: { ...p, speed: round(speed, 9) }, overlay: { ...o, note: text }, playToken: s.playToken + 1 };
        }
        case "note": return { ...s, overlay: { ...o, note: String(args.text ?? "") } };
        default: return s;
      }
    }
  }
}

function init(config: MotionTrackConfig | Cfg): MTState {
  const cfg = MotionTrackConfig.parse(config);
  return { config: cfg, lanes: cfg.lanes.map((l) => ({ ...l })), projectile: cfg.projectile ? { ...cfg.projectile } : undefined, overlay: emptyOverlay(), playToken: 0, revealed: !cfg.hideNumbers };
}

const f2 = (x: number) => round(x, 2);

export const motionTrack: WidgetModel<MotionTrackConfig, MTState, MTAction> = {
  type: "motion-track",
  interactive: true,
  dragInputs: true,
  configSchema: MotionTrackConfig as unknown as z.ZodType<MotionTrackConfig>,
  cues: {
    flag: z.object({ x: z.union([z.number(), z.string()]), label: z.string().optional(), tone: z.enum(["good", "bad"]).optional() }),
    "ghost-lane": z.object({ lane: z.object({ id: z.string().optional(), label: z.string().optional(), x0: z.union([z.number(), z.string()]), v0: z.union([z.number(), z.string()]), a: z.union([z.number(), z.string()]) }) }),
    tangent: z.object({ t: z.union([z.number(), z.string()]) }),
    area: z.object({ t: z.union([z.number(), z.string()]).optional() }),
    highlight: z.object({ id: z.string() }),
    "set-lane": z.object({ lane: z.string(), key: z.enum(["x0", "v0", "a"]), value: z.union([z.number(), z.string()]) }),
    play: z.object({}),
    reveal: z.object({}),
    note: z.object({ text: z.string() }),
    "stop-at": z.object({ x: z.union([z.number(), z.string()]), label: z.string().optional() }),
    "land-at": z.object({ x: z.union([z.number(), z.string()]) }),
  },
  init,
  reduce,
  timeline: (s) => { const d = duration(s); return { duration: d, keyframes: keyframesEvery(d, 8) }; },
  describe(s, t) {
    if (s.config.mode === "2d" && s.projectile) {
      const p = projectileAt(s.projectile, t);
      const f = projectileFacts(s.projectile);
      const note = s.overlay.note ? ` ${s.overlay.note}` : "";
      if (!s.revealed) return `At t = ${f2(t)} s of ${f2(f.tLand)} s the ball is ${p.landed ? "on the ground" : "in flight"}. Launch: ${f2(s.projectile.speed)} m/s at ${f2(s.projectile.angleDeg)}°.${note}`;
      return `At t = ${f2(t)} s the ball is ${f2(p.x)} m along and ${f2(p.y)} m high, moving ${f2(Math.hypot(p.vx, p.y > 0 ? p.vy : 0))} m/s.${p.landed ? ` It landed ${f2(f.range)} m away after ${f2(f.tLand)} s.` : ""} Launch: ${f2(s.projectile.speed)} m/s at ${f2(s.projectile.angleDeg)}°.${note}`;
    }
    const lanes = s.lanes.map((l) => { const p = laneAt(l, t, s.config.stopAtRest); return s.revealed ? `${l.label}: x = ${f2(p.x)} ${s.config.unit}, v = ${f2(p.v)} ${s.config.unit}/s${p.stopped ? " (stopped)" : ""}` : `${l.label}: ${p.stopped ? "stopped" : "moving"}`; });
    const ghosts = s.overlay.ghostLanes.map((l) => { const p = laneAt(l, t, false); return `${l.label}: x = ${f2(p.x)} ${s.config.unit}`; });
    return `At t = ${f2(t)} s. ${[...lanes, ...ghosts].join("; ")}.${s.overlay.note ? ` ${s.overlay.note}` : ""}`;
  },
};
