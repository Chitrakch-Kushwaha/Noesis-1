"use client";
// Dashboard "Continue": the newest unfinished session, with the exact place it resumes (docs/02).
import Link from "next/link";
import { useEffect, useState } from "react";
import { getChapter } from "@/src/domain/curriculum";
import type { ProgressSnapshot } from "@/src/domain/progress";
import { titleOf } from "@/src/engine/graph";
import { breadcrumb, topFrame, type Session } from "@/src/engine/session";
import { progressStore } from "@/src/persistence/store";

export function ContinueCard({ snapshot }: { snapshot: ProgressSnapshot }) {
  const latest = [...snapshot.sessions].filter((s) => s.status === "active" || s.status === "paused").sort((a, b) => b.updatedAt - a.updatedAt)[0];
  const [full, setFull] = useState<Session | null>(null);
  useEffect(() => {
    let off = false;
    if (latest) void progressStore.getSession(latest.id).then((s) => { if (!off) setFull(s ?? null); });
    else setFull(null);
    return () => { off = true; };
  }, [latest?.id, latest?.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!latest || !full) return null;
  const crumbs = breadcrumb(full);
  const step = topFrame(full).step;
  const where = [getChapter(full.chapterId).title, ...crumbs.slice(0, 1).map((c) => titleOf(c.skillId))].join(" › ");
  const first = full.frames.length > 1 ? titleOf(topFrame(full).skillId!) : step.kind === "stuck" ? titleOf(step.skillId) : null;
  const gaps = full.gaps.filter((g) => !g.resolvedAt);
  return (
    <section className="card continue-card" aria-labelledby="p-continue" data-testid="continue-card">
      <h3 id="p-continue">Continue</h3>
      <p style={{ margin: 0 }}>
        <span className="tag tag--paused">{full.status === "paused" ? "Paused" : "In progress"}</span>{" "}
        {where}{first ? <> — first: <strong>{first}</strong></> : null}
      </p>
      {gaps.length > 0 && <p className="muted small" style={{ margin: 0 }}>Recommended next: {gaps.map((g) => titleOf(g.skillId)).join(", ")}</p>}
      <Link className="btn btn--primary" href={`/chapter/${full.chapterId}/try`} data-testid="continue-session">Continue</Link>
    </section>
  );
}
