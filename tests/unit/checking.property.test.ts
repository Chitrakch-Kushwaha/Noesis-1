import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { check, normaliseUnion } from "@/src/checking/check";
import { compile } from "@/src/checking/expr/evaluate";
import { compareAst } from "@/src/checking/expr/equivalence";
import { parseExpression, print, type Node } from "@/src/checking/expr/parse";
import type { CheckSpec, Interval } from "@/src/checking/types";
import { fromSI, parseUnit, toSI } from "@/src/checking/units";

// Random expressions that are defined everywhere (polynomials, sin, cos, exp of bounded args)
const smallInt = fc.integer({ min: -9, max: 9 });
const node: fc.Arbitrary<Node> = fc.letrec<{ n: Node }>((tie) => ({
  n: fc.oneof(
    { depthSize: "small", withCrossShrink: true },
    smallInt.map((v): Node => (v < 0 ? { k: "neg", a: { k: "num", v: -v, text: String(-v) } } : { k: "num", v, text: String(v) })),
    fc.constant<Node>({ k: "var", name: "x" }),
    fc.record({ k: fc.constantFrom("add" as const, "sub" as const, "mul" as const), a: tie("n"), b: tie("n") }),
    fc.record({ k: fc.constant("pow" as const), a: tie("n"), b: fc.integer({ min: 0, max: 3 }).map((v): Node => ({ k: "num", v, text: String(v) })) }),
    fc.record({ k: fc.constant("fn" as const), name: fc.constantFrom("sin" as const, "cos" as const), a: tie("n") }),
    fc.record({ k: fc.constant("neg" as const), a: tie("n") }),
  ),
})).n;

/** Expressions that stay within ±1e6 on [-2, 2]: the checker deliberately skips values beyond 1e8
 *  (they would make the tolerance meaningless), so unbounded ones are indeterminate by design. */
const bounded = node.filter((n) => {
  const f = compile(n);
  for (let i = 0; i <= 20; i++) { const v = f({ x: -2 + i / 5 }); if (!Number.isFinite(v) || Math.abs(v) > 1e6) return false; }
  return true;
});

const env = (x: number) => ({ x });
const close = (a: number, b: number) => (Number.isNaN(a) && Number.isNaN(b)) || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

describe("property: parsing", () => {
  it("print → parse round-trips (same value everywhere, and printing is stable)", () => {
    fc.assert(fc.property(node, fc.double({ min: -3, max: 3, noNaN: true }), (ast, x) => {
      const printed = print(ast);
      const back = parseExpression(printed, { variables: ["x"] }).ast;
      expect(print(back)).toBe(printed);
      expect(close(compile(back)(env(x)), compile(ast)(env(x)))).toBe(true);
    }), { numRuns: 400 });
  });
  it("random text never crashes the checker and never yields a malformed result", () => {
    const spec: CheckSpec = { kind: "expression", reference: "x^2", variables: ["x"], domain: { x: [-3, 3] } };
    const kinds: CheckSpec[] = [spec, { kind: "quantity", value: 1, dimension: "force", tolerance: { relative: 0.01 } }, { kind: "interval", union: [] }, { kind: "set", elements: [1] }, { kind: "equation", reference: "x + y = 1", variables: ["x", "y"], box: { x: [-2, 2], y: [-2, 2] } }];
    fc.assert(fc.property(fc.string({ maxLength: 80 }), fc.constantFrom(...kinds), (s, k) => {
      const r = check(k, s);
      expect(["correct", "incorrect", "invalid", "indeterminate"]).toContain(r.status);
    }), { numRuns: 600 });
  });
});

describe("property: equivalence", () => {
  const opts = { domain: { x: [-2, 2] as [number, number] } };
  it("is reflexive and symmetric for everywhere-defined, bounded expressions", () => {
    fc.assert(fc.property(bounded, bounded, (a, b) => {
      expect(compareAst(a, a, opts).verdict).toBe("equivalent");
      const ab = compareAst(a, b, opts).verdict, ba = compareAst(b, a, opts).verdict;
      expect(ab).toBe(ba);
    }), { numRuns: 300 });
  });
  it("rejects x vs x·(1+ε) for ε above the tolerance", () => {
    fc.assert(fc.property(fc.double({ min: 1e-4, max: 0.5, noNaN: true }), (eps) => {
      const s: CheckSpec = { kind: "expression", reference: "x", variables: ["x"], domain: { x: [1, 5] } };
      expect(check(s, `x*(1 + ${eps.toFixed(12)})`).status).toBe("incorrect");
    }), { numRuns: 200 });
  });
  it("accepts algebraically equal rewrites", () => {
    fc.assert(fc.property(fc.integer({ min: -9, max: 9 }), fc.integer({ min: -9, max: 9 }), (a, b) => {
      const s: CheckSpec = { kind: "expression", reference: `(x + ${a})*(x + ${b})`, variables: ["x"], domain: { x: [-5, 5] } };
      expect(check(s, `x^2 + ${a + b}x + ${a * b}`.replace(/\+ -/g, "- ")).status).toBe("correct");
    }), { numRuns: 200 });
  });
});

describe("property: units", () => {
  const units = ["m", "km", "cm", "mm", "km/h", "m/s", "N", "kN", "J", "kWh", "eV", "mA", "µF", "kΩ", "°C", "K", "min", "h", "kg m/s^2"];
  it("toSI and fromSI are inverse for every unit", () => {
    fc.assert(fc.property(fc.constantFrom(...units), fc.double({ min: -1e6, max: 1e6, noNaN: true }), fc.constantFrom("absolute" as const, "difference" as const), (u, v, kind) => {
      const unit = parseUnit(u)!;
      expect(close(fromSI(toSI(v, unit, kind), unit, kind), v)).toBe(true);
    }), { numRuns: 400 });
  });
  it("a correct value written in any same-dimension unit is accepted", () => {
    fc.assert(fc.property(fc.double({ min: 0.01, max: 1e4, noNaN: true }), fc.constantFrom("m", "km", "cm", "mm"), (v, u) => {
      const unit = parseUnit(u)!;
      const shown = fromSI(v, unit);
      expect(check({ kind: "quantity", value: v, dimension: "length", tolerance: { relative: 0.001 } }, `${shown.toPrecision(10)} ${u}`).status).toBe("correct");
    }), { numRuns: 300 });
  });
});

describe("property: intervals and sets", () => {
  const iv = fc.tuple(fc.integer({ min: -10, max: 10 }), fc.integer({ min: 1, max: 6 }), fc.boolean(), fc.boolean())
    .map(([lo, w, a, b]): Interval => ({ lo, hi: lo + w, loClosed: a, hiClosed: b }));
  it("normalisation is idempotent and independent of order", () => {
    fc.assert(fc.property(fc.array(iv, { maxLength: 5 }), (u) => {
      const n = normaliseUnion(u);
      expect(normaliseUnion(n)).toEqual(n);
      expect(normaliseUnion([...u].reverse())).toEqual(n);
      for (let i = 1; i < n.length; i++) expect(n[i]!.lo).toBeGreaterThanOrEqual(n[i - 1]!.hi);
    }), { numRuns: 400 });
  });
  it("set answers ignore order and repetition", () => {
    fc.assert(fc.property(fc.uniqueArray(fc.integer({ min: -20, max: 20 }), { minLength: 1, maxLength: 6 }), fc.integer({ min: 0, max: 1000 }), (xs, seed) => {
      const shuffled = [...xs, xs[0]!].sort((a, b) => ((a * 7919 + seed) % 13) - ((b * 7919 + seed) % 13));
      expect(check({ kind: "set", elements: xs }, `{${shuffled.join(", ")}}`).status).toBe("correct");
    }), { numRuns: 300 });
  });
});
