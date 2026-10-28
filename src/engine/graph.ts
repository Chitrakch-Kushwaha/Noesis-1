// The skill graph the detour planner walks: chapter skills and foundation micro-skills together,
// with each node's class (foundations are open to every student) and nearest-first ancestry.
import { foundationById, getChapter, skillById, skillsOfChapter } from "@/src/domain/curriculum";

export const isFoundation = (id: string) => foundationById.has(id);
export const nodeExists = (id: string) => skillById.has(id) || foundationById.has(id);
export const prereqsOf = (id: string): string[] => skillById.get(id)?.prereqs ?? foundationById.get(id)?.prereqs ?? [];
export const titleOf = (id: string): string => skillById.get(id)?.title ?? foundationById.get(id)?.title ?? id;
/** Chapter id of a chapter skill; null for a foundation. */
export const chapterOfSkill = (id: string): string | null => skillById.get(id)?.chapter ?? null;
/** Class a node belongs to. Foundations are pre-11 or bridge-11 material, safe for every student. */
export const classOf = (id: string): 11 | 12 | null => {
  const ch = chapterOfSkill(id);
  return ch ? getChapter(ch).class : null;
};

/** Every ancestor of `id` with its graph distance (1 = direct prerequisite), nearest first. */
const ancestry = new Map<string, Map<string, number>>();
export function ancestorsWithDistance(id: string): Map<string, number> {
  const hit = ancestry.get(id);
  if (hit) return hit;
  const dist = new Map<string, number>();
  ancestry.set(id, dist);
  let frontier = prereqsOf(id);
  for (let d = 1; frontier.length; d++) {
    const next: string[] = [];
    for (const p of frontier) {
      if (dist.has(p)) continue;
      dist.set(p, d);
      next.push(...prereqsOf(p));
    }
    frontier = next;
  }
  return dist;
}

/** Chapter skills that depend on `id` (directly or not), within the same chapter. */
export function sameChapterDependents(id: string): string[] {
  const ch = chapterOfSkill(id);
  if (!ch) return [];
  return skillsOfChapter(ch).filter((s) => s.id !== id && ancestorsWithDistance(s.id).has(id)).map((s) => s.id);
}

/** True when `skill` is `blocker` itself or builds on it. */
export const buildsOn = (skill: string, blocker: string) => skill === blocker || ancestorsWithDistance(skill).has(blocker);
