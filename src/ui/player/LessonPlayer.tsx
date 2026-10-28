"use client";
// The reusable lesson player (docs/05 §5): intro, live visual, answer, checking, progressive hints,
// misconception feedback with an animated consequence, worked and alternative solutions, saving.
import "katex/dist/katex.min.css";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { parseUnion } from "@/src/checking/check";
import { getCheckClient } from "@/src/checking/client";
import type { CheckInput, CheckResult } from "@/src/checking/types";
import type { ManifestEntry } from "@/src/content/catalog";
import { instantiate, type Cues, type QuestionInstance, type Step } from "@/src/content/instantiate";
import { rng } from "@/src/content/rng";
import { feedbackFor, flashcardsFor, resolveCues } from "@/src/content/runtime";
import { chapterById, foundationById, skillById } from "@/src/domain/curriculum";
import type { AttemptRecord } from "@/src/domain/progress";
import type { Live, Role } from "@/src/engine/session";
import { progressStore } from "@/src/persistence/store";
import { formatUnion } from "@/src/widgets/number-line/model";
import { WIDGETS } from "@/src/widgets/registry";
import { RichText } from "@/src/widgets/shared";
import { ChoiceAnswer, MappingAnswer, OrderingAnswer, TextAnswer } from "./answers";
import { attemptsLeft, initialPlayer, MAX_ATTEMPTS, outcomeOf, playerReduce, tagsOf, type PlayerState } from "./playerModel";
import { foldCues, useWidgetHost } from "./useWidgetHost";
import { WidgetStage } from "./WidgetStage";
import { sameQuestion, type QuestionKey } from "@/src/tutor/contract";
import type { ServerReply } from "@/src/tutor/client";
import { tutorTargets, widgetSnapshot } from "@/src/tutor/snapshot";
import { OwlMark } from "@/src/ui/tutor/OwlTutor";
import { TutorPanel, type ApplyResult } from "../tutor/TutorPanel";

type View = { kind: "work" } | { kind: "consequence"; shows: "student" | "answer" } | { kind: "solution"; alt: boolean; step: number } | { kind: "demo" };
const TEXT_FORMATS = new Set(["quantity", "number", "expression", "antiderivative", "equation", "set", "interval"]);
const ON_WIDGET = new Set(["diagram", "interval"]);

/** Starting order for an ordering question: shuffled by seed, never already correct. */
function startOrder(q: QuestionInstance): string[] {
  const ids = (q.items ?? []).map((i) => i.id);
  const correct = q.check.kind === "ordering" ? q.check.correct.join() : "";
  const r = rng(q.seed ^ 0x2f6b);
  for (let k = 0; k < 20; k++) {
    const o = [...ids];
    for (let i = o.length - 1; i > 0; i--) { const j = r.int(0, i); [o[i], o[j]] = [o[j]!, o[i]!]; }
    if (o.join() !== correct) return o;
  }
  return ids.reverse();
}

export type SaveState = "idle" | "pending" | "saved" | "error";
/** How the player takes part in an adaptive session (absent for the single-question demonstration route). */
export interface SessionBinding {
  role: Role;
  /** "Main question 3 of 10", "Quick check", "Detour practice" … */
  roleLabel: string;
  crumbs: ReactNode;
  /** saved unfinished state of this question, restored exactly */
  initial?: Live;
  recordId: string;
  sessionId: string;
  /** may count toward mastery (approved content, or a labelled reviewer preview) */
  eligible: boolean;
  onLive(live: Live): void;
  onFinish(r: { record: AttemptRecord; cards: { tag: string; front: string; back: string }[] }): void;
  saveState: SaveState;
  onRetrySave(): void;
  onContinue(): void;
  continueLabel: string;
}

/** Rebuild the attempt state from a saved one. Replaying the same results gives the same phase and outcome. */
function restorePlayer(live?: Live): PlayerState {
  let s = initialPlayer();
  if (!live) return s;
  for (let i = 0; i < live.hintsShown; i++) s = playerReduce(s, { type: "hint" });
  for (let i = 0; i < (live.tutorAssists ?? 0); i++) s = playerReduce(s, { type: "assist" });
  for (const a of live.attempts) s = playerReduce(s, { type: "result", input: a.input as CheckInput, result: a.result as CheckResult });
  if (live.gaveUp) s = playerReduce(s, { type: "give-up" });
  return s;
}

const sameConfig = (a: unknown, b: unknown) => JSON.stringify((a as { config?: unknown })?.config) === JSON.stringify((b as { config?: unknown })?.config);
const titleOfSkill = (id: string) => skillById.get(id)?.title ?? foundationById.get(id)?.title ?? id;

export function LessonPlayer({ entry, seed, reduced, backHref, onAnother, others, session }: {
  entry: ManifestEntry; seed: number; reduced: boolean; backHref: string; onAnother(templateId?: string): void;
  others: { id: string; label: string }[];
  session?: SessionBinding;
}) {
  const q = useMemo(() => instantiate(entry.template, seed), [entry, seed]);
  const model = WIDGETS[q.widget.type]!;
  const live = session?.initial;
  const restoredWidget = useMemo(() => {
    if (!live?.widget) return undefined;
    const fresh = model.init(model.configSchema.parse(q.widget.config));
    return sameConfig(live.widget, fresh) ? live.widget : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const host = useWidgetHost(model, q.widget.config, reduced, restoredWidget);
  const chapter = chapterById.get(q.chapterId);
  const skillTitle = titleOfSkill(q.skillId);
  const [ps, act] = useReducer(playerReduce, live, restorePlayer);
  const [view, setView] = useState<View>({ kind: "work" });
  const snapshot = useRef<unknown>(null);

  // answer state for each format
  const [text, setText] = useState(live?.text ?? "");
  const [choice, setChoice] = useState<string[]>(live?.choice ?? []);
  const [order, setOrder] = useState<string[]>(() => live?.order ?? startOrder(q));
  const [mapping, setMapping] = useState<Record<string, string>>(live?.mapping ?? {});
  const [reasoning, setReasoning] = useState(live?.reasoning ?? "");
  const [selfCheck, setSelfCheck] = useState<number[]>(live?.selfCheck ?? []);
  const [saved, setSaved] = useState<{ record: AttemptRecord; cards: { tag: string; front: string }[] } | null>(null);
  const resultRef = useRef<HTMLDivElement>(null);
  const startedAt = useRef(Date.now());
  const answering = ps.phase === "answering";

  useEffect(() => { getCheckClient().warm(); }, []);

  // ------------------------------------------------ interval answers: the number line and the text box stay in sync
  const fromText = useRef(false);
  const pieces = (host.state as { pieces?: unknown }).pieces;
  const fresh = host.fresh;
  const startPieces = useMemo(() => JSON.stringify((fresh() as { pieces?: unknown }).pieces), [fresh]);
  useEffect(() => {
    if (q.format !== "interval" || view.kind !== "work") return;
    if (fromText.current) { fromText.current = false; return; }
    if (JSON.stringify(pieces) === startPieces) return; // don't prefill the box with the starting piece
    const u = model.answer?.(host.state) as Parameters<typeof formatUnion>[0];
    setText(u.length ? formatUnion(u) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pieces]);
  const onText = (v: string) => {
    setText(v);
    act({ type: "edit" });
    if (q.format === "interval" && view.kind === "work") {
      const r = parseUnionSafe(v);
      if (r) { fromText.current = true; host.dispatch({ type: "set-union", union: r }); }
    }
  };

  const buildInput = (): CheckInput => {
    if (q.format === "diagram") return model.answer!(host.state) as CheckInput;
    if (q.format === "interval") return text.trim() ? text : formatUnion(model.answer!(host.state) as Parameters<typeof formatUnion>[0]);
    if (TEXT_FORMATS.has(q.format)) return text;
    if (q.format === "single-choice") return choice[0] ?? "";
    if (q.format === "multi-choice") return choice;
    if (q.format === "ordering") return order;
    return mapping;
  };

  // ------------------------------------------------ consequence of a wrong answer, on the same live visual
  const showConsequence = useCallback((result: CheckResult, input: CheckInput) => {
    if (result.status !== "incorrect") return;
    const fb = feedbackFor(q, result.tags);
    const chosen: unknown[] = Array.isArray(input) ? input : [input];
    const optionCues: Cues = (q.options ?? []).filter((o) => chosen.includes(o.id) && o.cues.length && (q.check.kind === "single-choice" ? o.id !== q.check.correct : q.check.kind === "multi-choice" && !q.check.correct.includes(o.id))).flatMap((o) => o.cues);
    const cues = resolveCues([...q.consequence, ...optionCues, ...fb.step.cues], { result, input });
    if (!cues.length) return;
    snapshot.current = view.kind === "work" ? host.state : snapshot.current;
    const base = ON_WIDGET.has(q.format) ? (snapshot.current ?? host.state) : host.fresh();
    host.show(foldCues(model, base, cues), { autoplay: true });
    setView({ kind: "consequence", shows: "student" });
  }, [q, host, model, view.kind]);

  const submit = async () => {
    if (!answering || ps.checking) return;
    if (view.kind !== "work" && snapshot.current) { host.show(snapshot.current); setView({ kind: "work" }); }
    const input = buildInput();
    act({ type: "checking" });
    const result = await getCheckClient().check(q.check, input);
    act({ type: "result", input, result });
    const exhausted = result.status === "incorrect" && ps.attempts.length + 1 >= MAX_ATTEMPTS;
    if (result.status === "incorrect" && (!exhausted || !q.resolution.length)) showConsequence(result, input);
    if (result.status === "correct" || exhausted) showResolution();
    // focus moves to the result only when the question ends; a wrong answer keeps focus in the answer (docs/08)
    if (result.status === "correct" || (result.status === "incorrect" && ps.attempts.length + 1 >= MAX_ATTEMPTS)) requestAnimationFrame(() => resultRef.current?.focus());
  };

  /** Once the question ends, the correct state is shown next to the student's own (docs/07). */
  const showResolution = () => {
    if (!q.resolution.length) return;
    snapshot.current = view.kind === "work" ? host.state : snapshot.current ?? host.state;
    host.show(foldCues(model, ON_WIDGET.has(q.format) ? snapshot.current : host.fresh(), q.resolution), { autoplay: true });
    setView({ kind: "consequence", shows: "answer" });
  };
  const giveUp = () => { act({ type: "give-up" }); showResolution(); };

  // ------------------------------------------------ hints act on the current visual
  const showHint = () => {
    const h = q.hints[ps.hintsShown];
    act({ type: "hint" });
    if (h?.cues.length) host.applyCues(h.cues);
  };

  // ------------------------------------------------ worked and alternative solutions drive the same visual, step by step
  const steps = (alt: boolean): Step[] => (alt ? q.alternative?.steps ?? [] : q.solution);
  const solutionState = (alt: boolean, i: number) => steps(alt).slice(0, i + 1).reduce((s, st) => foldCues(model, s, st.cues), host.fresh());
  const goStep = (alt: boolean, i: number) => {
    if (view.kind === "work") snapshot.current = host.state;
    else if (view.kind === "consequence" && snapshot.current === null) snapshot.current = host.state;
    host.show(solutionState(alt, i), { autoplay: steps(alt)[i]!.cues.length > 0 });
    setView({ kind: "solution", alt, step: i });
  };
  const backToMine = () => { if (snapshot.current !== null) host.show(snapshot.current); setView({ kind: "work" }); };

  // ------------------------------------------------ save the attempt and schedule flashcards once it ends
  const outcome = outcomeOf(ps);
  useEffect(() => {
    if (!outcome || saved) return;
    const tags = tagsOf(ps);
    const record: AttemptRecord = {
      id: session ? session.recordId : `${q.templateId}@${q.version}:${seed}:${startedAt.current}`,
      at: Date.now(), chapterId: q.chapterId, skillId: q.skillId, templateId: `${q.templateId}@${q.version}`, seed,
      difficulty: q.difficulty, kind: !session ? "diagnostic" : session.role === "main" ? "main" : session.role === "diagnostic" ? "diagnostic" : "remediation",
      outcome,
      attemptsUsed: Math.min(MAX_ATTEMPTS, Math.max(1, ps.attempts.length)), hintsUsed: ps.hintsShown, tags,
      ...(ps.tutorAssists ? { tutorAssists: ps.tutorAssists } : {}),
      format: q.format, countsTowardMastery: entry.countsTowardMastery,
      ...(session ? { sessionId: session.sessionId, role: session.role, countedForMastery: session.role === "main" && outcome === "independent" && session.eligible } : {}),
      ...(q.reasoning && reasoning.trim() ? { reasoning: { text: reasoning.slice(0, 4000), selfCheck, scored: false as const } } : {}),
    };
    const cards = outcome === "independent" || (outcome === "assisted" && tags.length === 0) ? [] :
      flashcardsFor(q, tags).map((c) => ({ ...c, tag: c.tag === "generic" ? `${q.templateId}:generic` : c.tag }));
    setSaved({ record, cards });
    if (session) session.onFinish({ record, cards });
    else void progressStore.recordAttempt(record, cards);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome]);
  // in a session, the unfinished state is saved as the student works (the parent debounces and persists it)
  const workState = view.kind === "work" ? host.state : snapshot.current ?? host.state;
  const onLive = session?.onLive;
  useEffect(() => {
    if (!onLive || outcome) return;
    onLive({ attempts: ps.attempts.map((a) => ({ input: a.input, result: a.result })), hintsShown: ps.hintsShown, tutorAssists: ps.tutorAssists, gaveUp: ps.gaveUp, text, choice, order, mapping, reasoning, selfCheck, widget: workState });
  }, [onLive, outcome, ps.attempts, ps.hintsShown, ps.tutorAssists, ps.gaveUp, text, choice, order, mapping, reasoning, selfCheck, workState]);

  // ------------------------------------------------ the tutor (Phase 5): replies are applied here, against the live question
  const [tutorOpen, setTutorOpen] = useState(false);
  const compact = useCompact();
  const compactRef = useRef(compact);
  compactRef.current = compact;
  const questionKey: QuestionKey = useMemo(() => ({ templateId: q.templateId, version: q.version, seed }), [q.templateId, q.version, seed]);
  /** replies requested under an older answer state are discarded (stale) */
  const epoch = `${ps.attempts.length}|${ps.hintsShown}|${ps.phase}`;
  const live$ = useRef({ ps, epoch, view, workState });
  live$.current = { ps, epoch, view, workState };
  const [encourageToken, setEncourageToken] = useState(0);
  useEffect(() => { if (ps.phase === "correct") setEncourageToken((n) => n + 1); }, [ps.phase]);
  /** A tutor demonstration plays on a copy of the student's work; "Back to my work" restores it. */
  const tutorDemo = useCallback((cues: Cues) => {
    const cur = live$.current;
    if (cur.view.kind === "work") snapshot.current = host.state;
    const base = snapshot.current ?? host.state;
    host.show(foldCues(model, base, cues), { autoplay: true });
    setView({ kind: "demo" });
    // on narrow screens, bring the visual above the tutor sheet so the demonstration is seen
    if (compactRef.current) document.querySelector("[data-testid='stage']")?.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
  }, [host, model, reduced]);
  const applyTutorReply = useCallback((reply: ServerReply, epochAtRequest: string): ApplyResult => {
    const cur = live$.current;
    if (!sameQuestion(reply.question, questionKey) || epochAtRequest !== cur.epoch) return "stale";
    // assistance is recorded first, synchronously, so it is in place before another answer can be scored
    let consumed = cur.ps.hintsShown;
    if (reply.assistance === "hint") {
      if (cur.ps.phase === "answering" && cur.ps.hintsShown < q.hints.length) { act({ type: "hint" }); consumed += 1; }
    } else if (reply.assistance === "explanation" || reply.assistance === "demonstration") act({ type: "assist" });
    const targets = tutorTargets(q.widget.type, cur.workState);
    const cues: Cues = [];
    for (const t of reply.tools) {
      if (t.name === "show_hint" && t.args.level >= 1 && t.args.level <= consumed) cues.push(...q.hints[t.args.level - 1]!.cues);
      if (t.name === "highlight") cues.push(...(targets.find((x) => x.id === t.args.target)?.cues ?? []));
    }
    if (cues.length) tutorDemo(cues);
    return "applied";
  }, [questionKey, q, tutorDemo]);
  const getTutorSnapshot = useCallback(() => widgetSnapshot(q.widget.type, live$.current.workState), [q.widget.type]);

  const saveReasoning = () => {
    if (!saved || !reasoning.trim()) return;
    void progressStore.updateReasoning(saved.record, { text: reasoning.slice(0, 4000), selfCheck, scored: false });
  };

  // ------------------------------------------------ render
  const last = ps.attempts[ps.attempts.length - 1]?.result;
  const lastFeedback = last?.status === "incorrect" ? feedbackFor(q, last.tags) : null;
  const terminal = ps.phase !== "answering";
  const resetLabel = q.format === "diagram" ? "Clear my diagram" : q.format === "interval" ? "Clear the number line" : "Reset";
  const banner = view.kind === "consequence" ? (
    <div className="stage-banner" data-tone={view.shows === "answer" ? "good" : "bad"} data-testid="stage-banner">
      <span>{view.shows === "answer" ? "The correct answer, shown on the model." : "What your answer would mean, played out on the model."}</span>
      {snapshot.current !== null && <button type="button" className="btn btn--small" onClick={backToMine} data-testid="back-to-mine">Back to my work</button>}
    </div>
  ) : view.kind === "demo" ? (
    <div className="stage-banner" data-tone="good" data-testid="stage-banner" data-banner="demo">
      <span>Tutor demonstration on a copy of your work. Your own work is saved.</span>
      {snapshot.current !== null && <button type="button" className="btn btn--small" onClick={backToMine} data-testid="back-to-mine">Back to my work</button>}
    </div>
  ) : view.kind === "solution" ? (
    <div className="stage-banner" data-tone="good" data-testid="stage-banner">
      <span>{view.alt ? q.alternative?.title : "Worked solution"}: step {view.step + 1} of {steps(view.alt).length}</span>
      {snapshot.current !== null && <button type="button" className="btn btn--small" onClick={backToMine} data-testid="back-to-mine">Back to my work</button>}
    </div>
  ) : null;

  return (
    <main className="qshell" id="main">
      <div className="qbar">
        <Link className="btn btn--quiet" href={backHref} data-testid="back-to-map"><span aria-hidden="true">←</span><span className="qbar__back-label">Back to map</span></Link>
        {session ? session.crumbs : (
          <nav className="crumbs" aria-label="You are here">
            <span>{chapter?.title ?? "Foundations"}</span><span aria-hidden="true">›</span><strong>{skillTitle}</strong>
          </nav>
        )}
        <button type="button" className="tutor-toggle" onClick={() => setTutorOpen((o) => !o)} aria-expanded={tutorOpen} data-testid="tutor-toggle">
          <OwlMark size={24} /><span>{tutorOpen ? "Close tutor" : "Ask the tutor"}</span>
        </button>
      </div>
      <div className="qmain" data-tutor={tutorOpen ? (compact ? "sheet" : "rail") : undefined}>
        <WidgetStage
          type={q.widget.type} host={host} reduced={reduced} instructions={q.widget.instructions} altText={q.accessibility.altText}
          resetLabel={resetLabel} banner={banner}
          onReset={() => { host.reset(); snapshot.current = null; setView({ kind: "work" }); if (q.format === "interval") setText(""); }}
        />
        <section className="qprompt" aria-labelledby="q-title">
          {session && <p className="role-label" data-testid="role-label" data-role={session.role}>{session.roleLabel}</p>}
          <h1 id="q-title">{skillTitle}</h1>
          <p className="intro" data-testid="intro">{q.intro}</p>
          <div className="stem" data-testid="stem">{q.stem.map((p, i) => <p key={i}><RichText text={p} /></p>)}</div>
          {q.accessibility.nonDragAlternative && <p className="muted small" data-testid="non-drag">{q.accessibility.nonDragAlternative}</p>}

          <form className="answer" onSubmit={(e) => { e.preventDefault(); void submit(); }} aria-describedby="tries">
            {TEXT_FORMATS.has(q.format) && (
              <TextAnswer q={q} value={text} onChange={onText} onSubmit={() => void submit()} disabled={!answering} invalid={!!ps.notice} describedBy="notice" />
            )}
            {(q.format === "single-choice" || q.format === "multi-choice") && (
              <ChoiceAnswer q={q} value={choice} onChange={(v) => { setChoice(v); act({ type: "edit" }); }} disabled={!answering} multiple={q.format === "multi-choice"} />
            )}
            {q.format === "ordering" && <OrderingAnswer q={q} order={order} onChange={(o) => { setOrder(o); act({ type: "edit" }); }} disabled={!answering} />}
            {q.format === "mapping" && <MappingAnswer q={q} value={mapping} onChange={(m) => { setMapping(m); act({ type: "edit" }); }} disabled={!answering} />}
            {q.format === "diagram" && <p className="muted small">Build your diagram on the board, then check it.</p>}
            {answering && (
              <div className="answer-row">
                <button type="submit" className="btn btn--primary" disabled={ps.checking} data-testid="check">{ps.checking ? "Checking…" : "Check answer"}</button>
                <button type="button" className="btn" onClick={showHint} disabled={ps.hintsShown >= q.hints.length} data-testid="hint">
                  {ps.hintsShown === 0 ? "Get a hint" : ps.hintsShown < q.hints.length ? "Next hint" : "No more hints"}
                </button>
                <span className="tries" id="tries" data-testid="tries">
                  {Array.from({ length: MAX_ATTEMPTS }, (_, i) => <i key={i} data-used={i < ps.attempts.length} aria-hidden="true" />)}
                  {attemptsLeft(ps)} {attemptsLeft(ps) === 1 ? "try" : "tries"} left
                </span>
              </div>
            )}
          </form>

          <div id="notice" aria-live="polite">
            {ps.notice && (
              <div className="feedback" data-kind="invalid" data-testid="notice">
                <p>{ps.notice.text}</p>
                <p className="muted small">{ps.notice.kind === "indeterminate" ? "Rewrite your answer in another way and check again." : "Fix this and check again."} This doesn't use up a try.</p>
              </div>
            )}
          </div>

          <div ref={resultRef} tabIndex={-1} className="result" aria-live="assertive" data-testid="result">
            {last?.status === "correct" && (
              <div className="feedback" data-kind="correct" data-testid="feedback-correct">
                <p><strong>Correct.</strong> {ps.attempts.length === 1 && ps.hintsShown === 0 ? "Well reasoned." : "You got there."}</p>
                <p className="muted">Answer: <RichText text={q.answerText} /></p>
              </div>
            )}
            {lastFeedback && (
              <div className="feedback" data-kind="incorrect" data-testid="feedback-incorrect" data-tag={lastFeedback.tag}>
                <p><strong>Not quite.</strong> <RichText text={lastFeedback.step.text} /></p>
                {answering && (
                  <p className="muted small feedback__next">
                    Look at the visual, then try again.
                    {!tutorOpen && <button type="button" className="link-btn" onClick={() => setTutorOpen(true)} data-testid="feedback-ask-tutor">Ask the tutor about it</button>}
                  </p>
                )}
              </div>
            )}
            {ps.phase === "exhausted" && (
              <div className="feedback" data-kind="invalid" data-testid="feedback-exhausted">
                <p><strong>The answer is <RichText text={q.answerText} />.</strong> Step through the worked solution to see why.</p>
              </div>
            )}
          </div>

          {ps.hintsShown > 0 && (
            <div className="hints" data-testid="hints">
              <h2 className="h-small">Hints</h2>
              {q.hints.slice(0, ps.hintsShown).map((h, i) => (
                <div key={i} className="hint" data-testid={`hint-${i}`}>
                  <RichText text={h.text} />
                  {h.cues.length > 0 && <button type="button" className="link-btn" onClick={() => host.applyCues(h.cues)}>Show on the visual</button>}
                </div>
              ))}
            </div>
          )}

          {answering && (ps.hintsShown >= q.hints.length || ps.attempts.length > 0) && (
            <button type="button" className="btn btn--quiet" onClick={giveUp} data-testid="give-up">Show me the solution</button>
          )}

          {terminal && (
            <SolutionPanel q={q} view={view} goStep={goStep} />
          )}

          {q.reasoning && (
            <ReasoningPanel
              q={q} text={reasoning} setText={setReasoning} selfCheck={selfCheck} setSelfCheck={setSelfCheck} terminal={terminal}
              onSave={saveReasoning} saved={!!saved}
            />
          )}

          {terminal && saved && session && (
            <div className="after" data-testid="after">
              <SaveNote state={session.saveState} onRetry={session.onRetrySave} cards={saved.cards} />
              <div className="answer-row">
                <button type="button" className="btn btn--primary" onClick={session.onContinue} disabled={session.saveState !== "saved"} data-testid="continue">{session.continueLabel}</button>
                <Link className="btn" href={backHref}>Back to the map</Link>
              </div>
            </div>
          )}
          {terminal && saved && !session && (
            <div className="after" data-testid="after">
              <p className="muted small" data-testid="saved">
                Saved to this device.{saved.cards.length > 0 && ` ${saved.cards.length === 1 ? "One flashcard" : `${saved.cards.length} flashcards`} added for review tomorrow: “${saved.cards[0]!.front}”${saved.cards.length > 1 ? " and more" : ""}.`}
              </p>
              <div className="answer-row">
                <button type="button" className="btn btn--primary" onClick={() => onAnother()} data-testid="another">Try another question</button>
                <Link className="btn" href={backHref}>Back to the map</Link>
              </div>
              {others.length > 0 && (
                <details className="more-questions">
                  <summary>More questions in {chapter?.title ?? "this chapter"}</summary>
                  <ul>{others.map((o) => <li key={o.id}><button type="button" className="link-btn" onClick={() => onAnother(o.id)}>{o.label}</button></li>)}</ul>
                </details>
              )}
            </div>
          )}
        </section>
        <TutorPanel
          open={tutorOpen} onClose={() => setTutorOpen(false)} q={q} questionKey={questionKey} skillTitle={skillTitle}
          player={{ hintsShown: ps.hintsShown, hintsTotal: q.hints.length, phase: ps.phase, attempts: ps.attempts.map((a) => a.input), hasWrongAttempt: ps.attempts.some((a) => a.result.status === "incorrect") }}
          epoch={epoch} getSnapshot={getTutorSnapshot} onApply={applyTutorReply} demoActive={view.kind === "demo"} reduced={reduced}
          encourageToken={encourageToken} compact={compact}
        />
      </div>
    </main>
  );
}

/** Narrow layouts show the tutor as a bottom sheet instead of a side rail. */
function useCompact() {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1099px)");
    const on = () => setCompact(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return compact;
}

/** Saved only once the write has succeeded; a failed write offers a retry and nothing is lost. */
export function SaveNote({ state, onRetry, cards }: { state: SaveState; onRetry(): void; cards: { front: string }[] }) {
  if (state === "pending" || state === "idle") return <p className="muted small" data-testid="saving" role="status">Saving…</p>;
  if (state === "error") return (
    <p className="small" data-testid="save-error" role="alert">
      Your answer couldn’t be saved on this device yet. <button type="button" className="link-btn" onClick={onRetry} data-testid="save-retry">Try saving again</button>
    </p>
  );
  return (
    <p className="muted small" data-testid="saved" role="status">
      Saved to this device.{cards.length > 0 && ` ${cards.length === 1 ? "One flashcard" : `${cards.length} flashcards`} added for review tomorrow: “${cards[0]!.front}”${cards.length > 1 ? " and more" : ""}.`}
    </p>
  );
}

function SolutionPanel({ q, view, goStep }: { q: QuestionInstance; view: View; goStep(alt: boolean, i: number): void }) {
  const open = view.kind === "solution";
  const alt = open && view.alt;
  const steps = alt ? q.alternative!.steps : q.solution;
  const cur = open ? view.step : -1;
  return (
    <section className="solution" aria-labelledby="sol-title" data-testid="solution">
      <h2 id="sol-title" className="h-small">{alt ? q.alternative!.title : "Worked solution"}</h2>
      {!open ? (
        <div className="answer-row">
          <button type="button" className="btn btn--primary" onClick={() => goStep(false, 0)} data-testid="solution-open">Step through the solution</button>
          {q.alternative && <button type="button" className="btn" onClick={() => goStep(true, 0)} data-testid="alt-open">Another way: {q.alternative.title}</button>}
        </div>
      ) : (
        <>
          <ol className="steps" data-testid="solution-steps">
            {steps.map((s, i) => (
              <li key={i} data-active={i === cur} data-future={i > cur} aria-current={i === cur ? "step" : undefined}>
                <span>{i <= cur ? <RichText text={s.text} /> : <span className="muted">Step {i + 1}</span>}</span>
              </li>
            ))}
          </ol>
          <div className="answer-row">
            <button type="button" className="btn" onClick={() => goStep(alt, cur - 1)} disabled={cur <= 0} data-testid="sol-prev">Previous step</button>
            <button type="button" className="btn btn--primary" onClick={() => goStep(alt, cur + 1)} disabled={cur >= steps.length - 1} data-testid="sol-next">Next step</button>
            {!alt && q.alternative && <button type="button" className="btn btn--quiet" onClick={() => goStep(true, 0)} data-testid="alt-open">Another way</button>}
            {alt && <button type="button" className="btn btn--quiet" onClick={() => goStep(false, 0)}>Main solution</button>}
          </div>
        </>
      )}
    </section>
  );
}

function ReasoningPanel({ q, text, setText, selfCheck, setSelfCheck, terminal, onSave, saved }: {
  q: QuestionInstance; text: string; setText(s: string): void; selfCheck: number[]; setSelfCheck(n: number[]): void;
  terminal: boolean; onSave(): void; saved: boolean;
}) {
  const r = q.reasoning!;
  return (
    <section className="reasoning" aria-labelledby="reason-title" data-testid="reasoning">
      <h2 id="reason-title" className="h-small">Explain your thinking <span className="muted">(optional, not marked)</span></h2>
      <label htmlFor="reason-text" className="small">{r.prompt}</label>
      <textarea id="reason-text" value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { if (saved) onSave(); }} rows={3} maxLength={4000} data-testid="reasoning-text" />
      <p className="muted small">Your explanation stays on this device. It is never scored and never changes your progress.</p>
      {terminal && (
        <div className="self-check" data-testid="self-check">
          <p className="small"><strong>Check your own explanation.</strong> Tick what it covers:</p>
          {r.rubric.map((item, i) => (
            <label key={i} className="choice choice--compact">
              <input type="checkbox" checked={selfCheck.includes(i)} onChange={(e) => { const n = e.target.checked ? [...selfCheck, i] : selfCheck.filter((x) => x !== i); setSelfCheck(n); }} />
              <span>{item}</span>
            </label>
          ))}
          <details>
            <summary>See a model explanation</summary>
            <p><RichText text={r.modelAnswer} /></p>
          </details>
          {saved && <button type="button" className="btn btn--small" onClick={onSave} data-testid="reasoning-save">Save my explanation</button>}
        </div>
      )}
    </section>
  );
}

/** Parse typed interval text for the live number line; null while it isn't a complete union yet. */
function parseUnionSafe(v: string) {
  const r = parseUnion(v);
  return Array.isArray(r) ? r : null;
}
