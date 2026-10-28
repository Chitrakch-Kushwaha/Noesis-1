"use client";
import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  directSuccessorChapters,
  foundationsUsedBy,
  getChapter,
  prerequisiteDetails,
  relatedOf,
  skillsOfChapter,
  viewOfChapter,
} from "@/src/domain/curriculum";
import { chapterProgress, chapterState, skillState, STATE_LABEL, type ProgressSnapshot, type SkillState } from "@/src/domain/progress";
import { StatusRing, subjectName } from "../StatusRing";

const SKILL_LABEL: Record<SkillState, string> = { unseen: "Not tried", practising: "Practising", "needs-review": "Needs review", independent: "Independent" };

export function ChapterPreview({
  chapterId, snapshot, now, playable, highlightSkill, reduced, onClose, onOpenChapter,
}: {
  chapterId: string;
  snapshot: ProgressSnapshot;
  now: number;
  playable: boolean;
  highlightSkill: string | null;
  reduced: boolean;
  onClose(): void;
  onOpenChapter(id: string): void;
}) {
  const c = getChapter(chapterId);
  const state = chapterState(c.id, snapshot, now);
  const prog = chapterProgress(c.id, snapshot);
  const tried = snapshot.attempts.filter((a) => a.chapterId === c.id).length;
  const prereqs = prerequisiteDetails(c.id);
  const leadsTo = directSuccessorChapters(c.id);
  const related = relatedOf(c.id);
  const foundations = foundationsUsedBy(c.id);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openSession = snapshot.sessions.some((x) => x.chapterId === c.id && (x.status === "active" || x.status === "paused"));

  useEffect(() => {
    headingRef.current?.focus();
  }, [chapterId]);
  useEffect(() => {
    if (!highlightSkill) return;
    document.querySelector(`[data-skill="${CSS.escape(highlightSkill)}"]`)?.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
  }, [highlightSkill, reduced]);

  return (
    <motion.aside
      className="preview"
      role="dialog"
      aria-modal="false"
      aria-labelledby="preview-title"
      data-testid="chapter-preview"
      initial={reduced ? false : { opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 24 }}
      transition={{ duration: reduced ? 0 : 0.24, ease: [0.2, 0, 0, 1] }}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <header className="preview__head">
        <h2 id="preview-title" ref={headingRef} tabIndex={-1}>{c.title}</h2>
        <div className="preview__sub">
          <span>{subjectName(c.subject)} · Class {c.class}</span>
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><StatusRing state={state} /> {STATE_LABEL[state]}</span>
          {!playable && <span className="tag">Preview only</span>}
        </div>
        <div className="progress-line" aria-label={`${prog.touched} of ${prog.total} skills tried, ${tried} questions answered`}>
          <span className="bar" aria-hidden="true"><span style={{ transform: `scaleX(${prog.fraction})` }} /></span>
          <span>{prog.touched}/{prog.total} skills tried · {tried} {tried === 1 ? "question" : "questions"}</span>
        </div>
        <button className="btn btn--quiet icon-btn preview__close" onClick={onClose} aria-label="Close chapter preview">✕</button>
      </header>

      <div className="preview__body">
        <h3>Skills in this chapter</h3>
        <ul className="skill-list">
          {skillsOfChapter(c.id).map((s) => {
            const st = skillState(s.id, snapshot.attempts);
            return (
              <li key={s.id} data-skill={s.id} data-hl={highlightSkill === s.id}>
                <span className="skill-dot" data-s={st} aria-hidden="true" />
                <span>{s.title}</span>
                <span className="skill-state">{SKILL_LABEL[st]}</span>
              </li>
            );
          })}
        </ul>

        <h3>Builds on</h3>
        {prereqs.length === 0 && foundations.length === 0 && <p className="muted">No earlier chapters.</p>}
        {prereqs.map((p) => {
          const pc = getChapter(p.chapterId);
          const pv = viewOfChapter(pc.id);
          return (
            <div className="prereq" key={p.chapterId}>
              <button className="chip-btn" onClick={() => onOpenChapter(pc.id)}>
                {pc.title} <span className="tag tag--view">{pv.short}</span>
              </button>
              <ul className="prereq__links">
                {p.links.map((l) => (
                  <li key={l.prereq + l.skill}>{l.skillTitle} uses {l.prereqTitle.charAt(0).toLowerCase() + l.prereqTitle.slice(1)}</li>
                ))}
              </ul>
            </div>
          );
        })}
        {foundations.length > 0 && (
          <p className="muted" style={{ fontSize: 13.5 }}>
            Earlier-level basics used here: {foundations.map((f) => f.title).join("; ")}.
          </p>
        )}

        {leadsTo.length > 0 && (
          <>
            <h3>Leads to</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {leadsTo.map((id) => (
                <button key={id} className="chip-btn" onClick={() => onOpenChapter(id)}>
                  {getChapter(id).title} <span className="tag tag--view">{viewOfChapter(id).short}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {related.length > 0 && (
          <>
            <h3>Related concepts</h3>
            <p className="related-note">Related links are for context. They are not prerequisites and never send you to extra practice.</p>
            {related.map((r) => (
              <div className="prereq" key={r.chapterId}>
                <button className="chip-btn" onClick={() => onOpenChapter(r.chapterId)}>
                  {getChapter(r.chapterId).title} <span className="tag tag--view">{viewOfChapter(r.chapterId).short}</span>
                </button>
                <p className="prereq__links" style={{ listStyle: "none", paddingLeft: 2 }}>{r.note}</p>
              </div>
            ))}
          </>
        )}
      </div>

      <footer className="preview__foot">
        {playable ? (
          <>
            <Link className="btn btn--primary" href={`/chapter/${c.id}/try`} data-testid="try-question">{openSession ? "Resume session" : "Start a session"}</Link>
            <p className="preview__note">{openSession
              ? "Pick up exactly where you left off, including any detour."
              : "The first question helps us find the best place for you to begin. You can start even if the earlier chapters are new to you."}</p>
          </>
        ) : (
          <>
            <button className="btn" aria-disabled="true" disabled>Try a question</button>
            <p className="preview__note">Questions for this chapter are coming soon. You can still explore its skills and how it connects to other chapters.</p>
          </>
        )}
      </footer>
    </motion.aside>
  );
}
