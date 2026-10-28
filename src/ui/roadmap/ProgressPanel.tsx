"use client";
import { CloudSync } from "@/src/cloud/CloudSync";
import { useEffect, useState } from "react";
import { VIEWS } from "@/src/domain/curriculum";
import { panelStats, type ProgressSnapshot } from "@/src/domain/progress";
import { progressStore } from "@/src/persistence/store";
import { setMotionSetting, type MotionSetting } from "../motion";
import { setStoredClass, storedClass } from "../settings";
import { ContinueCard } from "./ContinueCard";

const dateFmt = (t: number) => new Date(t).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export function ProgressPanel({
  snapshot, now, open, compact, onToggle, onReview, motion,
}: {
  snapshot: ProgressSnapshot;
  now: number;
  open: boolean;
  compact: boolean;
  onToggle(): void;
  onReview(): void;
  motion: MotionSetting;
}) {
  const s = panelStats(snapshot, now);
  const maxDiff = Math.max(1, ...Object.values(s.byDifficulty).map((d) => d.attempted));
  const maxDay = Math.max(1, ...s.activity.map((d) => d.count));
  const [confirmErase, setConfirmErase] = useState(false);
  const [cls, setCls] = useState<ReturnType<typeof storedClass>>(null);
  useEffect(() => { setCls(storedClass()); }, []);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const importData = async (file: File | undefined) => {
    if (!file) return;
    try {
      await progressStore.importJson(await file.text());
      setImportMsg("Progress imported.");
    } catch {
      setImportMsg("That file isn't a NOÊSIS progress export, so nothing was changed.");
    }
  };

  const exportData = async () => {
    const blob = new Blob([await progressStore.exportJson()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `noesis-progress-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <aside className="panel" id="progress-panel" aria-label="Your progress" data-open={open} data-testid="progress-panel">
      <button className="panel__peek" onClick={onToggle} aria-expanded={open} aria-controls="progress-panel-body">
        <span>Progress · {s.totalAttempted} tried · {s.reviews.due} {s.reviews.due === 1 ? "review" : "reviews"} due</span>
        <span aria-hidden="true">{open ? "▾" : "▴"}</span>
      </button>
      <div id="progress-panel-body" style={{ display: "grid", gap: 14 }} inert={compact && !open ? true : undefined} aria-hidden={compact && !open ? true : undefined}>
        <h2>Your progress</h2>
        <ContinueCard snapshot={snapshot} />

        <section className="card" aria-labelledby="p-questions">
          <h3 id="p-questions">Questions attempted</h3>
          {(["easy", "medium", "hard"] as const).map((d) => (
            <div className="stat-row" key={d} data-testid={`stat-${d}`}>
              <span style={{ textTransform: "capitalize" }}>{d}</span>
              <span className="bar" aria-hidden="true"><span style={{ width: `${(s.byDifficulty[d].attempted / maxDiff) * 100}%` }} /></span>
              <span>
                {s.byDifficulty[d].attempted}
                <span className="muted"> · {s.byDifficulty[d].firstTry} first try</span>
              </span>
            </div>
          ))}
          {s.totalAttempted === 0 && <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>Nothing yet. Open a chapter marked “Good place to start” and try its question.</p>}
        </section>

        <section className="card" aria-labelledby="p-mastered">
          <h3 id="p-mastered">Mastered chapters</h3>
          <p style={{ margin: 0 }}><span className="big" data-testid="mastered-total">{s.mastered.total}</span> <span className="muted">of 24</span></p>
          <div className="view-grid">
            {VIEWS.map((v) => (
              <span key={v.id}>{v.short} <span className="muted">{s.mastered.byView[v.id]}/6</span></span>
            ))}
          </div>
        </section>

        <section className="card" aria-labelledby="p-reviews">
          <h3 id="p-reviews">Reviews due</h3>
          <p style={{ margin: 0 }}><span className="big" data-testid="reviews-due">{s.reviews.due}</span> <span className="muted">due now</span></p>
          {s.reviews.upcoming > 0 && (
            <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
              {s.reviews.upcoming} more scheduled{ s.reviews.nextDueAt ? `, next on ${dateFmt(s.reviews.nextDueAt)}` : ""}.
            </p>
          )}
          <button className="btn" onClick={onReview} disabled={s.reviews.due === 0}>Review now</button>
        </section>

        <section className="card" aria-labelledby="p-activity">
          <h3 id="p-activity">Activity</h3>
          <div className="activity" role="img" aria-label={`Questions per day over the last 14 days. ${s.last7} in the last 7 days.`}>
            {s.activity.map((d) => (
              <span key={d.day} data-on={d.count > 0} style={{ height: `${Math.max(6, (d.count / maxDay) * 100)}%` }} title={`${d.day}: ${d.count}`} />
            ))}
          </div>
          <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>{s.last7} {s.last7 === 1 ? "question" : "questions"} in the last 7 days</p>
        </section>

        <section className="card" aria-labelledby="p-settings">
          <h3 id="p-settings">Motion and data</h3>
          <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
            Motion
            <select
              value={motion}
              onChange={(e) => setMotionSetting(e.target.value as MotionSetting)}
              style={{ minHeight: 40, borderRadius: 8, background: "#0d0e10", border: "1px solid var(--border-strong)", padding: "0 8px" }}
              data-testid="motion-setting"
            >
              <option value="system">Follow my device</option>
              <option value="reduced">Reduced</option>
              <option value="full">Full</option>
            </select>
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 14 }}>
            Class
            <select
              value={cls === null ? "" : String(cls)}
              onChange={(e) => { const v = e.target.value; const c = v === "11" ? 11 : v === "12" ? 12 : "skip"; setStoredClass(c); setCls(c); }}
              style={{ minHeight: 40, borderRadius: 8, background: "#0d0e10", border: "1px solid var(--border-strong)", padding: "0 8px" }}
              data-testid="class-setting"
            >
              {cls === null && <option value="">Not set (treated as Class 11)</option>}
              <option value="11">Class 11</option>
              <option value="12">Class 12</option>
              <option value="skip">Prefer not to say (treated as Class 11)</option>
            </select>
          </label>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>Class is used only so practice never sends a Class 11 student into Class 12 topics. Every chapter stays open.</p>
          <CloudSync />
          {importMsg && <p role="status" style={{ margin: 0, fontSize: 13.5 }}>{importMsg}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="btn" onClick={exportData}>Export progress</button>
            <label className="btn" style={{ cursor: "pointer" }}>
              Import progress
              <input type="file" accept="application/json,.json" className="sr-only" data-testid="import-file" onChange={(e) => { void importData(e.target.files?.[0]); e.target.value = ""; }} />
            </label>
            {!confirmErase ? (
              <button className="btn btn--quiet" onClick={() => setConfirmErase(true)}>Erase progress…</button>
            ) : (
              <span role="group" aria-label="Confirm erase" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button className="btn" style={{ borderColor: "var(--danger)" }} onClick={async () => { await progressStore.eraseAll(); setConfirmErase(false); }}>
                  Erase everything
                </button>
                <button className="btn btn--quiet" onClick={() => setConfirmErase(false)}>Keep my progress</button>
              </span>
            )}
          </div>
        </section>
      </div>
    </aside>
  );
}

export function ReviewDialog({ snapshot, now, onClose }: { snapshot: ProgressSnapshot; now: number; onClose(): void }) {
  const due = snapshot.flashcards.filter((f) => f.dueAt <= now);
  const [idx, setIdx] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = due[idx];
  const answer = async (knew: boolean) => {
    if (!card) return;
    await progressStore.review(card, knew);
    setFlipped(false);
    setIdx((i) => i); // the reviewed card leaves the due list, so the same index shows the next one
  };
  return (
    <div className="dialog-backdrop" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby="review-title">
        <h2 id="review-title">Review</h2>
        {card ? (
          <>
            <p className="muted" style={{ margin: 0 }}>{due.length} due</p>
            <div className="flashcard" aria-live="polite">
              <strong>{card.front}</strong>
              {flipped && <p style={{ margin: 0 }}>{card.back}</p>}
            </div>
            {!flipped ? (
              <button className="btn btn--primary" autoFocus onClick={() => setFlipped(true)}>Show answer</button>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn btn--primary" autoFocus onClick={() => answer(true)}>I knew it</button>
                <button className="btn" onClick={() => answer(false)}>Not yet</button>
              </div>
            )}
          </>
        ) : (
          <p style={{ margin: 0 }}>All caught up. Nothing is due right now.</p>
        )}
        <button className="btn btn--quiet" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
