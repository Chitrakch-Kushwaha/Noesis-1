// Browser-only progress storage (U-10, D-006): IndexedDB via Dexie, with an in-memory fallback.
import Dexie, { type Table } from "dexie";
import { z } from "zod";
import {
  AttemptRecord,
  ChapterRecord,
  emptySnapshot,
  FlashcardRecord,
  type ProgressSnapshot,
} from "@/src/domain/progress";
import { SessionRecord, type Session } from "@/src/engine/session";

class NoesisDB extends Dexie {
  attempts!: Table<AttemptRecord, string>;
  flashcards!: Table<FlashcardRecord, string>;
  chapters!: Table<ChapterRecord, string>;
  sessions!: Table<Session, string>;
  constructor() {
    super("noesis");
    this.version(1).stores({
      attempts: "id, at, chapterId, skillId",
      flashcards: "id, chapterId, dueAt",
      chapters: "chapterId",
    });
    // Phase 3: adaptive sessions with their persisted frame stack
    this.version(2).stores({ sessions: "id, chapterId, status, updatedAt" });
  }
}

export const ExportFile = z.object({
  app: z.literal("noesis"),
  schema: z.union([z.literal(1), z.literal(2)]),
  exportedAt: z.string(),
  attempts: z.array(AttemptRecord),
  flashcards: z.array(FlashcardRecord),
  chapters: z.array(ChapterRecord),
  sessions: z.array(SessionRecord).default([]),
});
export type ExportFile = z.infer<typeof ExportFile>;

/** A newer version of this session was saved (for example in another tab). Nothing was written. */
export class StaleSessionError extends Error {}

/** Everything one finished question changes, written together or not at all. */
export interface ItemCommit {
  session: Session;
  attempt?: AttemptRecord;
  flashcards?: FlashcardRecord[];
  chapter?: ChapterRecord;
}

export interface ProgressRepo {
  readonly persistent: boolean;
  load(): Promise<ProgressSnapshot>;
  addAttempt(a: AttemptRecord): Promise<void>;
  putFlashcards(cards: FlashcardRecord[]): Promise<void>;
  putChapter(r: ChapterRecord): Promise<void>;
  replaceAll(s: ProgressSnapshot & { fullSessions?: Session[] }): Promise<void>;
  getSession(id: string): Promise<Session | undefined>;
  /** Write a session (and what its last transition produced) atomically. Its `rev` must be the stored rev + 1. */
  commit(c: ItemCommit): Promise<void>;
}

const sessionSummary = (s: Session) => ({ id: s.id, chapterId: s.chapterId, status: s.status, updatedAt: s.updatedAt, preview: s.preview });

class DexieRepo implements ProgressRepo {
  readonly persistent = true;
  constructor(private db: NoesisDB) {}
  async load() {
    const [attempts, flashcards, chapterRecords, sessions] = await Promise.all([
      this.db.attempts.orderBy("at").toArray(),
      this.db.flashcards.toArray(),
      this.db.chapters.toArray(),
      this.db.sessions.toArray(),
    ]);
    return { attempts, flashcards, chapterRecords, sessions: sessions.map(sessionSummary) };
  }
  async addAttempt(a: AttemptRecord) {
    await this.db.attempts.put(AttemptRecord.parse(a));
  }
  async putFlashcards(cards: FlashcardRecord[]) {
    await this.db.flashcards.bulkPut(cards.map((c) => FlashcardRecord.parse(c)));
  }
  async putChapter(r: ChapterRecord) {
    await this.db.chapters.put(ChapterRecord.parse(r));
  }
  async getSession(id: string) {
    const s = await this.db.sessions.get(id);
    return s ? SessionRecord.parse(s) : undefined;
  }
  async commit(c: ItemCommit) {
    const session = SessionRecord.parse(c.session);
    const attempt = c.attempt ? AttemptRecord.parse(c.attempt) : undefined;
    const cards = (c.flashcards ?? []).map((x) => FlashcardRecord.parse(x));
    const chapter = c.chapter ? ChapterRecord.parse(c.chapter) : undefined;
    await this.db.transaction("rw", [this.db.sessions, this.db.attempts, this.db.flashcards, this.db.chapters], async () => {
      const prev = await this.db.sessions.get(session.id);
      if (prev && prev.rev >= session.rev) throw new StaleSessionError("A newer copy of this session is already saved.");
      await this.db.sessions.put(session);
      // the attempt id is derived from the session and item, so a retried save can never duplicate it
      if (attempt) await this.db.attempts.put(attempt);
      if (cards.length) await this.db.flashcards.bulkPut(cards);
      if (chapter) await this.db.chapters.put(chapter);
    });
  }
  async replaceAll(s: ProgressSnapshot & { fullSessions?: Session[] }) {
    await this.db.transaction("rw", [this.db.attempts, this.db.flashcards, this.db.chapters, this.db.sessions], async () => {
      await Promise.all([this.db.attempts.clear(), this.db.flashcards.clear(), this.db.chapters.clear(), this.db.sessions.clear()]);
      await this.db.attempts.bulkPut(s.attempts);
      await this.db.flashcards.bulkPut(s.flashcards);
      await this.db.chapters.bulkPut(s.chapterRecords);
      if (s.fullSessions) await this.db.sessions.bulkPut(s.fullSessions);
    });
  }
}

export class MemoryRepo implements ProgressRepo {
  readonly persistent = false;
  private s: ProgressSnapshot = emptySnapshot();
  private full = new Map<string, Session>();
  async load() {
    return { ...structuredClone(this.s), sessions: [...this.full.values()].map(sessionSummary) };
  }
  async addAttempt(a: AttemptRecord) {
    const r = AttemptRecord.parse(a);
    this.s.attempts = this.s.attempts.filter((x) => x.id !== r.id);
    this.s.attempts.push(r);
  }
  async putFlashcards(cards: FlashcardRecord[]) {
    for (const c of cards) {
      this.s.flashcards = this.s.flashcards.filter((f) => f.id !== c.id);
      this.s.flashcards.push(FlashcardRecord.parse(c));
    }
  }
  async putChapter(r: ChapterRecord) {
    this.s.chapterRecords = this.s.chapterRecords.filter((c) => c.chapterId !== r.chapterId);
    this.s.chapterRecords.push(ChapterRecord.parse(r));
  }
  async getSession(id: string) {
    const s = this.full.get(id);
    return s ? structuredClone(s) : undefined;
  }
  async commit(c: ItemCommit) {
    const session = SessionRecord.parse(c.session);
    const prev = this.full.get(session.id);
    if (prev && prev.rev >= session.rev) throw new StaleSessionError("A newer copy of this session is already saved.");
    this.full.set(session.id, structuredClone(session));
    if (c.attempt) await this.addAttempt(c.attempt);
    if (c.flashcards?.length) await this.putFlashcards(c.flashcards);
    if (c.chapter) await this.putChapter(c.chapter);
  }
  async replaceAll(s: ProgressSnapshot & { fullSessions?: Session[] }) {
    this.s = structuredClone({ ...s, sessions: [] });
    this.full = new Map((s.fullSessions ?? []).map((x) => [x.id, structuredClone(x)]));
  }
}

export async function openRepo(): Promise<ProgressRepo> {
  try {
    if (typeof indexedDB === "undefined") throw new Error("no indexedDB");
    const db = new NoesisDB();
    await db.open();
    return new DexieRepo(db);
  } catch {
    return new MemoryRepo();
  }
}

/** Every stored session in full (for export). */
export async function allSessions(repo: ProgressRepo): Promise<Session[]> {
  const snap = await repo.load();
  const out: Session[] = [];
  for (const x of snap.sessions) { const s = await repo.getSession(x.id); if (s) out.push(s); }
  return out;
}
