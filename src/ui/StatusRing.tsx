import type { ChapterState } from "@/src/domain/progress";

/** Status ring: shape and symbol differ per state, so colour is never the only signal. */
export function StatusRing({ state, size = 16, bloom = false }: { state: ChapterState; size?: number; bloom?: boolean }) {
  const r = 6.5;
  const c = 2 * Math.PI * r;
  return (
    <svg className={`ring${bloom ? " ring--bloom" : ""}`} width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      {state === "unvisited" && <circle cx="8" cy="8" r={r} fill="none" stroke="var(--border-strong)" strokeWidth="1.6" />}
      {state === "learning" && (
        <>
          <circle cx="8" cy="8" r={r} fill="none" stroke="var(--surface-raised)" strokeWidth="2" />
          <circle cx="8" cy="8" r={r} fill="none" stroke="var(--accent-orange)" strokeWidth="2" strokeDasharray={`${c / 2} ${c}`} transform="rotate(-90 8 8)" />
        </>
      )}
      {state === "needs-review" && (
        <>
          <circle cx="8" cy="8" r={r} fill="none" stroke="var(--accent-coral)" strokeWidth="2" />
          <path d="M8 4.6v4.2" stroke="var(--accent-coral)" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="8" cy="11.2" r="1" fill="var(--accent-coral)" />
        </>
      )}
      {state === "mastered" && (
        <>
          <circle cx="8" cy="8" r={r + 0.6} fill="var(--accent-amber)" />
          <path d="M4.9 8.2l2.1 2.1 4.1-4.4" fill="none" stroke="var(--text-on-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

export const subjectGlyph = (subject: "physics" | "maths") => (subject === "physics" ? "⟂" : "∑");
export const subjectName = (subject: "physics" | "maths") => (subject === "physics" ? "Physics" : "Maths");
