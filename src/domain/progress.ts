// Progress records and pure derivations: chapter/skill states, recommendations, panel stats.
import { z } from "zod";
import { CONFIG, levelIndex } from "./config";
import { chapters, chaptersInView, directPrereqChapters, directSuccessorChapters, getChapter, skillsOfChapter, viewIdOf, VIEWS, type ViewId } from "./curriculum";
import { layoutView } from "./roadmapLayout";

export const Difficulty = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof Difficulty>;
export const Outcome = z.enum(["independent", "assisted", "exhausted"]);
export type Outcome = z.infer<typeof Outcome>;

export const AttemptRecord = z.object({
  id: z.string(),
  at: z.number(), // epoch ms
  chapterId: z.string(),
  skillId: z.string(),
  templateId: z.string(), // "<id>@<version>"
  seed: z.number(),
  difficulty: Difficulty,
  kind: z.enum(["diagnostic", "main", "remediation"]),
  /** Phase 3: the session this answer belongs to and its role there (main, diagnostic, probe, detour, foundation, return) */
  sessionId: z.string().optional(),
  role: z.enum(["main", "diagnostic", "probe", "detour", "foundation", "return"]).optional(),
  /** counted toward the session's mastery window (an independent main answer on eligible content) */
  countedForMastery: z.boolean().optional(),
  outcome: Outcome,
  attemptsUsed: z.number().int().min(1).max(3),
  hintsUsed: z.number().int().min(0),
  /** Phase 5: tutor explanations or demonstrations presented before the answer (optional for older records) */
  tutorAssists: z.number().int().min(0).optional(),
  tags: z.array(z.string()),
  // Phase 2 additions (optional, so Phase 1 records still load)
  format: z.string().optional(),
  /** true only when the template was human-approved and unchanged since; in-review content never counts */
  countsTowardMastery: z.boolean().optional(),
  /** the student's own written explanation: advisory only, never scored and never used for mastery */
  reasoning: z.object({ text: z.string().max(4000), selfCheck: z.array(z.number().int()), scored: z.literal(false) }).optional(),
});
export type AttemptRecord = z.infer<typeof AttemptRecord>;

export const FlashcardRecord = z.object({
  id: z.string(), // `${chapterId}:${tag}`
  chapterId: z.string(),
  skillId: z.string(),
  tag: z.string(),
  front: z.string(),
  back: z.string(),
  box: z.number().int().min(1).max(5),
  dueAt: z.number(),
  createdAt: z.number(),
});
export type FlashcardRecord = z.infer<typeof FlashcardRecord>;

export const ChapterRecord = z.object({
  chapterId: z.string(),
  mastered: z.boolean(),
  masteredAt: z.number().optional(),
  /** Phase 3: how the latest result was reached */
  sessionId: z.string().optional(),
  lastResult: z.enum(["mastered", "notYet"]).optional(),
  lastResultAt: z.number().optional(),
  sessionsCompleted: z.number().int().min(0).optional(),
  /** "reviewer-preview" records come from sessions where in-review content was allowed to count; they never show as mastered to students */
  basis: z.enum(["approved", "reviewer-preview"]).optional(),
});
export type ChapterRecord = z.infer<typeof ChapterRecord>;

export interface ProgressSnapshot {
  attempts: AttemptRecord[];
  flashcards: FlashcardRecord[];
  chapterRecords: ChapterRecord[];
  /** adaptive session records (src/engine/session.ts); typed loosely here to keep the domain layer engine-free */
  sessions: { id: string; chapterId: string; status: string; updatedAt: number; preview?: boolean }[];
}
export const emptySnapshot = (): ProgressSnapshot => ({ attempts: [], flashcards: [], chapterRecords: [], sessions: [] });

/** Reviewer preview (a labelled mode for walking through journeys before content approval) is on in this browser. */
let previewVisible = false;
export const setPreviewVisible = (on: boolean) => { previewVisible = on; };
export const isPreviewVisible = () => previewVisible;

/** A chapter record that counts as real mastery here: approved basis, or a preview record while preview is shown. */
export const masteredRecord = (r: ChapterRecord) => r.mastered && (r.basis !== "reviewer-preview" || previewVisible);

export type ChapterState = "unvisited" | "learning" | "needs-review" | "mastered";
export type SkillState = "unseen" | "practising" | "needs-review" | "independent";

export const STATE_LABEL: Record<ChapterState, string> = {
  unvisited: "Unvisited",
  learning: "Learning",
  "needs-review": "Needs review",
  mastered: "Mastered",
};

const DAY = 86_400_000;
/** Leitner intervals per box (config flashcards.intervalsDays). */
export const LEITNER_DAYS: readonly number[] = CONFIG.flashcards.intervalsDays;
const BOXES = CONFIG.flashcards.leitnerBoxes;

export function skillState(skillId: string, attempts: AttemptRecord[]): SkillState {
  const mine = attempts.filter((a) => a.skillId === skillId).sort((a, b) => a.at - b.at);
  if (!mine.length) return "unseen";
  const last = mine[mine.length - 1]!;
  if (last.outcome === "exhausted") return "needs-review";
  // docs/04: independent = ≥ 2 independent correct at medium or above within the last 4 attempts (config skillState)
  // only attempts on human-approved content can show independence (in-review questions never count)
  const rule = CONFIG.skillState.independentWhen;
  const recent = mine.slice(-rule.lookback).filter((a) => a.outcome === "independent" && levelIndex(a.difficulty) >= levelIndex(rule.minDifficulty) && a.countsTowardMastery === true);
  return recent.length >= rule.independentCorrect ? "independent" : "practising";
}

export function chapterState(chapterId: string, p: ProgressSnapshot, now: number): ChapterState {
  if (p.chapterRecords.some((r) => r.chapterId === chapterId && masteredRecord(r))) return "mastered";
  const attempts = p.attempts.filter((a) => a.chapterId === chapterId);
  if (!attempts.length) return "unvisited";
  const skillIds = new Set(attempts.map((a) => a.skillId));
  const exhausted = [...skillIds].some((s) => skillState(s, attempts) === "needs-review");
  const due = p.flashcards.some((f) => f.chapterId === chapterId && f.dueAt <= now);
  return exhausted || due ? "needs-review" : "learning";
}

/** Share of the chapter's skills with any recorded evidence (Phase 1 meaning of the progress underline). */
export function chapterProgress(chapterId: string, p: ProgressSnapshot): { touched: number; total: number; fraction: number } {
  const all = skillsOfChapter(chapterId);
  const touched = all.filter((s) => p.attempts.some((a) => a.skillId === s.id)).length;
  return { touched, total: all.length, fraction: all.length ? touched / all.length : 0 };
}

export type Recommendation = "start-here" | "recommended" | null;
/**
 * - "recommended": unvisited, has prerequisite chapters, and all of them are mastered.
 * - "start-here": unvisited, no prerequisite inside its own view, and nothing in this view has been tried yet.
 * Nothing is ever locked (U-02); these are highlights only.
 */
export function recommendation(chapterId: string, p: ProgressSnapshot, now: number): Recommendation {
  if (chapterState(chapterId, p, now) !== "unvisited") return null;
  const prereqs = directPrereqChapters(chapterId);
  if (prereqs.length && prereqs.every((c) => chapterState(c, p, now) === "mastered")) return "recommended";
  const view = viewIdOf(getChapter(chapterId));
  const viewTouched = chaptersInView(view).some((c) => chapterState(c.id, p, now) !== "unvisited");
  if (!viewTouched && layoutView(view).entryChapters.includes(chapterId)) return "start-here";
  return null;
}

export interface PanelStats {
  byDifficulty: Record<Difficulty, { attempted: number; firstTry: number }>;
  totalAttempted: number;
  mastered: { total: number; byView: Record<ViewId, number> };
  reviews: { due: number; upcoming: number; nextDueAt: number | null };
  activity: { day: string; count: number }[]; // last 14 local days, oldest first
  last7: number;
}

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export function panelStats(p: ProgressSnapshot, now: number): PanelStats {
  const byDifficulty = { easy: { attempted: 0, firstTry: 0 }, medium: { attempted: 0, firstTry: 0 }, hard: { attempted: 0, firstTry: 0 } };
  for (const a of p.attempts) {
    byDifficulty[a.difficulty].attempted++;
    if (a.outcome === "independent") byDifficulty[a.difficulty].firstTry++;
  }
  const byView = Object.fromEntries(VIEWS.map((v) => [v.id, 0])) as Record<ViewId, number>;
  let total = 0;
  for (const c of chapters)
    if (chapterState(c.id, p, now) === "mastered") {
      total++;
      byView[viewIdOf(c)]++;
    }
  const due = p.flashcards.filter((f) => f.dueAt <= now);
  const upcoming = p.flashcards.filter((f) => f.dueAt > now);
  const counts = new Map<string, number>();
  for (const a of p.attempts) counts.set(dayKey(a.at), (counts.get(dayKey(a.at)) ?? 0) + 1);
  const activity: PanelStats["activity"] = [];
  const midnight = new Date(now);
  midnight.setHours(12, 0, 0, 0); // noon avoids DST edge cases when stepping days
  for (let i = 13; i >= 0; i--) {
    const k = dayKey(midnight.getTime() - i * DAY);
    activity.push({ day: k, count: counts.get(k) ?? 0 });
  }
  return {
    byDifficulty,
    totalAttempted: p.attempts.length,
    mastered: { total, byView },
    reviews: { due: due.length, upcoming: upcoming.length, nextDueAt: upcoming.length ? Math.min(...upcoming.map((f) => f.dueAt)) : null },
    activity,
    last7: activity.slice(-7).reduce((s, d) => s + d.count, 0),
  };
}

/** Leitner scheduling for a reviewed card. */
export function reviewCard(card: FlashcardRecord, knewIt: boolean, now: number): FlashcardRecord {
  const box = knewIt ? Math.min(BOXES, card.box + 1) : 1;
  return { ...card, box, dueAt: now + LEITNER_DAYS[box - 1]! * DAY };
}

export function newFlashcard(args: { chapterId: string; skillId: string; tag: string; front: string; back: string }, now: number): FlashcardRecord {
  return { id: `${args.chapterId}:${args.tag}`, ...args, box: 1, dueAt: now + LEITNER_DAYS[0]! * DAY, createdAt: now };
}

export interface Successor { chapterId: string; label: "Recommended" | "Next after"; missing: string[]; share: number }
/**
 * Chapters a mastered chapter leads to (docs/04 "Successor recommendation"), ranked by the share of
 * their prerequisite chapters already mastered, then same subject, then the student's class. The top
 * one or two fully-ready chapters are "Recommended"; the rest name what they still need. Nothing is locked.
 */
export function successorRecommendations(chapterId: string, p: ProgressSnapshot, now: number, studentClass: 11 | 12 = 11): Successor[] {
  const from = getChapter(chapterId);
  const ranked = directSuccessorChapters(chapterId).map((id) => {
    const pre = directPrereqChapters(id);
    const missing = pre.filter((c) => chapterState(c, p, now) !== "mastered");
    const c = getChapter(id);
    return { chapterId: id, missing, share: pre.length ? (pre.length - missing.length) / pre.length : 1, same: c.subject === from.subject ? 1 : 0, cls: c.class <= studentClass ? 1 : 0 };
  }).sort((a, b) => b.share - a.share || b.same - a.same || b.cls - a.cls || a.chapterId.localeCompare(b.chapterId));
  let recommended = 0;
  return ranked.map((r) => {
    const top = r.missing.length === 0 && recommended < 2;
    if (top) recommended++;
    return { chapterId: r.chapterId, label: top ? "Recommended" : "Next after", missing: r.missing, share: r.share };
  });
}
