// Explanatory figures (not interactive models). Cues: the student's answer and worked-solution steps.
import { z } from "zod";
import type { BaseAction, WidgetModel } from "../types";
import type { FigureCue } from "./legacy";

export const FigureConfig = z.discriminatedUnion("figure", [
  z.object({ figure: z.literal("circuit"), E: z.number(), r: z.number(), R: z.number(), showVoltmeter: z.boolean() }),
  z.object({ figure: z.literal("venn"), A: z.array(z.number()), B: z.array(z.number()), U: z.array(z.number()), op: z.enum(["difference", "intersection", "union"]) }),
  z.object({ figure: z.literal("box"), p: z.number(), q: z.number(), r: z.number() }),
  z.object({ figure: z.literal("concept"), topic: z.string().min(3), subject: z.enum(["Physics", "Mathematics"]) }),
]);
export type FigureConfig = z.infer<typeof FigureConfig>;
export interface FigureState { config: FigureConfig; cue: FigureCue }

const has = (c: FigureCue, tag: string) => c.type === "student" && c.tags.includes(tag);
const stepOf = (c: FigureCue) => (c.type === "solution" ? c.step : -1);

export const figure: WidgetModel<FigureConfig, FigureState, { type: "noop" }> = {
  type: "figure",
  interactive: false,
  dragInputs: false,
  configSchema: FigureConfig,
  cues: {
    student: z.object({ value: z.unknown().optional(), tags: z.union([z.array(z.string()), z.string()]).optional() }),
    "solution-step": z.object({ step: z.union([z.number(), z.string()]) }),
  },
  init: (config) => ({ config: FigureConfig.parse(config), cue: { type: "idle" } }),
  reduce(s, a: { type: "noop" } | BaseAction) {
    if (a.type === "reset" || a.type === "clear-overlay") return { ...s, cue: { type: "idle" } };
    if (a.type === "replace") return a.state as FigureState;
    if (a.type !== "cue") return s;
    const args = a.args ?? {};
    if (a.cue === "student") return { ...s, cue: { type: "student", value: args.value, tags: Array.isArray(args.tags) ? (args.tags as string[]) : [] } };
    if (a.cue === "solution-step") return { ...s, cue: { type: "solution", step: Number(args.step) } };
    return s;
  },
  timeline: () => ({ duration: 0, keyframes: [0] }),
  describe(s) {
    const c = s.cue, st = stepOf(c), cfg = s.config;
    switch (cfg.figure) {
      case "circuit":
        if (has(c, "ignores-internal-resistance")) return "The internal resistance inside the cell is highlighted. It is in series with the resistor.";
        if (has(c, "terminal-equals-emf")) return "Part of the emf is lost across the internal resistance before reaching the terminals.";
        if (has(c, "drop-across-internal")) return "Ir is the drop inside the cell. The voltmeter reads the remaining part, IR.";
        if (st === 0) return "The internal resistance and the external resistor are in series.";
        return cfg.showVoltmeter ? "The potential ladder shows the emf rising in the cell, then falling across r and across R." : "Current flows through the internal resistance and the external resistor in series.";
      case "venn":
        if (c.type === "student") return "Orange elements in your answer are right; coral ones shouldn't be there; dashed rings are missing.";
        if (st >= 1) return "The shaded region is the answer.";
        return "Each element sits in its region of the Venn diagram.";
      case "box":
        if (has(c, "added-components")) return "Adding the components walks along the edges of the box, which is longer than the straight diagonal.";
        if (has(c, "missed-k-component")) return "Your answer stops at the corner of the floor. The vector also rises by its k̂ component.";
        if (has(c, "forgot-square-root")) return "That number is the square of the length, |a|².";
        if (st >= 1) return "Pythagoras across the floor, then up to the far corner.";
        return "The vector is the diagonal of a box with these side lengths.";
      case "concept":
        if (c.type === "student") return `A concept check for ${cfg.topic}; compare your choice with the worked solution.`;
        if (st >= 0) return `The worked solution explains the central idea in ${cfg.topic}.`;
        return `${cfg.subject} concept check: ${cfg.topic}.`;
    }
  },
};
