// Runtime reader for config/learning.config.json (docs/04). Pure: the engine, the player and the
// progress derivations read every threshold from here, so changing the file changes behaviour.
import { z } from "zod";
import raw from "@/config/learning.config.json";

const Difficulty = z.enum(["easy", "medium", "hard"]);

export const LearningConfig = z.object({
  version: z.literal(1),
  difficulty: z.object({
    levels: z.tuple([z.literal("easy"), z.literal("medium"), z.literal("hard")]),
    start: Difficulty,
    afterIndependentCorrect: z.enum(["stepUp", "stay"]),
    afterAssistedCorrect: z.enum(["stay", "stepDown"]),
    afterExhaustedAttempts: z.enum(["stepDownForNextMain", "stay"]),
    mainQuestionFloor: Difficulty,
  }),
  attempts: z.object({
    retriesAfterFirst: z.number().int().min(0).max(5),
    // the product rule (U-05): unreadable or unverifiable input never uses a try
    invalidInputConsumesAttempt: z.literal(false),
    indeterminateCheckConsumesAttempt: z.literal(false),
  }),
  hints: z.object({ maxLevels: z.number().int().min(1).max(3), finalAnswerNeverInHintLevelBelow: z.number().int() }),
  session: z.object({
    mainQuestionTarget: z.number().int().positive(),
    mainQuestionCap: z.number().int().positive(),
    avoidTemplateRepeatWithinSession: z.boolean(),
    /** when every unused template has been asked, offer a fresh variation of one already seen instead of ending */
    freshVariantWhenTemplatesRunOut: z.boolean().default(true),
    minHardOpportunities: z.number().int().min(0),
  }),
  mastery: z.object({
    windowSize: z.number().int().positive(),
    minIndependentCorrectInWindow: z.number().int().min(0),
    requireRequiredSkillCoverage: z.boolean(),
    coverageScope: z.literal("session"),
    coverageCountsOnly: z.literal("independentCorrect"),
    minHardIndependentCorrectInWindow: z.number().int().min(0),
    aiGradedItemsCount: z.literal(false),
  }),
  skillState: z.object({
    independentWhen: z.object({ independentCorrect: z.number().int().positive(), minDifficulty: Difficulty, lookback: z.number().int().positive() }),
    flagGapAfterExhaustedAttempts: z.number().int().positive(),
  }),
  diagnostic: z.object({ easyDiagnosticDifficulty: Difficulty, maxProbesBeforeDetour: z.number().int().min(1), probeDifficulty: Difficulty }),
  detour: z.object({
    maxDepth: z.number().int().min(1).max(8),
    maxSiblingDetoursPerSuspendedQuestion: z.number().int().min(1),
    miniMastery: z.object({ questions: z.number().int().positive(), minIndependentCorrect: z.number().int().positive(), lastMustBeIndependent: z.boolean(), maxQuestions: z.number().int().positive() }),
    returnQuestion: z.literal("freshVariantSameTemplateSameDifficulty"),
    returnQuestionCountsAsMain: z.literal(false),
  }),
  foundation: z.object({ practiceQuestions: z.number().int().positive(), minIndependentCorrect: z.number().int().positive(), maxMicroLessonRepeatsPerVisit: z.number().int().min(0) }),
  stuck: z.object({ tryAgainPerVisit: z.number().int().min(0) }).default({ tryAgainPerVisit: 1 }),
  flashcards: z.object({
    createOn: z.array(z.enum(["exhaustedAttempts", "misconceptionTagged"])),
    leitnerBoxes: z.number().int().positive(),
    intervalsDays: z.array(z.number().positive()).min(1),
  }),
  studentClass: z.object({ askOnFirstLaunch: z.boolean(), defaultWhenUnset: z.union([z.literal(11), z.literal(12)]) }),
}).superRefine((c, ctx) => {
  const issue = (message: string) => ctx.addIssue({ code: "custom", message });
  if (c.session.mainQuestionCap < c.session.mainQuestionTarget) issue("session.mainQuestionCap must be at least mainQuestionTarget");
  if (c.mastery.windowSize > c.session.mainQuestionCap) issue("mastery.windowSize cannot exceed session.mainQuestionCap");
  if (c.mastery.minIndependentCorrectInWindow > c.mastery.windowSize) issue("mastery.minIndependentCorrectInWindow cannot exceed windowSize");
  if (c.mastery.minHardIndependentCorrectInWindow > c.mastery.minIndependentCorrectInWindow) issue("mastery.minHardIndependentCorrectInWindow cannot exceed minIndependentCorrectInWindow");
  if (c.flashcards.intervalsDays.length !== c.flashcards.leitnerBoxes) issue("flashcards.intervalsDays needs one interval per Leitner box");
  if (c.difficulty.mainQuestionFloor === "easy") issue("difficulty.mainQuestionFloor: easy questions are for remediation only");
  if (c.foundation.minIndependentCorrect > c.foundation.practiceQuestions) issue("foundation.minIndependentCorrect cannot exceed practiceQuestions");
  if (c.detour.miniMastery.minIndependentCorrect > c.detour.miniMastery.questions) issue("detour.miniMastery.minIndependentCorrect cannot exceed questions");
  if (c.detour.miniMastery.maxQuestions < c.detour.miniMastery.questions) issue("detour.miniMastery.maxQuestions cannot be below questions");
});
export type LearningConfig = z.infer<typeof LearningConfig>;

/** Parse a config object, throwing a readable error. Tests use this to try alternative thresholds. */
export function parseConfig(x: unknown): LearningConfig {
  const r = LearningConfig.safeParse(x);
  if (!r.success) throw new Error(`Invalid learning config: ${r.error.issues.map((i) => `${i.path.join(".") || "(root)"} ${i.message}`).join("; ")}`);
  return r.data;
}

/** The validated configuration every runtime rule reads. */
export const CONFIG: LearningConfig = parseConfig(raw);

/** The first answer plus the configured retries (U-05). */
export const maxAttempts = (c: LearningConfig = CONFIG) => 1 + c.attempts.retriesAfterFirst;

const ORDER = ["easy", "medium", "hard"] as const;
export type Level = (typeof ORDER)[number];
export const levelIndex = (d: Level) => ORDER.indexOf(d);
export const stepUp = (d: Level): Level => ORDER[Math.min(2, levelIndex(d) + 1)]!;
export const stepDown = (d: Level, floor: Level = "easy"): Level => ORDER[Math.max(levelIndex(floor), levelIndex(d) - 1)]!;
