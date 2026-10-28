// Compact constructors for Phase 4 solvers. A numeric solver returns its answer as `ans` among the
// derived values (templates show it as {{ans}}); a choice solver names the correct option.
import { reject, type Params, type Solver } from "./types";

type Derived = { ans: number } & Record<string, unknown>;
/** A numeric (quantity or number) solver. Return null from `f` to reject the parameters. */
export const numeric = (f: (p: Params) => Derived | null, buggy?: Record<string, (p: Params) => number | null>): Solver => ({
  solve: (p) => {
    const d = f(p);
    if (!d || !Number.isFinite(d.ans)) return reject();
    // floating-point noise such as cos 90° = 6e-17 is shown and checked as exactly 0
    if (Math.abs(d.ans) < 1e-12) d.ans = 0;
    return { answer: { value: d.ans }, derived: d };
  },
  buggy: buggy && Object.fromEntries(Object.entries(buggy).map(([k, g]) => [k, (p: Params) => { try { const v = g(p); return v === null || !Number.isFinite(v) ? null : v; } catch { return null; } }])),
});
/** A single-choice solver: the correct option id, plus derived values for the text. */
export const pick = (correct: string | ((p: Params) => string), derived: (p: Params) => Record<string, unknown> = () => ({})): Solver => ({
  solve: (p) => ({ answer: { correct: typeof correct === "string" ? correct : correct(p) }, derived: derived(p) }),
});
/** An expression or equation solver: `reference` is the exact answer as text in the safe-parser syntax. */
export const exprAnswer = (f: (p: Params) => ({ reference: string } & Record<string, unknown>) | null, buggy?: Record<string, (p: Params) => string | null>): Solver => ({
  solve: (p) => { const d = f(p); if (!d) return reject(); const { reference, ...rest } = d; return { answer: { reference }, derived: { ...rest, reference } }; },
  buggy,
});
export const N = (p: Params, k: string) => Number(p[k]);
export const r12 = (x: number) => String(Number(x.toPrecision(12)));
