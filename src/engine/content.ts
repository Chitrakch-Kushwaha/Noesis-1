// What the engine may choose from: playable templates and lessons, reduced to the fields selection needs.
// Built from the student manifest in the app and from fixtures in tests.
import { CATALOG, type ManifestEntry } from "@/src/content/catalog";
import { LESSONS, type LessonEntry } from "@/src/content/lessons";
import type { Difficulty } from "@/src/domain/progress";

export interface EngineTemplate {
  id: string;
  version: number;
  skillId: string;
  chapterId: string;
  difficulty: Difficulty;
  /** human-approved and unchanged since approval (manifest countsTowardMastery) */
  approved: boolean;
  status: string;
}
export interface EngineLesson { id: string; skillId: string; hasAlternate: boolean; hasRecap: boolean; approved: boolean }
export interface EngineContent { templates: EngineTemplate[]; lessons: EngineLesson[] }

export const fromManifest = (entries: ManifestEntry[], lessons: LessonEntry[]): EngineContent => ({
  templates: entries.map((e) => ({
    id: e.template.id, version: e.template.version, skillId: e.template.primarySkillId, chapterId: e.template.chapterId,
    difficulty: e.template.difficulty, approved: e.countsTowardMastery && e.template.status === "approved", status: e.template.status,
  })),
  lessons: lessons.map((l) => ({ id: l.lesson.id, skillId: l.lesson.skillId, hasAlternate: !!l.lesson.alternate, hasRecap: !!l.lesson.recap, approved: l.approved })),
});

let shipped: EngineContent | null = null;
/** The content shipped in this build. */
export const shippedContent = () => (shipped ??= fromManifest(CATALOG, LESSONS));
