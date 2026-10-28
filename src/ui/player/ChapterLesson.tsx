"use client";
// The chapter route. Normally it runs an adaptive session (SessionPlayer). `?q=<templateId>&seed=<n>`
// opens one specific question and variation instead (used by the content review tool and tests).
import Link from "next/link";
import { useEffect, useState } from "react";
import { entryById, pickEntry, playerChapterFor, templatesForChapter } from "@/src/content/catalog";
import { newSeed } from "@/src/content/rng";
import { getChapter, skillById, viewOfChapter } from "@/src/domain/curriculum";
import { useProgress } from "@/src/persistence/store";
import { applyStoredMotionSetting, useMotion } from "../motion";
import { SessionPlayer } from "../session/SessionPlayer";
import { LessonPlayer } from "./LessonPlayer";

interface Choice { templateId: string; seed: number }

export function ChapterLesson({ chapterId }: { chapterId: string }) {
  const chapter = getChapter(chapterId);
  const view = viewOfChapter(chapterId);
  const backHref = `/map?view=${view.id}&chapter=${chapterId}`;
  const list = templatesForChapter(chapterId);
  useProgress(); // keeps the store warm for the return to the map
  const { reduced } = useMotion();
  const [choice, setChoice] = useState<Choice | null>(null);
  const [mode, setMode] = useState<"pending" | "single" | "session">("pending");
  const key = `noesis:lesson:${chapterId}`;

  useEffect(() => {
    applyStoredMotionSetting();
    const qs = new URLSearchParams(window.location.search);
    const qId = qs.get("q"), qSeed = Number(qs.get("seed"));
    if (!qId) { setMode("session"); return; }
    setMode("single");
    // a chapter's own templates, or a foundation template opened from a chapter that uses it (review tool links)
    const asked = qId ? entryById.get(qId)?.template : undefined;
    if (asked && (asked.chapterId === chapterId || playerChapterFor(asked) === chapterId)) {
      setChoice({ templateId: qId, seed: Number.isInteger(qSeed) && qSeed > 0 ? qSeed : newSeed() });
      return;
    }
    let c: Choice | null = null;
    try { c = JSON.parse(sessionStorage.getItem(key) ?? "null") as Choice | null; } catch { /* no storage */ }
    if (!c || entryById.get(c.templateId)?.template.chapterId !== chapterId) {
      const seed = newSeed();
      const e = pickEntry(chapterId, seed);
      c = e ? { templateId: e.template.id, seed } : null;
    }
    if (c) { try { sessionStorage.setItem(key, JSON.stringify(c)); } catch { /* ignore */ } }
    setChoice(c);
  }, [chapterId, key]);

  if (!list.length) {
    return (
      <main className="qshell" id="main">
        <div className="qbar"><Link className="btn btn--quiet" href={backHref}>← Back to map</Link></div>
        <section className="qprompt">
          <h1>{chapter.title}</h1>
          <p>Questions for this chapter are coming soon. You can still explore its skills and how it connects to other chapters on the map.</p>
          <Link className="btn btn--primary" href={backHref}>Back to the map</Link>
        </section>
      </main>
    );
  }
  if (mode === "session") return <SessionPlayer chapterId={chapterId} />;
  if (!choice) return <main className="qshell" aria-busy="true" />;
  const entry = entryById.get(choice.templateId);
  if (!entry) return <main className="qshell" aria-busy="true" />;
  const others = list.filter((e) => e.template.id !== choice.templateId).map((e) => ({ id: e.template.id, label: skillById.get(e.template.primarySkillId)?.title ?? e.template.primarySkillId }));
  return (
    <LessonPlayer
      key={`${choice.templateId}:${choice.seed}`}
      entry={entry} seed={choice.seed} reduced={reduced} backHref={backHref} others={others}
      onAnother={(templateId) => {
        const seed = newSeed();
        let id = templateId;
        if (!id) {
          // a fresh variation, preferring a different question when the chapter has more than one
          const pool = list.length > 1 ? list.filter((e) => e.template.id !== choice.templateId) : list;
          id = pool[seed % pool.length]!.template.id;
        }
        const c = { templateId: id, seed };
        try { sessionStorage.setItem(key, JSON.stringify(c)); } catch { /* ignore */ }
        const url = new URL(window.location.href);
        if (url.searchParams.has("q")) { url.searchParams.delete("q"); url.searchParams.delete("seed"); window.history.replaceState(null, "", url); }
        setChoice(c);
        window.scrollTo({ top: 0 });
      }}
    />
  );
}
