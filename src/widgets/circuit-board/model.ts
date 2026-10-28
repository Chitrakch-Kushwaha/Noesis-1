// Circuit Board: a DC circuit solved by modified nodal analysis, so every current and voltage shown is
// consistent with Ohm's law and Kirchhoff's rules. Capacitors are treated in the steady state (no
// current; charge Q = CV). The current animation is a pure function of time.
import { z } from "zod";
import { keyframesEvery, round, type BaseAction, type WidgetModel } from "../types";

export const KINDS = ["battery", "resistor", "wire", "ammeter", "voltmeter", "switch", "capacitor", "lamp", "galvanometer"] as const;
const Element = z.object({
  id: z.string(),
  kind: z.enum(KINDS),
  /** battery: from = negative terminal, to = positive terminal */
  from: z.string(),
  to: z.string(),
  /** emf (V) for a battery, resistance (Ω) for a resistor/lamp/galvanometer, capacitance (F) for a capacitor */
  value: z.number().default(0),
  /** internal resistance of a battery (Ω) */
  r: z.number().min(0).default(0),
  label: z.string().optional(),
  editable: z.boolean().default(false),
  closed: z.boolean().default(true),
});
export type CircuitElement = z.output<typeof Element>;
export const CircuitConfig = z.object({
  nodes: z.array(z.object({ id: z.string(), x: z.number(), y: z.number() })).min(2),
  elements: z.array(Element).min(1),
  ground: z.string().optional(),
  showValues: z.boolean().default(true),
  /** how values are written: the solver is always SI */
  unit: z.object({ capacitance: z.enum(["F", "µF"]).default("µF") }).default({ capacitance: "µF" }),
});
export type CircuitConfig = z.input<typeof CircuitConfig>;
type Cfg = z.output<typeof CircuitConfig>;

export interface CBOverlay { highlight: string[]; note: string | null; currents: boolean; voltages: boolean }
export interface CBState { config: Cfg; elements: CircuitElement[]; showValues: boolean; overlay: CBOverlay; playToken: number }
export type CBAction = { type: "set"; id: string; value: number } | { type: "toggle"; id: string };

const emptyOverlay = (): CBOverlay => ({ highlight: [], note: null, currents: false, voltages: false });
const LEAK = 1e-12; // keeps nodes joined only through capacitors or voltmeters solvable

/** Solve the circuit. Returns node voltages and, for each element, its current (from → to) and the voltage V(to) − V(from). */
export function solve(elements: CircuitElement[], nodeIds: string[], ground?: string) {
  const nodes = [...nodeIds];
  // a battery with internal resistance becomes an ideal source in series with r through an internal node
  const parts: { id: string; kind: "R" | "V"; a: string; b: string; v: number }[] = [];
  for (const e of elements) {
    const open = e.kind === "switch" && !e.closed;
    if (open || e.kind === "voltmeter" || e.kind === "capacitor") continue;
    if (e.kind === "battery") {
      if (e.r > 0) { const mid = `${e.id}#int`; nodes.push(mid); parts.push({ id: e.id, kind: "V", a: e.from, b: mid, v: e.value }, { id: `${e.id}#r`, kind: "R", a: mid, b: e.to, v: e.r }); }
      else parts.push({ id: e.id, kind: "V", a: e.from, b: e.to, v: e.value });
    } else if (e.kind === "resistor" || e.kind === "lamp" || e.kind === "galvanometer") parts.push({ id: e.id, kind: "R", a: e.from, b: e.to, v: Math.max(e.value, 1e-9) });
    else parts.push({ id: e.id, kind: "V", a: e.from, b: e.to, v: 0 }); // wire, ammeter, closed switch: a 0 V source that reports its current
  }
  const g = ground ?? nodes[0]!;
  const idx = new Map(nodes.filter((n) => n !== g).map((n, i) => [n, i]));
  const vs = parts.filter((p) => p.kind === "V");
  const n = idx.size, m = vs.length, N = n + m;
  const A = Array.from({ length: N }, () => new Array<number>(N + 1).fill(0));
  const at = (node: string) => idx.get(node);
  for (const i of idx.values()) A[i]![i]! += LEAK;
  for (const p of parts.filter((q) => q.kind === "R")) {
    const ga = 1 / p.v, a = at(p.a), b = at(p.b);
    if (a !== undefined) A[a]![a]! += ga;
    if (b !== undefined) A[b]![b]! += ga;
    if (a !== undefined && b !== undefined) { A[a]![b]! -= ga; A[b]![a]! -= ga; }
  }
  vs.forEach((p, k) => {
    const row = n + k, a = at(p.a), b = at(p.b);
    // V(b) − V(a) = v; the unknown current flows from a to b through the source
    if (b !== undefined) { A[row]![b]! += 1; A[b]![row]! += 1; }
    if (a !== undefined) { A[row]![a]! -= 1; A[a]![row]! -= 1; }
    A[row]![N] = p.v;
  });
  // Gaussian elimination with partial pivoting
  for (let c = 0; c < N; c++) {
    let piv = c;
    for (let r = c + 1; r < N; r++) if (Math.abs(A[r]![c]!) > Math.abs(A[piv]![c]!)) piv = r;
    [A[c], A[piv]] = [A[piv]!, A[c]!];
    const d = A[c]![c]!;
    if (Math.abs(d) < 1e-15) continue;
    for (let r = 0; r < N; r++) {
      if (r === c) continue;
      const f = A[r]![c]! / d;
      if (f) for (let k = c; k <= N; k++) A[r]![k]! -= f * A[c]![k]!;
    }
  }
  const x = A.map((row, i) => (Math.abs(row[i]!) < 1e-15 ? 0 : row[N]! / row[i]!));
  const V = (node: string) => (node === g ? 0 : x[idx.get(node)!] ?? 0);
  // MNA's source unknown is the current entering its b terminal from the network; through the source from a to b it is the negative
  const srcI = new Map(vs.map((p, k) => [p.id, -(x[n + k] ?? 0)]));
  const out = new Map<string, { current: number; voltage: number }>();
  for (const e of elements) {
    const dv = V(e.to) - V(e.from);
    let I = 0;
    if (e.kind === "battery") I = srcI.get(e.id) ?? 0;
    else if (e.kind === "resistor" || e.kind === "lamp" || e.kind === "galvanometer") I = -dv / Math.max(e.value, 1e-9);
    else if (e.kind === "voltmeter" || e.kind === "capacitor" || (e.kind === "switch" && !e.closed)) I = 0;
    else I = srcI.get(e.id) ?? 0;
    out.set(e.id, { current: round(I, 9), voltage: round(dv, 9) });
  }
  return { V, element: out };
}

const nodeIds = (s: CBState) => s.config.nodes.map((n) => n.id);
export const solved = (s: CBState) => solve(s.elements, nodeIds(s), s.config.ground);

function init(config: CircuitConfig | Cfg): CBState {
  const cfg = CircuitConfig.parse(config);
  return { config: cfg, elements: cfg.elements.map((e) => ({ ...e })), showValues: cfg.showValues, overlay: emptyOverlay(), playToken: 0 };
}

function reduce(s: CBState, a: CBAction | BaseAction): CBState {
  switch (a.type) {
    case "set": return { ...s, elements: s.elements.map((e) => (e.id === a.id && e.editable ? { ...e, value: Math.max(e.kind === "battery" ? -1e6 : 0, a.value) } : e)) };
    case "toggle": return { ...s, elements: s.elements.map((e) => (e.id === a.id && e.kind === "switch" && e.editable ? { ...e, closed: !e.closed } : e)) };
    case "clear-overlay": return { ...s, overlay: emptyOverlay() };
    case "reset": return init(s.config);
    case "replace": return a.state as CBState;
    case "cue": {
      const args = a.args ?? {}, o = s.overlay;
      switch (a.cue) {
        case "highlight": return { ...s, overlay: { ...o, highlight: (args.ids as string[]) ?? [] } };
        case "note": return { ...s, overlay: { ...o, note: String(args.text ?? "") } };
        case "currents": return { ...s, overlay: { ...o, currents: args.on !== false }, playToken: s.playToken + 1 };
        case "voltages": return { ...s, overlay: { ...o, voltages: args.on !== false } };
        case "reveal": return { ...s, showValues: true };
        case "set": return { ...s, elements: s.elements.map((e) => (e.id === args.id ? { ...e, value: Number(args.value) } : e)), playToken: s.playToken + 1 };
        case "switch": return { ...s, elements: s.elements.map((e) => (e.id === args.id ? { ...e, closed: args.closed !== false } : e)) };
        default: return s;
      }
    }
  }
}

const n3 = (x: number) => String(Number(x.toPrecision(3)));
export const fmtValue = (e: CircuitElement, cfg: Cfg) =>
  e.kind === "battery" ? `${n3(e.value)} V${e.r ? `, r = ${n3(e.r)} Ω` : ""}` : e.kind === "capacitor" ? (cfg.unit.capacitance === "µF" ? `${n3(e.value * 1e6)} µF` : `${n3(e.value)} F`) : ["resistor", "lamp", "galvanometer"].includes(e.kind) ? `${n3(e.value)} Ω` : "";

export const circuitBoard: WidgetModel<CircuitConfig, CBState, CBAction> = {
  type: "circuit-board",
  interactive: true,
  dragInputs: false,
  configSchema: CircuitConfig as unknown as z.ZodType<CircuitConfig>,
  cues: {
    highlight: z.object({ ids: z.array(z.string()) }),
    note: z.object({ text: z.string() }),
    currents: z.object({ on: z.boolean().optional() }),
    voltages: z.object({ on: z.boolean().optional() }),
    reveal: z.object({}),
    set: z.object({ id: z.string(), value: z.union([z.number(), z.string()]) }),
    switch: z.object({ id: z.string(), closed: z.boolean().optional() }),
  },
  init,
  reduce,
  timeline: (s) => (s.overlay.currents ? { duration: 2, keyframes: keyframesEvery(2, 4) } : { duration: 0, keyframes: [0] }),
  describe(s) {
    const r = solved(s), v = s.showValues;
    const parts = s.elements.filter((e) => e.kind !== "wire").map((e) => {
      const x = r.element.get(e.id)!;
      const name = `${e.label ?? e.id} (${e.kind}${fmtValue(e, s.config) ? `, ${fmtValue(e, s.config)}` : ""}${e.kind === "switch" ? (e.closed ? ", closed" : ", open") : ""})`;
      if (!v) return name;
      if (e.kind === "voltmeter") return `${name} reads ${n3(Math.abs(x.voltage))} V`;
      if (e.kind === "ammeter") return `${name} reads ${n3(Math.abs(x.current))} A`;
      if (e.kind === "capacitor") return `${name}: ${n3(Math.abs(x.voltage))} V, charge ${n3(Math.abs(x.voltage) * e.value * 1e6)} µC`;
      if (e.kind === "battery") return `${name}: terminal voltage ${n3(Math.abs(x.voltage))} V, current ${n3(Math.abs(x.current))} A`;
      return `${name}: ${n3(Math.abs(x.current))} A, ${n3(Math.abs(x.voltage))} V`;
    });
    return `Circuit: ${parts.join("; ")}.${s.overlay.note ? ` ${s.overlay.note}` : ""}`;
  },
};
