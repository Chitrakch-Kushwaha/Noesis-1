"use client";
import { AnimatePresence } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chapters, getChapter, isViewId, viewIdOf, VIEWS, type ViewId } from "@/src/domain/curriculum";
import { chapterProgress, chapterState, recommendation, STATE_LABEL, type Recommendation } from "@/src/domain/progress";
import { layoutView } from "@/src/domain/roadmapLayout";
import { useProgress } from "@/src/persistence/store";
import { PLAYABLE_CHAPTERS } from "@/src/content/playable";
import { applyStoredMotionSetting, useMotion } from "../motion";
import { applyPreviewFromUrl, setPreview } from "../settings";
import { ChapterPreview } from "./ChapterPreview";
import { Legend, ListView, SearchBox, ViewTabs } from "./Chrome";
import { ProgressPanel, ReviewDialog } from "./ProgressPanel";
import { Roadmap, type LastSeen, type RoadmapHandle } from "./Roadmap";

const VIEW_KEY = "noesis:view";
const LEGEND_KEY = "noesis:legend";
const SEEN_KEY = "noesis:lastSeen";
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* per-viewer convenience only */ } },
};

const VIEW_BLURB: Record<ViewId, string> = {
  physics11: "Mechanics from motion in a line to oscillations. Arrows point from what you need to what it unlocks.",
  physics12: "Electricity, magnetism and optics. Electric fields build on Class 11 rotation; ray optics stands on its own.",
  maths11: "From sets and functions to trigonometry, lines, conics and first ideas of calculus.",
  maths12: "Calculus and vectors. Several chapters build directly on Class 11 Maths.",
};

export function Dashboard() {
  const { ready, persistent, snapshot } = useProgress();
  const { setting: motionSetting, reduced } = useMotion();
  const [view, setView] = useState<ViewId>("physics11");
  const [selected, setSelected] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [highlightSkill, setHighlightSkill] = useState<string | null>(null);
  const [listMode, setListMode] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [legendOpen, setLegendOpen] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [introToken, setIntroToken] = useState(0);
  const [lastSeen, setLastSeen] = useState<LastSeen | null>(null);
  const [zoomK, setZoomK] = useState(1);
  const [announce, setAnnounce] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const [preview, setPreviewState] = useState(false);
  const roadmapRef = useRef<RoadmapHandle>(null);
  const pendingFocus = useRef<string | null>(null);

  // initial state: URL (?view=&chapter=) beats the remembered view
  useEffect(() => {
    applyStoredMotionSetting();
    // reviewer preview shows preview-basis results; it is off unless someone turned it on
    setPreviewState(applyPreviewFromUrl());
    setNow(Date.now());
    const params = new URLSearchParams(window.location.search);
    if (params.get("review") === "1") setReviewOpen(true);
    const qv = params.get("view"), qc = params.get("chapter");
    const remembered = ls.get(VIEW_KEY);
    if (qc && chapters.some((c) => c.id === qc)) {
      setView(viewIdOf(getChapter(qc)));
      setSelected(qc);
      setPreviewOpen(true);
      pendingFocus.current = qc;
    } else if (isViewId(qv)) setView(qv);
    else if (isViewId(remembered)) setView(remembered);
    const legendPref = ls.get(LEGEND_KEY);
    setLegendOpen(legendPref ? legendPref !== "closed" : window.innerWidth >= 768);
    try { setLastSeen(JSON.parse(ls.get(SEEN_KEY) ?? "null")); } catch { setLastSeen(null); }
    const mq = window.matchMedia("(max-width: 1199px)");
    const onMq = () => setCompact(mq.matches);
    onMq();
    mq.addEventListener("change", onMq);
    const tick = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => { mq.removeEventListener("change", onMq); window.clearInterval(tick); };
  }, []);

  // remember what the student has now seen, after the change animation has had time to play
  useEffect(() => {
    if (!ready) return;
    const id = window.setTimeout(() => {
      const seen: LastSeen = {};
      for (const c of chapters) seen[c.id] = { state: chapterState(c.id, snapshot, Date.now()), fraction: chapterProgress(c.id, snapshot).fraction };
      ls.set(SEEN_KEY, JSON.stringify(seen));
    }, 2500);
    return () => window.clearTimeout(id);
  }, [ready, snapshot]);

  const layout = useMemo(() => layoutView(view), [view]);
  const recs = useMemo(() => {
    const r: Record<string, Recommendation> = {};
    for (const c of chapters) r[c.id] = recommendation(c.id, snapshot, now);
    return r;
  }, [snapshot, now]);

  const switchView = useCallback((v: ViewId, opts?: { keepSelection?: boolean }) => {
    setView(v);
    ls.set(VIEW_KEY, v);
    setIntroToken((t) => t + 1);
    if (!opts?.keepSelection) { setSelected(null); setPreviewOpen(false); }
    setAnnounce(`${VIEWS.find((x) => x.id === v)!.label} roadmap.`);
    const url = new URL(window.location.href);
    url.searchParams.set("view", v);
    url.searchParams.delete("chapter");
    window.history.replaceState(null, "", url);
  }, []);

  const openChapter = useCallback((id: string, skillId?: string) => {
    const v = viewIdOf(getChapter(id));
    if (v !== view) switchView(v, { keepSelection: true });
    setListMode(false);
    setSelected(id);
    setPreviewOpen(true);
    setHighlightSkill(skillId ?? null);
    pendingFocus.current = id;
    const c = getChapter(id);
    setAnnounce(`${c.title} selected. ${STATE_LABEL[chapterState(id, snapshot, now)]}.`);
    const url = new URL(window.location.href);
    url.searchParams.set("view", v);
    url.searchParams.set("chapter", id);
    window.history.replaceState(null, "", url);
  }, [view, switchView, snapshot, now]);

  // focus + camera once the target view is laid out
  useEffect(() => {
    if (listMode || !pendingFocus.current) return;
    const id = pendingFocus.current;
    if (viewIdOf(getChapter(id)) !== view) return;
    const t = window.setTimeout(() => { roadmapRef.current?.focusChapter(id); pendingFocus.current = null; }, reduced ? 0 : 120);
    return () => window.clearTimeout(t);
  }, [view, layout, selected, listMode, reduced]);

  const closePreview = useCallback(() => {
    setPreviewOpen(false);
    const id = selected;
    setSelected(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("chapter");
    window.history.replaceState(null, "", url);
    if (id) window.setTimeout(() => document.querySelector<HTMLButtonElement>(`[data-key="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }), 0);
  }, [selected]);

  // global shortcuts (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, select, textarea, [role=dialog][aria-modal=true]") || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") { e.preventDefault(); document.getElementById("roadmap-search")?.focus(); }
      else if (["1", "2", "3", "4"].includes(e.key)) switchView(VIEWS[Number(e.key) - 1]!.id);
      else if (e.key === "l" || e.key === "L") setListMode((m) => !m);
      else if (listMode) return;
      else if (e.key === "+" || e.key === "=") roadmapRef.current?.zoomBy(1.25);
      else if (e.key === "-" || e.key === "_") roadmapRef.current?.zoomBy(0.8);
      else if (e.key === "0") roadmapRef.current?.fit();
      else if (e.key === "Escape" && previewOpen) closePreview();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [switchView, listMode, previewOpen, closePreview]);

  const currentView = VIEWS.find((v) => v.id === view)!;

  return (
    <div className="shell">
      <a className="skip-link" href="#roadmap">Skip to the roadmap</a>
      <header className="topbar">
        <a className="brand" href="/" aria-label="NOÊSIS home">
          <svg className="brand__mark" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="5" cy="19" r="3" fill="var(--accent-orange)" />
            <circle cx="19" cy="5" r="3" fill="var(--accent-amber)" />
            <path d="M7 17 C 10 10, 14 14, 17 7" fill="none" stroke="var(--highlight-peach)" strokeWidth="2" strokeLinecap="round" />
          </svg>
          NOÊSIS
        </a>
        <ViewTabs value={view} onChange={(v) => switchView(v)} />
        <span className="topbar__spacer" />
        <SearchBox onPick={({ chapterId, skillId }) => openChapter(chapterId, skillId)} />
        <button className="btn" aria-pressed={listMode} onClick={() => setListMode((m) => !m)} data-testid="list-toggle">
          {listMode ? "Map view" : "List view"}
        </button>
        <button className="btn panel-toggle" aria-expanded={panelOpen} aria-controls="progress-panel" onClick={() => setPanelOpen((o) => !o)}>
          Progress
        </button>
      </header>

      <div className="main">
        <section className="stage" id="roadmap" aria-label={`${currentView.label} roadmap`} tabIndex={-1} role="tabpanel" aria-labelledby={`tab-${view}`}>
          {preview && (
            <p className="banner" role="note" data-testid="preview-banner">
              Reviewer preview is on: results from preview sessions (where questions awaiting review counted) show on this map.{" "}
              <button className="link-btn" onClick={() => { setPreview(false); setPreviewState(false); setNow(Date.now()); }} data-testid="preview-off">Turn off reviewer preview</button>
            </p>
          )}
          {ready && !persistent && (
            <p className="banner" role="status">Progress can’t be saved in this browser (private browsing?). You can still practise; it will be lost when you close the tab.</p>
          )}
          {listMode ? (
            <ListView snapshot={snapshot} now={now} playable={PLAYABLE_CHAPTERS} recs={recs} onOpen={(id) => openChapter(id)} />
          ) : (
            <>
              <Roadmap
                ref={roadmapRef}
                layout={layout}
                snapshot={snapshot}
                now={now}
                selected={selected}
                recs={recs}
                playable={PLAYABLE_CHAPTERS}
                lastSeen={ready ? lastSeen : null}
                reduced={reduced}
                introToken={introToken}
                reserveBottom={compact && typeof window !== "undefined" && window.innerWidth < 768 ? 120 : legendOpen ? 128 : 72}
                onSelect={(id) => (selected === id && previewOpen ? closePreview() : openChapter(id))}
                onGhost={(id) => openChapter(id)}
                onZoomChange={setZoomK}
              />
              <div className="view-caption">
                <h1>{currentView.label}</h1>
                <p>{VIEW_BLURB[view]}</p>
              </div>
              <div className="canvas-controls" role="group" aria-label="Map controls">
                <button className="btn icon-btn" onClick={() => roadmapRef.current?.zoomBy(1.25)} aria-label="Zoom in">+</button>
                <button className="btn icon-btn" onClick={() => roadmapRef.current?.zoomBy(0.8)} aria-label="Zoom out">−</button>
                <button className="btn" onClick={() => roadmapRef.current?.fit()} data-testid="fit">Fit map</button>
                <span className="zoom-readout" aria-live="off" data-testid="zoom-readout">{Math.round(zoomK * 100)}%</span>
              </div>
              <Legend open={legendOpen} onToggle={() => { setLegendOpen((o) => { ls.set(LEGEND_KEY, o ? "closed" : "open"); return !o; }); }} />
            </>
          )}
          <AnimatePresence>
            {previewOpen && selected && (
              <ChapterPreview
                key={selected}
                chapterId={selected}
                snapshot={snapshot}
                now={now}
                playable={PLAYABLE_CHAPTERS.has(selected)}
                highlightSkill={highlightSkill}
                reduced={reduced}
                onClose={closePreview}
                onOpenChapter={(id) => openChapter(id)}
              />
            )}
          </AnimatePresence>
        </section>
        <ProgressPanel
          snapshot={snapshot}
          now={now}
          open={panelOpen}
          compact={compact}
          onToggle={() => setPanelOpen((o) => !o)}
          onReview={() => setReviewOpen(true)}
          motion={motionSetting}
        />
      </div>
      {reviewOpen && <ReviewDialog snapshot={snapshot} now={now} onClose={() => setReviewOpen(false)} />}
      <div className="sr-only" aria-live="polite" data-testid="announcer">{announce}</div>
    </div>
  );
}
