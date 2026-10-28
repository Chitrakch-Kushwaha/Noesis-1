// Solvers for Physics 12 and Maths templates.
import { rng } from "../rng";
import { minus, num, reject, type Solver } from "./types";
import { pick } from "./helpers";

/**
 * A deliberately small solver for authored concept checks. The checked answer
 * remains in the template data; this only makes that checked option available
 * to the common instantiation pipeline.
 */
export const concept: Record<string, Solver> = {
  "concept.choice": pick((p) => String(p.correct)),
};

export const cur: Record<string, Solver> = {
  "cur.internalCurrent": {
    solve: (p) => {
      const E = num(p, "E"), r = num(p, "r"), R = num(p, "R"), I = E / (R + r);
      return { answer: { value: I }, derived: { I, Rt: R + r } };
    },
    buggy: { ignoresInternal: (p) => num(p, "E") / num(p, "R"), onlyInternal: (p) => num(p, "E") / num(p, "r") },
  },
  "cur.terminalVoltage": {
    solve: (p) => {
      const E = num(p, "E"), r = num(p, "r"), R = num(p, "R"), I = E / (R + r);
      return { answer: { value: E - I * r }, derived: { I, drop: I * r, V: E - I * r, Rt: R + r } };
    },
    buggy: {
      terminalEqualsEmf: (p) => num(p, "E"),
      dropAcrossInternal: (p) => (num(p, "E") * num(p, "r")) / (num(p, "R") + num(p, "r")),
      addedInternalDrop: (p) => num(p, "E") + (num(p, "E") * num(p, "r")) / (num(p, "R") + num(p, "r")),
    },
  },
};

const show = (xs: number[]) => (xs.length ? `{${xs.join(", ")}}` : "∅");
function sets(k: number) {
  const r = rng(k);
  const U = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  for (let g = 0; g < 400; g++) {
    const A = U.filter(() => r.next() < 0.45), B = U.filter(() => r.next() < 0.45);
    const both = A.filter((x) => B.includes(x));
    if (A.length >= 3 && A.length <= 6 && B.length >= 3 && B.length <= 6 && both.length >= 1 && both.length < Math.min(A.length, B.length)) return { A, B, U, both };
  }
  return reject();
}
const diff = (X: number[], Y: number[]) => X.filter((x) => !Y.includes(x));
export const set: Record<string, Solver> = {
  "set.operations": {
    solve: (p) => {
      const { A, B, U, both } = sets(num(p, "k"));
      const answer = p.op === "difference" ? diff(A, B) : both;
      return { answer: { elements: answer }, derived: { A, B, U, Astr: show(A), Bstr: show(B), interStr: show(both), ansStr: show(answer) } };
    },
    buggy: {
      reversed: (p) => { if (p.op !== "difference") return null; const s = sets(num(p, "k")); return diff(s.B, s.A); },
      intersectionForDifference: (p) => (p.op === "difference" ? sets(num(p, "k")).both : null),
      unionInstead: (p) => { const s = sets(num(p, "k")); return [...new Set([...s.A, ...s.B])].sort((a, b) => a - b); },
      notRemoved: (p) => (p.op === "difference" ? sets(num(p, "k")).A : null),
      differenceForIntersection: (p) => { if (p.op !== "intersection") return null; const s = sets(num(p, "k")); return diff(s.A, s.B); },
    },
  },
  "set.intervalFromInequality": {
    solve: (p) => {
      const a = num(p, "a"), b = a + num(p, "w"), pat = String(p.pattern);
      const I = (lo: number, hi: number, l: boolean, h: boolean) => ({ lo, hi, loClosed: l, hiClosed: h });
      const union =
        pat === "lt-le" ? [I(a, b, false, true)] : pat === "le-lt" ? [I(a, b, true, false)] : pat === "lt-lt" ? [I(a, b, false, false)]
        : pat === "le-le" ? [I(a, b, true, true)] : pat === "gt" ? [I(a, Infinity, false, false)] : [I(-Infinity, b, false, true)];
      const n = (x: number) => minus(String(x));
      const cond = pat === "gt" ? `x > ${n(a)}` : pat === "le-only" ? `x ≤ ${n(b)}` : `${n(a)} ${pat.startsWith("le") ? "≤" : "<"} x ${pat.endsWith("le") ? "≤" : "<"} ${n(b)}`;
      const iv = union[0]!;
      const sh = (x: number) => (x === Infinity ? "∞" : x === -Infinity ? "−∞" : n(x));
      const text = `${iv.loClosed ? "[" : "("}${sh(iv.lo)}, ${sh(iv.hi)}${iv.hiClosed ? "]" : ")"}`;
      return { answer: { union }, derived: { b, cond, text, union, loText: sh(iv.lo), hiText: sh(iv.hi), loState: iv.loClosed ? "included" : "not included", hiState: iv.hiClosed ? "included" : "not included" } };
    },
  },
  "set.unionFromInequality": {
    solve: (p) => {
      const a = num(p, "a"), b = a + num(p, "gap"), c = b + num(p, "w");
      const strictA = p.symA === "<", closedB = p.symB === "≤";
      const union = [{ lo: -Infinity, hi: a, loClosed: false, hiClosed: !strictA }, { lo: b, hi: c, loClosed: closedB, hiClosed: true }];
      const n = (x: number) => minus(String(x));
      const text = `(−∞, ${n(a)}${strictA ? ")" : "]"} ∪ ${closedB ? "[" : "("}${n(b)}, ${n(c)}]`;
      return { answer: { union }, derived: { b, c, text, union, cond: `x ${p.symA} ${n(a)} or ${n(b)} ${p.symB} x ≤ ${n(c)}` } };
    },
  },
};

/** coefficient text without a redundant 1: î, −î, 3î */
const coef = (n: number) => (Math.abs(n) === 1 ? "" : String(Math.abs(n)));
const vecStr = (x: number, y: number) => `${x < 0 ? "−" : ""}${coef(x)}î ${y < 0 ? "−" : "+"} ${coef(y)}ĵ`;
const term = (c: number, u: string, first: boolean) => `${first ? (c < 0 ? "−" : "") : c < 0 ? " − " : " + "}${Math.abs(c) === 1 ? "" : Math.abs(c)}${u}`;
export const vec: Record<string, Solver> = {
  "vec.dotProduct": {
    solve: (p) => {
      const [a1, a2, b1, b2] = ["a1", "a2", "b1", "b2"].map((k) => num(p, k)) as [number, number, number, number];
      const dot = a1 * b1 + a2 * b2;
      const deg = (x: number, y: number) => (Math.atan2(y, x) * 180) / Math.PI;
      return {
        answer: { value: dot },
        derived: { dot, aStr: vecStr(a1, a2), bStr: vecStr(b1, b2), magA: Math.hypot(a1, a2), angA: deg(a1, a2), magB: Math.hypot(b1, b2), angB: deg(b1, b2), xx: a1 * b1, yy: a2 * b2 },
      };
    },
    buggy: {
      crossMultiplied: (p) => num(p, "a1") * num(p, "b2") + num(p, "a2") * num(p, "b1"),
      ignoredAngle: (p) => Math.hypot(num(p, "a1"), num(p, "a2")) * Math.hypot(num(p, "b1"), num(p, "b2")),
      droppedJ: (p) => num(p, "a1") * num(p, "b1"),
    },
  },
  "vec.magnitude3d": {
    solve: (p) => {
      const [x, y, z] = ["p", "q", "r"].map((k) => num(p, k)) as [number, number, number];
      const ss = x * x + y * y + z * z, mag = Math.sqrt(ss);
      const exact = Number.isInteger(mag) ? String(mag) : `√${ss}`;
      return {
        answer: { value: mag },
        derived: { ss, mag, exact, base: x * x + y * y, aStr: `${term(x, "î", true)}${term(y, "ĵ", false)}${term(z, "k̂", false)}`, ax: Math.abs(x), ay: Math.abs(y), az: Math.abs(z) },
      };
    },
    buggy: {
      addedComponents: (p) => Math.abs(num(p, "p")) + Math.abs(num(p, "q")) + Math.abs(num(p, "r")),
      addedSigned: (p) => num(p, "p") + num(p, "q") + num(p, "r"),
      forgotRoot: (p) => num(p, "p") ** 2 + num(p, "q") ** 2 + num(p, "r") ** 2,
      missedK: (p) => Math.hypot(num(p, "p"), num(p, "q")),
    },
  },
};

const raw = (x: number) => String(Number(x.toPrecision(12)));
export const maths: Record<string, Solver> = {
  "lim.powerRule": {
    solve: (p) => {
      const a = num(p, "a"), b = num(p, "b");
      const f = (x: number) => a * x * x + b * x, d = (x: number) => 2 * a * x + b;
      const ys = [-4, -3, -2, -1, 0, 1, 2, 3, 4].flatMap((x) => [f(x), d(x)]);
      return { answer: { reference: `${raw(2 * a)}*x + ${raw(b)}` }, derived: { ylo: Math.floor(Math.min(...ys)) - 1, yhi: Math.ceil(Math.max(...ys)) + 1, two_a: 2 * a, d1: d(1), dref: `${raw(2 * a)}*x + ${raw(b)}` } };
    },
    buggy: {
      forgotMultiply: (p) => `${raw(num(p, "a"))}*x + ${raw(num(p, "b"))}`,
      droppedLinear: (p) => (num(p, "b") === 0 ? null : `${raw(2 * num(p, "a"))}*x`),
      keptPower: (p) => `${raw(2 * num(p, "a"))}*x^2 + ${raw(num(p, "b"))}`,
    },
  },
  "int.polyAntiderivative": {
    solve: (p) => {
      const a = num(p, "a"), b = num(p, "b"), c = num(p, "c");
      const F = (x: number) => a * x ** 3 + b * x ** 2 + c * x, f = (x: number) => 3 * a * x * x + 2 * b * x + c;
      const ys = [-3, -2, -1, 0, 1, 2, 3].flatMap((x) => [F(x), f(x)]);
      return {
        answer: { integrand: `${raw(3 * a)}*x^2 + ${raw(2 * b)}*x + ${raw(c)}`, reference: `${raw(a)}*x^3 + ${raw(b)}*x^2 + ${raw(c)}*x` },
        derived: { A3: 3 * a, B2: 2 * b, ylo: Math.floor(Math.min(...ys)) - 1, yhi: Math.ceil(Math.max(...ys)) + 1, Fref: `${raw(a)}*x^3 + ${raw(b)}*x^2 + ${raw(c)}*x` },
      };
    },
    buggy: {
      forgotDivide: (p) => `${raw(3 * num(p, "a"))}*x^3 + ${raw(2 * num(p, "b"))}*x^2 + ${raw(num(p, "c"))}*x + C`,
      differentiated: (p) => `${raw(6 * num(p, "a"))}*x + ${raw(2 * num(p, "b"))} + C`,
      constantNotIntegrated: (p) => (num(p, "c") === 0 ? null : `${raw(num(p, "a"))}*x^3 + ${raw(num(p, "b"))}*x^2 + ${raw(num(p, "c"))} + C`),
    },
  },
  "sl.lineThroughPoints": {
    solve: (p) => {
      const x1 = num(p, "x1"), y1 = num(p, "y1"), m = num(p, "m"), dx = num(p, "dx");
      const x2 = x1 + dx, y2 = y1 + m * dx, c = y1 - m * x1;
      if (Math.abs(y2) > 6 || Math.abs(c) > 6) return reject();
      return { answer: { reference: `y = ${raw(m)}*x + ${raw(c)}` }, derived: { x2, y2, c, dy: m * dx, cAbs: Math.abs(c) } };
    },
    buggy: {
      slopeInverted: (p) => {
        const m = num(p, "m");
        if (Math.abs(Math.abs(m) - 1) < 1e-9) return null;
        return `y = ${raw(1 / m)}*x + ${raw(num(p, "y1") - num(p, "x1") / m)}`;
      },
      interceptSign: (p) => {
        const c = num(p, "y1") - num(p, "m") * num(p, "x1");
        return c === 0 ? null : `y = ${raw(num(p, "m"))}*x - ${raw(c)}`;
      },
    },
  },
  "trg.exactValue": {
    solve: (p) => {
      const fn = String(p.fn), k = num(p, "k");
      const deg = [30, 45, 60, 120, 135, 150, 210, 225, 240, 300, 315, 330][k]!;
      const value = fn === "sin" ? Math.sin((deg * Math.PI) / 180) : Math.cos((deg * Math.PI) / 180);
      return { answer: { value }, derived: { ...angleTexts(deg), exactText: exactOf(value), value, refDeg: refAngle(deg) } };
    },
    buggy: {
      sinCosSwap: (p) => {
        const s = maths["trg.exactValue"]!.solve(p).derived!;
        const deg = Number(s.deg);
        const other = String(p.fn) === "sin" ? Math.cos((deg * Math.PI) / 180) : Math.sin((deg * Math.PI) / 180);
        return Math.abs(Math.abs(other) - Math.abs(Number(s.value))) < 1e-9 ? null : exactOf(other);
      },
      quadrantSign: (p) => { const v = Number(maths["trg.exactValue"]!.solve(p).derived!.value); return v < 0 ? exactOf(-v) : null; },
    },
  },
  // ---------------------------------------------------------------- Phase 3: Straight Lines pack
  "sl.perpendicularSlope": {
    solve: (p) => {
      const dx = num(p, "dx"), dy = num(p, "dy");
      if (Math.abs(dx) === Math.abs(dy)) return reject();
      const x1 = num(p, "x1"), y1 = num(p, "y1"), m1 = dy / dx, k = -dx / dy;
      return { answer: { value: k }, derived: { x2: x1 + dx, y2: y1 + dy, m1, k, c1: y1 - m1 * x1, kText: frac(-dx, dy), m1Text: frac(dy, dx) } };
    },
    buggy: {
      parallelInstead: (p) => num(p, "dy") / num(p, "dx"),
      forgotNegative: (p) => num(p, "dx") / num(p, "dy"),
      negatedNotInverted: (p) => -num(p, "dy") / num(p, "dx"),
    },
  },
  "sl.acuteAngle": {
    solve: (p) => {
      const m1 = num(p, "m1"), m2 = num(p, "m2");
      const den = 1 + m1 * m2;
      if (Math.abs(den) < 1e-9 || m1 === m2) return reject();
      const raw = (m2 - m1) / den;
      if (raw >= 0 || Math.abs(Math.abs(raw) - Math.abs((m2 - m1) / (1 - m1 * m2))) < 1e-9 || Math.abs(1 - m1 * m2) < 1e-9) return reject();
      return { answer: { value: Math.abs(raw) }, derived: { t: Math.abs(raw), raw, den, num: m2 - m1, deg: (Math.atan(Math.abs(raw)) * 180) / Math.PI, obtuse: 180 - (Math.atan(Math.abs(raw)) * 180) / Math.PI } };
    },
    buggy: {
      missingModulus: (p) => (num(p, "m2") - num(p, "m1")) / (1 + num(p, "m1") * num(p, "m2")),
      signInDenominator: (p) => Math.abs((num(p, "m2") - num(p, "m1")) / (1 - num(p, "m1") * num(p, "m2"))),
    },
  },
  "sl.parallelK": {
    solve: (p) => {
      const a = num(p, "a"), b = num(p, "b"), c = num(p, "c");
      const k = (3 * a) / b;
      if (!Number.isInteger(k * 2) || k === 0) return reject();
      return { answer: { value: k }, derived: { k, m: -a / b, mText: frac(-a, b), cy: -c / b, kText: String(k) } };
    },
    buggy: {
      slopeSign: (p) => (-3 * num(p, "a")) / num(p, "b"),
      slopeInverted: (p) => { const v = (3 * num(p, "b")) / num(p, "a"); return Math.abs(v - (3 * num(p, "a")) / num(p, "b")) < 1e-9 ? null : v; },
    },
  },
  "sl.parallelDistance": {
    solve: (p) => {
      const [a, b] = String(p.ab).split(",").map(Number) as [number, number];
      const c1 = num(p, "c1"), c2 = num(p, "c2");
      if (c1 === c2) return reject();
      const n = Math.hypot(a, b), d = Math.abs(c1 - c2) / n;
      return { answer: { value: d }, derived: { a, b, n, d, diff: Math.abs(c1 - c2), y1: -c1 / b, y2: -c2 / b, slope: -a / b } };
    },
    buggy: {
      missingDenominator: (p) => Math.abs(num(p, "c1") - num(p, "c2")),
      missingRoot: (p) => { const [a, b] = String(p.ab).split(",").map(Number) as [number, number]; return Math.abs(num(p, "c1") - num(p, "c2")) / (a * a + b * b); },
      constantSign: (p) => { const [a, b] = String(p.ab).split(",").map(Number) as [number, number]; const v = Math.abs(num(p, "c1") + num(p, "c2")) / Math.hypot(a, b); return v === 0 ? null : v; },
    },
  },
  "sl.equalIntercepts": {
    solve: (p) => {
      const px = num(p, "px"), py = num(p, "py"), s = px + py;
      if (s === 0 || px === 0 || py === 0) return reject();
      return { answer: { reference: `x + y = ${raw(s)}` }, derived: { s, sText: String(s) } };
    },
    buggy: {
      oppositeSigns: (p) => `x - y = ${raw(num(p, "px") - num(p, "py"))}`,
      pointAsIntercepts: (p) => `x/${raw(num(p, "px"))} + y/${raw(num(p, "py"))} = 1`,
    },
  },
  // ---------------------------------------------------------------- Phase 3: trigonometric-ratio foundation
  "f.adjacentSide": { solve: (p) => ({ answer: { correct: p.at === "B" ? "BC" : "AC" }, derived: { angA: num(p, "angA"), angB: 90 - num(p, "angA") } }) },
  "f.ratioValue": {
    solve: (p) => {
      const [a, b, c] = String(p.tri).split(",").map((x) => Number(x) * num(p, "k")) as [number, number, number];
      const fn = String(p.fn);
      const value = fn === "sin" ? b / c : fn === "cos" ? a / c : b / a;
      const text = fn === "sin" ? `${b}/${c}` : fn === "cos" ? `${a}/${c}` : `${b}/${a}`;
      return { answer: { value }, derived: { a, b, c, value, text, angA: (Math.atan2(b, a) * 180) / Math.PI } };
    },
    buggy: {
      swapped: (p) => { const [a, b, c] = String(p.tri).split(",").map(Number) as [number, number, number]; const fn = String(p.fn); return fn === "sin" ? a / c : fn === "cos" ? b / c : b / c; },
      inverted: (p) => { const [a, b, c] = String(p.tri).split(",").map(Number) as [number, number, number]; const fn = String(p.fn); return fn === "sin" ? c / b : fn === "cos" ? c / a : a / b; },
    },
  },
  "f.componentRatio": { solve: (p) => ({ answer: { correct: "cos" }, derived: { ang: num(p, "ang") } }) },
};

/** A fraction p/q in lowest terms, as text with a proper minus sign. */
function frac(p: number, q: number): string {
  const g = (x: number, y: number): number => (y === 0 ? x : g(y, x % y));
  const d = g(Math.abs(p), Math.abs(q)) || 1;
  let n = p / d, m = q / d;
  if (m < 0) { n = -n; m = -m; }
  return `${n < 0 ? "−" : ""}${Math.abs(n)}${m === 1 ? "" : `/${m}`}`;
}

function exactOf(v: number): string {
  const s = v < 0 ? "-" : "";
  const a = Math.abs(v);
  if (Math.abs(a - 0.5) < 1e-9) return `${s}1/2`;
  if (Math.abs(a - Math.SQRT2 / 2) < 1e-9) return `${s}sqrt(2)/2`;
  if (Math.abs(a - Math.sqrt(3) / 2) < 1e-9) return `${s}sqrt(3)/2`;
  return String(v);
}
function refAngle(deg: number) { const d = deg % 180; return d > 90 ? 180 - d : d; }
function angleTexts(deg: number) {
  const frac: Record<number, string> = { 30: "π/6", 45: "π/4", 60: "π/3", 120: "2π/3", 135: "3π/4", 150: "5π/6", 210: "7π/6", 225: "5π/4", 240: "4π/3", 300: "5π/3", 315: "7π/4", 330: "11π/6" };
  return { deg, thetaText: frac[deg]!, thetaRad: (deg * Math.PI) / 180, quadrant: deg < 90 ? "first" : deg < 180 ? "second" : deg < 270 ? "third" : "fourth" };
}
