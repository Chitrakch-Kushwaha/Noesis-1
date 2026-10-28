"use client";
import { select } from "d3-selection";
import "d3-transition";
import { zoom, zoomIdentity, type D3ZoomEvent, type ZoomBehavior, type ZoomTransform } from "d3-zoom";
import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { getChapter, VIEWS, viewIdOf } from "@/src/domain/curriculum";
import { chapterProgress, chapterState, STATE_LABEL, type ChapterState, type ProgressSnapshot, type Recommendation } from "@/src/domain/progress";
import type { LayoutNode, ViewLayout } from "@/src/domain/roadmapLayout";
import { StatusRing, subjectGlyph, subjectName } from "../StatusRing";

export interface RoadmapHandle {
  zoomBy(f: number): void;
  fit(animated?: boolean): void;
  focusChapter(id: string): void;
}
export interface LastSeen { [chapterId: string]: { state: ChapterState; fraction: number } }

interface Props {
  layout: ViewLayout;
  snapshot: ProgressSnapshot;
  now: number;
  selected: string | null;
  recs: Record<string, Recommendation>;
  playable: ReadonlySet<string>;
  lastSeen: LastSeen | null;
  reduced: boolean;
  introToken: number;
  /** px kept clear at the bottom when fitting (legend, mobile sheet) */
  reserveBottom: number;
  onSelect(chapterId: string): void;
  onGhost(chapterId: string): void;
  onZoomChange?(k: number): void;
  ref?: Ref<RoadmapHandle>;
}

const MIN_K = 0.4, MAX_K = 2;

export function Roadmap({ layout, snapshot, now, selected, recs, playable, lastSeen, reduced, introToken, reserveBottom, onSelect, onGhost, onZoomChange, ref }: Props) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const lastK = useRef(-1);
  const zoomRef = useRef<ZoomBehavior<HTMLDivElement, unknown> | null>(null);
  const tRef = useRef<ZoomTransform>(zoomIdentity);
  const [introOn, setIntroOn] = useState(false);
  const { bounds } = layout;

  const apply = useCallback((t: ZoomTransform) => {
    tRef.current = t;
    const scene = sceneRef.current, dots = dotsRef.current;
    if (!scene || !dots) return;
    scene.style.transform = `translate(${t.x}px, ${t.y}px) scale(${t.k})`;
    const s = 24 * t.k;
    if (dots.dataset.k !== String(t.k)) { dots.style.backgroundSize = `${s}px ${s}px`; dots.dataset.k = String(t.k); }
    // the dots layer starts 96px outside the viewport; shift it within one tile so its grid stays locked to the map
    const phase = (v: number) => ((((v + 96) % s) + s) % s) - s;
    dots.style.transform = `translate(${phase(t.x)}px, ${phase(t.y)}px)`;
    if (Math.abs(t.k - lastK.current) > 0.004) { lastK.current = t.k; onZoomChange?.(t.k); }
  }, [onZoomChange]);

  const to = useCallback((t: ZoomTransform, ms: number) => {
    const vp = viewportRef.current, z = zoomRef.current;
    if (!vp || !z) return;
    const sel = select(vp);
    if (ms <= 0 || reduced) z.transform(sel, t);
    else sel.transition().duration(ms).call(z.transform, t);
  }, [reduced]);

  const fitTransform = useCallback(() => {
    const vp = viewportRef.current!;
    const w = vp.clientWidth, h = vp.clientHeight;
    const topPad = 64; // room for the view caption
    const usableH = h - topPad - reserveBottom - 8;
    const k = Math.max(MIN_K, Math.min(1.15, (w - 32) / bounds.w, usableH / bounds.h));
    return zoomIdentity.translate((w - bounds.w * k) / 2, topPad + Math.max(0, (usableH - bounds.h * k) / 2)).scale(k);
  }, [bounds, reserveBottom]);

  const nodeByKey = useMemo(() => new Map(layout.nodes.map((n) => [n.key, n])), [layout]);
  const centerOn = useCallback((n: LayoutNode, ms: number, minK = 0.85) => {
    const vp = viewportRef.current!;
    const k = Math.max(tRef.current.k, minK);
    const cx = n.x - bounds.x + n.w / 2, cy = n.y - bounds.y + n.h / 2;
    const offsetX = vp.clientWidth > 900 ? -120 : 0; // keep clear of the preview card on wide screens
    to(zoomIdentity.translate(vp.clientWidth / 2 + offsetX - cx * k, vp.clientHeight / 2 - cy * k).scale(k), ms);
  }, [bounds, to]);

  // d3-zoom: drag/pinch to pan and zoom; wheel pans, ctrl/pinch-wheel zooms (trackpad friendly)
  useLayoutEffect(() => {
    const vp = viewportRef.current!;
    const z = zoom<HTMLDivElement, unknown>()
      .scaleExtent([MIN_K, MAX_K])
      .clickDistance(5)
      .filter((ev: Event) => ev.type !== "wheel" && ev.type !== "dblclick" && !(ev as MouseEvent).button)
      .on("zoom", (e: D3ZoomEvent<HTMLDivElement, unknown>) => apply(e.transform));
    zoomRef.current = z;
    const sel = select(vp).call(z).on("dblclick.zoom", null);
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const t = tRef.current;
      if (e.ctrlKey || e.metaKey) {
        const r = vp.getBoundingClientRect();
        z.scaleTo(sel, Math.min(MAX_K, Math.max(MIN_K, t.k * Math.exp(-e.deltaY * 0.01))), [e.clientX - r.left, e.clientY - r.top]);
      } else z.translateBy(sel, -e.deltaX / t.k, -e.deltaY / t.k);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      vp.removeEventListener("wheel", onWheel);
      sel.on(".zoom", null);
    };
  }, [apply]);

  // initial camera on view change: fit, but never below a readable zoom (then align to the top); Fit shows everything
  const initialTransform = useCallback(() => {
    const f = fitTransform();
    const vp = viewportRef.current!;
    const minReadable = vp.clientWidth < 768 ? 0.62 : 0.8;
    if (f.k >= minReadable) return f;
    const k = minReadable;
    // centre the view's own chapters (not the side columns of linked chapters), aligned to the top
    const ch = layout.nodes.filter((n) => n.kind === "chapter");
    const cx = (Math.min(...ch.map((n) => n.x)) + Math.max(...ch.map((n) => n.x + n.w))) / 2 - bounds.x;
    const tx = Math.min(16, Math.max(vp.clientWidth - bounds.w * k - 16, vp.clientWidth / 2 - cx * k));
    return zoomIdentity.translate(tx, 64).scale(k);
  }, [fitTransform, bounds, layout]);

  // set the camera on view change, then play arrival in dependency order
  useLayoutEffect(() => {
    to(initialTransform(), 0);
    if (reduced) return setIntroOn(false);
    setIntroOn(true);
    const total = Math.max(...layout.nodes.map((n) => delays.get(n.key) ?? 0)) + 700;
    const id = window.setTimeout(() => setIntroOn(false), total);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, introToken]);

  useImperativeHandle(ref, () => ({
    zoomBy: (f) => {
      const vp = viewportRef.current!, z = zoomRef.current!;
      const sel = select(vp);
      if (reduced) z.scaleBy(sel, f);
      else sel.transition().duration(200).call(z.scaleBy, f);
    },
    fit: (animated = true) => to(fitTransform(), animated ? 400 : 0),
    focusChapter: (id) => {
      const n = nodeByKey.get(id) ?? layout.nodes.find((x) => x.chapterId === id);
      if (!n) return;
      centerOn(n, 600);
      requestAnimationFrame(() => sceneRef.current?.querySelector<HTMLButtonElement>(`[data-key="${CSS.escape(n.key)}"]`)?.focus({ preventScroll: true }));
    },
  }), [reduced, to, fitTransform, nodeByKey, layout, centerOn]);

  // arrival delays: chapters by layer then position; ghosts after; edges just after their source
  const delays = useMemo(() => {
    const m = new Map<string, number>();
    const chapterNodes = layout.nodes.filter((n) => n.kind === "chapter").sort((a, b) => a.layer - b.layer || a.x - b.x);
    let maxD = 0;
    chapterNodes.forEach((n) => {
      const idx = chapterNodes.filter((o) => o.layer === n.layer && o.x < n.x).length;
      const d = n.layer * 120 + idx * 32;
      m.set(n.key, d);
      maxD = Math.max(maxD, d);
    });
    layout.nodes.filter((n) => n.kind === "ghost").sort((a, b) => a.y - b.y).forEach((n, i) => m.set(n.key, maxD + 160 + i * 45));
    return m;
  }, [layout]);

  // path highlight: all ancestors (prerequisites) + direct successors of the selected chapter
  const path = useMemo(() => {
    if (!selected) return null;
    const prereqEdges = layout.edges.filter((e) => e.kind === "prereq");
    const nodes = new Set<string>([selected]);
    const edges = new Set<string>();
    const queue = [selected];
    while (queue.length) {
      const k = queue.pop()!;
      for (const e of prereqEdges) if (e.to === k && !edges.has(e.key)) { edges.add(e.key); nodes.add(e.from); queue.push(e.from); }
    }
    const up = new Set(edges);
    for (const e of prereqEdges) if (e.from === selected) { edges.add(e.key); nodes.add(e.to); }
    for (const e of layout.edges) if (e.kind === "related" && (e.from === selected || e.to === selected)) { edges.add(e.key); nodes.add(e.from); nodes.add(e.to); }
    return { nodes, edges, up };
  }, [selected, layout]);

  const recommendedEdges = useMemo(() => {
    const s = new Set<string>();
    for (const e of layout.edges)
      if (e.kind === "prereq" && recs[e.toChapter] === "recommended" && chapterState(e.fromChapter, snapshot, now) === "mastered") s.add(e.key);
    return s;
  }, [layout, recs, snapshot, now]);

  const stopIntro = () => introOn && setIntroOn(false);

  // spatial arrow-key navigation between nodes; the camera follows focus
  const onNodeKey = (e: KeyboardEvent<HTMLButtonElement>, n: LayoutNode) => {
    const dir = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as const)[e.key as "ArrowLeft"];
    if (!dir) return;
    e.preventDefault();
    const cx = n.x + n.w / 2, cy = n.y + n.h / 2;
    let best: LayoutNode | null = null, bestScore = Infinity;
    for (const o of layout.nodes) {
      if (o.key === n.key) continue;
      const dx = o.x + o.w / 2 - cx, dy = o.y + o.h / 2 - cy;
      const along = dx * dir[0] + dy * dir[1];
      if (along <= 4) continue;
      const across = Math.abs(dx * dir[1]) + Math.abs(dy * dir[0]);
      const score = along + across * 2.2;
      if (score < bestScore) { bestScore = score; best = o; }
    }
    if (best) sceneRef.current?.querySelector<HTMLButtonElement>(`[data-key="${CSS.escape(best.key)}"]`)?.focus({ preventScroll: true });
  };
  const ensureVisible = (n: LayoutNode) => {
    const vp = viewportRef.current!, t = tRef.current;
    const sx = (n.x - bounds.x) * t.k + t.x, sy = (n.y - bounds.y) * t.k + t.y;
    const m = 40;
    if (sx < m || sy < m + 50 || sx + n.w * t.k > vp.clientWidth - m || sy + n.h * t.k > vp.clientHeight - m) centerOn(n, 300, t.k);
  };

  const view = VIEWS.find((v) => v.id === layout.viewId)!;
  const chapterCount = layout.nodes.filter((n) => n.kind === "chapter").length;

  return (
    <div
      ref={viewportRef}
      className="viewport"
      data-testid="roadmap-viewport"
      onPointerDown={stopIntro}
      onWheel={stopIntro}
      onKeyDown={stopIntro}
    >
      <div ref={dotsRef} className="dots" aria-hidden="true" />
      <div className="atmosphere" aria-hidden="true" />
      <div ref={sceneRef} className="scene" data-intro={introOn ? "on" : "off"} data-testid="roadmap-scene">
        <svg className="edges" width={bounds.w} height={bounds.h} aria-hidden="true" data-flow="on" key={`flow-${selected ?? "none"}-${introToken}`}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--border-strong)" />
            </marker>
            <marker id="arrow-hot" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--accent-orange)" />
            </marker>
          </defs>
          <g transform={`translate(${-bounds.x} ${-bounds.y})`}>
            {layout.edges.map((e) => {
              const on = path?.edges.has(e.key) ?? false;
              const rec = !path && recommendedEdges.has(e.key);
              const dim = path ? !on : false;
              const delay = (delays.get(e.from) ?? 0) + 200;
              const hot = on || rec;
              const cls = ["edge", e.kind === "related" ? "edge--related" : "edge--draw", on ? "edge--onpath" : "", rec ? "edge--recommended" : "", dim ? "edge--dim" : ""].join(" ");
              return (
                <g key={e.key} data-edge={e.key} data-kind={e.kind}>
                  <path className={cls} d={e.d} pathLength={1} style={{ ["--delay" as string]: `${delay}ms` }} markerEnd={e.kind === "prereq" ? `url(#${hot ? "arrow-hot" : "arrow"})` : undefined} />
                  {e.kind === "prereq" && hot && <path className="edge-flow edge-flow--active" d={e.d} pathLength={1} />}
                  {e.label && (
                    <text className="edge-label" x={e.label.x} y={e.label.y - 6} textAnchor="middle" style={{ ["--delay" as string]: `${delay}ms`, opacity: dim ? 0.25 : undefined }}>
                      {e.label.text}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
        <div role="group" aria-label={`${view.label} roadmap: ${chapterCount} chapters`} aria-describedby="roadmap-keys">
          {layout.nodes.map((n) => {
            const left = n.x - bounds.x, top = n.y - bounds.y;
            const delay = `${delays.get(n.key) ?? 0}ms`;
            const onpath = path?.nodes.has(n.key) ?? false;
            const dim = path ? !onpath : false;
            if (n.kind === "ghost") {
              const c = getChapter(n.chapterId);
              const v = VIEWS.find((x) => x.id === viewIdOf(c))!;
              const caption = n.role === "buildsOn" ? "Builds on" : n.role === "leadsTo" ? "Leads to" : "Related";
              return (
                <button
                  key={n.key}
                  data-key={n.key}
                  data-role={n.role}
                  data-onpath={onpath}
                  data-dim={dim}
                  className="ghost"
                  style={{ left, top, width: n.w, height: n.h, ["--delay" as string]: delay }}
                  aria-label={`${caption}: ${c.title}, in ${v.label}. Opens that view.`}
                  onClick={() => onGhost(n.chapterId)}
                  onKeyDown={(e) => onNodeKey(e, n)}
                  onFocus={() => ensureVisible(n)}
                >
                  <span className="ghost__row"><span>{caption}</span><span className="tag tag--view">{v.short}</span></span>
                  <span className="ghost__title">{c.title}</span>
                </button>
              );
            }
            const c = getChapter(n.chapterId);
            const state = chapterState(c.id, snapshot, now);
            const prog = chapterProgress(c.id, snapshot);
            const rec = recs[c.id] ?? null;
            const isPlayable = playable.has(c.id);
            const label = [
              `${c.title}. ${subjectName(c.subject)}, Class ${c.class}.`,
              `${STATE_LABEL[state]}. ${prog.touched} of ${prog.total} skills tried.`,
              isPlayable ? "Starting question available." : "Preview only: questions coming soon.",
              rec === "recommended" ? "Recommended next." : rec === "start-here" ? "Good place to start." : "",
            ].join(" ");
            return (
              <ChapterNode
                key={n.key}
                node={n}
                left={left}
                top={top}
                delay={delay}
                state={state}
                fraction={prog.fraction}
                last={lastSeen?.[c.id]}
                introOn={introOn}
                selected={selected === c.id}
                dim={dim}
                rec={rec}
                playable={isPlayable}
                glyph={subjectGlyph(c.subject)}
                title={c.title}
                ariaLabel={label}
                onClick={() => onSelect(c.id)}
                onKeyDown={(e) => onNodeKey(e, n)}
                onFocus={() => ensureVisible(n)}
              />
            );
          })}
        </div>
      </div>
      <p id="roadmap-keys" className="sr-only">
        Use arrow keys to move between chapters, Enter to open a chapter preview. Plus and minus zoom, 0 fits the map, L opens the list view.
      </p>
    </div>
  );
}

function ChapterNode(p: {
  node: LayoutNode; left: number; top: number; delay: string; state: ChapterState; fraction: number;
  last?: { state: ChapterState; fraction: number }; introOn: boolean; selected: boolean; dim: boolean; rec: Recommendation;
  playable: boolean; glyph: string; title: string; ariaLabel: string;
  onClick(): void; onKeyDown(e: KeyboardEvent<HTMLButtonElement>): void; onFocus(): void;
}) {
  // progress fill animates from what the student last saw to the current value (docs/07: progress fill)
  const [shown, setShown] = useState(p.last?.fraction ?? p.fraction);
  const changed = !!p.last && (p.last.state !== p.state || Math.abs(p.last.fraction - p.fraction) > 1e-9);
  useEffect(() => {
    if (shown === p.fraction) return;
    const id = window.setTimeout(() => setShown(p.fraction), p.introOn ? 900 : 250);
    return () => window.clearTimeout(id);
  }, [p.fraction, shown, p.introOn]);
  return (
    <button
      data-key={p.node.key}
      data-testid={`node-${p.node.chapterId}`}
      data-state={p.state}
      data-selected={p.selected}
      data-dim={p.dim}
      data-changed={changed}
      className={`node${p.rec === "start-here" ? " node--start" : ""}`}
      style={{ left: p.left, top: p.top, width: p.node.w, height: p.node.h, ["--delay" as string]: p.delay }}
      aria-label={p.ariaLabel}
      aria-pressed={p.selected}
      onClick={p.onClick}
      onKeyDown={p.onKeyDown}
      onFocus={p.onFocus}
    >
      <span className="node__top">
        <span className="node__glyph" aria-hidden="true">{p.glyph}</span>
        <span className="node__title">{p.title}</span>
      </span>
      <span className="node__meta" aria-hidden="true">
        <StatusRing state={p.state} bloom={changed && p.last?.state !== p.state} />
        <span>{STATE_LABEL[p.state]}</span>
        {!p.playable && <span className="tag">Preview only</span>}
        {p.rec === "recommended" && <span className="tag tag--rec">Recommended</span>}
        {p.rec === "start-here" && <span className="tag tag--start">Good place to start</span>}
      </span>
      <span className="node__bar" aria-hidden="true">
        <span className="node__fill" style={{ transform: `scaleX(${shown})` }} />
      </span>
    </button>
  );
}
