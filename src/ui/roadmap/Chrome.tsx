"use client";
// Smaller dashboard pieces: view tabs, legend, search, list view.
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { chapters, chaptersInView, getChapter, skills, VIEWS, viewOfChapter, type ViewId } from "@/src/domain/curriculum";
import { chapterState, STATE_LABEL, type ProgressSnapshot, type Recommendation } from "@/src/domain/progress";
import { StatusRing } from "../StatusRing";

export function ViewTabs({ value, onChange }: { value: ViewId; onChange(v: ViewId): void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let j = i;
    if (e.key === "ArrowRight") j = (i + 1) % VIEWS.length;
    else if (e.key === "ArrowLeft") j = (i - 1 + VIEWS.length) % VIEWS.length;
    else if (e.key === "Home") j = 0;
    else if (e.key === "End") j = VIEWS.length - 1;
    else return;
    e.preventDefault();
    onChange(VIEWS[j]!.id);
    refs.current[j]?.focus();
  };
  return (
    <div className="tabs" role="tablist" aria-label="Roadmap views">
      {VIEWS.map((v, i) => (
        <button
          key={v.id}
          ref={(el) => { refs.current[i] = el; }}
          role="tab"
          id={`tab-${v.id}`}
          aria-selected={value === v.id}
          aria-controls="roadmap"
          tabIndex={value === v.id ? 0 : -1}
          className="tab"
          onClick={() => onChange(v.id)}
          onKeyDown={(e) => onKey(e, i)}
          data-testid={`tab-${v.id}`}
        >
          {v.label}
        </button>
      ))}
    </div>
  );
}

export function Legend({ open, onToggle }: { open: boolean; onToggle(): void }) {
  return (
    <section className="legend" data-open={open} aria-labelledby="legend-title" data-testid="legend">
      {open ? (
        <>
          <div className="legend__head">
            <h2 id="legend-title">Legend</h2>
            <button className="btn btn--quiet legend__hide" onClick={onToggle} aria-expanded="true">Hide legend</button>
          </div>
          <ul className="legend__rows">
            <li>
              <svg width="40" height="12" aria-hidden="true"><path d="M2 6 H31" stroke="var(--accent-orange)" strokeWidth="2.2" /><path d="M30 1.5 L38 6 L30 10.5 z" fill="var(--accent-orange)" /></svg>
              <span><strong>Solid arrow: prerequisite.</strong> Needed first; only prerequisites can lead to extra practice.</span>
            </li>
            <li>
              <svg width="40" height="12" aria-hidden="true"><path d="M2 6 H38" stroke="var(--highlight-peach)" strokeWidth="1.6" strokeDasharray="2 6" strokeLinecap="round" /></svg>
              <span><strong>Dotted line: related concept.</strong> Context only; it can never trigger remediation.</span>
            </li>
            <li className="legend__inline">
              <span><span className="tag tag--view">Maths 12</span> chapter in another view</span>
              <span className="legend__states">
                <StatusRing state="unvisited" size={12} /> Unvisited <StatusRing state="learning" size={12} /> Learning <StatusRing state="needs-review" size={12} /> Needs review <StatusRing state="mastered" size={12} /> Mastered
              </span>
              <span><span className="tag">Preview only</span> questions coming soon</span>
            </li>
          </ul>
        </>
      ) : (
        <button className="btn" onClick={onToggle} aria-expanded="false">Show legend</button>
      )}
    </section>
  );
}

interface Result { kind: "chapter" | "skill"; id: string; chapterId: string; title: string; meta: string }

export function SearchBox({ onPick }: { onPick(r: { chapterId: string; skillId?: string }): void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const results = useMemo<Result[]>(() => {
    const term = q.trim().toLowerCase();
    if (!term) return [];
    const words = term.split(/\s+/);
    const match = (s: string) => words.every((w) => s.toLowerCase().includes(w));
    const ch: Result[] = chapters
      .filter((c) => match(c.title))
      .map((c) => ({ kind: "chapter", id: c.id, chapterId: c.id, title: c.title, meta: `Chapter · ${viewOfChapter(c.id).label}` }));
    const sk: Result[] = skills
      .filter((s) => match(s.title))
      .map((s) => ({ kind: "skill", id: s.id, chapterId: s.chapter, title: s.title, meta: `Skill in ${getChapter(s.chapter).title} · ${viewOfChapter(s.chapter).short}` }));
    return [...ch, ...sk].slice(0, 10);
  }, [q]);
  const pick = (r: Result) => {
    onPick({ chapterId: r.chapterId, skillId: r.kind === "skill" ? r.id : undefined });
    setQ("");
    setOpen(false);
  };
  return (
    <div className="search">
      <svg className="search__icon" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M11 11l3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
      <input
        id="roadmap-search"
        type="search"
        role="combobox"
        aria-expanded={open && q.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined}
        aria-label="Search chapters and skills"
        placeholder="Search chapters and skills"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(results.length - 1, a + 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
          else if (e.key === "Enter" && results[active]) { e.preventDefault(); pick(results[active]); }
          else if (e.key === "Escape") { setQ(""); setOpen(false); }
        }}
        data-testid="search"
      />
      {open && q.trim() && (
        <ul className="search__list" id={listId} role="listbox" aria-label="Search results">
          {results.length === 0 && <li className="search__empty" role="option" aria-selected="false">No chapter or skill matches “{q}”.</li>}
          {results.map((r, i) => (
            <li
              key={r.kind + r.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className="search__opt"
              onMouseDown={(e) => { e.preventDefault(); pick(r); }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{r.title}</span>
              <span className="search__meta">{r.meta}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ListView({
  snapshot, now, playable, recs, onOpen,
}: {
  snapshot: ProgressSnapshot;
  now: number;
  playable: ReadonlySet<string>;
  recs: Record<string, Recommendation>;
  onOpen(chapterId: string): void;
}) {
  return (
    <div className="listview" data-testid="list-view">
      <p className="muted" style={{ margin: "0 0 4px" }}>All 24 chapters, grouped by view. Each one matches its node on the map.</p>
      {VIEWS.map((v) => (
        <section key={v.id} aria-labelledby={`list-${v.id}`}>
          <h2 id={`list-${v.id}`}>{v.label}</h2>
          <ul>
            {chaptersInView(v.id).map((c) => {
              const st = chapterState(c.id, snapshot, now);
              return (
                <li key={c.id} className="listrow">
                  <div>
                    <div className="listrow__title">{c.title}</div>
                    <div className="listrow__meta">
                      <StatusRing state={st} size={13} /> {STATE_LABEL[st]}
                      {!playable.has(c.id) && <span className="tag">Preview only</span>}
                      {recs[c.id] === "recommended" && <span className="tag tag--rec">Recommended</span>}
                      {recs[c.id] === "start-here" && <span className="tag tag--start">Good place to start</span>}
                    </div>
                  </div>
                  <button className="btn" onClick={() => onOpen(c.id)} aria-label={`Open preview: ${c.title}`}>Open preview</button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
