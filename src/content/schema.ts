// Question template schema (docs/05 §1). Templates are JSON content; answers come from registered code solvers.
import { z } from "zod";

export const STATUSES = ["draft", "auto-checked", "in-review", "approved", "retired"] as const;
export type Status = (typeof STATUSES)[number];
/** Statuses that may appear to students. Only "approved" (with a matching content hash) can ever count toward mastery. */
export const PLAYABLE_STATUSES: readonly Status[] = ["in-review", "approved"];

export const FORMATS = ["single-choice", "multi-choice", "quantity", "number", "expression", "antiderivative", "equation", "interval", "set", "ordering", "mapping", "diagram"] as const;
export type Format = (typeof FORMATS)[number];

const CueSchema = z.object({ cue: z.string(), args: z.record(z.string(), z.unknown()).optional() });
const Cues = z.union([CueSchema, z.array(CueSchema)]);
export type CueRef = z.infer<typeof CueSchema>;
const Step = z.object({ text: z.string().min(1), cue: Cues.optional() });

export const ParamSpec = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("int"), min: z.number().int(), max: z.number().int() }),
  z.object({ kind: z.literal("decimal"), min: z.number(), max: z.number(), step: z.number().positive() }),
  z.object({ kind: z.literal("choice"), values: z.array(z.union([z.number(), z.string()])).min(1) }),
  z.object({ kind: z.literal("const"), value: z.union([z.number(), z.string()]) }),
]);
export type ParamSpec = z.infer<typeof ParamSpec>;

const Content = z.object({
  intro: z.string(),
  stem: z.array(z.string().min(1)).min(1),
  answerText: z.string(),
  hints: z.array(Step).length(3),
  feedback: z.record(z.string(), Step).refine((f) => "generic" in f, "feedback needs a generic entry"),
  workedSolution: z.array(Step).min(2),
  alternativeSolution: z.object({ title: z.string(), steps: z.array(Step).min(2) }).optional(),
  flashcards: z.record(z.string(), z.object({ front: z.string(), back: z.string() })).refine((f) => "generic" in f, "flashcards need a generic card"),
  options: z.array(z.object({ id: z.string(), text: z.string(), tags: z.array(z.string()).optional(), cue: Cues.optional() })).optional(),
  items: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  targets: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
  input: z.object({ label: z.string(), placeholder: z.string(), keypad: z.enum(["none", "maths", "interval", "set"]).default("none") }).optional(),
  accessibility: z.object({ altText: z.string().min(10), nonDragAlternative: z.string().optional() }),
});

export const TemplateSchema = z.object({
  id: z.string().regex(/^[a-z0-9]+\.[a-z0-9-]+\.[emh]\.[a-z0-9-]+$/),
  version: z.number().int().positive(),
  status: z.enum(STATUSES),
  provenance: z.object({
    origin: z.enum(["human", "ai-draft"]),
    author: z.string(),
    model: z.string().optional(),
    promptRef: z.string().optional(),
    createdAt: z.string(),
    migratedFrom: z.string().optional(),
    reviewedBy: z.string().nullable(),
    reviewedAt: z.string().nullable(),
    contentHash: z.string().nullable(),
    reviewLog: z.array(z.object({ at: z.string(), by: z.string(), decision: z.enum(["approved", "changes-requested", "submitted"]), note: z.string() })).default([]),
  }),
  chapterId: z.string(),
  skillIds: z.array(z.string()).min(1),
  primarySkillId: z.string(),
  difficulty: z.enum(["easy", "medium", "hard"]),
  format: z.enum(FORMATS),
  estimatedSeconds: z.number().int().positive(),
  parameters: z.record(z.string(), ParamSpec),
  constraints: z.array(z.string()).default([]),
  solver: z.string(),
  answer: z.record(z.string(), z.unknown()).default({}),
  misconceptionRules: z.array(z.object({ tags: z.array(z.string()).min(1), match: z.object({ buggySolver: z.string() }) })).default([]),
  acceptExamples: z.array(z.string()).default([]),
  widget: z.object({ type: z.string(), config: z.record(z.string(), z.unknown()), instructions: z.string().min(10) }),
  consequence: Cues.optional(),
  resolution: Cues.optional(),
  reasoning: z.object({ prompt: z.string(), rubric: z.array(z.string()).min(2).max(6), modelAnswer: z.string() }).optional(),
  variants: z.object({ param: z.string(), cases: z.record(z.string(), Content.partial()) }).optional(),
}).merge(Content);

export type Template = z.infer<typeof TemplateSchema>;
export type ContentStep = z.infer<typeof Step>;
