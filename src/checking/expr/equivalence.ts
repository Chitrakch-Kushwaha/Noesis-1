// Equivalence by seeded multi-point sampling inside a declared domain (docs/05 §3).
import { compile, sampler, type Compiled, type Env } from "./evaluate";
import { countNodes, type Node } from "./parse";
import type { DomainSpec, Form } from "../types";

export const EQ = {
  samples: 24, // attempts
  minValid: 10, // fewer valid points → indeterminate
  correctTol: 1e-8, // max scaled difference for "equivalent"
  wrongTol: 1e-5, // above this the expressions differ; between the two → indeterminate (near-degenerate)
  hugeValue: 1e8, // reference values beyond this are treated as singular and skipped
  seed: 0x5eed,
};

export type Verdict = "equivalent" | "different" | "indeterminate";

export interface CompareOptions {
  domain: DomainSpec;
  specialPoints?: Record<string, number>[];
  domainMustMatch?: boolean;
  seed?: number;
}

const finite = (v: number) => Number.isFinite(v) && Math.abs(v) <= EQ.hugeValue;

export function samplePoints(domain: DomainSpec, n: number, seed: number): Env[] {
  const rnd = sampler(seed);
  const vars = Object.keys(domain);
  const pts: Env[] = [];
  for (let i = 0; i < n; i++) {
    const p: Record<string, number> = {};
    for (const v of vars) {
      const [lo, hi] = domain[v]!;
      p[v] = lo + (hi - lo) * (0.02 + 0.96 * rnd());
    }
    pts.push(p);
  }
  return pts;
}

/**
 * Compare a student expression with the reference.
 * Points where the reference is undefined or singular are skipped; a point where the reference is defined
 * but the student's expression is not counts as a difference (e.g. 2·log x vs log(x²) at negative x).
 */
export function compareCompiled(student: Compiled, reference: Compiled, opts: CompareOptions): { verdict: Verdict; valid: number; maxDiff: number } {
  let valid = 0, maxDiff = 0, mismatch = false;
  for (const p of samplePoints(opts.domain, EQ.samples, opts.seed ?? EQ.seed)) {
    const r = reference(p);
    if (!finite(r)) continue;
    const s = student(p);
    if (!Number.isFinite(s)) { mismatch = true; continue; }
    valid++;
    maxDiff = Math.max(maxDiff, Math.abs(r - s) / Math.max(1, Math.abs(r), Math.abs(s)));
  }
  if (opts.domainMustMatch) {
    for (const p of opts.specialPoints ?? []) {
      const r = reference(p), s = student(p);
      const rd = Number.isFinite(r), sd = Number.isFinite(s);
      if (rd !== sd) mismatch = true;
      else if (rd && Math.abs(r - s) / Math.max(1, Math.abs(r)) > EQ.correctTol) mismatch = true;
    }
  }
  if (mismatch || maxDiff > EQ.wrongTol) return { verdict: "different", valid, maxDiff };
  if (valid < EQ.minValid) return { verdict: "indeterminate", valid, maxDiff };
  if (maxDiff <= EQ.correctTol) return { verdict: "equivalent", valid, maxDiff };
  return { verdict: "indeterminate", valid, maxDiff };
}

export function compareAst(student: Node, reference: Node, opts: CompareOptions & { logBase?: "e" | "10" }) {
  return compareCompiled(compile(student, opts), compile(reference, opts), opts);
}

// ---------- required forms (AST inspection) ----------
const isConstant = (n: Node): boolean =>
  n.k === "num" || n.k === "const" || ((n.k === "neg" || n.k === "fn") && isConstant(n.a)) ||
  ((n.k === "add" || n.k === "sub" || n.k === "mul" || n.k === "div" || n.k === "pow") && isConstant(n.a) && isConstant(n.b));

function factorised(n: Node): boolean {
  if (n.k === "neg") return factorised(n.a);
  if (n.k === "mul") return true;
  if (n.k === "pow") return !isConstant(n.a);
  return n.k === "var" || n.k === "fn";
}
function hasNegativeExponent(n: Node): boolean {
  if (n.k === "pow") {
    const e = n.b;
    if ((e.k === "neg" && !(e.a.k === "num" && e.a.v === 0)) || (e.k === "num" && e.v < 0)) return true;
    return hasNegativeExponent(n.a) || hasNegativeExponent(n.b);
  }
  if (n.k === "neg" || n.k === "fn") return hasNegativeExponent(n.a);
  if (n.k === "num" || n.k === "const" || n.k === "var") return false;
  return hasNegativeExponent(n.a) || hasNegativeExponent(n.b);
}
function radicalIn(n: Node): boolean {
  if (n.k === "fn") return n.name === "sqrt" || n.name === "cbrt" || radicalIn(n.a);
  if (n.k === "pow") return (n.b.k === "div" || (n.b.k === "num" && !Number.isInteger(n.b.v))) || radicalIn(n.a);
  if (n.k === "neg") return radicalIn(n.a);
  if (n.k === "num" || n.k === "const" || n.k === "var") return false;
  return radicalIn(n.a) || radicalIn(n.b);
}
function radicalInDenominator(n: Node): boolean {
  if (n.k === "div") return radicalIn(n.b) || radicalInDenominator(n.a);
  if (n.k === "pow" && hasNegativeExponent(n) && radicalIn(n.a)) return true;
  if (n.k === "neg" || n.k === "fn") return radicalInDenominator(n.a);
  if (n.k === "num" || n.k === "const" || n.k === "var") return false;
  return radicalInDenominator(n.a) || radicalInDenominator(n.b);
}
function trivialPatterns(n: Node): boolean {
  if ((n.k === "mul") && ((n.a.k === "num" && n.a.v === 1) || (n.b.k === "num" && n.b.v === 1))) return true;
  if ((n.k === "add" || n.k === "sub") && n.b.k === "num" && n.b.v === 0) return true;
  if (n.k === "add" && n.a.k === "num" && n.a.v === 0) return true;
  if (n.k === "pow" && n.b.k === "num" && n.b.v === 1) return true;
  if (n.k === "neg" && n.a.k === "neg") return true;
  if (n.k === "div" && n.b.k === "num" && n.b.v === 1) return true;
  if (n.k === "num" || n.k === "const" || n.k === "var") return false;
  if (n.k === "neg" || n.k === "fn") return trivialPatterns(n.a);
  return trivialPatterns(n.a) || trivialPatterns(n.b);
}

export const FORM_MESSAGES: Record<Form, string> = {
  factorised: "Write your answer in factorised form, as a product of factors.",
  simplified: "Simplify your answer further.",
  "no-negative-exponents": "Rewrite your answer without negative exponents.",
  "rationalised-denominator": "Rationalise the denominator, so no root is left in it.",
};

/** Returns the first form requirement the expression fails, or null. */
export function failedForm(n: Node, forms: readonly Form[], reference: Node): Form | null {
  for (const f of forms) {
    if (f === "factorised" && !factorised(n)) return f;
    if (f === "no-negative-exponents" && hasNegativeExponent(n)) return f;
    if (f === "rationalised-denominator" && radicalInDenominator(n)) return f;
    if (f === "simplified" && (trivialPatterns(n) || countNodes(n) > countNodes(reference) + 4)) return f;
  }
  return null;
}
