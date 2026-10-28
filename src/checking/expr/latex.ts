// AST → LaTeX, with optional substitution of parameter values (for live equation display).
import type { Node } from "./parse";

const num = (v: number) => {
  if (!Number.isFinite(v)) return v > 0 ? "\\infty" : "-\\infty";
  const s = Number(v.toPrecision(4)).toString();
  return s.includes("e") ? s.replace(/e\+?(-?\d+)/, "\\times 10^{$1}") : s;
};
const FN: Record<string, string> = { sin: "\\sin", cos: "\\cos", tan: "\\tan", sec: "\\sec", csc: "\\csc", cot: "\\cot", asin: "\\sin^{-1}", acos: "\\cos^{-1}", atan: "\\tan^{-1}", sinh: "\\sinh", cosh: "\\cosh", tanh: "\\tanh", exp: "\\exp", ln: "\\ln", log: "\\log", sgn: "\\operatorname{sgn}" };
const PREC: Record<string, number> = { add: 1, sub: 1, mul: 2, div: 9, neg: 3, pow: 4 };

function sub(n: Node, values: Record<string, number>): Node {
  if (n.k === "var" && n.name in values) {
    const v = values[n.name]!;
    return v < 0 ? { k: "neg", a: { k: "num", v: -v, text: String(-v) } } : { k: "num", v, text: String(v) };
  }
  if (n.k === "neg" || n.k === "fn") return { ...n, a: sub(n.a, values) } as Node;
  if (n.k === "num" || n.k === "const" || n.k === "var") return n;
  return { ...n, a: sub(n.a, values), b: sub(n.b, values) } as Node;
}

export function toLatex(n0: Node, values: Record<string, number> = {}): string {
  const n = Object.keys(values).length ? sub(n0, values) : n0;
  const wrap = (c: Node, min: number) => {
    const p = c.k in PREC ? PREC[c.k]! : 10;
    const s = toLatex(c);
    return p < min ? `\\left(${s}\\right)` : s;
  };
  switch (n.k) {
    case "num": return num(n.v);
    case "const": return n.name === "pi" ? "\\pi" : "e";
    case "var": return n.name.length > 1 ? `\\${n.name}` : n.name;
    case "neg": return `-${wrap(n.a, 3)}`;
    case "fn":
      if (n.name === "sqrt") return `\\sqrt{${toLatex(n.a)}}`;
      if (n.name === "cbrt") return `\\sqrt[3]{${toLatex(n.a)}}`;
      if (n.name === "abs") return `\\left|${toLatex(n.a)}\\right|`;
      return `${FN[n.name]}\\left(${toLatex(n.a)}\\right)`;
    case "add": {
      const b = toLatex(n.b);
      return b.startsWith("-") ? `${wrap(n.a, 1)} ${b}` : `${wrap(n.a, 1)} + ${b}`;
    }
    case "sub": return `${wrap(n.a, 1)} - ${wrap(n.b, 2)}`;
    case "mul": {
      const a = wrap(n.a, 2), b = wrap(n.b, 3);
      const numThenVar = n.a.k === "num" && (n.b.k === "var" || n.b.k === "fn" || n.b.k === "pow" || n.b.k === "const");
      if (n.a.k === "num" && n.a.v === 1 && numThenVar) return b;
      return numThenVar || n.implicit ? `${a}${b}` : `${a} \\cdot ${b}`;
    }
    case "div": return `\\frac{${toLatex(n.a)}}{${toLatex(n.b)}}`;
    case "pow": return `${wrap(n.a, 5)}^{${toLatex(n.b)}}`;
  }
}
