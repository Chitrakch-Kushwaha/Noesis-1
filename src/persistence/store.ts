"use client";
// One shared progress store for the whole app (useSyncExternalStore). Every write goes to the repo first.
import { useSyncExternalStore } from "react";
import { emptySnapshot, newFlashcard, reviewCard, type AttemptRecord, type ChapterRecord, type FlashcardRecord, type ProgressSnapshot } from "@/src/domain/progress";
import type { Session } from "@/src/engine/session";
import { allSessions, ExportFile, openRepo, type ProgressRepo } from "./db";

interface StoreState {
  ready: boolean;
  persistent: boolean;
  snapshot: ProgressSnapshot;
}

let state: StoreState = { ready: false, persistent: true, snapshot: emptySnapshot() };
let repo: ProgressRepo | null = null;
let opening: Promise<ProgressRepo> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function getRepo() {
  if (repo) return repo;
  opening ??= openRepo();
  repo = await opening;
  return repo;
}

async function refresh() {
  const r = await getRepo();
  state = { ready: true, persistent: r.persistent, snapshot: await r.load() };
  emit();
}

export const progressStore = {
  subscribe(l: () => void) {
    listeners.add(l);
    if (!state.ready && listeners.size === 1) void refresh();
    return () => listeners.delete(l);
  },
  get: () => state,
  refresh,
  async recordAttempt(a: AttemptRecord, cards: { tag: string; front: string; back: string }[]) {
    const r = await getRepo();
    await r.addAttempt(a);
    if (cards.length) {
      const now = a.at;
      await r.putFlashcards(cards.map((c) => newFlashcard({ chapterId: a.chapterId, skillId: a.skillId, ...c }, now)));
    }
    await refresh();
  },
  /** Update an attempt already saved (the student's optional explanation). Never changes its outcome. */
  async updateReasoning(a: AttemptRecord, reasoning: NonNullable<AttemptRecord["reasoning"]>) {
    const r = await getRepo();
    await r.addAttempt({ ...a, reasoning });
    await refresh();
  },
  async getSession(id: string): Promise<Session | undefined> {
    return (await getRepo()).getSession(id);
  },
  /** The newest unfinished (active or paused) session for a chapter. */
  async openSessionFor(chapterId: string): Promise<Session | undefined> {
    const r = await getRepo();
    const list = (await r.load()).sessions.filter((x) => x.chapterId === chapterId && (x.status === "active" || x.status === "paused")).sort((a, b) => b.updatedAt - a.updatedAt);
    return list[0] ? r.getSession(list[0].id) : undefined;
  },
  /**
   * Persist a session transition together with what it produced. Resolves with the saved session (its
   * `rev` bumped) only after the write has succeeded; rejects, writing nothing, if the write fails or a
   * newer copy exists. The UI shows "Saved" only after this resolves.
   */
  async commitSession(next: Session, savedRev: number, extra: { attempt?: AttemptRecord; cards?: { tag: string; front: string; back: string; skillId: string }[]; chapter?: ChapterRecord } = {}): Promise<Session> {
    const r = await getRepo();
    const session = { ...next, rev: savedRev + 1 };
    const now = extra.attempt?.at ?? next.updatedAt;
    const flashcards = (extra.cards ?? []).map((c) => newFlashcard({ chapterId: next.chapterId, skillId: c.skillId, tag: c.tag, front: c.front, back: c.back }, now));
    await r.commit({ session, attempt: extra.attempt, flashcards, chapter: extra.chapter });
    await refresh();
    return session;
  },
  async review(card: FlashcardRecord, knewIt: boolean, now = Date.now()) {
    const r = await getRepo();
    await r.putFlashcards([reviewCard(card, knewIt, now)]);
    await refresh();
  },
  async exportJson(): Promise<string> {
    const s = (await getRepo()).load();
    const snap = await s;
    const file: ExportFile = { app: "noesis", schema: 2, exportedAt: new Date().toISOString(), attempts: snap.attempts, flashcards: snap.flashcards, chapters: snap.chapterRecords, sessions: await allSessions(await getRepo()) };
    return JSON.stringify(file, null, 2);
  },
  async importJson(text: string) {
    const f = ExportFile.parse(JSON.parse(text));
    await (await getRepo()).replaceAll({ attempts: f.attempts, flashcards: f.flashcards, chapterRecords: f.chapters, sessions: [], fullSessions: f.sessions });
    await refresh();
  },
  async eraseAll() {
    await (await getRepo()).replaceAll(emptySnapshot());
    await refresh();
  },
};

const serverState: StoreState = { ready: false, persistent: true, snapshot: emptySnapshot() };
export function useProgress(): StoreState {
  return useSyncExternalStore(progressStore.subscribe, progressStore.get, () => serverState);
}
