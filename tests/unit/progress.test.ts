import { describe, expect, it } from "vitest";
import {
  chapterProgress,
  chapterState,
  emptySnapshot,
  newFlashcard,
  panelStats,
  recommendation,
  reviewCard,
  skillState,
  type AttemptRecord,
  type ProgressSnapshot,
} from "@/src/domain/progress";

const NOW = new Date(2026, 9, 27, 18, 0).getTime();
const DAY = 86_400_000;
let n = 0;
const att = (p: Partial<AttemptRecord>): AttemptRecord => ({
  id: `a${n++}`, at: NOW - DAY, chapterId: "kin", skillId: "kin.acceleration", templateId: "t@1", seed: 1,
  difficulty: "medium", kind: "diagnostic", outcome: "independent", attemptsUsed: 1, hintsUsed: 0, tags: [], ...p,
});
const snap = (p: Partial<ProgressSnapshot>): ProgressSnapshot => ({ ...emptySnapshot(), ...p });

describe("chapter states", () => {
  it("unvisited → learning → needs review → mastered", () => {
    expect(chapterState("kin", emptySnapshot(), NOW)).toBe("unvisited");
    expect(chapterState("kin", snap({ attempts: [att({})] }), NOW)).toBe("learning");
    expect(chapterState("kin", snap({ attempts: [att({ outcome: "exhausted", attemptsUsed: 3 })] }), NOW)).toBe("needs-review");
    expect(chapterState("kin", snap({ attempts: [att({})], chapterRecords: [{ chapterId: "kin", mastered: true }] }), NOW)).toBe("mastered");
  });
  it("clears 'needs review' once the skill's latest attempt is not exhausted and nothing is due", () => {
    const a = [att({ outcome: "exhausted", at: NOW - 2 * DAY }), att({ outcome: "assisted", at: NOW - DAY })];
    expect(chapterState("kin", snap({ attempts: a }), NOW)).toBe("learning");
  });
  it("shows 'needs review' when a flashcard for the chapter is due", () => {
    const card = { ...newFlashcard({ chapterId: "kin", skillId: "kin.acceleration", tag: "x", front: "f", back: "b" }, NOW - 2 * DAY) };
    expect(chapterState("kin", snap({ attempts: [att({})], flashcards: [card] }), NOW)).toBe("needs-review");
  });
  it("measures progress as skills with evidence", () => {
    expect(chapterProgress("kin", snap({ attempts: [att({}), att({ skillId: "kin.suvat" })] }))).toMatchObject({ touched: 2, total: 7 });
  });
});

describe("skill states", () => {
  it("independent needs two unaided medium+ answers in the last four", () => {
    const ok = { countsTowardMastery: true };
    expect(skillState("kin.acceleration", [att(ok)])).toBe("practising");
    expect(skillState("kin.acceleration", [att(ok), att({ ...ok, at: NOW })])).toBe("independent");
    expect(skillState("kin.acceleration", [att(ok), att({ ...ok, at: NOW, difficulty: "easy" })])).toBe("practising");
  });
  it("answers to questions that are not human-approved never show independence", () => {
    expect(skillState("kin.acceleration", [att({}), att({ at: NOW })])).toBe("practising");
    expect(skillState("kin.acceleration", [att({ countsTowardMastery: false }), att({ at: NOW, countsTowardMastery: false })])).toBe("practising");
  });
});

describe("recommendations (highlights only; nothing locks)", () => {
  it("marks view entry chapters as a good place to start until the view is touched", () => {
    expect(recommendation("kin", emptySnapshot(), NOW)).toBe("start-here");
    expect(recommendation("mip", emptySnapshot(), NOW)).toBeNull();
    expect(recommendation("ecf", emptySnapshot(), NOW)).toBe("start-here"); // no prerequisite inside Class 12 Physics
    expect(recommendation("opt", emptySnapshot(), NOW)).toBe("start-here");
    expect(recommendation("opt", snap({ attempts: [att({ chapterId: "ecf", skillId: "ecf.field" })] }), NOW)).toBeNull();
  });
  it("recommends a chapter once all its prerequisite chapters are mastered", () => {
    const s = snap({ chapterRecords: [{ chapterId: "kin", mastered: true }] });
    expect(recommendation("mip", s, NOW)).toBe("recommended");
    expect(recommendation("lom", s, NOW)).toBeNull(); // also needs mip
  });
});

describe("panel stats", () => {
  it("counts by difficulty, first tries, reviews and activity", () => {
    const card = newFlashcard({ chapterId: "kin", skillId: "kin.acceleration", tag: "x", front: "f", back: "b" }, NOW);
    const s = panelStats(
      snap({
        attempts: [att({ at: NOW }), att({ at: NOW, outcome: "assisted", attemptsUsed: 2 }), att({ at: NOW - 3 * DAY, difficulty: "hard" })],
        flashcards: [card, { ...card, id: "due", dueAt: NOW - 1 }],
        chapterRecords: [{ chapterId: "set", mastered: true }],
      }),
      NOW,
    );
    expect(s.byDifficulty.medium).toEqual({ attempted: 2, firstTry: 1 });
    expect(s.byDifficulty.hard).toEqual({ attempted: 1, firstTry: 1 });
    expect(s.mastered.total).toBe(1);
    expect(s.mastered.byView.maths11).toBe(1);
    expect(s.reviews).toMatchObject({ due: 1, upcoming: 1 });
    expect(s.activity).toHaveLength(14);
    expect(s.activity.at(-1)!.count).toBe(2);
    expect(s.last7).toBe(3);
  });
  it("schedules Leitner reviews", () => {
    const c = newFlashcard({ chapterId: "kin", skillId: "s", tag: "t", front: "f", back: "b" }, NOW);
    expect(c.dueAt).toBe(NOW + DAY);
    expect(reviewCard(c, true, NOW)).toMatchObject({ box: 2, dueAt: NOW + 2 * DAY });
    expect(reviewCard({ ...c, box: 4 }, false, NOW)).toMatchObject({ box: 1, dueAt: NOW + DAY });
  });
});
