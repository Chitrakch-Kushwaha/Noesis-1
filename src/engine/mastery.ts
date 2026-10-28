// Chapter mastery over main-question evidence only (docs/04 "Mastery rule"). Pure.
// Only independent answers on eligible (human-approved, unchanged) content count; hinted, retried,
// remediation and return answers never reach this function, and written reasoning never changes an outcome.
import { CONFIG, type LearningConfig } from "@/src/domain/config";
import type { Difficulty, Outcome } from "@/src/domain/progress";

export interface MainEvidence { skillId: string; difficulty: Difficulty; outcome: Outcome; eligible: boolean }

export interface MasteryReport {
  mastered: boolean;
  answered: number;
  window: number;
  independentInWindow: number;
  hardIndependentInWindow: number;
  covered: string[];
  uncovered: string[];
  /** main answers that would have counted but were on content not yet approved for mastery */
  ineligibleIndependent: number;
  capReached: boolean;
}

export const countsForMastery = (e: MainEvidence) => e.outcome === "independent" && e.eligible;

export function evaluateMastery(mains: MainEvidence[], requiredSkills: string[], cfg: LearningConfig = CONFIG): MasteryReport {
  const m = cfg.mastery;
  const window = mains.slice(-m.windowSize);
  const independentInWindow = window.filter(countsForMastery).length;
  const hardIndependentInWindow = window.filter((e) => countsForMastery(e) && e.difficulty === "hard").length;
  const covered = requiredSkills.filter((s) => mains.some((e) => e.skillId === s && countsForMastery(e)));
  const uncovered = requiredSkills.filter((s) => !covered.includes(s));
  const mastered =
    mains.length >= m.windowSize &&
    independentInWindow >= m.minIndependentCorrectInWindow &&
    hardIndependentInWindow >= m.minHardIndependentCorrectInWindow &&
    (!m.requireRequiredSkillCoverage || uncovered.length === 0);
  return {
    mastered, answered: mains.length, window: window.length, independentInWindow, hardIndependentInWindow, covered, uncovered,
    ineligibleIndependent: mains.filter((e) => e.outcome === "independent" && !e.eligible).length,
    capReached: !mastered && mains.length >= cfg.session.mainQuestionCap,
  };
}
