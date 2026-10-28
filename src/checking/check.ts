// The checking engine (docs/05 §3). Pure and synchronous; run it through the worker client in the browser.
import { compile } from "./expr/evaluate";
import { compareCompiled, EQ, FORM_MESSAGES, failedForm, samplePoints } from "./expr/equivalence";
import { functionsOf, hasDecimalLiteral, LIMITS, ParseError, parseExpression, variablesOf, type Node } from "./expr/parse";
import type { CheckInput, CheckResult, CheckSpec, DiagramForce, Interval, SetElement } from "./types";
import { dimsOf, parseQuantity, sameDims, toSI, type UnitValue } from "./units";

const invalid = (reason: Extract<CheckResult, { status: "invalid" }>["reason"], message: string): CheckResult => ({ status: "invalid", reason, message });
const indeterminate = (reason: string, message: string): CheckResult => ({ status: "indeterminate", reason, message });
const REWRITE = "We couldn't check this answer safely. Please write it another way, for example with more brackets. This doesn't use up a try.";
const TOO_LONG = invalid("too-long", "That answer is too long.");

const uniq = (xs: string[]) => [...new Set(xs)];
const closeRel = (a: number, b: number, rel: number, abs: number) => Math.abs(a - b) <= Math.max(abs, rel * Math.max(Math.abs(a), Math.abs(b)));

function asText(input: CheckInput): string | null {
  return typeof input === "string" ? input : null;
}

function parseOrInvalid(text: string, variables: readonly string[], allowInfinity = false): { ast: Node } | CheckResult {
  if (!text.trim()) return invalid("empty", "Type an answer first.");
  if (text.length > LIMITS.maxLength) return TOO_LONG;
  try {
    const { ast, ambiguous } = parseExpression(text, { variables, allowInfinity });
    if (ambiguous) return indeterminate("ambiguous", "Add brackets so the meaning is clear, for example 1/(2x) or (1/2)x. This doesn't use up a try.");
    return { ast };
  } catch (e) {
    if (e instanceof ParseError) {
      if (e.kind === "limit") return invalid("too-long", e.message);
      if (e.kind === "unknown-symbol") return invalid("unknown-symbol", e.message);
      return invalid("unparseable", e.message);
    }
    return indeterminate("parser-error", REWRITE);
  }
}

function checkAllowedFunctions(ast: Node, allowed?: string[]): CheckResult | null {
  if (!allowed) return null;
  const bad = [...functionsOf(ast)].filter((f) => !allowed.includes(f));
  return bad.length ? invalid("not-allowed", `This question can be answered without ${bad.join(", ")}. Try another form.`) : null;
}

// ---------- choice ----------
function checkSingle(spec: Extract<CheckSpec, { kind: "single-choice" }>, input: CheckInput): CheckResult {
  const id = asText(input);
  if (!id) return invalid("empty", "Choose an option first.");
  if (!spec.options.some((o) => o.id === id)) return invalid("unparseable", "Choose one of the options.");
  if (id === spec.correct) return { status: "correct" };
  return { status: "incorrect", tags: spec.options.find((o) => o.id === id)?.tags ?? [], details: { chosen: id } };
}
function checkMulti(spec: Extract<CheckSpec, { kind: "multi-choice" }>, input: CheckInput): CheckResult {
  if (!Array.isArray(input) || !input.length) return invalid("empty", "Choose at least one option.");
  const chosen = uniq(input as string[]);
  if (chosen.some((id) => !spec.options.some((o) => o.id === id))) return invalid("unparseable", "Choose from the options shown.");
  const want = new Set(spec.correct);
  const wrong = chosen.filter((id) => !want.has(id));
  const missed = spec.correct.filter((id) => !chosen.includes(id));
  if (!wrong.length && !missed.length) return { status: "correct" };
  const tags = uniq(wrong.flatMap((id) => spec.options.find((o) => o.id === id)?.tags ?? []));
  if (missed.length) tags.push("missed-correct-option");
  return { status: "incorrect", tags, details: { wrong, missed } };
}

// ---------- quantity ----------
const SIBLING_FACTORS = [3.6, 1 / 3.6, 1000, 1e-3, 100, 1e-2, 60, 1 / 60, 3600, 1 / 3600, 1e6, 1e-6];
function checkQuantity(spec: Extract<CheckSpec, { kind: "quantity" }>, input: CheckInput): CheckResult {
  const text = asText(input);
  if (!text?.trim()) return invalid("empty", "Type an answer first.");
  if (text.length > 120) return TOO_LONG;
  const q = parseQuantity(text);
  if (q === "unparseable") return invalid("unparseable", "Write a number followed by a unit, for example 12.5 m.");
  if (q === "unknown-unit") return invalid("unknown-unit", "That unit isn't recognised. Try an SI unit such as m, s, N, A or V.");
  const want = dimsOf(spec.dimension);
  const dimensionless = want.every((x) => x === 0);
  if (!q.unit) {
    if (spec.requireUnit === false || dimensionless) {
      const v = q.number;
      return compareQuantity(spec, v, null, q.number);
    }
    return invalid("missing-unit", "Add a unit to your answer. This doesn't use up a try.");
  }
  if (!sameDims(q.unit.dims, want)) return { status: "incorrect", tags: ["dimension-mismatch"], details: { studentDims: q.unit.dims } };
  return compareQuantity(spec, toSI(q.number, q.unit, spec.temperature), q.unit, q.number);
}
function compareQuantity(spec: Extract<CheckSpec, { kind: "quantity" }>, valueSI: number, unit: UnitValue | null, raw: number): CheckResult {
  const rel = spec.tolerance.relative ?? 0.01;
  const abs = spec.tolerance.absolute ?? 0;
  if (closeRel(valueSI, spec.value, rel, abs)) return { status: "correct" };
  const tags: string[] = [];
  for (const b of spec.buggy ?? []) if (closeRel(valueSI, b.value, rel, abs)) tags.push(...b.tags);
  // right number, wrong unit (e.g. 20 km/h for 20 m/s), or off by a common conversion factor
  if (unit && !tags.length) {
    if (closeRel(raw, spec.value, rel, abs) || SIBLING_FACTORS.some((f) => closeRel(valueSI, spec.value * f, rel, abs))) tags.push("unit-conversion-error");
  }
  if (Math.sign(valueSI) === -Math.sign(spec.value) && closeRel(-valueSI, spec.value, rel, abs)) tags.push("sign-error");
  return { status: "incorrect", tags: uniq(tags), details: { valueSI } };
}

// ---------- numbers ----------
function checkNumber(spec: Extract<CheckSpec, { kind: "number" }>, input: CheckInput): CheckResult {
  const text = asText(input);
  if (!text?.trim()) return invalid("empty", "Type an answer first.");
  const p = parseOrInvalid(text, []);
  if ("status" in p) return p;
  const f = checkAllowedFunctions(p.ast, spec.allowedFunctions);
  if (f) return f;
  if (spec.exact && hasDecimalLiteral(p.ast)) return invalid("not-exact", "Give an exact value, for example √3/2 or 1/3, not a decimal. This doesn't use up a try.");
  const v = compile(p.ast)({});
  if (!Number.isFinite(v)) return indeterminate("undefined", "That value is undefined. Check your answer and write it another way.");
  const rel = spec.tolerance?.relative ?? (spec.exact ? 1e-9 : 1e-9);
  const abs = spec.tolerance?.absolute ?? 1e-9;
  if (closeRel(v, spec.value, rel, abs)) return { status: "correct" };
  const tags = uniq((spec.buggy ?? []).filter((b) => closeRel(v, b.value, rel, abs)).flatMap((b) => b.tags));
  if (!tags.length && closeRel(-v, spec.value, rel, abs)) tags.push("sign-error");
  return { status: "incorrect", tags, details: { value: v } };
}

// ---------- expressions ----------
function checkExpression(spec: Extract<CheckSpec, { kind: "expression" }>, input: CheckInput): CheckResult {
  const text = asText(input) ?? "";
  if (/=/.test(text)) return invalid("wrong-form", "Write only the expression, without an = sign.");
  const p = parseOrInvalid(text, spec.variables);
  if ("status" in p) return p;
  const fa = checkAllowedFunctions(p.ast, spec.allowedFunctions);
  if (fa) return fa;
  const ref = parseExpression(spec.reference, { variables: spec.variables }).ast;
  const opts = { domain: spec.domain, specialPoints: spec.specialPoints, domainMustMatch: spec.domainMustMatch, logBase: spec.logBase };
  const sc = compile(p.ast, opts);
  const cmp = compareCompiled(sc, compile(ref, opts), opts);
  if (cmp.verdict === "indeterminate") return indeterminate("sampling", REWRITE);
  if (cmp.verdict === "equivalent") {
    const form = failedForm(p.ast, spec.forms ?? [], ref);
    return form ? invalid("wrong-form", `${FORM_MESSAGES[form]} Your answer has the right value. This doesn't use up a try.`) : { status: "correct" };
  }
  const tags: string[] = [];
  for (const b of spec.buggy ?? []) {
    const bAst = parseExpression(b.expression, { variables: spec.variables }).ast;
    if (compareCompiled(sc, compile(bAst, opts), opts).verdict === "equivalent") tags.push(...b.tags);
  }
  return { status: "incorrect", tags: uniq(tags) };
}

// ---------- antiderivatives ----------
function checkAntiderivative(spec: Extract<CheckSpec, { kind: "antiderivative" }>, input: CheckInput): CheckResult {
  const text = (asText(input) ?? "").replace(/^\s*∫.*?=\s*/, "");
  const constants = spec.constants ?? ["C"];
  const p = parseOrInvalid(text, [spec.variable, ...constants]);
  if ("status" in p) return p;
  const used = variablesOf(p.ast);
  const usedConstant = constants.find((c) => used.has(c));
  if (!usedConstant && spec.requireConstant) return invalid("wrong-form", "Add the constant of integration, + C. This doesn't use up a try.");
  const opts = { logBase: spec.logBase };
  const F = compile(p.ast, opts);
  const at = (c: number) => (env: Record<string, number>) => F({ ...env, ...(usedConstant ? { [usedConstant]: c } : {}) });
  // the constant must enter additively: F(x; C=1) − F(x; C=0) ≡ 1·k, independent of x
  if (usedConstant) {
    const diffs = samplePoints(spec.domain, 12, 99).map((pt) => at(1)(pt) - at(0)(pt)).filter(Number.isFinite);
    if (diffs.length < 6 || diffs.some((d) => Math.abs(d - diffs[0]!) > 1e-9 * Math.max(1, Math.abs(diffs[0]!))) || Math.abs(diffs[0]!) < 1e-12)
      return invalid("wrong-form", "Add the constant of integration as a separate term, + C. This doesn't use up a try.");
  }
  const F0 = at(0);
  const verdict = antiderivativeVerdict(F0, spec);
  if (verdict === "indeterminate") return indeterminate("sampling", REWRITE);
  if (verdict === "equivalent") return usedConstant ? { status: "correct" } : { status: "correct", notes: ["Remember to add the constant of integration, + C."] };
  const tags: string[] = [];
  for (const b of spec.buggy ?? []) {
    const bF = compile(parseExpression(b.expression, { variables: [spec.variable, ...constants] }).ast, opts);
    const bAt = (env: Record<string, number>) => bF({ ...env, C: 0 });
    if (differenceIsConstant(F0, bAt, spec.domain) === "equivalent") tags.push(...b.tags);
  }
  return { status: "incorrect", tags: uniq(tags) };
}
function differenceIsConstant(F: (e: Record<string, number>) => number, G: (e: Record<string, number>) => number, domain: Record<string, [number, number]>): "equivalent" | "different" | "indeterminate" {
  const d: number[] = [];
  let scale = 1;
  let mismatch = false;
  for (const pt of samplePoints(domain, EQ.samples, EQ.seed)) {
    const g = G(pt);
    if (!Number.isFinite(g) || Math.abs(g) > EQ.hugeValue) continue;
    const f = F(pt);
    if (!Number.isFinite(f)) { mismatch = true; continue; }
    d.push(f - g);
    scale = Math.max(scale, Math.abs(f), Math.abs(g));
  }
  if (mismatch) return "different";
  if (d.length < EQ.minValid) return "indeterminate";
  const spread = Math.max(...d) - Math.min(...d);
  if (spread <= 1e-7 * scale) return "equivalent";
  if (spread > 1e-4 * scale) return "different";
  return "indeterminate";
}
function antiderivativeVerdict(F: (e: Record<string, number>) => number, spec: Extract<CheckSpec, { kind: "antiderivative" }>) {
  if (spec.reference) {
    const G = compile(parseExpression(spec.reference, { variables: [spec.variable] }).ast, { logBase: spec.logBase });
    return differenceIsConstant(F, G, spec.domain);
  }
  // fallback: numerical derivative of the student's answer against the integrand
  const f = compile(parseExpression(spec.integrand, { variables: [spec.variable] }).ast, { logBase: spec.logBase });
  const x = spec.variable;
  const dF = (env: Record<string, number>) => {
    const v = env[x]!, h = 1e-5 * Math.max(1, Math.abs(v));
    return (F({ ...env, [x]: v + h }) - F({ ...env, [x]: v - h })) / (2 * h);
  };
  let valid = 0, maxDiff = 0;
  for (const pt of samplePoints(spec.domain, EQ.samples, EQ.seed)) {
    const r = f(pt);
    if (!Number.isFinite(r) || Math.abs(r) > EQ.hugeValue) continue;
    const s = dF(pt);
    if (!Number.isFinite(s)) return "different";
    valid++;
    maxDiff = Math.max(maxDiff, Math.abs(r - s) / Math.max(1, Math.abs(r)));
  }
  if (valid < EQ.minValid) return "indeterminate";
  return maxDiff < 1e-5 ? "equivalent" : maxDiff > 1e-3 ? "different" : "indeterminate";
}

// ---------- equations (lines, planes, conics) ----------
function parseEquation(text: string, variables: string[]): { lhs: Node; rhs: Node } | CheckResult {
  const parts = text.split("=");
  if (parts.length !== 2) return invalid("wrong-form", parts.length < 2 ? "Write an equation with an = sign." : "Use only one = sign.");
  const l = parseOrInvalid(parts[0]!, variables);
  if ("status" in l) return l;
  const r = parseOrInvalid(parts[1]!, variables);
  if ("status" in r) return r;
  return { lhs: l.ast, rhs: r.ast };
}
function checkEquation(spec: Extract<CheckSpec, { kind: "equation" }>, input: CheckInput): CheckResult {
  const text = asText(input) ?? "";
  if (!text.trim()) return invalid("empty", "Type an equation first.");
  const st = parseEquation(text, spec.variables);
  if ("status" in st) return st;
  const ref = parseEquation(spec.reference, spec.variables) as { lhs: Node; rhs: Node };
  const G = (e: { lhs: Node; rhs: Node }) => { const a = compile(e.lhs), b = compile(e.rhs); return (env: Record<string, number>) => a(env) - b(env); };
  const gs = G(st), gr = G(ref);
  const verdict = (g: (e: Record<string, number>) => number, gref: (e: Record<string, number>) => number = gr) => {
    const ratios: number[] = [];
    let allZero = true;
    for (const pt of samplePoints(spec.box, EQ.samples, EQ.seed)) {
      const r = gref(pt), s = g(pt);
      if (!Number.isFinite(s)) return "different";
      if (Math.abs(s) > 1e-12) allZero = false;
      if (!Number.isFinite(r) || Math.abs(r) < 1e-9) continue;
      ratios.push(s / r);
    }
    if (allZero) return "trivial";
    if (ratios.length < EQ.minValid) return "indeterminate";
    const k = ratios[0]!;
    if (Math.abs(k) < 1e-12) return "different";
    const spread = Math.max(...ratios.map((x) => Math.abs(x - k) / Math.abs(k)));
    return spread < 1e-7 ? "equivalent" : spread > 1e-4 ? "different" : "indeterminate";
  };
  const v = verdict(gs);
  if (v === "trivial") return invalid("wrong-form", "That equation is true for every point. Write the equation of the specific line or curve.");
  if (v === "indeterminate") return indeterminate("sampling", REWRITE);
  if (v === "equivalent") return { status: "correct" };
  const tags: string[] = [];
  for (const b of spec.buggy ?? []) {
    const bt = parseEquation(b.equation, spec.variables);
    if (!("status" in bt) && verdict(gs, G(bt)) === "equivalent") tags.push(...b.tags);
  }
  return { status: "incorrect", tags: uniq(tags) };
}

// ---------- intervals and unions ----------
const TOL = 1e-9;
export function parseUnion(text: string): Interval[] | CheckResult {
  const s = text.trim().replace(/−/g, "-").replace(/∞/g, "inf");
  if (!s) return invalid("empty", "Type an interval, for example (2, 7].");
  if (s.length > 200) return TOO_LONG;
  if (/^(∅|\{\s*\}|phi|empty)$/i.test(s)) return [];
  if (/^(ℝ|R|\(-inf,\s*\+?inf\))$/.test(s)) return [{ lo: -Infinity, hi: Infinity, loClosed: false, hiClosed: false }];
  const pieces = s.split(/\s*(?:∪|\bU\b|\bu\b|\bor\b)\s*/);
  const out: Interval[] = [];
  for (const piece of pieces) {
    const single = /^\{\s*([^,{}]+)\s*\}$/.exec(piece);
    if (single) {
      const v = endpoint(single[1]!);
      if (v === null || !Number.isFinite(v)) return invalid("unparseable", "Write a single point as {3}.");
      out.push({ lo: v, hi: v, loClosed: true, hiClosed: true });
      continue;
    }
    const m = /^([\[(])\s*([^,]+?)\s*,\s*([^,]+?)\s*([\])])$/.exec(piece);
    if (!m) return invalid("unparseable", "Use interval notation: a bracket, two endpoints separated by a comma, and a bracket, for example [−1, 4). Join pieces with ∪ or U.");
    const lo = endpoint(m[2]!), hi = endpoint(m[3]!);
    if (lo === null || hi === null) return invalid("unparseable", "An endpoint couldn't be read. Use numbers, √, π or ∞.");
    if (!(lo < hi)) return invalid("unparseable", "The left endpoint must be smaller than the right endpoint.");
    out.push({ lo, hi, loClosed: m[1] === "[", hiClosed: m[4] === "]" });
  }
  return out;
}
function endpoint(t: string): number | null {
  const s = t.trim().replace(/^\+/, "");
  if (/^(inf|infinity)$/i.test(s)) return Infinity;
  if (/^-(inf|infinity)$/i.test(s)) return -Infinity;
  try {
    const { ast, ambiguous } = parseExpression(s);
    if (ambiguous) return null;
    const v = compile(ast)({});
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
}
/** Sort, then merge overlapping pieces and pieces that touch at an included endpoint. */
export function normaliseUnion(u: Interval[]): Interval[] {
  const xs = u.filter((i) => i.lo < i.hi || (i.lo === i.hi && i.loClosed && i.hiClosed)).map((i) => ({ ...i })).sort((a, b) => a.lo - b.lo || Number(b.loClosed) - Number(a.loClosed));
  const out: Interval[] = [];
  for (const i of xs) {
    const last = out[out.length - 1];
    if (last && (i.lo < last.hi - TOL || (Math.abs(i.lo - last.hi) <= TOL && (last.hiClosed || i.loClosed)))) {
      if (i.hi > last.hi + TOL) { last.hi = i.hi; last.hiClosed = i.hiClosed; }
      else if (Math.abs(i.hi - last.hi) <= TOL) last.hiClosed = last.hiClosed || i.hiClosed;
      if (Math.abs(i.lo - last.lo) <= TOL) last.loClosed = last.loClosed || i.loClosed;
    } else out.push(i);
  }
  return out;
}
const eqEnd = (a: number, b: number) => (a === b) || Math.abs(a - b) <= TOL * Math.max(1, Math.abs(a));
export function checkUnionValue(student: Interval[], target: Interval[]): CheckResult {
  if (student.some((i) => (i.lo === -Infinity && i.loClosed) || (i.hi === Infinity && i.hiClosed)))
    return { status: "incorrect", tags: ["infinity-closed"], details: { endpointMismatches: [] } };
  const s = normaliseUnion(student), t = normaliseUnion(target);
  if (s.length === t.length && s.every((p, i) => eqEnd(p.lo, t[i]!.lo) && eqEnd(p.hi, t[i]!.hi))) {
    const mism: { piece: number; end: "lo" | "hi" }[] = [];
    s.forEach((p, i) => {
      if (Number.isFinite(p.lo) && p.loClosed !== t[i]!.loClosed) mism.push({ piece: i, end: "lo" });
      if (Number.isFinite(p.hi) && p.hiClosed !== t[i]!.hiClosed) mism.push({ piece: i, end: "hi" });
    });
    if (!mism.length) return { status: "correct" };
    return { status: "incorrect", tags: ["open-closed-confusion"], details: { endpointMismatches: mism } };
  }
  const tags = s.length < t.length ? ["missing-piece"] : s.length > t.length ? ["extra-piece"] : ["wrong-endpoints"];
  return { status: "incorrect", tags, details: { endpointMismatches: [] } };
}
function checkInterval(spec: Extract<CheckSpec, { kind: "interval" }>, input: CheckInput): CheckResult {
  const text = asText(input);
  if (text === null) return invalid("empty", "Type an interval first.");
  const u = parseUnion(text);
  if (!Array.isArray(u)) return u;
  return checkUnionValue(u, spec.union);
}

// ---------- sets ----------
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const c of s) {
    if (c === "(" || c === "[") depth++;
    if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) { out.push(cur); cur = ""; } else cur += c;
  }
  if (cur.trim()) out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}
export function parseSet(text: string): SetElement[] | CheckResult {
  const s = text.trim().replace(/−/g, "-");
  if (!s) return invalid("empty", "Type a set, for example {1, 3, 5}, or ∅ for the empty set.");
  if (s.length > 300) return TOO_LONG;
  if (/^(∅|\{\s*\}|phi|empty)$/i.test(s)) return [];
  const inner = s.replace(/^\{/, "").replace(/\}$/, "");
  if (/[:|]/.test(inner) || /[{}]/.test(inner)) return invalid("wrong-form", "List the elements one by one, for example {1, 3, 5}. Set-builder form can't be checked here.");
  const parts = inner.includes(",") ? splitTop(inner) : inner.split(/\s+/).filter(Boolean);
  const out: SetElement[] = [];
  for (const part of parts) {
    const pair = /^\(\s*([^,]+)\s*,\s*([^,]+)\s*\)$/.exec(part);
    if (pair) {
      const a = endpoint(pair[1]!), b = endpoint(pair[2]!);
      if (a === null || b === null || !Number.isFinite(a) || !Number.isFinite(b)) return invalid("unparseable", `“${part}” couldn't be read.`);
      out.push([a, b]);
      continue;
    }
    if (/^[A-Za-z]+$/.test(part) && !/^(pi|e)$/i.test(part)) { out.push(part); continue; }
    const v = endpoint(part);
    if (v === null || !Number.isFinite(v)) return invalid("unparseable", `“${part}” couldn't be read as an element.`);
    out.push(v);
  }
  return out;
}
const elemEq = (a: SetElement, b: SetElement) =>
  typeof a === "number" && typeof b === "number" ? eqEnd(a, b)
  : Array.isArray(a) && Array.isArray(b) ? eqEnd(a[0], b[0]) && eqEnd(a[1], b[1])
  : a === b;
const dedupe = (xs: SetElement[]) => xs.filter((x, i) => xs.findIndex((y) => elemEq(x, y)) === i);
export const setsEqual = (a: SetElement[], b: SetElement[]) => {
  const A = dedupe(a), B = dedupe(b);
  return A.length === B.length && A.every((x) => B.some((y) => elemEq(x, y)));
};
function checkSet(spec: Extract<CheckSpec, { kind: "set" }>, input: CheckInput): CheckResult {
  const text = asText(input);
  if (text === null) return invalid("empty", "Type a set first.");
  const got = parseSet(text);
  if (!Array.isArray(got)) return got;
  if (setsEqual(got, spec.elements)) return { status: "correct" };
  const tags = uniq((spec.buggy ?? []).filter((b) => setsEqual(got, b.elements)).flatMap((b) => b.tags));
  const missing = dedupe(spec.elements).filter((x) => !got.some((y) => elemEq(x, y)));
  const extra = dedupe(got).filter((x) => !spec.elements.some((y) => elemEq(x, y)));
  return { status: "incorrect", tags, details: { missing, extra, elements: got } };
}

// ---------- ordering ----------
function checkOrdering(spec: Extract<CheckSpec, { kind: "ordering" }>, input: CheckInput): CheckResult {
  if (!Array.isArray(input) || input.length !== spec.items.length || new Set(input as string[]).size !== input.length || input.some((x) => !spec.items.includes(x as string)))
    return invalid("incomplete", "Put every item in order before checking.");
  const order = input as string[];
  const group = (id: string) => spec.ties?.findIndex((g) => g.includes(id)) ?? -1;
  const rank = new Map<string, number>();
  let r = 0;
  spec.correct.forEach((id, i) => {
    const g = group(id);
    if (i > 0 && g >= 0 && g === group(spec.correct[i - 1]!)) rank.set(id, r);
    else rank.set(id, ++r);
  });
  const ok = order.every((id, i) => i === 0 || rank.get(order[i - 1]!)! <= rank.get(id)!);
  if (ok) return { status: "correct" };
  const tags = uniq((spec.buggy ?? []).filter((b) => b.order.join() === order.join()).flatMap((b) => b.tags));
  if (!tags.length && order.join() === [...spec.correct].reverse().join()) tags.push("reversed-order");
  const misplaced = order.filter((id, i) => rank.get(id) !== rank.get(spec.correct[i]!));
  return { status: "incorrect", tags, details: { misplaced } };
}

// ---------- drag-and-drop mapping ----------
function checkMapping(spec: Extract<CheckSpec, { kind: "mapping" }>, input: CheckInput): CheckResult {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return invalid("incomplete", "Place every item before checking.");
  const m = input as Record<string, string>;
  if (spec.items.some((i) => !m[i])) return invalid("incomplete", "Place every item before checking.");
  if (Object.values(m).some((t) => !spec.targets.includes(t))) return invalid("unparseable", "Place items only on the targets shown.");
  const wrong = spec.items.filter((i) => !(spec.accepted[i] ?? []).includes(m[i]!));
  if (!wrong.length) return { status: "correct" };
  const tags = uniq(wrong.flatMap((i) => (spec.rules ?? []).filter((r) => r.item === i && r.target === m[i]).flatMap((r) => r.tags)));
  return { status: "incorrect", tags, details: { wrong } };
}

// ---------- free-body diagrams ----------
const angleDiff = (a: number, b: number) => { const d = (((a - b) % 360) + 540) % 360 - 180; return Math.abs(d); };
export function checkDiagramValue(spec: Extract<CheckSpec, { kind: "diagram" }>["rules"], forces: DiagramForce[]): CheckResult {
  if (!forces.length) return invalid("incomplete", "Add at least one force to the diagram before checking.");
  const tags: string[] = [];
  const problems: { kind: string; issue: string }[] = [];
  const used = new Set<number>();
  for (const req of spec.required) {
    const idx = forces.findIndex((f, i) => !used.has(i) && f.kind === req.kind && (!req.agent || f.agent === req.agent));
    if (idx < 0) { tags.push(...req.missingTags); problems.push({ kind: req.kind, issue: "missing" }); continue; }
    used.add(idx);
    const f = forces[idx]!;
    if (req.angleDeg !== undefined && angleDiff(f.angleDeg, req.angleDeg) > (req.angleTol ?? 8)) {
      tags.push(...(req.wrongDirectionTags ?? ["force-direction"]));
      problems.push({ kind: req.kind, issue: "direction" });
    }
    if (req.magnitude !== undefined && Math.abs(f.magnitude - req.magnitude) > (req.magnitudeTol ?? 0.08) * Math.max(1e-9, req.magnitude)) {
      tags.push(...(req.wrongMagnitudeTags ?? ["force-magnitude"]));
      problems.push({ kind: req.kind, issue: "magnitude" });
    }
  }
  forces.forEach((f, i) => {
    if (used.has(i)) return;
    if (f.agent === "none") { tags.push(...(spec.noAgentTags ?? ["force-without-agent"])); problems.push({ kind: f.kind, issue: "no-agent" }); return; }
    const forb = spec.forbidden?.find((x) => x.kind === f.kind);
    if (forb) { tags.push(...forb.tags); problems.push({ kind: f.kind, issue: "forbidden" }); return; }
    if (spec.required.some((r) => r.kind === f.kind)) { tags.push(...(spec.duplicateTags ?? ["double-counted-force"])); problems.push({ kind: f.kind, issue: "duplicate" }); return; }
    tags.push("extra-force"); problems.push({ kind: f.kind, issue: "extra" });
  });
  return problems.length ? { status: "incorrect", tags: uniq(tags), details: { problems } } : { status: "correct" };
}

// ---------- dispatch ----------
export function check(spec: CheckSpec, input: CheckInput): CheckResult {
  try {
    switch (spec.kind) {
      case "single-choice": return checkSingle(spec, input);
      case "multi-choice": return checkMulti(spec, input);
      case "quantity": return checkQuantity(spec, input);
      case "number": return checkNumber(spec, input);
      case "expression": return checkExpression(spec, input);
      case "antiderivative": return checkAntiderivative(spec, input);
      case "equation": return checkEquation(spec, input);
      case "interval": return checkInterval(spec, input);
      case "set": return checkSet(spec, input);
      case "ordering": return checkOrdering(spec, input);
      case "mapping": return checkMapping(spec, input);
      case "diagram": return Array.isArray(input) ? checkDiagramValue(spec.rules, input as DiagramForce[]) : invalid("incomplete", "Add forces to the diagram first.");
    }
  } catch {
    // never guess: an internal failure is never counted as wrong
    return indeterminate("internal", REWRITE);
  }
}
