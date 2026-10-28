export type Params = Record<string, number | string>;
export interface Solved { answer: Record<string, unknown>; derived?: Record<string, unknown> }
export interface Solver {
  solve(p: Params): Solved;
  /** wrong methods, keyed by name; return null when the method doesn't apply to these parameters */
  buggy?: Record<string, (p: Params) => unknown>;
}
export const num = (p: Params, k: string) => Number(p[k]);
export const G = 9.8;
export const rad = (deg: number) => (deg * Math.PI) / 180;
/** Reject these parameters and resample (counts like a failed constraint). */
export const reject = (): never => { throw new Error("reject"); };
export const minus = (s: string) => s.replace(/-/g, "−");
