// {{ expression | format }} substitution. Expressions are evaluated by the safe parser over numeric
// parameters and derived values; string values are inserted by name. No eval.
import { compile } from "@/src/checking/expr/evaluate";
import { parseExpression } from "@/src/checking/expr/parse";

export type Ctx = Record<string, unknown>;
const PH = /\{\{\s*([^{}|]+?)\s*(?:\|\s*([a-z0-9]+)\s*)?\}\}/g;
const WHOLE = /^\{\{\s*([^{}|]+?)\s*(?:\|\s*([a-z0-9]+)\s*)?\}\}$/;

export class PlaceholderError extends Error {}

function numericVars(ctx: Ctx): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(ctx)) if (typeof v === "number") out[k] = v;
  return out;
}

export function evaluate(expr: string, ctx: Ctx): unknown {
  const name = expr.trim();
  if (Object.prototype.hasOwnProperty.call(ctx, name)) return ctx[name];
  const vars = numericVars(ctx);
  try {
    const { ast } = parseExpression(name, { variables: Object.keys(vars) });
    const v = compile(ast)(vars);
    if (!Number.isFinite(v)) throw new PlaceholderError(`{{${name}}} is not a finite number`);
    return v;
  } catch (e) {
    if (e instanceof PlaceholderError) throw e;
    throw new PlaceholderError(`Unknown placeholder {{${name}}}`);
  }
}

const sig = (x: number, n: number) => {
  const v = Number(x.toPrecision(n));
  return Object.is(v, -0) ? 0 : v;
};
export function formatValue(v: unknown, fmt?: string): string {
  if (typeof v !== "number") {
    if (typeof v === "string") return v;
    throw new PlaceholderError(`Cannot format ${JSON.stringify(v)} as text`);
  }
  const minus = (s: string) => s.replace(/^-/, "−");
  if (!fmt) return minus(String(sig(v, 3)));
  if (fmt === "raw") return String(Number(v.toPrecision(15)));
  if (fmt === "int") return minus(String(Math.round(v)));
  if (fmt === "abs") return String(sig(Math.abs(v), 3));
  if (fmt === "signed") return v < 0 ? `− ${sig(-v, 3)}` : `+ ${sig(v, 3)}`;
  const fixed = /^fixed(\d)$/.exec(fmt);
  if (fixed) return minus(v.toFixed(Number(fixed[1])));
  if (/^\d$/.test(fmt)) return minus(String(sig(v, Number(fmt))));
  throw new PlaceholderError(`Unknown format |${fmt}`);
}

export function fillText(s: string, ctx: Ctx): string {
  return s.replace(PH, (_, expr: string, fmt?: string) => formatValue(evaluate(expr, ctx), fmt));
}

/** Keys whose values are always student-facing text (never raw numbers), at any depth. */
const TEXT_KEYS = new Set(["text", "intro", "stem", "answerText", "label", "placeholder", "front", "back", "title", "prompt", "rubric", "modelAnswer", "altText", "nonDragAlternative", "instructions", "acceptExamples"]);

/** Deep substitution. A string that is exactly one placeholder becomes the raw value (number, array…),
 *  except under text keys, which always stay strings. */
export function fillDeep<T>(x: T, ctx: Ctx, text = false): T {
  if (typeof x === "string") {
    if (text) return fillText(x, ctx) as T;
    const m = WHOLE.exec(x);
    if (m && !m[2]) return evaluate(m[1]!, ctx) as T;
    return fillText(x, ctx) as T;
  }
  if (Array.isArray(x)) return x.map((y) => fillDeep(y, ctx, text)) as T;
  if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, fillDeep(v, ctx, TEXT_KEYS.has(k))])) as T;
  return x;
}

export const hasPlaceholder = (x: unknown): boolean => JSON.stringify(x).includes("{{");

/** Evaluate a constraint such as "tan(theta*pi/180) < mu_s" or "a != b". */
export function constraintHolds(c: string, ctx: Ctx): boolean {
  const m = /^(.*?)(<=|>=|!=|==|<|>)(.*)$/.exec(c);
  if (!m) throw new PlaceholderError(`Constraint needs a comparison: ${c}`);
  const a = Number(evaluate(m[1]!, ctx)), b = Number(evaluate(m[3]!, ctx));
  switch (m[2]) {
    case "<": return a < b;
    case "<=": return a <= b;
    case ">": return a > b;
    case ">=": return a >= b;
    case "!=": return Math.abs(a - b) > 1e-12;
    default: return Math.abs(a - b) <= 1e-12;
  }
}
