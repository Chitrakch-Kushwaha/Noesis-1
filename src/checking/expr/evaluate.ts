// Real-valued evaluation of a parsed AST. Compiles to plain closures (no eval/Function).
// Outside a function's real domain the result is NaN (e.g. sqrt(-1), ln(0), asin(2)).
import type { FnName, Node } from "./parse";

export type Env = Readonly<Record<string, number>>;
export type Compiled = (env: Env) => number;

export interface EvalOptions {
  /** NCERT writes log x for the natural logarithm; templates may switch to base 10. */
  logBase?: "e" | "10";
}

const FNS: Record<FnName, (x: number) => number> = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  sec: (x) => 1 / Math.cos(x), csc: (x) => 1 / Math.sin(x), cot: (x) => Math.cos(x) / Math.sin(x),
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  sqrt: Math.sqrt, cbrt: Math.cbrt, exp: Math.exp,
  ln: (x) => (x > 0 ? Math.log(x) : NaN), log: (x) => (x > 0 ? Math.log(x) : NaN),
  abs: Math.abs, sgn: (x) => (x === 0 ? 0 : Math.sign(x)),
};

function pow(a: number, b: number): number {
  if (a < 0 && !Number.isInteger(b)) return NaN; // no complex results
  if (a === 0 && b < 0) return NaN;
  return Math.pow(a, b);
}

export function compile(n: Node, opts: EvalOptions = {}): Compiled {
  switch (n.k) {
    case "num": { const v = n.v; return () => v; }
    case "const": { const v = n.name === "pi" ? Math.PI : Math.E; return () => v; }
    case "var": { const name = n.name; return (env) => (Object.prototype.hasOwnProperty.call(env, name) ? env[name]! : NaN); }
    case "neg": { const a = compile(n.a, opts); return (env) => -a(env); }
    case "fn": {
      const a = compile(n.a, opts);
      const f = n.name === "log" && opts.logBase === "10" ? (x: number) => (x > 0 ? Math.log10(x) : NaN) : FNS[n.name];
      return (env) => f(a(env));
    }
    case "add": { const a = compile(n.a, opts), b = compile(n.b, opts); return (env) => a(env) + b(env); }
    case "sub": { const a = compile(n.a, opts), b = compile(n.b, opts); return (env) => a(env) - b(env); }
    case "mul": { const a = compile(n.a, opts), b = compile(n.b, opts); return (env) => a(env) * b(env); }
    case "div": { const a = compile(n.a, opts), b = compile(n.b, opts); return (env) => { const d = b(env); return d === 0 ? NaN : a(env) / d; }; }
    case "pow": { const a = compile(n.a, opts), b = compile(n.b, opts); return (env) => pow(a(env), b(env)); }
  }
}

/** Deterministic sample generator (mulberry32). */
export function sampler(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
