import { describe, expect, it } from "vitest";
import { check, normaliseUnion, parseUnion } from "@/src/checking/check";
import { CheckClient, TIMEOUT_RESULT, type WorkerLike } from "@/src/checking/client";
import { compile } from "@/src/checking/expr/evaluate";
import { LIMITS, parseExpression, print } from "@/src/checking/expr/parse";
import type { CheckSpec } from "@/src/checking/types";
import { parseQuantity, parseUnit, NAMED_DIMENSIONS, sameDims } from "@/src/checking/units";

const expr = (reference: string, domain: Record<string, [number, number]> = { x: [-5, 5] }, extra: Partial<Extract<CheckSpec, { kind: "expression" }>> = {}): CheckSpec =>
  ({ kind: "expression", reference, variables: Object.keys(domain), domain, ...extra });
const st = (spec: CheckSpec, input: Parameters<typeof check>[1]) => check(spec, input).status;

describe("expression parser", () => {
  it.each([
    ["2x+1", { x: 2 }, 5], ["2(x+1)", { x: 2 }, 6], ["x^2", { x: 3 }, 9], ["-x^2", { x: 3 }, -9], ["2^3^2", {}, 512],
    ["sin x cos x", { x: 0.3 }, Math.sin(0.3) * Math.cos(0.3)], ["sin 2x", { x: 0.3 }, Math.sin(0.6)], ["sin^2(x)", { x: 0.4 }, Math.sin(0.4) ** 2],
    ["sin^-1(0.5)", {}, Math.PI / 6], ["√(x)", { x: 9 }, 3], ["3√2", {}, 3 * Math.SQRT2], ["|x - 4|", { x: 1 }, 3], ["2|x|", { x: -2 }, 4],
    ["x²", { x: 5 }, 25], ["x⁻¹", { x: 4 }, 0.25], ["π", {}, Math.PI], ["e^x", { x: 1 }, Math.E], ["2e3", {}, 2000], ["ln(e)", {}, 1],
    ["log x", { x: Math.E }, 1], ["xsinx", { x: 1 }, Math.sin(1)], ["(x+1)(x-1)", { x: 3 }, 8], ["2·3×4÷6", {}, 4], ["cosec x", { x: 1 }, 1 / Math.sin(1)],
  ])("%s", (src, env, value) => {
    const { ast } = parseExpression(src, { variables: Object.keys(env).length ? Object.keys(env) : ["x"] });
    expect(compile(ast)(env as Record<string, number>)).toBeCloseTo(value, 9);
  });
  it("flags a/bc as ambiguous", () => {
    expect(parseExpression("1/2x", { variables: ["x"] }).ambiguous).toBe(true);
    expect(parseExpression("1/(2x)", { variables: ["x"] }).ambiguous).toBe(false);
  });
  it.each(["alert(1)", "constructor", "x.y", "2++", "((x)", "x)", "sin", "__proto__", "require('fs')", "1;2", "`x`", "x=>x"])("rejects %s", (s) =>
    expect(() => parseExpression(s, { variables: ["x"] })).toThrow());
  it("enforces input limits", () => {
    expect(() => parseExpression("x+".repeat(260) + "x", { variables: ["x"] })).toThrow(/too long/);
    expect(() => parseExpression("(".repeat(50) + "x" + ")".repeat(50), { variables: ["x"] })).toThrow(/nested|too long/);
    expect(() => parseExpression("1".repeat(40))).toThrow(/too long/);
    expect(check(expr("x"), "x+".repeat(300) + "x")).toMatchObject({ status: "invalid", reason: "too-long" });
  });
  it("evaluates outside the real domain as NaN, never complex", () => {
    for (const s of ["sqrt(-1)", "ln(0)", "asin(2)", "(-8)^(1/3)", "1/0", "0^(-1)"]) expect(compile(parseExpression(s).ast)({})).toBeNaN();
    expect(compile(parseExpression("cbrt(-8)").ast)({})).toBeCloseTo(-2);
  });
  it("supports base-10 log when a template asks for it", () => {
    expect(compile(parseExpression("log(100)").ast, { logBase: "10" })({})).toBeCloseTo(2);
  });
});

describe("choice, ordering, mapping", () => {
  const single: CheckSpec = { kind: "single-choice", correct: "b", options: [{ id: "a", tags: ["t-a"] }, { id: "b" }, { id: "c" }] };
  it("single choice", () => {
    expect(check(single, "b").status).toBe("correct");
    expect(check(single, "a")).toMatchObject({ status: "incorrect", tags: ["t-a"] });
    expect(check(single, "").status).toBe("invalid");
    expect(check(single, "zzz").status).toBe("invalid");
  });
  const multi: CheckSpec = { kind: "multi-choice", correct: ["a", "c"], options: [{ id: "a" }, { id: "b", tags: ["same-body-pair"] }, { id: "c" }] };
  it("multiple choice", () => {
    expect(check(multi, ["c", "a"]).status).toBe("correct");
    expect(check(multi, ["a", "b", "c"])).toMatchObject({ status: "incorrect", tags: ["same-body-pair"] });
    expect(check(multi, ["a"])).toMatchObject({ status: "incorrect", tags: ["missed-correct-option"] });
    expect(check(multi, []).status).toBe("invalid");
  });
  const ord: CheckSpec = { kind: "ordering", items: ["p", "q", "r", "s"], correct: ["p", "q", "r", "s"], ties: [["q", "r"]], buggy: [{ order: ["s", "p", "q", "r"], tags: ["heavier-faster"] }] };
  it("ordering with ties and misconceptions", () => {
    expect(st(ord, ["p", "q", "r", "s"])).toBe("correct");
    expect(st(ord, ["p", "r", "q", "s"])).toBe("correct");
    expect(check(ord, ["s", "r", "q", "p"])).toMatchObject({ status: "incorrect", tags: ["reversed-order"] });
    expect(check(ord, ["s", "p", "q", "r"])).toMatchObject({ status: "incorrect", tags: ["heavier-faster"] });
    expect(st(ord, ["p", "q", "r"])).toBe("invalid");
    expect(st(ord, ["p", "p", "q", "r"])).toBe("invalid");
  });
  const map: CheckSpec = { kind: "mapping", items: ["W", "N"], targets: ["earth", "table", "hand"], accepted: { W: ["earth"], N: ["table"] }, rules: [{ item: "N", target: "earth", tags: ["normal-from-earth"] }] };
  it("drag-and-drop mapping", () => {
    expect(st(map, { W: "earth", N: "table" })).toBe("correct");
    expect(check(map, { W: "earth", N: "earth" })).toMatchObject({ status: "incorrect", tags: ["normal-from-earth"], details: { wrong: ["N"] } });
    expect(st(map, { W: "earth" })).toBe("invalid");
    expect(st(map, { W: "earth", N: "moon" })).toBe("invalid");
  });
});

describe("quantities, units and dimensions", () => {
  const spec = (value: number, dimension: keyof typeof NAMED_DIMENSIONS, extra = {}): CheckSpec => ({ kind: "quantity", value, dimension, tolerance: { relative: 0.01 }, ...extra });
  it("parses compound and prefixed units", () => {
    for (const [u, dim] of [["kg m/s^2", "force"], ["kg·m·s⁻²", "force"], ["N m", "torque"], ["N.m", "energy"], ["m s-1", "velocity"], ["m/s/s", "acceleration"], ["kΩ", "resistance"], ["µF", "capacitance"], ["μF", "capacitance"], ["mA", "current"], ["kWh", "energy"], ["eV", "energy"], ["kg/(m s^2)", "pressure"], ["Nm", "energy"], ["ms", "time"]] as const)
      expect(sameDims(parseUnit(u)!.dims, NAMED_DIMENSIONS[dim]), u).toBe(true);
    expect(parseUnit("kWh")!.factor).toBeCloseTo(3.6e6);
    expect(parseUnit("ms")!.factor).toBeCloseTo(1e-3);
    expect(parseUnit("furlongs")).toBeNull();
  });
  it("converts to SI before comparing", () => {
    expect(st(spec(20, "velocity"), "72 km/h")).toBe("correct");
    expect(st(spec(1200, "length"), "1.2 km")).toBe("correct");
    expect(st(spec(0.25, "current"), "250 mA")).toBe("correct");
    expect(st(spec(9.8, "acceleration"), "9.8 m s^-2")).toBe("correct");
    expect(st(spec(1.5e-3, "capacitance"), "1500 µF")).toBe("correct");
  });
  it("never spends a try on a missing or unknown unit", () => {
    expect(check(spec(5, "length"), "5")).toMatchObject({ status: "invalid", reason: "missing-unit" });
    expect(check(spec(5, "length"), "5 furlongs")).toMatchObject({ status: "invalid", reason: "unknown-unit" });
    expect(check(spec(5, "length"), "five metres")).toMatchObject({ status: "invalid", reason: "unparseable" });
  });
  it("tags a wrong dimension", () => {
    expect(check(spec(5, "force"), "5 kg")).toMatchObject({ status: "incorrect", tags: ["dimension-mismatch"] });
  });
  it("trap: km/h vs m/s (unit conversion error)", () => {
    expect(check(spec(20, "velocity"), "20 km/h")).toMatchObject({ status: "incorrect", tags: ["unit-conversion-error"] });
    expect(check(spec(20, "velocity"), "72 m/s")).toMatchObject({ status: "incorrect", tags: ["unit-conversion-error"] });
  });
  it("trap: °C differences vs K", () => {
    expect(st(spec(10, "temperature", { temperature: "difference" }), "10 °C")).toBe("correct");
    expect(st(spec(10, "temperature", { temperature: "difference" }), "10 K")).toBe("correct");
    expect(st(spec(300, "temperature", { temperature: "absolute" }), "26.85 °C")).toBe("correct");
    expect(st(spec(300, "temperature", { temperature: "absolute" }), "300 °C")).toBe("incorrect");
  });
  it("uses an absolute tolerance near zero and detects sign errors", () => {
    expect(st({ kind: "quantity", value: 0, dimension: "force", tolerance: { absolute: 0.01 } }, "0.005 N")).toBe("correct");
    expect(check(spec(-3, "velocity"), "3 m/s")).toMatchObject({ status: "incorrect", tags: ["sign-error"] });
  });
  it("matches wrong-method values to misconception tags", () => {
    expect(check(spec(72, "length", { buggy: [{ value: 114, tags: ["area-uses-final-velocity"] }] }), "114 m")).toMatchObject({ tags: ["area-uses-final-velocity"] });
  });
  it("splits number and unit", () => {
    expect(parseQuantity("3sqrt2 m")).toMatchObject({ number: 3 * Math.SQRT2 });
    expect(parseQuantity("1.5e3 m")).toMatchObject({ number: 1500 });
    expect(parseQuantity("2pi rad")).toMatchObject({ number: 2 * Math.PI });
    expect(parseQuantity("5eV")).toMatchObject({ number: 5, unitText: "eV" });
  });
});

describe("numbers and exact values", () => {
  it("exact answers reject decimals without spending a try", () => {
    const s: CheckSpec = { kind: "number", value: Math.sqrt(3) / 2, exact: true };
    expect(st(s, "√3/2")).toBe("correct");
    expect(st(s, "sqrt(3)/2")).toBe("correct");
    expect(st(s, "3^(1/2)/2")).toBe("correct");
    expect(check(s, "0.866")).toMatchObject({ status: "invalid", reason: "not-exact" });
    expect(st(s, "1/2")).toBe("incorrect");
  });
  it("trap: 1e-12 vs 0", () => {
    expect(check({ kind: "number", value: 0, exact: true }, "1e-12")).toMatchObject({ status: "invalid", reason: "not-exact" });
    expect(st({ kind: "number", value: 0, tolerance: { absolute: 1e-9 } }, "1e-12")).toBe("correct");
    expect(st({ kind: "number", value: 0, tolerance: { absolute: 1e-15 } }, "1e-12")).toBe("incorrect");
  });
  it("undefined values are indeterminate, never wrong", () => {
    expect(st({ kind: "number", value: 1 }, "1/0")).toBe("indeterminate");
  });
});

describe("expressions and the documented traps", () => {
  it("accepts equivalent forms", () => {
    expect(st(expr("(x+1)^2"), "x^2 + 2x + 1")).toBe("correct");
    expect(st(expr("sin(2x)"), "2 sin x cos x")).toBe("correct");
    expect(st(expr("1", { x: [-5, 5] }), "sin^2 x + cos^2 x")).toBe("correct");
    expect(st(expr("3x^2"), "3x^2 + 1")).toBe("incorrect");
  });
  it("trap: √(x²) vs x depends on the declared domain", () => {
    expect(st(expr("x", { x: [-5, 5] }), "sqrt(x^2)")).toBe("incorrect");
    expect(st(expr("x", { x: [0.1, 5] }), "sqrt(x^2)")).toBe("correct");
    expect(st(expr("abs(x)", { x: [-5, 5] }), "√(x²)")).toBe("correct");
  });
  it("trap: log(x²) vs 2 log x", () => {
    expect(st(expr("log(x^2)", { x: [0.1, 5] }), "2 log x")).toBe("correct");
    expect(st(expr("log(x^2)", { x: [-5, 5] }), "2 log x")).toBe("incorrect");
    expect(st(expr("2 log(abs(x))", { x: [-5, 5] }), "log(x^2)")).toBe("correct");
  });
  it("trap: removable discontinuity (x²−1)/(x−1) vs x+1", () => {
    expect(st(expr("(x^2-1)/(x-1)"), "x + 1")).toBe("correct");
    expect(st(expr("(x^2-1)/(x-1)", { x: [-5, 5] }, { domainMustMatch: true, specialPoints: [{ x: 1 }] }), "x + 1")).toBe("incorrect");
    expect(st(expr("x + 1", { x: [-5, 5] }, { domainMustMatch: true, specialPoints: [{ x: 1 }] }), "(x^2-1)/(x-1)")).toBe("incorrect");
  });
  it("trap: trigonometric singularities", () => {
    expect(st(expr("tan(x)", { x: [-1.5707, 1.5707] }), "sin(x)/cos(x)")).toBe("correct");
    expect(st(expr("tan(x)", { x: [-4.7, 4.7] }), "sin x / cos x")).toBe("correct");
    expect(st(expr("tan(x)", { x: [-1.5, 1.5] }), "cot x")).toBe("incorrect");
  });
  it("trap: |x|/x vs sgn x", () => {
    expect(st(expr("abs(x)/x"), "sgn(x)")).toBe("correct");
  });
  it("is indeterminate when the domain leaves too few valid points", () => {
    expect(check(expr("sqrt(x)", { x: [-5, -1] }), "sqrt(x)")).toMatchObject({ status: "indeterminate" });
  });
  it("asks to rewrite ambiguous a/bc input", () => {
    expect(check(expr("1/(2x)"), "1/2x")).toMatchObject({ status: "indeterminate", reason: "ambiguous" });
  });
  it("rejects undeclared symbols and disallowed functions without spending a try", () => {
    expect(check(expr("2x"), "2y")).toMatchObject({ status: "invalid", reason: "unknown-symbol" });
    expect(check(expr("x^2", undefined, { allowedFunctions: [] }), "exp(2 ln x)")).toMatchObject({ status: "invalid", reason: "not-allowed" });
  });
  it("enforces required forms only after the value is right", () => {
    const f = expr("x^2 - 1", undefined, { forms: ["factorised"] });
    expect(st(f, "(x-1)(x+1)")).toBe("correct");
    expect(check(f, "x^2 - 1")).toMatchObject({ status: "invalid", reason: "wrong-form" });
    expect(st(f, "(x-1)(x+2)")).toBe("incorrect");
    expect(check(expr("1/x", { x: [0.5, 5] }, { forms: ["no-negative-exponents"] }), "x^-1")).toMatchObject({ reason: "wrong-form" });
    expect(check(expr("sqrt(2)/2", { x: [0, 1] }, { forms: ["rationalised-denominator"] }), "1/sqrt(2)")).toMatchObject({ reason: "wrong-form" });
  });
  it("tags known wrong expressions", () => {
    const d = expr("2x cos(x^2)", undefined, { buggy: [{ expression: "cos(x^2)", tags: ["forgot-chain-rule"] }] });
    expect(check(d, "cos(x^2)")).toMatchObject({ status: "incorrect", tags: ["forgot-chain-rule"] });
  });
});

describe("antiderivatives", () => {
  const s: CheckSpec = { kind: "antiderivative", integrand: "3x^2 + 2", reference: "x^3 + 2x", variable: "x", domain: { x: [-3, 3] }, buggy: [{ expression: "6x", tags: ["differentiated-instead"] }, { expression: "3x^3 + 2x", tags: ["forgot-to-divide"] }] };
  it("accepts any constant and notes a missing + C", () => {
    expect(check(s, "x^3 + 2x + C")).toEqual({ status: "correct" });
    expect(check(s, "x^3 + 2x + 7 + C")).toEqual({ status: "correct" });
    expect(check(s, "x^3 + 2x")).toMatchObject({ status: "correct", notes: [expect.stringContaining("+ C")] });
    expect(check({ ...s, requireConstant: true }, "x^3 + 2x")).toMatchObject({ status: "invalid", reason: "wrong-form" });
  });
  it("rejects a constant that is not additive", () => {
    expect(check(s, "C x^3 + 2x")).toMatchObject({ status: "invalid", reason: "wrong-form" });
  });
  it("tags wrong methods", () => {
    expect(check(s, "6x + C")).toMatchObject({ status: "incorrect", tags: ["differentiated-instead"] });
    expect(check(s, "3x^3 + 2x + C")).toMatchObject({ status: "incorrect", tags: ["forgot-to-divide"] });
  });
  it("works from the integrand alone (numerical derivative)", () => {
    const n: CheckSpec = { kind: "antiderivative", integrand: "cos(x)", variable: "x", domain: { x: [-3, 3] } };
    expect(st(n, "sin x + C")).toBe("correct");
    expect(st(n, "-sin x + C")).toBe("incorrect");
  });
});

describe("equations", () => {
  const line: CheckSpec = { kind: "equation", reference: "x + 2y = 3", variables: ["x", "y"], box: { x: [-5, 5], y: [-5, 5] }, buggy: [{ equation: "y = 2x + 3", tags: ["swapped-slope"] }] };
  it("trap: equivalent line equations up to a constant multiple", () => {
    expect(st(line, "2x + 4y - 6 = 0")).toBe("correct");
    expect(st(line, "y = -x/2 + 3/2")).toBe("correct");
    expect(st(line, "3 - x = 2y")).toBe("correct");
    expect(st(line, "x + 2y = 4")).toBe("incorrect");
    expect(check(line, "y = 2x + 3")).toMatchObject({ status: "incorrect", tags: ["swapped-slope"] });
  });
  it("trap: equivalent plane equations", () => {
    const plane: CheckSpec = { kind: "equation", reference: "x + y + z = 1", variables: ["x", "y", "z"], box: { x: [-3, 3], y: [-3, 3], z: [-3, 3] } };
    expect(st(plane, "2x + 2y + 2z - 2 = 0")).toBe("correct");
    expect(st(plane, "x + y - z = 1")).toBe("incorrect");
  });
  it("rejects trivial and malformed equations without spending a try", () => {
    expect(check(line, "x = x")).toMatchObject({ status: "invalid", reason: "wrong-form" });
    expect(check(line, "x + 2y")).toMatchObject({ status: "invalid", reason: "wrong-form" });
    expect(check(line, "x = 1 = 2")).toMatchObject({ status: "invalid" });
  });
});

describe("intervals and unions", () => {
  const I = (lo: number, hi: number, l: boolean, h: boolean) => ({ lo, hi, loClosed: l, hiClosed: h });
  it("trap: touching pieces merge only through an included endpoint", () => {
    expect(st({ kind: "interval", union: [I(1, 3, true, true)] }, "[1,2) ∪ [2,3]")).toBe("correct");
    expect(st({ kind: "interval", union: [I(1, 3, false, false)] }, "(1,2) U (2,3)")).toBe("incorrect");
    expect(normaliseUnion([I(3, 5, false, false), I(-1, 2, true, false), I(1, 4, false, true)])).toEqual([I(-1, 5, true, false)]);
  });
  it("trap: open versus closed endpoints, with details for the number line", () => {
    const r = check({ kind: "interval", union: [I(-1, 4, false, true)] }, "[-1, 4]");
    expect(r).toMatchObject({ status: "incorrect", tags: ["open-closed-confusion"], details: { endpointMismatches: [{ piece: 0, end: "lo" }] } });
  });
  it("infinity can never be closed", () => {
    expect(check({ kind: "interval", union: [I(3, Infinity, true, false)] }, "[3, ∞]")).toMatchObject({ tags: ["infinity-closed"] });
    expect(st({ kind: "interval", union: [I(3, Infinity, true, false)] }, "[3, inf)")).toBe("correct");
  });
  it("accepts exact endpoints and unions in any order", () => {
    expect(st({ kind: "interval", union: [I(-Math.SQRT2, Math.SQRT2, true, true)] }, "[-√2, √2]")).toBe("correct");
    expect(st({ kind: "interval", union: [I(-Infinity, 0, false, false), I(2, 5, true, false)] }, "[2,5) ∪ (-∞, 0)")).toBe("correct");
    expect(check({ kind: "interval", union: [I(0, 1, true, true), I(2, 3, true, true)] }, "[0,1]")).toMatchObject({ tags: ["missing-piece"] });
  });
  it("rejects malformed intervals without spending a try", () => {
    for (const s of ["1 to 4", "(4, 1)", "[a, b]", ""]) expect(check({ kind: "interval", union: [] }, s).status).toBe("invalid");
    expect(parseUnion("∅")).toEqual([]);
  });
});

describe("sets", () => {
  const s: CheckSpec = { kind: "set", elements: [1, 2], buggy: [{ elements: [3], tags: ["x"] }] };
  it("trap: duplicates and order do not matter", () => {
    expect(st(s, "{1, 2, 2}")).toBe("correct");
    expect(st(s, "{2, 1}")).toBe("correct");
    expect(st(s, "2 1")).toBe("correct");
  });
  it("handles ordered pairs, symbols and the empty set", () => {
    expect(st({ kind: "set", elements: [[1, 2], [2, 1]] }, "{(2, 1), (1, 2)}")).toBe("correct");
    expect(st({ kind: "set", elements: [[1, 2]] }, "{(2, 1)}")).toBe("incorrect");
    expect(st({ kind: "set", elements: ["a", "b"] }, "{b, a}")).toBe("correct");
    expect(st({ kind: "set", elements: [] }, "∅")).toBe("correct");
    expect(check(s, "{3}")).toMatchObject({ status: "incorrect", tags: ["x"], details: { missing: [1, 2], extra: [3] } });
  });
  it("set-builder notation is a form error, not a wrong answer", () => {
    expect(check(s, "{x : x < 3}")).toMatchObject({ status: "invalid", reason: "wrong-form" });
  });
});

describe("free-body diagrams", () => {
  const rules: CheckSpec = {
    kind: "diagram",
    rules: {
      required: [
        { kind: "weight", agent: "Earth", angleDeg: -90, magnitude: 19.6, missingTags: ["missing-weight"] },
        { kind: "normal", agent: "floor", angleDeg: 90, missingTags: ["missing-normal"], wrongDirectionTags: ["normal-direction"] },
      ],
      forbidden: [{ kind: "applied", tags: ["extra-force-of-motion"] }],
      noAgentTags: ["extra-force-of-motion"],
    },
  };
  const W = { kind: "weight", agent: "Earth", magnitude: 19.6, angleDeg: -90 };
  const N = { kind: "normal", agent: "floor", magnitude: 19.6, angleDeg: 90 };
  it("accepts a complete diagram within angle and magnitude tolerance", () => {
    expect(st(rules, [W, { ...N, angleDeg: 93 }])).toBe("correct");
  });
  it("tags missing, misdirected, agentless and forbidden forces", () => {
    expect(check(rules, [W])).toMatchObject({ status: "incorrect", tags: ["missing-normal"] });
    expect(check(rules, [W, { ...N, angleDeg: 0 }])).toMatchObject({ tags: ["normal-direction"] });
    expect(check(rules, [W, N, { kind: "applied", agent: "hand", magnitude: 5, angleDeg: 0 }])).toMatchObject({ tags: ["extra-force-of-motion"] });
    expect(check(rules, [W, N, { kind: "motion", agent: "none", magnitude: 5, angleDeg: 0 }])).toMatchObject({ tags: ["extra-force-of-motion"] });
    expect(check(rules, [W, N, W])).toMatchObject({ tags: ["double-counted-force"] });
    expect(st(rules, [])).toBe("invalid");
  });
});

describe("checking worker client", () => {
  const fake = (behaviour: "respond" | "hang" | "crash") => {
    const created: (WorkerLike & { terminated: boolean })[] = [];
    const factory = () => {
      const w: WorkerLike & { terminated: boolean } = {
        terminated: false, onmessage: null, onerror: null,
        postMessage(m: unknown) {
          const { id } = m as { id: number };
          if (behaviour === "respond") setTimeout(() => w.onmessage?.({ data: { id, result: { status: "correct" } } }), 1);
          if (behaviour === "crash") setTimeout(() => w.onerror?.(new Error("boom")), 1);
        },
        terminate() { w.terminated = true; },
      };
      setTimeout(() => w.onmessage?.({ data: { ready: true } }), 1);
      created.push(w);
      return w;
    };
    return { factory, created };
  };
  const spec: CheckSpec = { kind: "number", value: 1 };
  it("returns the worker's result", async () => {
    const f = fake("respond");
    expect(await new CheckClient(f.factory, 50).check(spec, "1")).toEqual({ status: "correct" });
  });
  it("times out as indeterminate, terminates the worker and starts a fresh one", async () => {
    const f = fake("hang");
    const c = new CheckClient(f.factory, 30);
    expect(await c.check(spec, "1")).toEqual(TIMEOUT_RESULT);
    expect(f.created[0]!.terminated).toBe(true);
    expect(c.restarts).toBe(1);
    await c.check(spec, "1");
    expect(f.created).toHaveLength(2);
  });
  it("a crashing worker never produces an incorrect result", async () => {
    const f = fake("crash");
    expect((await new CheckClient(f.factory, 50).check(spec, "1")).status).toBe("indeterminate");
  });
  it("falls back to inline checking without Worker support", async () => {
    expect(await new CheckClient(null).check(spec, "1")).toEqual({ status: "correct" });
  });
});

describe("limits", () => {
  it("documents parser limits", () => expect(LIMITS).toMatchObject({ maxLength: 500, maxDepth: 40, maxNodes: 400 }));
  it("prints canonically", () => expect(print(parseExpression("2(x+1)^2 - -3", { variables: ["x"] }).ast)).toBe("2*(x + 1)^2 - -3"));
});
