import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { MemoryRepo, openRepo, StaleSessionError } from "@/src/persistence/db";
import { SessionRecord } from "@/src/engine/session";
import type { AttemptRecord } from "@/src/domain/progress";

const a: AttemptRecord = {
  id: "x1", at: 1, chapterId: "kin", skillId: "kin.acceleration", templateId: "t@1", seed: 9, difficulty: "medium",
  kind: "diagnostic", outcome: "exhausted", attemptsUsed: 3, hintsUsed: 1, tags: ["area-uses-final-velocity"],
};

describe("IndexedDB repository", () => {
  it("persists attempts, flashcards and chapter records across re-opening", async () => {
    const r1 = await openRepo();
    expect(r1.persistent).toBe(true);
    await r1.addAttempt(a);
    await r1.putFlashcards([{ id: "kin:t", chapterId: "kin", skillId: "kin.acceleration", tag: "t", front: "f", back: "b", box: 1, dueAt: 5, createdAt: 1 }]);
    await r1.putChapter({ chapterId: "kin", mastered: false });
    const r2 = await openRepo();
    const s = await r2.load();
    expect(s.attempts).toEqual([a]);
    expect(s.flashcards).toHaveLength(1);
    expect(s.chapterRecords).toEqual([{ chapterId: "kin", mastered: false }]);
    await r2.replaceAll({ attempts: [], flashcards: [], chapterRecords: [], sessions: [] });
    expect((await r2.load()).attempts).toEqual([]);
  });
  it("rejects malformed records", async () => {
    const r = await openRepo();
    await expect(r.addAttempt({ ...a, outcome: "great" as never })).rejects.toThrow();
  });
  it("falls back to memory when storage is unavailable", async () => {
    const m = new MemoryRepo();
    expect(m.persistent).toBe(false);
    await m.addAttempt(a);
    expect((await m.load()).attempts).toHaveLength(1);
  });
});

describe("session commits (Phase 3)", () => {
  const session = (rev: number) => SessionRecord.parse({
    id: "ses_t", chapterId: "lom", status: "active", seed: 7, startedAt: 1, updatedAt: 2, studentClass: 11,
    frames: [{ id: "f0", mode: "main", depth: 0, skillId: null, items: [], step: { kind: "suspended" }, difficulty: "medium" }], counter: 0, rev,
  });
  const attempt: AttemptRecord = { ...a, id: "ses_t:i1", sessionId: "ses_t", role: "main", kind: "main", outcome: "independent", attemptsUsed: 1, hintsUsed: 0, tags: [] };

  it("writes the session, its attempt, flashcards and chapter record together, and a retried save never duplicates the attempt", async () => {
    for (const r of [await openRepo(), new MemoryRepo()]) {
      await r.replaceAll({ attempts: [], flashcards: [], chapterRecords: [], sessions: [] });
      await r.commit({ session: session(1), attempt, flashcards: [{ id: "lom:t", chapterId: "lom", skillId: "lom.fbd", tag: "t", front: "f", back: "b", box: 1, dueAt: 5, createdAt: 1 }], chapter: { chapterId: "lom", mastered: false, lastResult: "notYet" } });
      await r.commit({ session: session(2), attempt });
      const snap = await r.load();
      expect(snap.attempts.filter((x) => x.id === "ses_t:i1")).toHaveLength(1);
      expect(snap.sessions).toEqual([{ id: "ses_t", chapterId: "lom", status: "active", updatedAt: 2, preview: false }]);
      expect((await r.getSession("ses_t"))!.rev).toBe(2);
      expect(snap.chapterRecords[0]!.lastResult).toBe("notYet");
    }
  });
  it("refuses a stale copy (another tab saved newer progress) and writes nothing", async () => {
    const r = await openRepo();
    await r.replaceAll({ attempts: [], flashcards: [], chapterRecords: [], sessions: [] });
    await r.commit({ session: session(3) });
    await expect(r.commit({ session: session(3), attempt })).rejects.toBeInstanceOf(StaleSessionError);
    expect((await r.load()).attempts).toEqual([]);
  });
  it("an invalid session record is rejected before anything is written", async () => {
    const r = await openRepo();
    await r.replaceAll({ attempts: [], flashcards: [], chapterRecords: [], sessions: [] });
    await expect(r.commit({ session: { ...session(1), status: "great" } as never, attempt })).rejects.toThrow();
    expect((await r.load()).attempts).toEqual([]);
  });
});
