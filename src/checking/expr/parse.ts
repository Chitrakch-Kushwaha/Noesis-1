// Safe mathematical expression parser (docs/05 §3). Produces data (an AST); never executes input.
// No eval, no Function, no dynamic property access. Bounded length, token count, depth and node count.

export type FnName =
  | "sin" | "cos" | "tan" | "sec" | "csc" | "cot"
  | "asin" | "acos" | "atan" | "sinh" | "cosh" | "tanh"
  | "sqrt" | "cbrt" | "exp" | "ln" | "log" | "abs" | "sgn";

export type Node =
  | { k: "num"; v: number; text: string }
  | { k: "const"; name: "pi" | "e" }
  | { k: "var"; name: string }
  | { k: "neg"; a: Node }
  | { k: "add" | "sub" | "mul" | "div" | "pow"; a: Node; b: Node; implicit?: boolean }
  | { k: "fn"; name: FnName; a: Node };

export const LIMITS = { maxLength: 500, maxTokens: 300, maxDepth: 40, maxNodes: 400, maxNumberChars: 30 };

export class ParseError extends Error {
  constructor(message: string, public readonly kind: "syntax" | "limit" | "unknown-symbol" | "ambiguous" = "syntax") {
    super(message);
  }
}

const FN_ALIASES: Record<string, FnName> = {
  sin: "sin", cos: "cos", tan: "tan", sec: "sec", csc: "csc", cosec: "csc", cot: "cot",
  asin: "asin", acos: "acos", atan: "atan", arcsin: "asin", arccos: "acos", arctan: "atan",
  sinh: "sinh", cosh: "cosh", tanh: "tanh",
  sqrt: "sqrt", cbrt: "cbrt", exp: "exp", ln: "ln", log: "log", abs: "abs", sgn: "sgn", sign: "sgn",
};
const INVERSE: Partial<Record<FnName, FnName>> = { sin: "asin", cos: "acos", tan: "atan" };
const WORDS = [...Object.keys(FN_ALIASES), "pi", "inf", "infinity"].sort((a, b) => b.length - a.length);
const GREEK: Record<string, string> = { "θ": "theta", "φ": "phi", "α": "alpha", "β": "beta", "ω": "omega", "λ": "lambda", "μ": "mu" };
const SUPER: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-" };

type Tok =
  | { t: "num"; v: number; text: string }
  | { t: "id"; name: string } // variable
  | { t: "fn"; name: FnName }
  | { t: "const"; name: "pi" | "e" }
  | { t: "inf" }
  | { t: "op"; v: "+" | "-" | "*" | "/" | "^" | "(" | ")" | "|" | "," };

/** Normalise Unicode maths into ASCII-ish tokens. Exported for the quantity/interval parsers. */
export function normalise(src: string): string {
  let s = src
    .replace(/[−–—]/g, "-")
    .replace(/[×·⋅∙]/g, "*")
    .replace(/÷/g, "/")
    .replace(/π/g, "pi")
    .replace(/∛/g, "cbrt")
    .replace(/√/g, "sqrt")
    .replace(/∞/g, "inf")
    .replace(/[\[\{]/g, "(")
    .replace(/[\]\}]/g, ")");
  // superscript runs → ^(…)
  s = s.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (m) => `^(${[...m].map((c) => SUPER[c]).join("")})`);
  for (const [g, name] of Object.entries(GREEK)) s = s.split(g).join(` ${name} `);
  return s;
}

function tokenize(src: string, vars: ReadonlySet<string>): Tok[] {
  if (src.length > LIMITS.maxLength) throw new ParseError("That answer is too long.", "limit");
  const s = normalise(src);
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(s.slice(i));
      if (!m || m[0] === ".") throw new ParseError("A number is written incorrectly.");
      if (m[0].length > LIMITS.maxNumberChars) throw new ParseError("A number in your answer is too long.", "limit");
      out.push({ t: "num", v: Number(m[0]), text: m[0] });
      i += m[0].length;
      continue;
    }
    if ("+-*/^()|,".includes(c)) {
      if (c === "*" && s[i + 1] === "*") { out.push({ t: "op", v: "^" }); i += 2; continue; }
      out.push({ t: "op", v: c as "+" });
      i++;
      continue;
    }
    if (/[A-Za-z]/.test(c)) {
      // a declared variable may end in digits (template parameters such as a1, x2)
      const alnum = /^[A-Za-z]+[0-9]+/.exec(s.slice(i))?.[0];
      if (alnum && vars.has(alnum)) { out.push({ t: "id", name: alnum }); i += alnum.length; continue; }
      const word = /^[A-Za-z]+/.exec(s.slice(i))![0];
      i += word.length;
      // whole word: declared multi-letter variable (e.g. theta), function or constant
      if (vars.has(word)) { out.push({ t: "id", name: word }); continue; }
      let j = 0;
      while (j < word.length) {
        const rest = word.slice(j);
        const w = WORDS.find((k) => rest.toLowerCase().startsWith(k));
        if (w) {
          const lw = w.toLowerCase();
          if (lw === "pi") out.push({ t: "const", name: "pi" });
          else if (lw === "inf" || lw === "infinity") out.push({ t: "inf" });
          else out.push({ t: "fn", name: FN_ALIASES[lw]! });
          j += w.length;
          continue;
        }
        const ch = word[j]!;
        if (vars.has(ch)) out.push({ t: "id", name: ch });
        else if (ch === "e") out.push({ t: "const", name: "e" });
        else throw new ParseError(`“${ch}” isn't used in this question.`, "unknown-symbol");
        j++;
      }
      continue;
    }
    throw new ParseError(`The symbol “${c}” can't be used here.`);
  }
  if (out.length > LIMITS.maxTokens) throw new ParseError("That answer is too long.", "limit");
  return out;
}

export interface ParseOptions {
  variables?: readonly string[];
  /** reject ∞ unless explicitly allowed (intervals) */
  allowInfinity?: boolean;
}

export interface Parsed {
  ast: Node;
  /** a/bc style input whose meaning depends on convention */
  ambiguous: boolean;
}

export function parseExpression(src: string, opts: ParseOptions = {}): Parsed {
  const vars = new Set(opts.variables ?? []);
  const toks = tokenize(src, vars);
  if (!toks.length) throw new ParseError("Type an answer first.");
  let p = 0;
  let depth = 0;
  let nodes = 0;
  let ambiguous = false;
  let absDepth = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => { const t = toks[p]; return !!t && t.t === "op" && t.v === v; };
  const mk = <T extends Node>(n: T): T => {
    if (++nodes > LIMITS.maxNodes) throw new ParseError("That answer is too long.", "limit");
    return n;
  };
  const enter = () => { if (++depth > LIMITS.maxDepth) throw new ParseError("That answer has too many nested brackets.", "limit"); };
  const leave = () => { depth--; };

  const startsPrimary = (t: Tok | undefined, allowFn: boolean): boolean => {
    if (!t) return false;
    if (t.t === "num" || t.t === "id" || t.t === "const") return true;
    if (t.t === "fn") return allowFn;
    if (t.t === "inf") return !!opts.allowInfinity;
    if (t.t === "op") return t.v === "(" || (t.v === "|" && absDepth === 0);
    return false;
  };

  const expr = (): Node => {
    enter();
    let n = term();
    while (isOp("+") || isOp("-")) {
      const op = (toks[p++] as { v: string }).v;
      n = mk({ k: op === "+" ? "add" : "sub", a: n, b: term() });
    }
    leave();
    return n;
  };

  const term = (): Node => {
    let n = unary();
    let lastExplicitDiv = false;
    for (;;) {
      if (isOp("*")) { p++; n = mk({ k: "mul", a: n, b: unary() }); lastExplicitDiv = false; }
      else if (isOp("/")) { p++; n = mk({ k: "div", a: n, b: unary() }); lastExplicitDiv = true; }
      else if (startsPrimary(peek(), true)) {
        if (lastExplicitDiv) ambiguous = true; // a/bc: (a/b)c or a/(bc)?
        n = mk({ k: "mul", a: n, b: power(), implicit: true });
      } else return n;
    }
  };

  const unary = (): Node => {
    if (isOp("-")) { p++; enter(); const a = unary(); leave(); return mk({ k: "neg", a }); }
    if (isOp("+")) { p++; return unary(); }
    return power();
  };

  const power = (): Node => {
    const base = primary();
    if (isOp("^")) { p++; enter(); const e = unary(); leave(); return mk({ k: "pow", a: base, b: e }); }
    return base;
  };

  const primary = (): Node => {
    const t = toks[p];
    if (!t) throw new ParseError("Your answer ends too early.");
    if (t.t === "num") { p++; return mk({ k: "num", v: t.v, text: t.text }); }
    if (t.t === "id") { p++; return mk({ k: "var", name: t.name }); }
    if (t.t === "const") { p++; return mk({ k: "const", name: t.name }); }
    if (t.t === "inf") {
      if (!opts.allowInfinity) throw new ParseError("∞ can't be used in this answer.");
      p++;
      return mk({ k: "num", v: Infinity, text: "inf" });
    }
    if (t.t === "fn") return fnCall(t.name);
    if (t.t === "op" && t.v === "(") {
      p++;
      const n = expr();
      if (!isOp(")")) throw new ParseError("A bracket is missing.");
      p++;
      return n;
    }
    if (t.t === "op" && t.v === "|" && absDepth === 0) {
      p++;
      absDepth++;
      const n = expr();
      absDepth--;
      if (!isOp("|")) throw new ParseError("An absolute-value bar | is missing.");
      p++;
      return mk({ k: "fn", name: "abs", a: n });
    }
    throw new ParseError("Something is missing in your answer.");
  };

  const fnCall = (name0: FnName): Node => {
    p++;
    let name = name0;
    let outerPow: Node | null = null;
    if (isOp("^")) {
      // sin^2(x) = (sin x)^2 ; sin^-1(x) = arcsin x
      p++;
      const e = unary();
      if (e.k === "neg" && e.a.k === "num" && e.a.v === 1 && INVERSE[name]) name = INVERSE[name]!;
      else outerPow = e;
    }
    let arg: Node;
    if (isOp("(")) {
      p++;
      arg = expr();
      if (!isOp(")")) throw new ParseError("A bracket is missing.");
      p++;
    } else {
      // sin 2x → sin(2x); sin x cos x → sin(x)·cos(x): take an implicit product that stops at the next function
      if (!startsPrimary(peek(), false)) throw new ParseError(`Write what ${name0} applies to, for example ${name0}(x).`);
      arg = power();
      while (startsPrimary(peek(), false) && !isOp("(")) arg = mk({ k: "mul", a: arg, b: power(), implicit: true });
    }
    const call = mk({ k: "fn" as const, name, a: arg });
    return outerPow ? mk({ k: "pow", a: call, b: outerPow }) : call;
  };

  const ast = expr();
  if (p < toks.length) {
    const t = toks[p]!;
    if (t.t === "op" && t.v === ")") throw new ParseError("There is an extra closing bracket.");
    throw new ParseError("Part of your answer couldn't be read.");
  }
  return { ast, ambiguous };
}

/** Variables used by an AST. */
export function variablesOf(n: Node, out = new Set<string>()): Set<string> {
  if (n.k === "var") out.add(n.name);
  else if (n.k === "neg" || n.k === "fn") variablesOf(n.a, out);
  else if (n.k !== "num" && n.k !== "const") { variablesOf(n.a, out); variablesOf(n.b, out); }
  return out;
}
export function functionsOf(n: Node, out = new Set<FnName>()): Set<FnName> {
  if (n.k === "fn") { out.add(n.name); functionsOf(n.a, out); }
  else if (n.k === "neg") functionsOf(n.a, out);
  else if (n.k !== "num" && n.k !== "const" && n.k !== "var") { functionsOf(n.a, out); functionsOf(n.b, out); }
  return out;
}
export function countNodes(n: Node): number {
  if (n.k === "num" || n.k === "const" || n.k === "var") return 1;
  if (n.k === "neg" || n.k === "fn") return 1 + countNodes(n.a);
  return 1 + countNodes(n.a) + countNodes(n.b);
}
/** True if any numeric literal is written as a decimal or in scientific notation. */
export function hasDecimalLiteral(n: Node): boolean {
  if (n.k === "num") return /[.eE]/.test(n.text);
  if (n.k === "neg" || n.k === "fn") return hasDecimalLiteral(n.a);
  if (n.k === "const" || n.k === "var") return false;
  return hasDecimalLiteral(n.a) || hasDecimalLiteral(n.b);
}

const PREC: Record<string, number> = { add: 1, sub: 1, mul: 2, div: 2, neg: 3, pow: 4 };
/** Canonical, fully re-parseable printing. */
export function print(n: Node): string {
  const wrap = (c: Node, min: number, right = false) => {
    const pc = c.k in PREC ? PREC[c.k]! : 9;
    const s = print(c);
    return pc < min || (right && pc === min && c.k !== "pow") ? `(${s})` : s;
  };
  switch (n.k) {
    case "num":
      if (n.v === Infinity) return "inf";
      return Number.isInteger(n.v) && Math.abs(n.v) < 1e15 ? String(n.v) : n.v.toPrecision(17).replace(/\.?0+(e|$)/, "$1");
    case "const": return n.name;
    case "var": return n.name;
    case "neg": return `-${wrap(n.a, 4)}`;
    case "fn": return `${n.name}(${print(n.a)})`;
    case "add": return `${wrap(n.a, 1)} + ${wrap(n.b, 1, true)}`;
    case "sub": return `${wrap(n.a, 1)} - ${wrap(n.b, 2)}`;
    case "mul": return `${wrap(n.a, 2)}*${wrap(n.b, 3)}`;
    case "div": return `${wrap(n.a, 2)}/${wrap(n.b, 3)}`;
    case "pow": return `${wrap(n.a, 5)}^${wrap(n.b, 4)}`;
  }
}
