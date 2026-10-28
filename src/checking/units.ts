// Physical units with dimensional analysis (docs/05 §3). Pure; no third-party unit library (D-049).
// Dimensions are exponent vectors over SI base units [m, kg, s, A, K, mol, cd].
import { normalise, parseExpression } from "./expr/parse";
import { compile } from "./expr/evaluate";

export type Dims = readonly [number, number, number, number, number, number, number];
const D = (m = 0, kg = 0, s = 0, A = 0, K = 0, mol = 0, cd = 0): Dims => [m, kg, s, A, K, mol, cd];
export const DIMENSIONLESS = D();

export const NAMED_DIMENSIONS = {
  dimensionless: D(),
  length: D(1), mass: D(0, 1), time: D(0, 0, 1), current: D(0, 0, 0, 1), temperature: D(0, 0, 0, 0, 1), amount: D(0, 0, 0, 0, 0, 1),
  area: D(2), volume: D(3), velocity: D(1, 0, -1), acceleration: D(1, 0, -2), force: D(1, 1, -2), momentum: D(1, 1, -1),
  energy: D(2, 1, -2), power: D(2, 1, -3), pressure: D(-1, 1, -2), frequency: D(0, 0, -1), density: D(-3, 1),
  charge: D(0, 0, 1, 1), voltage: D(2, 1, -3, -1), resistance: D(2, 1, -3, -2), capacitance: D(-2, -1, 4, 2),
  "magnetic-field": D(0, 1, -2, -1), "magnetic-flux": D(2, 1, -2, -1), inductance: D(2, 1, -2, -2),
  "electric-field": D(1, 1, -3, -1), torque: D(2, 1, -2), "angular-velocity": D(0, 0, -1), "spring-constant": D(0, 1, -2),
  // Phase 4 additions
  "moment-of-inertia": D(2, 1), "angular-momentum": D(2, 1, -1), "angular-acceleration": D(0, 0, -2), "dipole-moment": D(1, 0, 1, 1),
  "electric-flux": D(3, 1, -3, -1), "magnetic-moment": D(2, 0, 0, 1), resistivity: D(3, 1, -3, -2), "optical-power": D(-1),
  "surface-charge-density": D(-2, 0, 1, 1), "linear-charge-density": D(-1, 0, 1, 1),
} as const satisfies Record<string, Dims>;
export type DimensionName = keyof typeof NAMED_DIMENSIONS;

interface UnitDef { dims: Dims; factor: number; offset?: number; prefixable: boolean; temperature?: boolean }
const U = (dims: Dims, factor = 1, prefixable = true, extra: Partial<UnitDef> = {}): UnitDef => ({ dims, factor, prefixable, ...extra });
const UNITS: Record<string, UnitDef> = {
  m: U(D(1)), g: U(D(0, 1), 1e-3), s: U(D(0, 0, 1)), A: U(D(0, 0, 0, 1)), K: U(D(0, 0, 0, 0, 1)), mol: U(D(0, 0, 0, 0, 0, 1)), cd: U(D(0, 0, 0, 0, 0, 0, 1)),
  N: U(D(1, 1, -2)), J: U(D(2, 1, -2)), W: U(D(2, 1, -3)), Pa: U(D(-1, 1, -2)), Hz: U(D(0, 0, -1)), C: U(D(0, 0, 1, 1)),
  V: U(D(2, 1, -3, -1)), "Ω": U(D(2, 1, -3, -2)), F: U(D(-2, -1, 4, 2)), T: U(D(0, 1, -2, -1)), Wb: U(D(2, 1, -2, -1)), H: U(D(2, 1, -2, -2)),
  eV: U(D(2, 1, -2), 1.602176634e-19), L: U(D(3), 1e-3), l: U(D(3), 1e-3, false),
  D: U(D(-1), 1, false), // dioptre, the unit of lens power (1/m)
  min: U(D(0, 0, 1), 60, false), h: U(D(0, 0, 1), 3600, false), hr: U(D(0, 0, 1), 3600, false),
  rad: U(D(), 1, false), deg: U(D(), Math.PI / 180, false), "°": U(D(), Math.PI / 180, false), rev: U(D(), 2 * Math.PI, false),
  "°C": U(D(0, 0, 0, 0, 1), 1, false, { offset: 273.15, temperature: true }), degC: U(D(0, 0, 0, 0, 1), 1, false, { offset: 273.15, temperature: true }),
};
const WORDS: Record<string, string> = {
  metre: "m", metres: "m", meter: "m", meters: "m", second: "s", seconds: "s", sec: "s", secs: "s",
  gram: "g", grams: "g", kilogram: "kg", kilograms: "kg", newton: "N", newtons: "N", joule: "J", joules: "J",
  watt: "W", watts: "W", pascal: "Pa", pascals: "Pa", hertz: "Hz", coulomb: "C", coulombs: "C", volt: "V", volts: "V",
  ohm: "Ω", ohms: "Ω", farad: "F", farads: "F", tesla: "T", weber: "Wb", henry: "H", ampere: "A", amperes: "A", amp: "A", amps: "A",
  kelvin: "K", minute: "min", minutes: "min", mins: "min", hour: "h", hours: "h", hrs: "hr",
  degree: "deg", degrees: "deg", radian: "rad", radians: "rad", litre: "L", litres: "L", liter: "L", liters: "L",
  kmph: "km/h", kmh: "km/h", mps: "m/s", dioptre: "D", dioptres: "D", diopter: "D", diopters: "D",
};
const PREFIX: Record<string, number> = {
  Y: 1e24, Z: 1e21, E: 1e18, P: 1e15, T: 1e12, G: 1e9, M: 1e6, k: 1e3, h: 1e2, da: 1e1,
  d: 1e-1, c: 1e-2, m: 1e-3, "µ": 1e-6, "μ": 1e-6, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15, a: 1e-18,
};
const PREFIXES = Object.keys(PREFIX).sort((a, b) => b.length - a.length);

export interface UnitValue { dims: Dims; factor: number; offset: number; temperature: boolean; text: string }

const mulDims = (a: Dims, b: Dims, k = 1): Dims => a.map((x, i) => x + k * b[i]!) as unknown as Dims;
export const sameDims = (a: Dims, b: Dims) => a.every((x, i) => Math.abs(x - b[i]!) < 1e-12);

function resolveSymbol(sym: string): { def: UnitDef; factor: number } | null {
  const w = WORDS[sym] ?? WORDS[sym.toLowerCase()];
  if (w) { const u = parseUnit(w); return u ? { def: { dims: u.dims, factor: u.factor, offset: u.offset, prefixable: false, temperature: u.temperature }, factor: 1 } : null; }
  if (UNITS[sym]) return { def: UNITS[sym]!, factor: 1 };
  for (const p of PREFIXES) {
    if (sym.length > p.length && sym.startsWith(p)) {
      const base = UNITS[sym.slice(p.length)];
      if (base?.prefixable) return { def: base, factor: PREFIX[p]! };
    }
  }
  return null;
}

/** Split a run of letters with no separator into known units, e.g. "Nm" → N·m (only if prefix reading fails). */
function splitRun(sym: string): { def: UnitDef; factor: number }[] | null {
  const direct = resolveSymbol(sym);
  if (direct) return [direct];
  for (let i = sym.length - 1; i >= 1; i--) {
    const head = resolveSymbol(sym.slice(0, i));
    if (!head) continue;
    const tail = splitRun(sym.slice(i));
    if (tail) return [head, ...tail];
  }
  return null;
}

/** Parse a unit expression such as "kg m/s^2", "m·s⁻¹", "km/h", "N m", "kΩ", "°C". */
export function parseUnit(raw: string): UnitValue | null {
  const text = raw.trim();
  if (!text) return null;
  if (text.length > 60) return null;
  let s = normalise(text.replace(/μ/g, "µ").replace(/\u2126/g, "Ω")).replace(/\(/g, " ( ").replace(/\)/g, " ) ").replace(/\*/g, " ").replace(/(?<=[A-Za-zΩ°µμ])\.(?=[A-Za-zΩ°µμ])/g, " ");
  s = s.replace(/°\s*C/g, "°C").replace(/\^\s*\(\s*(-?\d+)\s*\)/g, "^$1");
  const tokens = s.match(/\/|\(|\)|[A-Za-zΩ°µμ]+(?:\^-?\d+(?:\.\d+)?|-\d+)?|\S/g) ?? [];
  let dims: Dims = DIMENSIONLESS;
  let factor = 1;
  let offset = 0;
  let temperature = false;
  let sign = 1; // +1 numerator, -1 denominator
  let groupSign: number | null = null;
  let afterSlash = false;
  let count = 0;
  for (const tok of tokens) {
    if (tok === "/") { afterSlash = true; continue; }
    if (tok === "(") { if (afterSlash) { groupSign = -1; afterSlash = false; } continue; }
    if (tok === ")") { groupSign = null; continue; }
    const m = /^([A-Za-zΩ°µμ]+)(?:\^(-?\d+(?:\.\d+)?)|(-\d+))?$/.exec(tok);
    if (!m) return null;
    const exp = Number(m[2] ?? m[3] ?? 1);
    const parts = splitRun(m[1]!);
    if (!parts) return null;
    const dir = groupSign ?? (afterSlash ? -1 : sign);
    afterSlash = false;
    parts.forEach((part, idx) => {
      const e = idx === parts.length - 1 ? exp : 1;
      dims = mulDims(dims, part.def.dims, dir * e);
      factor *= Math.pow(part.def.factor * part.factor, dir * e);
      if (part.def.temperature) { temperature = true; offset = part.def.offset ?? 0; }
      count++;
    });
  }
  if (!count) return null;
  // an offset unit is only meaningful on its own (°C, not °C/s)
  if (temperature && count > 1) offset = 0;
  return { dims, factor, offset, temperature, text };
}

export interface ParsedQuantity { number: number; numberText: string; unit: UnitValue | null; unitText: string }

/** Split "12.5 km/h" into its number and unit. The number part may use √, π and simple arithmetic. */
export function parseQuantity(input: string): ParsedQuantity | "unparseable" | "unknown-unit" {
  const src = input.trim().replace(/−/g, "-");
  // the unit begins at the first letter that is not part of sqrt / pi / scientific e, or at °, Ω, µ
  let cut = src.length;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (/[°Ωµμ]/.test(c)) { cut = i; break; }
    if (/[A-Za-z]/.test(c)) {
      const rest = src.slice(i);
      if (/^sqrt/i.test(rest)) { i += 3; continue; }
      if (/^pi(?![A-Za-z])/i.test(rest)) { i += 1; continue; }
      if (/^e[+-]?\d/.test(rest) && i > 0 && /[0-9.]/.test(src[i - 1]!)) continue;
      cut = i;
      break;
    }
  }
  const numberText = src.slice(0, cut).trim();
  const unitText = src.slice(cut).trim();
  if (!numberText) return "unparseable";
  let number: number;
  try {
    const { ast, ambiguous } = parseExpression(numberText);
    if (ambiguous) return "unparseable";
    number = compile(ast)({});
  } catch {
    return "unparseable";
  }
  if (!Number.isFinite(number)) return "unparseable";
  if (!unitText) return { number, numberText, unit: null, unitText };
  const unit = parseUnit(unitText);
  if (!unit) return "unknown-unit";
  return { number, numberText, unit, unitText };
}

export function dimsOf(d: DimensionName | Dims): Dims {
  return typeof d === "string" ? NAMED_DIMENSIONS[d] : d;
}

/** Convert a value in `unit` to SI. Temperature: absolute applies the offset, difference does not. */
export function toSI(value: number, unit: UnitValue, temperatureKind: "absolute" | "difference" = "absolute"): number {
  return value * unit.factor + (unit.temperature && temperatureKind === "absolute" ? unit.offset : 0);
}
export function fromSI(valueSI: number, unit: UnitValue, temperatureKind: "absolute" | "difference" = "absolute"): number {
  return (valueSI - (unit.temperature && temperatureKind === "absolute" ? unit.offset : 0)) / unit.factor;
}
