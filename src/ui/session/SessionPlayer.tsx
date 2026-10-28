"use client";
// Runs an adaptive chapter session (docs/04) around the existing lesson player. Every transition is
// persisted (session, attempt, flashcards and chapter record together) before the screen moves on,
// and a refresh resumes the exact frame, question, seed, answer, tries, hints and visual.
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { entryById } from "@/src/content/catalog";
import { newSeed } from "@/src/content/rng";
import { CONFIG } from "@/src/domain/config";
import { getChapter, viewOfChapter } from "@/src/domain/curriculum";
import type { AttemptRecord, ChapterRecord } from "@/src/domain/progress";
import { shippedContent } from "@/src/engine/content";
import {
  canRetry, chooseStuck, completeItem, continueStep, currentItem, masteryOf, mainItems, pauseSession, reconcile, resumeSession,
  startSession, topFrame, updateLive, type Env, type Item, type Live, type Session, type StuckChoice,
} from "@/src/engine/session";
import { StaleSessionError } from "@/src/persistence/db";
import { progressStore, useProgress } from "@/src/persistence/store";
import { applyStoredMotionSetting, useMotion } from "../motion";
import { LessonPlayer, type SaveState } from "../player/LessonPlayer";
import { applyPreviewFromUrl, effectiveClass, previewOn, setStoredClass, storedClass, type ClassChoice } from "../settings";
import { ClassAsk, Crumbs, DetourIntro, LessonView, MainProgress, StuckView, SummaryView, WorkedView } from "./screens";

const ROLE_LABEL: Record<string, string> = {
  diagnostic: "Quick check: an easier question on the same idea",
  probe: "Quick check on an earlier idea",
  detour: "Detour practice",
  foundation: "Foundation practice",
  return: "Back to the paused question: a fresh version",
};

export function SessionPlayer({ chapterId }: { chapterId: string }) {
  const chapter = getChapter(chapterId);
  const backHref = `/map?view=${viewOfChapter(chapterId).id}&chapter=${chapterId}`;
  const { reduced } = useMotion();
  const { snapshot } = useProgress();
  const [phase, setPhase] = useState<"loading" | "class" | "ready" | "stale">("loading");
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const savedRev = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [itemSave, setItemSave] = useState<{ state: SaveState; retry?: () => void }>({ state: "idle" });
  const [bgSave, setBgSave] = useState<SaveState>("idle");
  const [busy, setBusy] = useState(false);
  /** the finished question stays on screen (feedback, solution) until Continue, even if its frame has popped */
  const [hold, setHold] = useState<Item | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [preview, setPreviewState] = useState(false);
  const env = useCallback((): Env => ({ content: shippedContent(), now: Date.now(), strength: () => 0 }), []);

  const show = (s: Session) => { sessionRef.current = s; setSession(s); };

  /** Persist a transition; the screen shows it only once the write succeeds. Writes run one at a time. */
  const commit = useCallback((next: Session, extra: Parameters<typeof progressStore.commitSession>[2] = {}): Promise<boolean> => {
    const run = queue.current.then(async () => {
      try {
        const saved = await progressStore.commitSession(next, savedRev.current, extra);
        savedRev.current = saved.rev;
        show(saved);
        setBgSave("saved");
        return true;
      } catch (e) {
        if (e instanceof StaleSessionError) setPhase("stale");
        setBgSave("error");
        return false;
      }
    });
    queue.current = run.catch(() => false);
    return run;
  }, []);

  // ------------------------------------------------------------------ load or start
  const begin = useCallback(async (cls: ClassChoice | null) => {
    const s = startSession({ id: `ses_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, chapterId, seed: newSeed(), studentClass: effectiveClass(cls), preview: previewOn() }, env());
    savedRev.current = 0;
    setBgSave("pending");
    if (await commit(s)) setPhase("ready");
  }, [chapterId, commit, env]);

  useEffect(() => {
    applyStoredMotionSetting();
    setPreviewState(applyPreviewFromUrl());
    let cancelled = false;
    void (async () => {
      let s = await progressStore.openSessionFor(chapterId);
      if (cancelled) return;
      if (s) {
        savedRev.current = s.rev;
        const r = reconcile(s, env());
        if (r.substituted) setNote("This question was updated since your last visit, so a similar one replaces it.");
        let next = r.session;
        if (next.status === "paused") next = resumeSession(next, env());
        if (next !== s) { if (!(await commit(next))) { show(s); } }
        else show(s);
        setPhase("ready");
        return;
      }
      const cls = storedClass();
      if (cls === null && CONFIG.studentClass.askOnFirstLaunch) { setPhase("class"); return; }
      await begin(cls);
    })();
    return () => { cancelled = true; };
  }, [chapterId, begin, commit, env]);

  // ------------------------------------------------------------------ question events
  const liveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // every callback is bound to the question it came from: a late call can never land on the next question
  const onLive = useCallback((itemId: string, live: Live) => {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    liveTimer.current = setTimeout(() => {
      const s = sessionRef.current;
      const cur = s && currentItem(s);
      if (!s || !cur || cur.id !== itemId) return;
      const next = updateLive(s, cur.id, live, env());
      if (next === s || JSON.stringify(cur.live) === JSON.stringify(next.frames.flatMap((f) => f.items).find((i) => i.id === cur.id)?.live)) return;
      setBgSave("pending");
      void commit(next);
    }, 450);
  }, [commit, env]);

  const finish = useCallback((itemId: string, r: { record: AttemptRecord; cards: { tag: string; front: string; back: string }[] }) => {
    if (liveTimer.current) clearTimeout(liveTimer.current);
    const s = sessionRef.current!;
    const cur = currentItem(s);
    if (!cur || cur.id !== itemId) return;
    setHold(cur);
    const next = completeItem(s, cur.id, { outcome: r.record.outcome, tags: r.record.tags, attemptsUsed: r.record.attemptsUsed, hintsUsed: r.record.hintsUsed }, env());
    let chapterRec: ChapterRecord | undefined;
    if (next.status === "mastered" || next.status === "notYet") {
      const prev = progressStore.get().snapshot.chapterRecords.find((c) => c.chapterId === chapterId);
      const basis = next.preview ? "reviewer-preview" : "approved";
      const realMastery = !!prev?.mastered && prev.basis !== "reviewer-preview";
      // a preview result never replaces real mastery; Not yet never removes mastery of the same basis
      if (!(next.preview && realMastery)) {
        const keep = !!prev?.mastered && (prev.basis ?? "approved") === basis;
        chapterRec = {
          chapterId, mastered: next.status === "mastered" || keep,
          masteredAt: next.status === "mastered" ? Date.now() : keep ? prev?.masteredAt : undefined, sessionId: next.id, lastResult: next.status, lastResultAt: Date.now(),
          sessionsCompleted: (prev?.sessionsCompleted ?? 0) + 1, basis,
        };
      }
    }
    const extra = { attempt: r.record, cards: r.cards.map((c) => ({ ...c, skillId: r.record.skillId })), chapter: chapterRec };
    const attempt = async () => {
      setItemSave({ state: "pending" });
      const ok = await commit(next, extra);
      setItemSave(ok ? { state: "saved" } : { state: "error", retry: () => void attempt() });
    };
    void attempt();
  }, [chapterId, commit, env]);

  const handlers = useRef(new Map<string, { live(l: Live): void; finish(r: Parameters<typeof finish>[1]): void }>());
  const handlersFor = (id: string) => {
    let h = handlers.current.get(id);
    if (!h) { h = { live: (l) => onLive(id, l), finish: (r) => finish(id, r) }; handlers.current.set(id, h); }
    return h;
  };

  const advance = useCallback(async (f: (s: Session, e: Env) => Session) => {
    const s = sessionRef.current!;
    const next = f(s, env());
    if (next === s) return;
    setBusy(true);
    await commit(next);
    setBusy(false);
    window.scrollTo({ top: 0 });
  }, [commit, env]);

  const pause = async () => {
    const s = sessionRef.current;
    if (s && s.status === "active") await commit(pauseSession(s, env()));
    window.location.href = backHref;
  };

  // ------------------------------------------------------------------ render
  if (phase === "stale") {
    return (
      <main className="qshell" id="main">
        <section className="qprompt"><h1>{chapter.title}</h1><p role="alert">This session was continued in another tab or window, so this copy is out of date. Nothing here was overwritten.</p>
          <button className="btn btn--primary" onClick={() => window.location.reload()}>Load the latest</button></section>
      </main>
    );
  }
  if (phase === "class") {
    return (
      <main className="qshell" id="main">
        <div className="qbar"><Link className="btn btn--quiet" href={backHref} data-testid="back-to-map">← Back to map</Link></div>
        <ClassAsk onPick={(c) => { setStoredClass(c); setPhase("loading"); void begin(c); }} />
      </main>
    );
  }
  if (!session) return <main className="qshell" aria-busy="true" />;

  const f = topFrame(session);
  const st = f.step;
  const heldItem = hold ?? undefined;
  const item = heldItem ?? currentItem(session);
  const mains = mainItems(session);
  const bar = (
    <div className="session-bar">
      <MainProgress session={session} target={CONFIG.session.mainQuestionTarget} cap={CONFIG.session.mainQuestionCap} />
      <span className="muted small" data-testid="bg-save" role="status">{bgSave === "pending" ? "Saving…" : bgSave === "error" ? "Not saved yet" : bgSave === "saved" ? "Saved" : ""}</span>
      {session.status === "active" && <button type="button" className="btn btn--small btn--quiet" onClick={() => void pause()} data-testid="pause">Pause</button>}
    </div>
  );
  const banners = (
    <>
      {(preview || session.preview) && <p className="notice-bar" role="note" data-testid="preview-banner">Reviewer preview is on: questions awaiting review count toward mastery in sessions started now. Results are labelled as previews and never shown to students as mastery.</p>}
      {note && <p className="notice-bar" role="status">{note}</p>}
    </>
  );

  if (item && (heldItem || st.kind === "question")) {
    const entry = entryById.get(item.templateId);
    if (!entry) return <main className="qshell"><section className="qprompt"><p>This question isn’t available right now.</p><Link className="btn btn--primary" href={backHref}>Back to the map</Link></section></main>;
    const n = item.role === "main" ? session.frames[0]!.items.filter((i) => i.role === "main").findIndex((i) => i.id === item.id) + 1 : 0;
    return (
      <>
        {banners}
        <LessonPlayer
          key={item.id} entry={entry} seed={item.seed} reduced={reduced} backHref={backHref} others={[]} onAnother={() => undefined}
          session={{
            role: item.role, roleLabel: item.role === "main" ? `Main question ${n} · ${item.difficulty}` : ROLE_LABEL[item.role]!,
            crumbs: <div className="session-head"><Crumbs session={session} />{bar}</div>,
            initial: item.live, recordId: `${session.id}:${item.id}`, sessionId: session.id, eligible: item.eligible,
            onLive: handlersFor(item.id).live, onFinish: handlersFor(item.id).finish, saveState: heldItem ? itemSave.state : "idle", onRetrySave: () => itemSave.retry?.(),
            onContinue: () => { setHold(null); setItemSave({ state: "idle" }); window.scrollTo({ top: 0 }); },
            continueLabel: session.status === "mastered" || session.status === "notYet" ? "See your summary" : "Continue",
          }}
        />
      </>
    );
  }

  const shell = (body: React.ReactNode) => (
    <main className="qshell" id="main">
      <div>
        {banners}
        <div className="qbar">
          <Link className="btn btn--quiet" href={backHref} data-testid="back-to-map">← Back to map</Link>
          <div className="session-head"><Crumbs session={session} />{bar}</div>
        </div>
      </div>
      {body}
    </main>
  );
  const e = env();
  switch (st.kind) {
    case "detour-intro": return shell(<div className="qsolo"><DetourIntro session={session} reduced={reduced} busy={busy} onContinue={() => void advance(continueStep)} /></div>);
    case "lesson": return shell(<LessonView lessonId={st.lessonId} variant={st.variant} reduced={reduced} busy={busy} onContinue={() => void advance(continueStep)} />);
    case "worked": {
      const w = f.items.find((i) => i.id === st.itemId)!;
      return shell(<WorkedView item={w} reason={st.reason} aheadSkillId={st.aheadSkillId} reduced={reduced} busy={busy} onContinue={() => void advance(continueStep)} />);
    }
    case "stuck":
      return shell(<div className="qsolo"><StuckView session={session} skillId={st.skillId} canRetry={canRetry(session, e)} busy={busy} onChoose={(c: StuckChoice) => {
        if (c === "pause") { void (async () => { await commit(chooseStuck(sessionRef.current!, "pause", env())); window.location.href = backHref; })(); return; }
        void advance((s, en) => chooseStuck(s, c, en));
      }} /></div>);
    case "done":
      return shell(<div className="qsolo"><SummaryView session={session} report={masteryOf(session, e)} snapshot={snapshot} now={Date.now()} onFresh={() => void begin(storedClass())} /></div>);
    default:
      return shell(<section className="qprompt"><p>{mains.length ? "Loading your next step…" : "Preparing your session…"}</p></section>);
  }
}
