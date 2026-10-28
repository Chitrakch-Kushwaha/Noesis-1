// Shared widget contract (docs/05 §2). Models are pure and deterministic; views are React.
import type { z } from "zod";

export interface Cue { cue: string; args?: Record<string, unknown> }
export interface Timeline { duration: number; keyframes: number[] }

export type BaseAction =
  | { type: "cue"; cue: string; args?: Record<string, unknown> }
  | { type: "clear-overlay" }
  | { type: "reset" }
  | { type: "replace"; state: unknown };

export interface WidgetModel<C, S, A extends { type: string }> {
  type: string;
  /** false for explanatory figures, which never count as interactive models */
  interactive: boolean;
  /** true when the student manipulates it by dragging; templates must then describe a non-drag alternative */
  dragInputs: boolean;
  configSchema: z.ZodType<C>;
  /** cue name → schema of its arguments; content validation checks every cue a template uses */
  cues: Record<string, z.ZodType>;
  init(config: C): S;
  reduce(state: S, action: A | BaseAction): S;
  timeline(state: S): Timeline;
  describe(state: S, t: number): string;
  /** structured answer for formats answered on the widget (diagram, interval) */
  answer?(state: S): unknown;
}

export const keyframesEvery = (duration: number, n = 8) => Array.from({ length: n + 1 }, (_, i) => +(duration * i / n).toFixed(6));
export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const snap = (v: number, step: number) => (step > 0 ? Math.round(v / step) * step : v);
export const round = (v: number, dp = 6) => Math.round(v * 10 ** dp) / 10 ** dp;
