// The adaptive chapter session (docs/04): one practice loop per frame, a persisted frame stack for
// recursive detours, remediation after exhausted questions, and mastery over main questions only.
// Every function here is pure: it takes a session and returns the next one, so each transition can be
// persisted before the UI shows it and replayed exactly after a refresh.
import { z } from "zod";
import { CONFIG, stepDown, stepUp, type LearningConfig } from "@/src/domain/config";
import { getChapter, skillsOfChapter } from "@/src/domain/curriculum";
import { Difficulty, Outcome } from "@/src/domain/progress";
import type { EngineContent, EngineTemplate } from "./content";
import { buildsOn, classOf, isFoundation, prereqsOf, sameChapterDependents } from "./graph";
import { evaluateMastery, type MasteryReport } from "./mastery";
import { planDetour } from "./planner";

// ------------------------------------------------------------------ records (persisted in IndexedDB)

export const Role = z.enum(["main", "diagnostic", "probe", "detour", "foundation", "return"]);
export type Role = z.infer<typeof Role>;

/** Unfinished question state, saved as the student works so a refresh restores it exactly. */
export const Live = z.object({
  attempts: z.array(z.object({ input: z.unknown(), result: z.unknown() })).default([]),
  hintsShown: z.number().int().min(0).default(0),
  /** tutor explanations/demonstrations presented on this question (Phase 5); counted like hints */
  tutorAssists: z.number().int().min(0).optional(),
  gaveUp: z.boolean().default(false),
  text: z.string().default(""),
  choice: z.array(z.string()).default([]),
  order: z.array(z.string()).optional(),
  mapping: z.record(z.string(), z.string()).default({}),
  reasoning: z.string().default(""),
  selfCheck: z.array(z.number().int()).default([]),
  /** the student's own work on the visual (not a consequence or solution view) */
  widget: z.unknown().optional(),
});
export type Live = z.infer<typeof Live>;

export const Item = z.object({
  id: z.string(),
  role: Role,
  templateId: z.string(),
  version: z.number().int(),
  seed: z.number().int().positive(),
  skillId: z.string(),
  difficulty: Difficulty,
  /** may count toward mastery: approved content (or a clearly labelled reviewer preview) */
  eligible: z.boolean(),
  /** a fresh variation of a template already used this session (only when unused templates ran out) */
  repeat: z.boolean().default(false),
  /** the suspended question this return question re-asks */
  returnOf: z.string().optional(),
  outcome: Outcome.optional(),
  tags: z.array(z.string()).default([]),
  attemptsUsed: z.number().int().min(0).default(0),
  hintsUsed: z.number().int().min(0).default(0),
  startedAt: z.number(),
  endedAt: z.number().optional(),
  live: Live.optional(),
  /** the template was retired between visits and this one replaced it */
  substitutedFor: z.string().optional(),
});
export type Item = z.infer<typeof Item>;

const WorkedReason = z.enum(["within-skill", "guided", "class-ahead", "no-content", "return", "back-anyway"]);
export type WorkedReason = z.infer<typeof WorkedReason>;
export const Step = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("question"), itemId: z.string() }),
  z.object({ kind: z.literal("detour-intro") }),
  z.object({ kind: z.literal("lesson"), lessonId: z.string(), variant: z.enum(["main", "alternate", "recap"]) }),
  z.object({ kind: z.literal("worked"), itemId: z.string(), reason: WorkedReason, then: z.enum(["return-question", "continue"]), aheadSkillId: z.string().optional() }),
  z.object({ kind: z.literal("suspended") }),
  z.object({ kind: z.literal("stuck"), skillId: z.string(), reason: z.enum(["depth", "foundation", "mini-mastery"]) }),
  z.object({ kind: z.literal("done"), result: z.enum(["mastered", "notYet"]), why: z.enum(["mastery", "cap", "no-content"]).optional() }),
]);
export type Step = z.infer<typeof Step>;

export const Remediation = z.object({
  itemId: z.string(),
  skillId: z.string(),
  tags: z.array(z.string()),
  stage: z.enum(["diagnostic", "probing", "detour", "returning", "done"]),
  candidates: z.array(z.string()).default([]),
  probed: z.array(z.string()).default([]),
  detoured: z.array(z.string()).default([]),
});
export type Remediation = z.infer<typeof Remediation>;

export const Frame = z.object({
  id: z.string(),
  mode: z.enum(["main", "detour", "foundation"]),
  depth: z.number().int().min(0),
  skillId: z.string().nullable(),
  items: z.array(Item),
  step: Step,
  /** difficulty of this frame's next question */
  difficulty: Difficulty,
  remediation: Remediation.nullable().default(null),
  /** why this detour was opened: the skill it interrupted and the evidence */
  reason: z.object({ fromSkill: z.string(), tags: z.array(z.string()) }).optional(),
  visit: z.number().int().default(1),
  /** index into items where the current practice round (foundation) or visit (detour) began */
  roundStart: z.number().int().default(0),
  lessonRepeatsUsed: z.number().int().default(0),
  tryAgainUsed: z.number().int().default(0),
});
export type Frame = z.infer<typeof Frame>;

export const Gap = z.object({ skillId: z.string(), forSkill: z.string(), kind: z.enum(["foundation-gap", "prerequisite-gap"]), openedAt: z.number(), resolvedAt: z.number().optional() });
export type Gap = z.infer<typeof Gap>;

export const SessionRecord = z.object({
  id: z.string(),
  chapterId: z.string(),
  status: z.enum(["active", "paused", "mastered", "notYet"]),
  seed: z.number().int().positive(),
  startedAt: z.number(),
  updatedAt: z.number(),
  studentClass: z.union([z.literal(11), z.literal(12)]),
  /** reviewer preview: in-review content counts inside this session only; never shown as real mastery */
  preview: z.boolean().default(false),
  frames: z.array(Frame).min(1),
  counter: z.number().int(),
  learned: z.array(z.string()).default([]),
  gaps: z.array(Gap).default([]),
  /** bumps on every saved transition; a stale tab can't overwrite newer progress */
  rev: z.number().int().default(0),
});
export type Session = z.infer<typeof SessionRecord>;

export interface Env { content: EngineContent; cfg?: LearningConfig; now?: number; strength?(skillId: string): number }
const cfgOf = (e: Env) => e.cfg ?? CONFIG;
const nowOf = (e: Env) => e.now ?? Date.now();

// ------------------------------------------------------------------ small helpers

export const topFrame = (s: Session) => s.frames[s.frames.length - 1]!;
export const mainFrame = (s: Session) => s.frames[0]!;
export const allItems = (s: Session) => s.frames.flatMap((f) => f.items);
export const findItem = (s: Session, id: string) => allItems(s).find((i) => i.id === id);
export const mainItems = (s: Session) => mainFrame(s).items.filter((i) => i.role === "main" && i.outcome);
/** The question on screen, if the top frame is showing one. */
export function currentItem(s: Session): Item | undefined {
  const st = topFrame(s).step;
  return st.kind === "question" ? topFrame(s).items.find((i) => i.id === st.itemId) : undefined;
}
export const requiredSkills = (chapterId: string) => skillsOfChapter(chapterId).filter((x) => x.required).map((x) => x.id);

/** Deterministic positive 31-bit seed from parts (FNV-1a). */
export function hashSeed(...parts: (string | number)[]): number {
  let h = 0x811c9dc5;
  for (const ch of parts.join("|")) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return (h % 2147483646) + 1;
}

const usedTemplates = (s: Session) => new Set(allItems(s).map((i) => i.templateId));
const timesUsed = (s: Session, id: string) => allItems(s).filter((i) => i.templateId === id).length;
export const isEligible = (s: Session, t: EngineTemplate) => t.approved || (s.preview && t.status === "in-review");

/** independent on any question this session, or learned in a detour */
const independentInSession = (s: Session, skillId: string) => s.learned.includes(skillId) || allItems(s).some((i) => i.skillId === skillId && i.outcome === "independent");
/** an exhausted or assisted outcome since the last independent one (session evidence) */
function needsReview(s: Session, skillId: string): boolean {
  const mine = allItems(s).filter((i) => i.skillId === skillId && i.outcome).sort((a, b) => (a.endedAt ?? 0) - (b.endedAt ?? 0));
  const last = mine[mine.length - 1];
  return !!last && last.outcome !== "independent";
}
const openGaps = (s: Session) => s.gaps.filter((g) => !g.resolvedAt);

function pickTemplate(s: Session, env: Env, skillId: string, difficulty: Difficulty, opts: { allowRepeat: boolean; salt: string }): { t: EngineTemplate; repeat: boolean } | null {
  const pool = env.content.templates.filter((t) => t.skillId === skillId && t.difficulty === difficulty);
  if (!pool.length) return null;
  const used = usedTemplates(s);
  const avoid = cfgOf(env).session.avoidTemplateRepeatWithinSession;
  const rank = (list: EngineTemplate[]) => [...list].sort((a, b) => Number(isEligible(s, b)) - Number(isEligible(s, a)) || hashSeed(s.seed, opts.salt, a.id) - hashSeed(s.seed, opts.salt, b.id));
  const fresh = avoid ? pool.filter((t) => !used.has(t.id)) : pool;
  if (fresh.length) return { t: rank(fresh)[0]!, repeat: used.has(rank(fresh)[0]!.id) };
  if (!opts.allowRepeat) return null;
  const least = [...pool].sort((a, b) => timesUsed(s, a.id) - timesUsed(s, b.id) || hashSeed(s.seed, opts.salt, a.id) - hashSeed(s.seed, opts.salt, b.id))[0]!;
  return { t: least, repeat: true };
}

function newItem(s: Session, frame: Frame, t: EngineTemplate, role: Role, env: Env, extra: Partial<Item> = {}): Item {
  s.counter += 1;
  const it: Item = {
    id: `i${s.counter}`, role, templateId: t.id, version: t.version, seed: hashSeed(s.seed, frame.id, s.counter, role),
    skillId: t.skillId, difficulty: t.difficulty, eligible: isEligible(s, t), repeat: extra.repeat ?? false, tags: [], attemptsUsed: 0, hintsUsed: 0,
    startedAt: nowOf(env), ...extra,
  };
  frame.items.push(it);
  frame.step = { kind: "question", itemId: it.id };
  return it;
}

/** Content exists to probe a prerequisite and run a frame for it. */
export function hasRemediationContent(content: EngineContent, skillId: string): boolean {
  return content.templates.some((t) => t.skillId === skillId && t.difficulty === "easy");
}

// ------------------------------------------------------------------ starting a session

export interface StartOptions { id: string; chapterId: string; seed: number; studentClass: 11 | 12; preview?: boolean }

export function startSession(o: StartOptions, env: Env): Session {
  const now = nowOf(env);
  const s: Session = {
    id: o.id, chapterId: o.chapterId, status: "active", seed: o.seed, startedAt: now, updatedAt: now, studentClass: o.studentClass, preview: !!o.preview,
    frames: [{ id: "f0", mode: "main", depth: 0, skillId: null, items: [], step: { kind: "suspended" }, difficulty: cfgOf(env).difficulty.start, remediation: null, visit: 1, roundStart: 0, lessonRepeatsUsed: 0, tryAgainUsed: 0 }],
    counter: 0, learned: [], gaps: [], rev: 0,
  };
  nextMain(s, env);
  return s;
}

// ------------------------------------------------------------------ main-question selection (docs/04 "Selection")

/** Skills that have main-question content in this chapter. */
const mainSkills = (s: Session, env: Env) => skillsOfChapter(s.chapterId).filter((sk) => env.content.templates.some((t) => t.skillId === sk.id && t.difficulty !== "easy"));

export function skillScores(s: Session, env: Env): { skillId: string; score: number }[] {
  const mains = mainItems(s);
  const prev = mains[mains.length - 1]?.skillId;
  const gaps = openGaps(s);
  const asked = (id: string) => mains.filter((m) => m.skillId === id).length;
  return mainSkills(s, env).map((sk, order) => {
    let score = 0;
    const covered = mains.some((m) => m.skillId === sk.id && m.outcome === "independent");
    if (sk.required && !covered) score += 3;
    if (needsReview(s, sk.id)) score += 2;
    const inner = sk.prereqs.filter((p) => getChapter(s.chapterId) && skillsOfChapter(s.chapterId).some((x) => x.id === p));
    if (inner.every((p) => independentInSession(s, p))) score += 1;
    if (sk.id === prev) score -= 2;
    if (gaps.some((g) => buildsOn(sk.id, g.forSkill))) score = -Infinity;
    // stable tie-break: fewer times asked, then the chapter's teaching order
    return { skillId: sk.id, score: score - asked(sk.id) * 0.01 - order * 0.0001 };
  }).sort((a, b) => b.score - a.score);
}

/** The required skill with the most same-chapter dependents (docs/04: the first question doubles as placement). */
export function mostCentralSkill(s: Session, env: Env): string | undefined {
  const withMedium = mainSkills(s, env).filter((sk) => env.content.templates.some((t) => t.skillId === sk.id && t.difficulty === cfgOf(env).difficulty.start));
  const pool = withMedium.length ? withMedium : mainSkills(s, env);
  return [...pool].sort((a, b) => Number(b.required) - Number(a.required) || sameChapterDependents(b.id).length - sameChapterDependents(a.id).length)[0]?.id;
}

function targetDifficulty(s: Session, env: Env): Difficulty {
  const cfg = cfgOf(env);
  const mains = mainItems(s);
  const window = mains.slice(-(cfg.mastery.windowSize - 1));
  const hardHave = window.filter((m) => m.outcome === "independent" && m.eligible && m.difficulty === "hard").length;
  const hardNeeded = cfg.mastery.minHardIndependentCorrectInWindow - hardHave;
  const remaining = cfg.session.mainQuestionCap - mains.length;
  if (mains.length && hardNeeded > 0 && remaining <= Math.max(hardNeeded, cfg.session.minHardOpportunities)) return "hard";
  return mainFrame(s).difficulty;
}

function nextMain(s: Session, env: Env): void {
  const cfg = cfgOf(env);
  const f = mainFrame(s);
  f.remediation = null;
  const mains = mainItems(s);
  const report = masteryOf(s, env);
  if (report.mastered) { f.step = { kind: "done", result: "mastered", why: "mastery" }; s.status = "mastered"; return; }
  if (mains.length >= cfg.session.mainQuestionCap) { f.step = { kind: "done", result: "notYet", why: "cap" }; s.status = "notYet"; return; }
  const floor = cfg.difficulty.mainQuestionFloor;
  const target = targetDifficulty(s, env);
  const other: Difficulty = target === "hard" ? "medium" : "hard";
  let order = skillScores(s, env);
  if (order.length && order.every((o) => o.score === -Infinity)) order = order.map((o) => ({ ...o, score: 0 })); // every skill blocked: keep practising
  const skills = order.filter((o) => o.score > -Infinity).map((o) => o.skillId);
  const first = mains.length === 0 && !f.items.some((i) => i.role === "main") ? mostCentralSkill(s, env) : undefined;
  const tries: [string, Difficulty, boolean][] = [];
  if (first) tries.push([first, cfg.difficulty.start, false]);
  // skill priority first (coverage), then the target difficulty, then the other main difficulty
  for (const sk of skills) {
    tries.push([sk, target, false]);
    if (other !== "medium" || floor !== "hard") tries.push([sk, other, false]);
  }
  if (cfg.session.freshVariantWhenTemplatesRunOut) for (const sk of skills) tries.push([sk, target, true], [sk, other, true]);
  for (const [sk, d, allowRepeat] of tries) {
    const pick = pickTemplate(s, env, sk, d, { allowRepeat, salt: `main${mains.length}` });
    if (pick) { newItem(s, f, pick.t, "main", env, { repeat: pick.repeat }); return; }
  }
  f.step = { kind: "done", result: "notYet", why: "no-content" };
  s.status = "notYet";
}

export function masteryOf(s: Session, env: Env): MasteryReport {
  return evaluateMastery(mainItems(s).map((m) => ({ skillId: m.skillId, difficulty: m.difficulty, outcome: m.outcome!, eligible: m.eligible })), requiredSkills(s.chapterId), cfgOf(env));
}

// ------------------------------------------------------------------ completing a question

export interface ItemResult { outcome: Outcome; tags: string[]; attemptsUsed: number; hintsUsed: number }

/** Record a finished question and advance. Idempotent: completing the same item twice changes nothing. */
export function completeItem(s0: Session, itemId: string, r: ItemResult, env: Env): Session {
  const cur = currentItem(s0);
  if (!cur || cur.id !== itemId || cur.outcome) return s0;
  const s = structuredClone(s0);
  const f = topFrame(s);
  const it = f.items.find((i) => i.id === itemId)!;
  Object.assign(it, { outcome: r.outcome, tags: r.tags, attemptsUsed: r.attemptsUsed, hintsUsed: r.hintsUsed, endedAt: nowOf(env) });
  delete it.live;
  s.updatedAt = nowOf(env);
  const cfg = cfgOf(env);
  const merge = (rem: Remediation) => { rem.tags = [...new Set([...rem.tags, ...r.tags])]; };
  if (r.outcome === "independent") resolveGapsFor(s, it.skillId, env);

  switch (it.role) {
    case "main": {
      f.difficulty = r.outcome === "independent" ? (cfg.difficulty.afterIndependentCorrect === "stepUp" ? stepUp(f.difficulty) : f.difficulty)
        : r.outcome === "assisted" ? (cfg.difficulty.afterAssistedCorrect === "stepDown" ? stepDown(f.difficulty, cfg.difficulty.mainQuestionFloor) : f.difficulty)
        : cfg.difficulty.afterExhaustedAttempts === "stepDownForNextMain" ? stepDown(f.difficulty, cfg.difficulty.mainQuestionFloor) : f.difficulty;
      if (r.outcome === "exhausted") startRemediation(s, f, it, env);
      else nextMain(s, env);
      break;
    }
    case "detour": {
      f.difficulty = r.outcome === "independent" ? (f.difficulty === "easy" ? "medium" : f.difficulty) : r.outcome === "exhausted" ? "easy" : f.difficulty;
      if (r.outcome === "exhausted") startRemediation(s, f, it, env);
      else nextInFrame(s, env);
      break;
    }
    case "foundation": nextInFrame(s, env); break;
    case "diagnostic": {
      const rem = f.remediation!;
      merge(rem);
      if (r.outcome === "independent") {
        // a within-skill difficulty gap: replay the original's worked solution and step down
        rem.stage = "done";
        if (f.mode === "main") f.difficulty = stepDown(f.difficulty, cfg.difficulty.mainQuestionFloor);
        f.step = { kind: "worked", itemId: rem.itemId, reason: "within-skill", then: "continue" };
      } else plan(s, f, env);
      break;
    }
    case "probe": {
      const rem = f.remediation!;
      merge(rem);
      rem.probed.push(it.skillId);
      if (r.outcome !== "independent") { pushDetour(s, f, it.skillId, env); break; }
      const next = rem.candidates.find((c) => !rem.probed.includes(c));
      if (next && rem.probed.length < cfg.diagnostic.maxProbesBeforeDetour) probe(s, f, next, env);
      else { rem.stage = "done"; f.step = { kind: "worked", itemId: rem.itemId, reason: "guided", then: "continue" }; }
      break;
    }
    case "return": {
      const rem = f.remediation;
      if (r.outcome === "exhausted" && rem) {
        // the detour didn't carry over: plan a sibling detour (bounded by the sibling limit), else a guided example
        merge(rem);
        if (rem.detoured.length < cfg.detour.maxSiblingDetoursPerSuspendedQuestion) { rem.candidates = []; plan(s, f, env); break; }
        rem.stage = "done";
        f.step = { kind: "worked", itemId: it.id, reason: "guided", then: "continue" };
        break;
      }
      if (rem) rem.stage = "done";
      nextInFrame(s, env);
      break;
    }
  }
  return s;
}

function startRemediation(s: Session, f: Frame, it: Item, env: Env) {
  const cfg = cfgOf(env);
  f.remediation = { itemId: it.id, skillId: it.skillId, tags: [...it.tags], stage: "diagnostic", candidates: [], probed: [], detoured: [] };
  const pick = pickTemplate(s, env, it.skillId, cfg.diagnostic.easyDiagnosticDifficulty, { allowRepeat: false, salt: `diag${it.id}` });
  if (pick) newItem(s, f, pick.t, "diagnostic", env);
  else plan(s, f, env);
}

/** Skills on the stack: every detour frame's skill and every suspended question's skill (cycle guard). */
function stackSkills(s: Session): Set<string> {
  const out = new Set<string>();
  for (const fr of s.frames) {
    if (fr.skillId) out.add(fr.skillId);
    if (fr.remediation) out.add(fr.remediation.skillId);
  }
  return out;
}

function plan(s: Session, f: Frame, env: Env) {
  const rem = f.remediation!;
  const content = env.content;
  const p = planDetour({
    skillId: rem.skillId, tags: rem.tags, onStack: stackSkills(s), excluded: new Set([...rem.probed, ...rem.detoured]), studentClass: s.studentClass,
    hasContent: (id) => hasRemediationContent(content, id),
    strength: (id) => (s.learned.includes(id) ? 10 : 0) + (env.strength?.(id) ?? 0),
    isIndependent: (id) => independentInSession(s, id) || (env.strength?.(id) ?? 0) >= 3,
  });
  if (p.kind === "class-ahead") {
    rem.stage = "done";
    f.step = { kind: "worked", itemId: rem.itemId, reason: "class-ahead", then: "continue", aheadSkillId: p.skillId };
    return;
  }
  const max = cfgOf(env).diagnostic.maxProbesBeforeDetour;
  if (p.kind === "none" || rem.detoured.length >= cfgOf(env).detour.maxSiblingDetoursPerSuspendedQuestion) {
    rem.stage = "done";
    f.step = { kind: "worked", itemId: rem.itemId, reason: p.kind === "none" && p.reason === "no-content" ? "no-content" : "guided", then: "continue" };
    return;
  }
  rem.candidates = p.candidates.slice(0, max).map((c) => c.skillId);
  rem.stage = "probing";
  probe(s, f, rem.candidates[0]!, env);
}

function probe(s: Session, f: Frame, skillId: string, env: Env) {
  const cfg = cfgOf(env);
  const pick = pickTemplate(s, env, skillId, cfg.diagnostic.probeDifficulty, { allowRepeat: true, salt: `probe${skillId}` })!;
  newItem(s, f, pick.t, "probe", env, { repeat: pick.repeat });
}

function pushDetour(s: Session, f: Frame, target: string, env: Env) {
  const rem = f.remediation!;
  if (f.depth + 1 > cfgOf(env).detour.maxDepth) {
    f.step = { kind: "stuck", skillId: target, reason: "depth" };
    return;
  }
  rem.detoured.push(target);
  rem.stage = "detour";
  f.step = { kind: "suspended" };
  const implicated = rem.tags;
  s.frames.push({
    id: `f${s.counter + 1}x${s.frames.length}`, mode: isFoundation(target) ? "foundation" : "detour", depth: f.depth + 1, skillId: target, items: [],
    step: { kind: "detour-intro" }, difficulty: "easy", remediation: null, reason: { fromSkill: rem.skillId, tags: implicated },
    visit: 1, roundStart: 0, lessonRepeatsUsed: 0, tryAgainUsed: 0,
  });
  s.counter += 1;
}

const lessonOf = (env: Env, skillId: string | null) => (skillId ? env.content.lessons.find((l) => l.skillId === skillId) : undefined);

/** Next step inside the top frame once nothing is pending. */
function nextInFrame(s: Session, env: Env) {
  const f = topFrame(s);
  const cfg = cfgOf(env);
  if (f.mode === "main") { nextMain(s, env); return; }
  // the frame goal counts its own practice questions; return questions are learning progress only (docs/02 Journey 2)
  const round = f.items.slice(f.roundStart).filter((i) => i.outcome && i.role === f.mode);
  const indep = round.filter((i) => i.outcome === "independent").length;
  if (f.mode === "detour") {
    const mm = cfg.detour.miniMastery;
    const last = round[round.length - 1];
    if (round.length >= mm.questions && indep >= mm.minIndependentCorrect && (!mm.lastMustBeIndependent || last?.outcome === "independent")) { popLearned(s, env); return; }
    if (round.length >= mm.maxQuestions) { f.step = { kind: "stuck", skillId: f.skillId!, reason: "mini-mastery" }; return; }
    nextFrameQuestion(s, f, env);
    return;
  }
  // foundation: two of three practice questions independent; one micro-lesson repeat per visit
  const fc = cfg.foundation;
  if (indep >= fc.minIndependentCorrect) { popLearned(s, env); return; }
  const left = fc.practiceQuestions - round.length;
  if (left <= 0 || indep + left < fc.minIndependentCorrect) {
    const lesson = lessonOf(env, f.skillId);
    if (lesson && f.lessonRepeatsUsed < fc.maxMicroLessonRepeatsPerVisit) {
      f.lessonRepeatsUsed += 1;
      f.roundStart = f.items.length;
      f.step = { kind: "lesson", lessonId: lesson.id, variant: lesson.hasAlternate ? "alternate" : "main" };
      return;
    }
    f.step = { kind: "stuck", skillId: f.skillId!, reason: "foundation" };
    return;
  }
  nextFrameQuestion(s, f, env);
}

function nextFrameQuestion(s: Session, f: Frame, env: Env) {
  const role: Role = f.mode === "foundation" ? "foundation" : "detour";
  const order: Difficulty[] = f.mode === "foundation" ? ["easy", "medium"] : f.difficulty === "easy" ? ["easy", "medium"] : ["medium", "easy"];
  for (const allowRepeat of [false, true]) for (const d of order) {
    const pick = pickTemplate(s, env, f.skillId!, d, { allowRepeat, salt: `${f.id}:${f.items.length}` });
    if (pick) { newItem(s, f, pick.t, role, env, { repeat: pick.repeat }); return; }
  }
  f.step = { kind: "stuck", skillId: f.skillId!, reason: f.mode === "foundation" ? "foundation" : "mini-mastery" };
}

function popLearned(s: Session, env: Env) {
  const child = s.frames.pop()!;
  if (child.skillId && !s.learned.includes(child.skillId)) s.learned.push(child.skillId);
  if (child.skillId) resolveGapsBySkill(s, child.skillId, env);
  const parent = topFrame(s);
  const rem = parent.remediation!;
  rem.stage = "returning";
  parent.step = { kind: "worked", itemId: rem.itemId, reason: "return", then: "return-question" };
}

function resolveGapsBySkill(s: Session, skillId: string, env: Env) {
  for (const g of s.gaps) if (!g.resolvedAt && g.skillId === skillId) g.resolvedAt = nowOf(env);
}
function resolveGapsFor(s: Session, forSkill: string, env: Env) {
  for (const g of s.gaps) if (!g.resolvedAt && g.forSkill === forSkill) g.resolvedAt = nowOf(env);
}

// ------------------------------------------------------------------ continuing from explanation screens

/** Move on from a detour introduction, a lesson or a worked solution. */
export function continueStep(s0: Session, env: Env): Session {
  const s = structuredClone(s0);
  const f = topFrame(s);
  const st = f.step;
  s.updatedAt = nowOf(env);
  if (st.kind === "detour-intro") {
    const lesson = lessonOf(env, f.skillId);
    if (lesson) f.step = { kind: "lesson", lessonId: lesson.id, variant: "main" };
    else nextFrameQuestion(s, f, env);
  } else if (st.kind === "lesson") {
    f.roundStart = f.items.length;
    nextFrameQuestion(s, f, env);
  } else if (st.kind === "worked") {
    if (st.then === "return-question") {
      const orig = f.items.find((i) => i.id === st.itemId)!;
      const t = env.content.templates.find((x) => x.id === orig.templateId) ?? env.content.templates.find((x) => x.skillId === orig.skillId && x.difficulty === orig.difficulty);
      if (!t) { f.remediation = null; nextInFrame(s, env); return s; }
      const it = newItem(s, f, t, "return", env, { returnOf: orig.id });
      if (it.seed === orig.seed) it.seed = hashSeed(it.seed, "fresh");
    } else {
      if (f.remediation && f.remediation.stage !== "returning") f.remediation.stage = "done";
      if (f.mode === "main") nextMain(s, env); else nextInFrame(s, env);
    }
  } else return s0;
  return s;
}

// ------------------------------------------------------------------ Stuck, pause and resume

export type StuckChoice = "back" | "pause" | "retry";

export function canRetry(s: Session, env: Env): boolean {
  const f = topFrame(s);
  return f.step.kind === "stuck" && f.step.reason !== "depth" && f.tryAgainUsed < cfgOf(env).stuck.tryAgainPerVisit;
}

export function chooseStuck(s0: Session, choice: StuckChoice, env: Env): Session {
  const f0 = topFrame(s0);
  if (f0.step.kind !== "stuck") return s0;
  const s = structuredClone(s0);
  const f = topFrame(s);
  const st = f.step as Extract<Step, { kind: "stuck" }>;
  const now = nowOf(env);
  s.updatedAt = now;
  if (choice === "pause") { s.status = "paused"; return s; }
  if (choice === "retry") {
    if (!canRetry(s0, env)) return s0;
    f.tryAgainUsed += 1;
    f.roundStart = f.items.length;
    const lesson = lessonOf(env, f.skillId);
    if (lesson) f.step = { kind: "lesson", lessonId: lesson.id, variant: "main" };
    else nextFrameQuestion(s, f, env);
    return s;
  }
  // back to the question anyway: the gap stays open and selection avoids what depends on it
  if (st.reason === "depth") {
    const rem = f.remediation!;
    openGap(s, st.skillId, rem.skillId, now);
    rem.stage = "done";
    f.step = { kind: "worked", itemId: rem.itemId, reason: "back-anyway", then: "continue" };
    return s;
  }
  const child = s.frames.pop()!;
  const parent = topFrame(s);
  const rem = parent.remediation!;
  openGap(s, child.skillId!, rem.skillId, now);
  rem.stage = "done";
  if (parent.mode === "main") parent.difficulty = stepDown(parent.difficulty, cfgOf(env).difficulty.mainQuestionFloor);
  parent.step = { kind: "worked", itemId: rem.itemId, reason: "back-anyway", then: "continue" };
  return s;
}

function openGap(s: Session, skillId: string, forSkill: string, now: number) {
  if (s.gaps.some((g) => !g.resolvedAt && g.skillId === skillId && g.forSkill === forSkill)) return;
  s.gaps.push({ skillId, forSkill, kind: isFoundation(skillId) ? "foundation-gap" : "prerequisite-gap", openedAt: now });
}

export function pauseSession(s0: Session, env: Env): Session {
  if (s0.status !== "active") return s0;
  return { ...structuredClone(s0), status: "paused", updatedAt: nowOf(env) };
}

/** Resume a paused session at its exact frame. A paused Stuck frame starts a new visit with a short recap. */
export function resumeSession(s0: Session, env: Env): Session {
  if (s0.status !== "paused") return s0;
  const s = structuredClone(s0);
  s.status = "active";
  s.updatedAt = nowOf(env);
  const f = topFrame(s);
  if (f.step.kind === "stuck" && f.step.reason !== "depth" && f.mode !== "main") {
    f.visit += 1;
    f.lessonRepeatsUsed = 0;
    f.tryAgainUsed = 0;
    f.roundStart = f.items.length;
    const lesson = lessonOf(env, f.skillId);
    if (lesson) f.step = { kind: "lesson", lessonId: lesson.id, variant: lesson.hasRecap ? "recap" : "main" };
    else nextFrameQuestion(s, f, env);
  }
  return s;
}

/** Save the unfinished state of the question on screen (answer, tries, hints, visual). */
export function updateLive(s0: Session, itemId: string, live: Live, env: Env): Session {
  const cur = currentItem(s0);
  if (!cur || cur.id !== itemId || cur.outcome) return s0;
  const s = structuredClone(s0);
  currentItem(s)!.live = live;
  s.updatedAt = nowOf(env);
  return s;
}

/** After a content update: replace a retired template on the question in progress with one of the same skill and difficulty. */
export function reconcile(s0: Session, env: Env): { session: Session; substituted: boolean } {
  const cur = currentItem(s0);
  if (!cur || env.content.templates.some((t) => t.id === cur.templateId)) return { session: s0, substituted: false };
  const s = structuredClone(s0);
  const it = currentItem(s)!;
  const alt = env.content.templates.find((t) => t.skillId === it.skillId && t.difficulty === it.difficulty) ?? env.content.templates.find((t) => t.skillId === it.skillId);
  if (!alt) return { session: s0, substituted: false };
  Object.assign(it, { substitutedFor: it.templateId, templateId: alt.id, version: alt.version, difficulty: alt.difficulty, eligible: isEligible(s, alt) });
  delete it.live;
  return { session: s, substituted: true };
}

// ------------------------------------------------------------------ views for the UI

export interface Crumb { skillId: string; mode: Frame["mode"]; paused: boolean }
/** Chapter › suspended skill › detour skill …, for the breadcrumb and the route back. */
export function breadcrumb(s: Session): Crumb[] {
  const out: Crumb[] = [];
  s.frames.forEach((f, i) => {
    const top = i === s.frames.length - 1;
    if (f.mode === "main") {
      const it = f.remediation ? f.items.find((x) => x.id === f.remediation!.itemId) : currentItem(s) && top ? currentItem(s) : undefined;
      if (it) out.push({ skillId: it.skillId, mode: "main", paused: !top });
    } else {
      out.push({ skillId: f.skillId!, mode: f.mode, paused: !top });
    }
  });
  return out;
}

/** The chain from the interrupted skill to the detour target, for the "why this detour" animation. */
export function detourPath(from: string, to: string): string[] {
  const path: string[] = [from];
  let cur = from;
  for (let guard = 0; guard < 8 && cur !== to; guard++) {
    const next = prereqsOf(cur).find((p) => p === to || buildsOn(p, to));
    if (!next) break;
    path.push(next);
    cur = next;
  }
  if (path[path.length - 1] !== to) path.push(to);
  return path;
}

export const isClassAhead = (skillId: string, studentClass: 11 | 12) => (classOf(skillId) ?? 0) > studentClass;
