"use client";
// The screens of an adaptive session other than the question itself (docs/02, docs/04, docs/07):
// why a detour opened, micro-lessons, worked-solution replays, Stuck, and the session summary.
import { motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { entryById } from "@/src/content/catalog";
import { instantiate } from "@/src/content/instantiate";
import { lessonCues, lessonVariant, LESSONS, type LessonVariant } from "@/src/content/lessons";
import { CATALOGUES } from "@/src/content/misconceptions";
import { getChapter, viewOfChapter } from "@/src/domain/curriculum";
import { successorRecommendations, type ProgressSnapshot } from "@/src/domain/progress";
import { chapterOfSkill, titleOf } from "@/src/engine/graph";
import type { MasteryReport } from "@/src/engine/mastery";
import { breadcrumb, detourPath, type Item, type Session, type WorkedReason } from "@/src/engine/session";
import { RichText } from "@/src/widgets/shared";
import { WIDGETS } from "@/src/widgets/registry";
import { foldCues, useWidgetHost } from "../player/useWidgetHost";
import { WidgetStage } from "../player/WidgetStage";

const describeTag = (tag: string) => CATALOGUES.flatMap((c) => c.misconceptions).find((m) => m.tag === tag)?.flashcard.front;

// ------------------------------------------------------------------ breadcrumb and progress

export function Crumbs({ session }: { session: Session }) {
  const chapter = getChapter(session.chapterId);
  const crumbs = breadcrumb(session);
  return (
    <nav className="crumbs" aria-label="You are here" data-testid="crumbs">
      <span>{chapter.title}</span>
      {crumbs.map((c, i) => (
        <span key={`${c.skillId}${i}`} className="crumb" data-paused={c.paused} data-mode={c.mode}>
          <span aria-hidden="true">›</span>
          {c.paused ? <span>{titleOf(c.skillId)} <span className="tag tag--paused">Paused</span></span> : <strong>{titleOf(c.skillId)}</strong>}
        </span>
      ))}
    </nav>
  );
}

/** One dot per main question: filled independent, half assisted, hollow exhausted; the target and cap shown as text. */
export function MainProgress({ session, target, cap }: { session: Session; target: number; cap: number }) {
  const mains = session.frames[0]!.items.filter((i) => i.role === "main" && i.outcome);
  return (
    <div className="session-dots" data-testid="session-progress" aria-label={`${mains.length} main questions answered; mastery is checked from question ${target}, and the session ends by question ${cap}`}>
      {mains.map((m) => <i key={m.id} data-outcome={m.outcome} data-hard={m.difficulty === "hard"} aria-hidden="true" />)}
      <span className="muted small">{mains.length}/{target}{mains.length >= target ? ` (up to ${cap})` : ""}</span>
    </div>
  );
}

// ------------------------------------------------------------------ why this detour (docs/07: the paused card docks, the detour edge draws)

export function DetourIntro({ session, reduced, onContinue, busy }: { session: Session; reduced: boolean; onContinue(): void; busy: boolean }) {
  const f = session.frames[session.frames.length - 1]!;
  const from = f.reason?.fromSkill ?? "";
  const to = f.skillId!;
  const path = detourPath(from, to);
  const evidence = [...new Set(f.reason?.tags ?? [])].map(describeTag).filter((x): x is string => !!x).slice(0, 3);
  const foundation = f.mode === "foundation";
  const t = (d: number) => (reduced ? { duration: 0 } : { duration: 0.5, delay: d, ease: [0.2, 0, 0, 1] as const });
  return (
    <section className="qprompt detour-intro" aria-labelledby="detour-title" data-testid="detour-intro">
      <motion.div className="paused-card" initial={reduced ? false : { opacity: 1, y: 0, scale: 1 }} animate={{ opacity: 0.55, y: -6, scale: 0.94 }} transition={t(0)} data-testid="paused-card">
        <span className="tag tag--paused">Paused</span> <strong>{titleOf(from)}</strong>
        <span className="muted small"> · your place is saved</span>
      </motion.div>
      <h1 id="detour-title">{foundation ? "A short foundation lesson first" : "A quick detour first"}</h1>
      <p>Your answers on <strong>{titleOf(from)}</strong> suggest that <strong>{titleOf(to)}</strong> needs some practice. It comes earlier in the route:</p>
      <svg className="detour-path" viewBox={`0 0 ${Math.max(1, path.length - 1) * 220 + 40} 80`} role="img" aria-label={`Route: ${path.map(titleOf).join(", then ")}`} data-testid="detour-path">
        {path.slice(1).map((_, i) => (
          <motion.path key={i} d={`M ${20 + i * 220 + 14} 40 H ${20 + (i + 1) * 220 - 14}`} stroke="var(--highlight-peach)" strokeWidth={3} strokeDasharray="8 6" fill="none"
            initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={t(0.3 + i * 0.35)} />
        ))}
        {path.map((id, i) => (
          <g key={id} transform={`translate(${20 + i * 220} 40)`}>
            <circle r={12} fill={i === path.length - 1 ? "var(--accent-orange)" : "var(--surface-raised)"} stroke="var(--highlight-peach)" strokeWidth={2} />
            <text y={34} textAnchor={i === 0 ? "start" : i === path.length - 1 ? "end" : "middle"} className="v-text">{titleOf(id).length > 30 ? `${titleOf(id).slice(0, 28)}…` : titleOf(id)}</text>
          </g>
        ))}
      </svg>
      {evidence.length > 0 && (
        <div className="card">
          <p className="small" style={{ margin: 0 }}><strong>What we noticed</strong></p>
          <ul className="small">{evidence.map((e) => <li key={e}>{e}</li>)}</ul>
        </div>
      )}
      <p className="muted small">When you’re ready, you’ll come back to <strong>{titleOf(from)}</strong> through its worked explanation and a fresh version of the question. Nothing is locked: you can leave from the map at any time.</p>
      <button type="button" className="btn btn--primary" onClick={onContinue} disabled={busy} data-testid="detour-start">{foundation ? "Start the lesson" : "Start the detour"}</button>
    </section>
  );
}

// ------------------------------------------------------------------ micro-lesson and explainer

export function LessonView({ lessonId, variant, reduced, onContinue, busy }: { lessonId: string; variant: LessonVariant; reduced: boolean; onContinue(): void; busy: boolean }) {
  const entry = LESSONS.find((l) => l.lesson.id === lessonId);
  if (!entry) return <section className="qprompt"><p>This lesson isn’t available right now.</p><button className="btn btn--primary" onClick={onContinue}>Continue</button></section>;
  return <LessonInner key={`${lessonId}:${variant}`} lesson={entry.lesson} variant={variant} reduced={reduced} onContinue={onContinue} busy={busy} />;
}

function LessonInner({ lesson, variant, reduced, onContinue, busy }: { lesson: (typeof LESSONS)[number]["lesson"]; variant: LessonVariant; reduced: boolean; onContinue(): void; busy: boolean }) {
  const v = lessonVariant(lesson, variant);
  const model = WIDGETS[v.widget.type]!;
  const host = useWidgetHost(model, v.widget.config, reduced);
  const [i, setI] = useState(-1);
  const go = (n: number) => {
    const state = v.steps.slice(0, n + 1).reduce((s, st) => foldCues(model, s, lessonCues(st.cue)), host.fresh());
    host.show(state, { autoplay: lessonCues(v.steps[n]!.cue).length > 0 });
    setI(n);
  };
  const last = i >= v.steps.length - 1;
  return (
    <div className="qmain" data-testid="lesson" data-variant={variant}>
      <WidgetStage type={v.widget.type} host={host} reduced={reduced} instructions={v.widget.instructions} altText={lesson.accessibility.altText} resetLabel="Reset" onReset={() => { host.reset(); setI(-1); }} />
      <section className="qprompt" aria-labelledby="lesson-title">
        <p className="role-label">{variant === "recap" ? "Recap" : variant === "alternate" ? "Another way to see it" : lesson.kind === "micro-lesson" ? `Foundation lesson · about ${lesson.minutes} min` : "Explainer"}</p>
        <h1 id="lesson-title">{v.title}</h1>
        {lesson.accessibility.nonDragAlternative && <p className="muted small">{lesson.accessibility.nonDragAlternative}</p>}
        {i < 0 ? (
          <p>Step through the explanation. The visual is live: you can change it at any point.</p>
        ) : (
          <ol className="steps" data-testid="lesson-steps">
            {v.steps.map((s, k) => (
              <li key={k} data-active={k === i} data-future={k > i} aria-current={k === i ? "step" : undefined}>
                <span>{k <= i ? <RichText text={s.text} /> : <span className="muted">Step {k + 1}</span>}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="answer-row">
          {i >= 0 && <button type="button" className="btn" onClick={() => go(i - 1)} disabled={i <= 0}>Previous step</button>}
          {!last && <button type="button" className="btn btn--primary" onClick={() => go(i + 1)} data-testid="lesson-next">{i < 0 ? "Begin" : "Next step"}</button>}
          {(last || variant === "recap") && <button type="button" className={last ? "btn btn--primary" : "btn btn--quiet"} onClick={onContinue} disabled={busy} data-testid="lesson-done">{last ? "Start practice" : "Skip the recap"}</button>}
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ worked-solution replay (return route, guided example, notices)

const WORKED_TEXT: Record<WorkedReason, { role: string; lead: string; next: string }> = {
  "within-skill": { role: "Worked solution", lead: "You managed the easier version, so the jump in difficulty was the hard part. Here is the full solution to the question you missed.", next: "Continue" },
  guided: { role: "Guided example", lead: "Let’s walk through the question step by step. Watch each step on the visual.", next: "Continue" },
  "class-ahead": { role: "Worked solution", lead: "", next: "Continue" },
  "no-content": { role: "Worked solution", lead: "Here is the full solution, step by step.", next: "Continue" },
  return: { role: "Back to the paused question", lead: "Welcome back. First, the worked explanation of the question you paused; then you’ll try a fresh version of it.", next: "Try a fresh version" },
  "back-anyway": { role: "Back to the question", lead: "Here is its worked solution. The earlier topic stays on your map as a recommendation, so you can return to it any time.", next: "Continue" },
};

export function WorkedView({ item, reason, aheadSkillId, reduced, onContinue, busy }: { item: Item; reason: WorkedReason; aheadSkillId?: string; reduced: boolean; onContinue(): void; busy: boolean }) {
  const entry = entryById.get(item.templateId);
  if (!entry) return <section className="qprompt" data-testid="worked"><p>This question has been updated since; its solution isn’t available.</p><button className="btn btn--primary" onClick={onContinue} data-testid="worked-continue">Continue</button></section>;
  return <WorkedInner key={item.id} entry={entry} item={item} reason={reason} aheadSkillId={aheadSkillId} reduced={reduced} onContinue={onContinue} busy={busy} />;
}

function WorkedInner({ entry, item, reason, aheadSkillId, reduced, onContinue, busy }: { entry: NonNullable<ReturnType<typeof entryById.get>>; item: Item; reason: WorkedReason; aheadSkillId?: string; reduced: boolean; onContinue(): void; busy: boolean }) {
  const q = useMemo(() => instantiate(entry.template, item.seed), [entry, item.seed]);
  const model = WIDGETS[q.widget.type]!;
  const host = useWidgetHost(model, q.widget.config, reduced);
  const [i, setI] = useState(-1);
  const go = (n: number) => {
    host.show(q.solution.slice(0, n + 1).reduce((s, st) => foldCues(model, s, st.cues), host.fresh()), { autoplay: q.solution[n]!.cues.length > 0 });
    setI(n);
  };
  const t = WORKED_TEXT[reason];
  const aheadChapter = aheadSkillId ? chapterOfSkill(aheadSkillId) : null;
  return (
    <div className="qmain" data-testid="worked" data-reason={reason}>
      <WidgetStage type={q.widget.type} host={host} reduced={reduced} instructions={q.widget.instructions} altText={q.accessibility.altText} resetLabel="Reset" onReset={() => { host.reset(); setI(-1); }} />
      <section className="qprompt" aria-labelledby="worked-title">
        <p className="role-label">{t.role}</p>
        <h1 id="worked-title">{titleOf(item.skillId)}</h1>
        {reason === "class-ahead" && aheadSkillId && aheadChapter ? (
          <p className="card small" data-testid="class-ahead">
            This question builds on <strong>{titleOf(aheadSkillId)}</strong> from <em>{getChapter(aheadChapter).title}</em> (Class {getChapter(aheadChapter).class}).
            You can open that chapter from the map whenever you like; here is the worked solution meanwhile.
          </p>
        ) : <p>{t.lead}</p>}
        <div className="stem">{q.stem.map((p, k) => <p key={k}><RichText text={p} /></p>)}</div>
        <p className="muted small">Answer: <RichText text={q.answerText} /></p>
        <ol className="steps" data-testid="worked-steps">
          {q.solution.map((s, k) => (
            <li key={k} data-active={k === i} data-future={k > i} aria-current={k === i ? "step" : undefined}>
              <span>{k <= i ? <RichText text={s.text} /> : <span className="muted">Step {k + 1}</span>}</span>
            </li>
          ))}
        </ol>
        <div className="answer-row">
          {i >= 0 && <button type="button" className="btn" onClick={() => go(i - 1)} disabled={i <= 0}>Previous step</button>}
          {i < q.solution.length - 1 && <button type="button" className="btn btn--primary" onClick={() => go(i + 1)} data-testid="worked-next">{i < 0 ? "Step through it" : "Next step"}</button>}
          <button type="button" className={i >= q.solution.length - 1 ? "btn btn--primary" : "btn btn--quiet"} onClick={onContinue} disabled={busy} data-testid="worked-continue">{t.next}</button>
        </div>
      </section>
    </div>
  );
}

// ------------------------------------------------------------------ Stuck

export function StuckView({ session, skillId, canRetry, onChoose, busy }: { session: Session; skillId: string; canRetry: boolean; onChoose(c: "back" | "pause" | "retry"): void; busy: boolean }) {
  const crumbs = breadcrumb(session).filter((c) => c.paused);
  const place = crumbs[crumbs.length - 1]?.skillId ?? crumbs[0]?.skillId;
  const lesson = LESSONS.find((l) => l.lesson.skillId === skillId)?.lesson;
  return (
    <section className="qprompt stuck" aria-labelledby="stuck-title" data-testid="stuck">
      <p className="role-label">Your next step</p>
      <h1 id="stuck-title">{titleOf(skillId)}{lesson ? ` (about ${lesson.minutes} min)` : ""}</h1>
      <p>This needs a little more time than one sitting gives it, and that’s normal. We saved your place{place ? <> in <strong>{getChapter(session.chapterId).title} › {titleOf(place)}</strong></> : null}.</p>
      <div className="answer-row">
        {canRetry && <button type="button" className="btn btn--primary" onClick={() => onChoose("retry")} disabled={busy} data-testid="stuck-retry">Try again now</button>}
        <button type="button" className={canRetry ? "btn" : "btn btn--primary"} onClick={() => onChoose("back")} disabled={busy} data-testid="stuck-back">Back to the question anyway</button>
        <button type="button" className="btn btn--quiet" onClick={() => onChoose("pause")} disabled={busy} data-testid="stuck-pause">Pause for today</button>
      </div>
      <p className="muted small">If you go back to the question, this topic stays on your map as a recommendation and the session avoids questions that depend on it.</p>
    </section>
  );
}

// ------------------------------------------------------------------ session summary: mastered or Not yet

export function SummaryView({ session, report, snapshot, now, onFresh }: { session: Session; report: MasteryReport; snapshot: ProgressSnapshot; now: number; onFresh(): void }) {
  const chapter = getChapter(session.chapterId);
  const view = viewOfChapter(session.chapterId);
  const mastered = session.status === "mastered";
  const items = session.frames.flatMap((f) => f.items);
  const solid = [...new Set(items.filter((i) => i.role === "main" && i.outcome === "independent").map((i) => i.skillId))];
  const practise = [...new Set(items.filter((i) => i.role === "main" && i.outcome && i.outcome !== "independent" && !solid.includes(i.skillId)).map((i) => i.skillId))];
  const successors = mastered ? successorRecommendations(session.chapterId, snapshot, now, session.studentClass) : [];
  const cards = snapshot.flashcards.filter((c) => c.chapterId === session.chapterId && c.createdAt >= session.startedAt).length;
  const remediation = items.filter((i) => i.role !== "main" && i.outcome).length;
  return (
    <section className="qprompt summary" aria-labelledby="summary-title" data-testid="summary" data-result={mastered ? "mastered" : "notYet"}>
      {session.preview && <p className="notice-bar" role="note" data-testid="preview-note">Reviewer preview: questions still awaiting review counted in this session. This result is labelled as a preview and is never shown to students as mastery.</p>}
      <p className="role-label">{mastered ? "Chapter mastered" : "Not yet"}</p>
      <h1 id="summary-title">{mastered ? `${chapter.title}: mastered` : `${chapter.title}: not yet`}</h1>
      <p data-testid="summary-stats">
        {report.answered} main questions · {report.independentInWindow} of the last {report.window} right first time without help · {report.hardIndependentInWindow} hard · {remediation} practice and detour questions along the way.
      </p>
      {!mastered && report.ineligibleIndependent > 0 && report.independentInWindow === 0 && (
        <p className="muted small" data-testid="ineligible-note">Some questions in this chapter are new and don’t count toward mastery yet, so this session can’t end in mastery. Your practice and flashcards are still saved.</p>
      )}
      {!mastered && (
        <div className="card small">
          {solid.length > 0 && <p style={{ margin: 0 }}><strong>Solid this session:</strong> {solid.map(titleOf).join(", ")}</p>}
          {practise.length > 0 && <p style={{ margin: 0 }}><strong>Needs more practice:</strong> {practise.map(titleOf).join(", ")}</p>}
          {report.uncovered.length > 0 && <p style={{ margin: 0 }}><strong>Not yet covered:</strong> {report.uncovered.map(titleOf).join(", ")}</p>}
          <p className="muted" style={{ margin: 0 }}>Nothing is lost or locked. Your next session starts with a fresh window, beginning with the weakest skills.</p>
        </div>
      )}
      {successors.length > 0 && (
        <div className="card small" data-testid="successors">
          <p style={{ margin: 0 }}><strong>Where next</strong></p>
          <ul>{successors.map((s) => (
            <li key={s.chapterId} data-label={s.label}>
              <Link href={`/map?view=${viewOfChapter(s.chapterId).id}&chapter=${s.chapterId}`}>{getChapter(s.chapterId).title}</Link>{" "}
              {s.label === "Recommended" ? <span className="tag tag--rec">Recommended</span> : <span className="muted">Next after {s.missing.map((m) => getChapter(m).title).join(" and ")}</span>}
            </li>
          ))}</ul>
        </div>
      )}
      {cards > 0 && <p className="small">{cards === 1 ? "One flashcard is" : `${cards} flashcards are`} queued for review.</p>}
      <div className="answer-row">
        <Link className="btn btn--primary" href={`/map?view=${view.id}&chapter=${session.chapterId}`} data-testid="summary-map">Back to the map</Link>
        <Link className="btn" href="/map?review=1" data-testid="summary-review">Review cards</Link>
        <button type="button" className="btn btn--quiet" onClick={onFresh} data-testid="summary-fresh">Start a fresh session</button>
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ first launch: which class?

export function ClassAsk({ onPick }: { onPick(c: 11 | 12 | "skip"): void }) {
  return (
    <section className="qprompt" aria-labelledby="class-title" data-testid="class-ask">
      <h1 id="class-title">Which class are you in?</h1>
      <p>We use this for one thing only: practice never sends a Class 11 student into Class 12 topics. Every chapter stays open to you on the map, and you can change this later.</p>
      <div className="answer-row">
        <button type="button" className="btn btn--primary" onClick={() => onPick(11)} data-testid="class-11">Class 11</button>
        <button type="button" className="btn btn--primary" onClick={() => onPick(12)} data-testid="class-12">Class 12</button>
        <button type="button" className="btn btn--quiet" onClick={() => onPick("skip")} data-testid="class-skip">Skip (treated as Class 11)</button>
      </div>
    </section>
  );
}
