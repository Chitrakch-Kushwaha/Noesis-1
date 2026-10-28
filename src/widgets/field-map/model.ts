// Field Map: electric and magnetic fields computed from their sources, so every arrow, equipotential and
// reading is consistent. Modes: point charges (field, potential, forces), a parallel-plate capacitor,
// a charged particle in a uniform magnetic field, long straight currents, and electromagnetic induction
// (a loop in a changing field, or a rod sliding on rails). Motion is a pure function of time.
import { z } from "zod";
import { keyframesEvery, round, type BaseAction, type WidgetModel } from "../types";

export const K_E = 8.9875517923e9, EPS0 = 8.8541878128e-12, MU0 = 4e-7 * Math.PI;

const Charge = z.object({ id: z.string(), q: z.number(), x: z.number(), y: z.number(), label: z.string().optional(), editable: z.boolean().default(false) });
const Wire = z.object({ id: z.string(), I: z.number(), x: z.number(), y: z.number(), label: z.string().optional() });
export const FieldMapConfig = z.object({
  mode: z.enum(["charges", "plates", "particle", "wires", "induction"]),
  /** half-width of the scene in metres */
  extent: z.number().positive().default(1),
  charges: z.array(Charge).default([]),
  probe: z.object({ x: z.number(), y: z.number() }).nullable().default(null),
  showField: z.boolean().default(true),
  showPotential: z.boolean().default(false),
  /** forces on the charges (superposition) */
  showForces: z.boolean().default(false),
  plates: z.object({ V: z.number(), d: z.number().positive(), area: z.number().positive(), k: z.number().min(1).default(1), editable: z.boolean().default(false) }).optional(),
  /** B > 0 points out of the page */
  particle: z.object({ q: z.number(), m: z.number().positive(), v: z.number().positive(), B: z.number(), periods: z.number().positive().default(1), editable: z.boolean().default(false) }).optional(),
  wires: z.array(Wire).default([]),
  induction: z.object({
    kind: z.enum(["loop", "rod"]),
    B0: z.number(),
    /** dB/dt in T/s (loop) */
    rate: z.number().default(0),
    /** loop area (m²) and angle between the field and the loop's normal */
    area: z.number().positive().default(0.01),
    angleDeg: z.number().default(0),
    turns: z.number().int().positive().default(1),
    /** rod length (m), speed (m/s) and circuit resistance (Ω) */
    L: z.number().positive().default(0.5),
    v: z.number().default(1),
    R: z.number().positive().default(1),
    duration: z.number().positive().default(2),
  }).optional(),
  showValues: z.boolean().default(true),
});
export type FieldMapConfig = z.input<typeof FieldMapConfig>;
type Cfg = z.output<typeof FieldMapConfig>;

export interface FMOverlay { highlight: string[]; note: string | null; ghost: { key: string; value: number; label: string } | null }
export interface FMState {
  config: Cfg; charges: z.output<typeof Charge>[]; probe: { x: number; y: number } | null;
  p: Record<string, number>; field: boolean; potential: boolean; forces: boolean; showValues: boolean; overlay: FMOverlay; playToken: number;
}
export type FMAction = { type: "set-charge"; id: string; q?: number; x?: number; y?: number } | { type: "probe"; x: number; y: number } | { type: "set"; key: string; value: number };

const emptyOverlay = (): FMOverlay => ({ highlight: [], note: null, ghost: null });

// ---------------------------------------------------------------- physics
export function fieldAt(charges: { q: number; x: number; y: number }[], x: number, y: number) {
  let Ex = 0, Ey = 0, V = 0;
  for (const c of charges) {
    const dx = x - c.x, dy = y - c.y, r2 = dx * dx + dy * dy, r = Math.sqrt(r2);
    if (r < 1e-9) continue;
    Ex += (K_E * c.q * dx) / (r2 * r); Ey += (K_E * c.q * dy) / (r2 * r); V += (K_E * c.q) / r;
  }
  return { Ex, Ey, E: Math.hypot(Ex, Ey), V };
}
/** Marching-squares line segments for equipotentials.  The samples use the same
 * Coulomb potential as the probe, rather than a separately drawn approximation. */
export function equipotentialContours(charges: { q: number; x: number; y: number }[], extent: number, levels = 7, cells = 26) {
  if (!charges.length) return [] as { x1: number; y1: number; x2: number; y2: number; level: number }[];
  const grid = Array.from({ length: cells + 1 }, (_, j) => Array.from({ length: cells + 1 }, (_, i) => {
    const x = -extent + (2 * extent * i) / cells, y = -extent + (2 * extent * j) / cells;
    return { x, y, v: fieldAt(charges, x, y).V };
  }));
  const values = grid.flat().map((p) => p.v).filter(Number.isFinite).sort((a, b) => a - b);
  const lo = values[Math.floor(values.length * 0.12)]!, hi = values[Math.floor(values.length * 0.88)]!;
  if (!(hi > lo)) return [];
  const out: { x1: number; y1: number; x2: number; y2: number; level: number }[] = [];
  const cross = (a: typeof grid[number][number], b: typeof grid[number][number], level: number) => {
    const d = b.v - a.v, f = Math.abs(d) < 1e-20 ? 0.5 : (level - a.v) / d;
    return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
  };
  for (let l = 1; l <= levels; l++) {
    const level = lo + ((hi - lo) * l) / (levels + 1);
    for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
      const a = grid[j]![i]!, b = grid[j]![i + 1]!, c = grid[j + 1]![i + 1]!, d = grid[j + 1]![i]!;
      const edges: { x: number; y: number }[] = [];
      for (const [p, q] of [[a, b], [b, c], [c, d], [d, a]] as const) if ((p.v < level) !== (q.v < level)) edges.push(cross(p, q, level));
      if (edges.length === 2) out.push({ x1: edges[0]!.x, y1: edges[0]!.y, x2: edges[1]!.x, y2: edges[1]!.y, level });
      if (edges.length === 4) { out.push({ x1: edges[0]!.x, y1: edges[0]!.y, x2: edges[1]!.x, y2: edges[1]!.y, level }, { x1: edges[2]!.x, y1: edges[2]!.y, x2: edges[3]!.x, y2: edges[3]!.y, level }); }
    }
  }
  return out;
}
/** Net Coulomb force on charge i from all the others. */
export function forceOn(charges: { id: string; q: number; x: number; y: number }[], id: string) {
  const me = charges.find((c) => c.id === id)!;
  const f = fieldAt(charges.filter((c) => c.id !== id), me.x, me.y);
  return { Fx: me.q * f.Ex, Fy: me.q * f.Ey, F: Math.abs(me.q) * f.E };
}
export function platesOf(p: Record<string, number>) {
  const E = p.V! / p.d!, C = (p.k! * EPS0 * p.area!) / p.d!;
  return { E, C, Q: C * p.V!, U: 0.5 * C * p.V! * p.V!, sigma: (C * p.V!) / p.area! };
}
export function particleOf(p: Record<string, number>) {
  const w = (Math.abs(p.q!) * Math.abs(p.B!)) / p.m!;
  return { r: (p.m! * p.v!) / (Math.abs(p.q!) * Math.abs(p.B!)), T: (2 * Math.PI) / w, omega: w, F: Math.abs(p.q!) * p.v! * Math.abs(p.B!), f: w / (2 * Math.PI) };
}
/** Position of the particle at time t: it starts at the origin moving in +x; F = qv × B sets the turning sense. */
export function particleAt(p: Record<string, number>, t: number) {
  const { r, omega } = particleOf(p);
  // for B out of the page (+z) and v along +x, F = q v B (x̂ × ẑ) = −q v B ŷ: a positive charge turns clockwise
  const sense = -Math.sign(p.q! * p.B!) || 1;
  const th = omega * t;
  return { x: r * Math.sin(th), y: sense * r * (1 - Math.cos(th)), sense };
}
export function wireField(wires: { I: number; x: number; y: number }[], x: number, y: number) {
  let Bx = 0, By = 0;
  for (const w of wires) {
    const dx = x - w.x, dy = y - w.y, r2 = dx * dx + dy * dy;
    if (r2 < 1e-12) continue;
    const k = (MU0 * w.I) / (2 * Math.PI * r2); // B = μ₀I/(2πr) along ẑ × r̂ (anticlockwise for I out of the page)
    Bx += -k * dy; By += k * dx;
  }
  return { Bx, By, B: Math.hypot(Bx, By) };
}
/** Force per unit length on wire `id` from the others (F/L = I × B). */
export function wireForce(wires: { id: string; I: number; x: number; y: number }[], id: string) {
  const me = wires.find((w) => w.id === id)!;
  const b = wireField(wires.filter((w) => w.id !== id), me.x, me.y);
  // ẑ I × (Bx, By) = I(−By, Bx)
  return { fx: -me.I * b.By, fy: me.I * b.Bx, f: Math.abs(me.I) * b.B };
}
export function inductionAt(c: NonNullable<Cfg["induction"]>, p: Record<string, number>, t: number) {
  if (c.kind === "loop") {
    const B = p.B0! + p.rate! * t, cos = Math.cos((p.angleDeg! * Math.PI) / 180);
    const flux = B * p.area! * cos, emf = -c.turns * p.rate! * p.area! * cos;
    return { B, flux, linkage: c.turns * flux, emf, I: emf / p.R!, x: 0, F: 0, P: (emf * emf) / p.R! };
  }
  const x = p.v! * t, flux = p.B0! * p.L! * x, emf = -p.B0! * p.L! * p.v!, I = emf / p.R!;
  return { B: p.B0!, flux, linkage: flux, emf, I, x, F: Math.abs(I) * p.L! * Math.abs(p.B0!), P: (emf * emf) / p.R! };
}

// ---------------------------------------------------------------- model
function params(c: Cfg): Record<string, number> {
  return { ...(c.plates ?? {}), ...(c.particle ?? {}), ...(c.induction ? { ...c.induction, kind: 0 } : {}) } as unknown as Record<string, number>;
}
function init(config: FieldMapConfig | Cfg): FMState {
  const c = FieldMapConfig.parse(config);
  return { config: c, charges: c.charges.map((q) => ({ ...q })), probe: c.probe, p: params(c), field: c.showField, potential: c.showPotential, forces: c.showForces, showValues: c.showValues, overlay: emptyOverlay(), playToken: 0 };
}

export const durationOf = (s: FMState) => {
  const c = s.config;
  if (c.mode === "particle" && c.particle) {
    const Ts = [particleOf(s.p).T];
    if (s.overlay.ghost) Ts.push(particleOf({ ...s.p, [s.overlay.ghost.key]: s.overlay.ghost.value }).T);
    return round(Math.max(...Ts) * c.particle.periods, 9);
  }
  if (c.mode === "induction" && c.induction) return c.induction.duration;
  return 0;
};

const EDITABLE: Record<string, (c: Cfg) => boolean> = {
  V: (c) => !!c.plates?.editable, d: (c) => !!c.plates?.editable, k: (c) => !!c.plates?.editable,
  v: (c) => !!c.particle?.editable || c.mode === "induction", B: (c) => !!c.particle?.editable, rate: (c) => c.mode === "induction", angleDeg: (c) => c.mode === "induction",
};

function reduce(s: FMState, a: FMAction | BaseAction): FMState {
  switch (a.type) {
    case "set-charge": return { ...s, charges: s.charges.map((q) => (q.id === a.id && q.editable ? { ...q, ...(a.q !== undefined ? { q: a.q } : {}), ...(a.x !== undefined ? { x: a.x } : {}), ...(a.y !== undefined ? { y: a.y } : {}) } : q)) };
    case "probe": return { ...s, probe: { x: a.x, y: a.y } };
    case "set": return EDITABLE[a.key]?.(s.config) ? { ...s, p: { ...s.p, [a.key]: a.value } } : s;
    case "clear-overlay": return { ...s, overlay: emptyOverlay() };
    case "reset": return init(s.config);
    case "replace": return a.state as FMState;
    case "cue": {
      const args = a.args ?? {}, o = s.overlay;
      switch (a.cue) {
        case "highlight": return { ...s, overlay: { ...o, highlight: (args.ids as string[]) ?? [] } };
        case "note": return { ...s, overlay: { ...o, note: String(args.text ?? "") } };
        case "probe": return { ...s, probe: { x: Number(args.x), y: Number(args.y) } };
        case "field": return { ...s, field: args.on !== false };
        case "potential": return { ...s, potential: args.on !== false };
        case "forces": return { ...s, forces: args.on !== false };
        case "reveal": return { ...s, showValues: true };
        case "play": return { ...s, playToken: s.playToken + 1 };
        case "set": return { ...s, p: { ...s.p, [String(args.key)]: Number(args.value) }, playToken: s.playToken + 1 };
        case "set-charge": return { ...s, charges: s.charges.map((q) => (q.id === args.id ? { ...q, q: Number(args.q ?? q.q), x: Number(args.x ?? q.x), y: Number(args.y ?? q.y) } : q)) };
        case "ghost": return { ...s, overlay: { ...o, ghost: { key: String(args.key), value: Number(args.value), label: String(args.label ?? "compare") } }, playToken: s.playToken + 1 };
        default: return s;
      }
    }
  }
}

export const sci = (x: number, d = 3) => {
  if (x === 0 || !Number.isFinite(x)) return String(x);
  const e = Math.floor(Math.log10(Math.abs(x)));
  if (e >= -3 && e < 5) return String(Number(x.toPrecision(d)));
  return `${Number((x / 10 ** e).toPrecision(d))} × 10^${e}`;
};

export const fieldMap: WidgetModel<FieldMapConfig, FMState, FMAction> = {
  type: "field-map",
  interactive: true,
  dragInputs: false,
  configSchema: FieldMapConfig as unknown as z.ZodType<FieldMapConfig>,
  cues: {
    highlight: z.object({ ids: z.array(z.string()) }),
    note: z.object({ text: z.string() }),
    probe: z.object({ x: z.union([z.number(), z.string()]), y: z.union([z.number(), z.string()]) }),
    field: z.object({ on: z.boolean().optional() }),
    potential: z.object({ on: z.boolean().optional() }),
    forces: z.object({ on: z.boolean().optional() }),
    reveal: z.object({}),
    play: z.object({}),
    set: z.object({ key: z.string(), value: z.union([z.number(), z.string()]) }),
    "set-charge": z.object({ id: z.string(), q: z.union([z.number(), z.string()]).optional(), x: z.union([z.number(), z.string()]).optional(), y: z.union([z.number(), z.string()]).optional() }),
    ghost: z.object({ key: z.string(), value: z.union([z.number(), z.string()]), label: z.string().optional() }),
  },
  init,
  reduce,
  timeline: (s) => { const d = durationOf(s); return d > 0 ? { duration: d, keyframes: keyframesEvery(d, 8) } : { duration: 0, keyframes: [0] }; },
  describe(s, t) {
    const c = s.config, v = s.showValues, note = s.overlay.note ? ` ${s.overlay.note}` : "";
    switch (c.mode) {
      case "charges": {
        const qs = s.charges.map((q) => `${q.label ?? q.id} = ${sci(q.q)} C at (${sci(q.x)} m, ${sci(q.y)} m)`).join("; ");
        let out = `Point charges: ${qs}.`;
        if (s.probe && v) { const f = fieldAt(s.charges, s.probe.x, s.probe.y); out += ` At the probe (${sci(s.probe.x)} m, ${sci(s.probe.y)} m): E = ${sci(f.E)} N/C, V = ${sci(f.V)} V.`; }
        if (s.forces && v) out += " " + s.charges.map((q) => `Net force on ${q.label ?? q.id}: ${sci(forceOn(s.charges, q.id).F)} N.`).join(" ");
        return out + note;
      }
      case "plates": {
        const r = platesOf(s.p);
        return `Parallel plates ${sci(s.p.d!)} m apart, area ${sci(s.p.area!)} m², at ${sci(s.p.V!)} V${s.p.k! > 1 ? `, dielectric constant ${s.p.k}` : ""}.${v ? ` Field ${sci(r.E)} V/m, capacitance ${sci(r.C)} F, charge ${sci(r.Q)} C.` : ""}${note}`;
      }
      case "particle": {
        const r = particleOf(s.p), pos = particleAt(s.p, t);
        return `A charge ${sci(s.p.q!)} C of mass ${sci(s.p.m!)} kg moving at ${sci(s.p.v!)} m/s in a uniform field of ${sci(Math.abs(s.p.B!))} T ${s.p.B! > 0 ? "out of" : "into"} the page; it turns ${pos.sense > 0 ? "anticlockwise" : "clockwise"}.${v ? ` Radius ${sci(r.r)} m, period ${sci(r.T)} s.` : ""}${note}`;
      }
      case "wires": {
        const ws = c.wires.map((w) => `${w.label ?? w.id}: ${sci(Math.abs(w.I))} A ${w.I > 0 ? "out of" : "into"} the page at (${sci(w.x)} m, ${sci(w.y)} m)`).join("; ");
        let out = `Long straight wires: ${ws}.`;
        if (s.probe && v) out += ` Field at the probe: ${sci(wireField(c.wires, s.probe.x, s.probe.y).B)} T.`;
        if (s.forces && v && c.wires.length > 1) out += " " + c.wires.map((w) => `Force per metre on ${w.label ?? w.id}: ${sci(wireForce(c.wires, w.id).f)} N/m.`).join(" ");
        return out + note;
      }
      case "induction": {
        const k = c.induction!, r = inductionAt(k, s.p, t);
        const head = k.kind === "loop" ? `A ${k.turns}-turn loop of area ${sci(s.p.area!)} m² at ${sci(s.p.angleDeg!)}° to the field; B changes at ${sci(s.p.rate!)} T/s.` : `A rod ${sci(s.p.L!)} m long slides at ${sci(s.p.v!)} m/s on rails in a ${sci(s.p.B0!)} T field; circuit resistance ${sci(s.p.R!)} Ω.`;
        return `${head}${v ? ` At t = ${sci(t)} s: flux ${sci(r.flux)} Wb, emf ${sci(Math.abs(r.emf))} V, current ${sci(Math.abs(r.I))} A.` : ""}${note}`;
      }
    }
  },
};
