// Rigid Body: rotation about a fixed axis, levers, centre of mass, dipoles in a uniform field, a rotating
// generator coil and uniform circular motion. Every displayed number is computed from the same state, and
// motion is an analytic function of time, so play, scrub and replay are exact.
import { z } from "zod";
import { clamp, keyframesEvery, round, type BaseAction, type WidgetModel } from "../types";

const G = 9.8;
const Load = z.object({ id: z.string(), label: z.string(), x: z.number(), force: z.number(), editable: z.boolean().default(false) });
const Mass = z.object({ id: z.string(), label: z.string(), m: z.number().positive(), x: z.number(), y: z.number().default(0), editable: z.boolean().default(false) });
export const SHAPES = ["ring", "disc", "rod-centre", "rod-end", "solid-sphere", "hollow-sphere"] as const;
export type Shape = (typeof SHAPES)[number];

export const RigidBodyConfig = z.object({
  mode: z.enum(["lever", "rotor", "com", "dipole", "coil", "circle"]),
  /** lever: a beam of `length` m on a pivot at `pivot` m from its left end; loads are downward forces (N) at x m from the left */
  lever: z.object({ length: z.number().positive(), pivot: z.number().min(0), beamWeight: z.number().min(0).default(0), loads: z.array(Load) }).optional(),
  /** rotor: a body turning about a fixed axis under a constant net torque */
  rotor: z.object({ shape: z.enum(SHAPES), mass: z.number().positive(), size: z.number().positive(), torque: z.number().default(0), omega0: z.number().default(0), duration: z.number().positive().default(3) }).optional(),
  /** com: point masses in a plane (m) */
  com: z.object({ masses: z.array(Mass).min(1) }).optional(),
  /** dipole: an electric or magnetic dipole moment at an angle to a uniform field */
  dipole: z.object({ kind: z.enum(["electric", "magnetic"]), moment: z.number().positive(), field: z.number().positive(), angleDeg: z.number(), editableAngle: z.boolean().default(true) }).optional(),
  /** coil: N turns of area A (m²) rotating at ω (rad/s) in a uniform field B (T) */
  coil: z.object({ turns: z.number().int().positive(), area: z.number().positive(), field: z.number().positive(), omega: z.number().positive(), periods: z.number().positive().default(2) }).optional(),
  /** circle: a particle in uniform circular motion */
  circle: z.object({ radius: z.number().positive(), speed: z.number().positive(), mass: z.number().positive().default(1), periods: z.number().positive().default(1.5) }).optional(),
  /** values are hidden until the solution reveals them (answer-safe hints and feedback) */
  showValues: z.boolean().default(true),
});
export type RigidBodyConfig = z.input<typeof RigidBodyConfig>;
type Cfg = z.output<typeof RigidBodyConfig>;

export interface RBOverlay { highlight: string[]; note: string | null; arms: boolean; ghostShape: Shape | null; comMarker: boolean }
export interface RBState {
  config: Cfg;
  loads: z.output<typeof Load>[];
  masses: z.output<typeof Mass>[];
  rotor: Cfg["rotor"];
  angleDeg: number;
  showValues: boolean;
  overlay: RBOverlay;
  playToken: number;
}
export type RBAction =
  | { type: "set-load"; id: string; x?: number; force?: number }
  | { type: "set-mass"; id: string; x?: number; y?: number; m?: number }
  | { type: "set-angle"; deg: number }
  | { type: "set-rotor"; key: "torque" | "mass" | "size"; value: number };

const emptyOverlay = (): RBOverlay => ({ highlight: [], note: null, arms: false, ghostShape: null, comMarker: false });
const rad = (d: number) => (d * Math.PI) / 180;

/** Moment of inertia about the usual axis for each standard shape (size = radius, or length for rods). */
export function inertia(shape: Shape, m: number, size: number): number {
  switch (shape) {
    case "ring": return m * size * size;
    case "disc": return 0.5 * m * size * size;
    case "rod-centre": return (m * size * size) / 12;
    case "rod-end": return (m * size * size) / 3;
    case "solid-sphere": return 0.4 * m * size * size;
    case "hollow-sphere": return (2 / 3) * m * size * size;
  }
}
export const SHAPE_FORMULA: Record<Shape, string> = {
  ring: "MR²", disc: "½MR²", "rod-centre": "ML²/12", "rod-end": "ML²/3", "solid-sphere": "⅖MR²", "hollow-sphere": "⅔MR²",
};

/** Net torque about the pivot (N m), anticlockwise positive; downward loads to the right of the pivot turn the beam clockwise. */
export function leverTorque(s: RBState): number {
  const l = s.config.lever!;
  const beam = l.beamWeight * (l.length / 2 - l.pivot);
  return -s.loads.reduce((t, x) => t + x.force * (x.x - l.pivot), beam);
}
export function leverInertia(s: RBState): number {
  const l = s.config.lever!;
  const beamMass = l.beamWeight / G;
  const beamI = (beamMass * l.length * l.length) / 12 + beamMass * (l.length / 2 - l.pivot) ** 2;
  return Math.max(1e-6, beamI + s.loads.reduce((I, x) => I + (Math.abs(x.force) / G) * (x.x - l.pivot) ** 2, 0));
}
export function centreOfMass(ms: { m: number; x: number; y: number }[]) {
  const M = ms.reduce((a, b) => a + b.m, 0);
  return { M, x: ms.reduce((a, b) => a + b.m * b.x, 0) / M, y: ms.reduce((a, b) => a + b.m * b.y, 0) / M };
}

/** Beam tilt (degrees, anticlockwise positive) at time t; a balanced beam stays level. */
export function leverAngleAt(s: RBState, t: number): number {
  const tau = leverTorque(s);
  if (Math.abs(tau) < 1e-9) return 0;
  const alpha = tau / leverInertia(s);
  return clamp(((0.5 * alpha * t * t) * 180) / Math.PI, -25, 25);
}
export function rotorAt(s: RBState, t: number) {
  const r = s.rotor!;
  const I = inertia(r.shape, r.mass, r.size);
  const alpha = r.torque / I;
  const omega = r.omega0 + alpha * t;
  const theta = r.omega0 * t + 0.5 * alpha * t * t;
  return { I, alpha, omega, theta, L: I * omega, ke: 0.5 * I * omega * omega };
}
/** Dipole: torque magnitude pF sin θ and potential energy −pF cos θ; it swings toward alignment as an undamped pendulum would (small angles shown). */
export function dipoleAt(s: RBState) {
  const d = s.config.dipole!;
  const th = rad(s.angleDeg);
  return { torque: d.moment * d.field * Math.sin(th), energy: -d.moment * d.field * Math.cos(th) };
}
export function coilAt(s: RBState, t: number) {
  const c = s.config.coil!;
  const wt = c.omega * t;
  return { flux: c.turns * c.field * c.area * Math.cos(wt), emf: c.turns * c.field * c.area * c.omega * Math.sin(wt), peak: c.turns * c.field * c.area * c.omega, angleDeg: ((wt * 180) / Math.PI) % 360 };
}
export function circleAt(s: RBState, t: number) {
  const c = s.config.circle!;
  const w = c.speed / c.radius;
  const th = w * t;
  return { x: c.radius * Math.cos(th), y: c.radius * Math.sin(th), omega: w, period: (2 * Math.PI) / w, ac: (c.speed * c.speed) / c.radius, force: (c.mass * c.speed * c.speed) / c.radius, theta: th };
}

export function durationOf(s: RBState): number {
  const c = s.config;
  if (c.mode === "lever") return Math.abs(leverTorque(s)) < 1e-9 ? 0 : 1.5;
  if (c.mode === "rotor") return c.rotor!.duration;
  if (c.mode === "coil") return (c.coil!.periods * 2 * Math.PI) / c.coil!.omega;
  if (c.mode === "circle") return circleAt(s, 0).period * c.circle!.periods;
  return 0;
}

function init(config: RigidBodyConfig | Cfg): RBState {
  const cfg = RigidBodyConfig.parse(config);
  return { config: cfg, loads: (cfg.lever?.loads ?? []).map((l) => ({ ...l })), masses: (cfg.com?.masses ?? []).map((m) => ({ ...m })), rotor: cfg.rotor ? { ...cfg.rotor } : undefined, angleDeg: cfg.dipole?.angleDeg ?? 0, showValues: cfg.showValues, overlay: emptyOverlay(), playToken: 0 };
}

function reduce(s: RBState, a: RBAction | BaseAction): RBState {
  const cfg = s.config;
  switch (a.type) {
    case "set-load": {
      const len = cfg.lever?.length ?? 0;
      return { ...s, loads: s.loads.map((l) => (l.id === a.id && l.editable ? { ...l, x: a.x !== undefined ? round(clamp(a.x, 0, len), 4) : l.x, force: a.force !== undefined ? round(Math.max(0, a.force), 4) : l.force } : l)) };
    }
    case "set-mass": return { ...s, masses: s.masses.map((m) => (m.id === a.id && m.editable ? { ...m, x: a.x ?? m.x, y: a.y ?? m.y, m: a.m !== undefined ? Math.max(0.01, a.m) : m.m } : m)) };
    case "set-angle": return cfg.dipole?.editableAngle ? { ...s, angleDeg: round(((a.deg % 360) + 360) % 360, 2) } : s;
    case "set-rotor": return s.rotor ? { ...s, rotor: { ...s.rotor, [a.key]: a.key === "torque" ? a.value : Math.max(0.01, a.value) } } : s;
    case "clear-overlay": return { ...s, overlay: emptyOverlay() };
    case "reset": return init(cfg);
    case "replace": return a.state as RBState;
    case "cue": {
      const args = a.args ?? {};
      const o = s.overlay;
      switch (a.cue) {
        case "highlight": return { ...s, overlay: { ...o, highlight: (args.ids as string[]) ?? [] } };
        case "note": return { ...s, overlay: { ...o, note: String(args.text ?? "") } };
        case "arms": return { ...s, overlay: { ...o, arms: args.on !== false } };
        case "com": return { ...s, overlay: { ...o, comMarker: args.on !== false } };
        case "reveal": return { ...s, showValues: true };
        case "play": return { ...s, playToken: s.playToken + 1 };
        case "set-load": return { ...s, loads: s.loads.map((l) => (l.id === args.id ? { ...l, x: args.x !== undefined ? Number(args.x) : l.x, force: args.force !== undefined ? Number(args.force) : l.force } : l)), playToken: s.playToken + 1 };
        case "set-angle": return { ...s, angleDeg: Number(args.deg) };
        case "set-rotor": return s.rotor ? { ...s, rotor: { ...s.rotor, [String(args.key)]: Number(args.value) }, playToken: s.playToken + 1 } : s;
        case "ghost-shape": return { ...s, overlay: { ...o, ghostShape: (args.shape as Shape) ?? null } };
        default: return s;
      }
    }
  }
}

const n = (x: number, d = 3) => String(Number(x.toPrecision(d)));

export const rigidBody: WidgetModel<RigidBodyConfig, RBState, RBAction> = {
  type: "rigid-body",
  interactive: true,
  dragInputs: true,
  configSchema: RigidBodyConfig as unknown as z.ZodType<RigidBodyConfig>,
  cues: {
    highlight: z.object({ ids: z.array(z.string()) }),
    note: z.object({ text: z.string() }),
    arms: z.object({ on: z.boolean().optional() }),
    com: z.object({ on: z.boolean().optional() }),
    reveal: z.object({}),
    play: z.object({}),
    "set-load": z.object({ id: z.string(), x: z.union([z.number(), z.string()]).optional(), force: z.union([z.number(), z.string()]).optional() }),
    "set-angle": z.object({ deg: z.union([z.number(), z.string()]) }),
    "set-rotor": z.object({ key: z.enum(["torque", "mass", "size", "omega0"]), value: z.union([z.number(), z.string()]) }),
    "ghost-shape": z.object({ shape: z.enum(SHAPES) }),
  },
  init,
  reduce,
  timeline: (s) => { const d = durationOf(s); return d > 0 ? { duration: d, keyframes: keyframesEvery(d, 6) } : { duration: 0, keyframes: [0] }; },
  describe(s, t) {
    const c = s.config, v = s.showValues;
    const note = s.overlay.note ? ` ${s.overlay.note}` : "";
    switch (c.mode) {
      case "lever": {
        const l = c.lever!;
        const parts = s.loads.map((x) => `${x.label}: ${v ? `${n(x.force)} N ` : ""}at ${n(x.x)} m from the left end (${n(Math.abs(x.x - l.pivot))} m ${x.x >= l.pivot ? "right" : "left"} of the pivot)`);
        const tau = leverTorque(s);
        const state = Math.abs(tau) < 1e-9 ? "The beam balances: the turning effects cancel." : `The beam turns ${tau > 0 ? "anticlockwise" : "clockwise"}${v ? ` with a net torque of ${n(Math.abs(tau))} N m` : ""}; tilt now ${n(Math.abs(leverAngleAt(s, t)), 2)}°.`;
        return `A ${n(l.length)} m beam on a pivot ${n(l.pivot)} m from its left end${l.beamWeight ? `, weighing ${n(l.beamWeight)} N` : ""}. ${parts.join("; ")}. ${state}${note}`;
      }
      case "rotor": {
        const r = s.rotor!, q = rotorAt(s, t);
        const name = { ring: "ring", disc: "disc", "rod-centre": "rod about its centre", "rod-end": "rod about one end", "solid-sphere": "solid sphere", "hollow-sphere": "hollow sphere" }[r.shape];
        return `A ${name} of mass ${n(r.mass)} kg and ${r.shape.startsWith("rod") ? "length" : "radius"} ${n(r.size)} m (I = ${SHAPE_FORMULA[r.shape]}${v ? ` = ${n(q.I)} kg m²` : ""}) under a net torque of ${n(r.torque)} N m. At t = ${n(t, 2)} s${v ? `: ω = ${n(q.omega)} rad/s, angle turned ${n(q.theta)} rad, L = ${n(q.L)} kg m²/s, rotational KE ${n(q.ke)} J` : ", it is turning faster"}.${note}`;
      }
      case "com": {
        const cm = centreOfMass(s.masses);
        return `${s.masses.map((m) => `${m.label}: ${n(m.m)} kg at (${n(m.x)}, ${n(m.y)}) m`).join("; ")}.${s.overlay.comMarker || v ? ` Centre of mass at (${n(cm.x)}, ${n(cm.y)}) m.` : ""}${note}`;
      }
      case "dipole": {
        const d = c.dipole!, q = dipoleAt(s);
        const sym = d.kind === "electric" ? ["p", "E", "C m", "N/C"] : ["m", "B", "A m²", "T"];
        return `${d.kind === "electric" ? "An" : "A"} ${d.kind} dipole ${sym[0]} = ${n(d.moment)} ${sym[2]} at ${n(s.angleDeg)}° to a uniform field ${sym[1]} = ${n(d.field)} ${sym[3]}.${v ? ` Torque ${n(Math.abs(q.torque))} N m (turning it toward the field); potential energy ${n(q.energy)} J.` : " The field turns it toward alignment."}${note}`;
      }
      case "coil": {
        const k = c.coil!, q = coilAt(s, t);
        return `A coil of ${k.turns} turns, area ${n(k.area)} m², rotating at ${n(k.omega)} rad/s in ${n(k.field)} T. At t = ${n(t, 2)} s the coil has turned ${n(q.angleDeg)}°${v ? `: flux linkage ${n(q.flux)} Wb, emf ${n(q.emf)} V (peak ${n(q.peak)} V)` : ""}.${note}`;
      }
      case "circle": {
        const k = c.circle!, q = circleAt(s, t);
        return `A ${n(k.mass)} kg body moving at a steady ${n(k.speed)} m/s round a circle of radius ${n(k.radius)} m. Its velocity is along the tangent and its acceleration points to the centre${v ? `: ω = ${n(q.omega)} rad/s, period ${n(q.period)} s, centripetal acceleration ${n(q.ac)} m/s², net force ${n(q.force)} N` : ""}.${note}`;
      }
    }
  },
};
