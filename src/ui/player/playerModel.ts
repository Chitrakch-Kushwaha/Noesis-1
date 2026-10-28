// Pure state machine for one question attempt (docs/05 §5). No React, so it is unit-tested directly.
// Only correct/incorrect results use up an attempt; invalid and indeterminate input never does.
import type { CheckInput, CheckResult } from "@/src/checking/types";
import { consumesAttempt } from "@/src/checking/types";
import { CONFIG, maxAttempts } from "@/src/domain/config";
import type { Outcome } from "@/src/domain/progress";

/** the first answer plus the configured retries (U-05; config attempts.retriesAfterFirst) */
export const MAX_ATTEMPTS = maxAttempts();

export type Phase = "answering" | "correct" | "exhausted";
export interface Attempt { input: CheckInput; result: CheckResult }
export interface Notice { kind: "invalid" | "indeterminate"; text: string }

export interface PlayerState {
  phase: Phase;
  attempts: Attempt[];
  /** last message that did not use an attempt */
  notice: Notice | null;
  hintsShown: number;
  /** student chose to see the solution before solving it */
  gaveUp: boolean;
  checking: boolean;
  /** tutor explanations and demonstrations presented before the question ended (Phase 5).
   *  Like hints, any of them makes a correct answer "assisted", never "independent". */
  tutorAssists: number;
}

export type PlayerAction =
  | { type: "checking" }
  | { type: "result"; input: CheckInput; result: CheckResult }
  | { type: "hint" }
  /** a tutor explanation or demonstration was presented (recorded before another answer can be scored) */
  | { type: "assist" }
  | { type: "give-up" }
  | { type: "edit" };

export const initialPlayer = (): PlayerState => ({ phase: "answering", attempts: [], notice: null, hintsShown: 0, gaveUp: false, checking: false, tutorAssists: 0 });

export function playerReduce(s: PlayerState, a: PlayerAction): PlayerState {
  switch (a.type) {
    case "checking": return s.phase === "answering" ? { ...s, checking: true } : s;
    case "edit": return s.notice ? { ...s, notice: null } : s;
    case "hint": return s.phase === "answering" && s.hintsShown < CONFIG.hints.maxLevels ? { ...s, hintsShown: s.hintsShown + 1 } : s;
    case "assist": return s.phase === "answering" ? { ...s, tutorAssists: s.tutorAssists + 1 } : s;
    case "give-up": return s.phase === "answering" ? { ...s, phase: "exhausted", gaveUp: true, checking: false } : s;
    case "result": {
      if (s.phase !== "answering") return { ...s, checking: false };
      const r = a.result;
      if (!consumesAttempt(r)) {
        return { ...s, checking: false, notice: { kind: r.status as "invalid" | "indeterminate", text: (r as { message: string }).message } };
      }
      const attempts = [...s.attempts, { input: a.input, result: r }];
      const phase: Phase = r.status === "correct" ? "correct" : attempts.length >= MAX_ATTEMPTS ? "exhausted" : "answering";
      return { ...s, checking: false, notice: null, attempts, phase };
    }
  }
}

export const attemptsLeft = (s: PlayerState) => MAX_ATTEMPTS - s.attempts.length;
export const lastResult = (s: PlayerState) => s.attempts[s.attempts.length - 1]?.result;

/** independent: right first time with no hints and no tutor help. assisted: right after hints, tutor
 *  explanations or demonstrations, or retries. exhausted otherwise. */
export function outcomeOf(s: PlayerState): Outcome | null {
  if (s.phase === "answering") return null;
  if (s.phase === "exhausted") return "exhausted";
  return s.attempts.length === 1 && s.hintsShown === 0 && s.tutorAssists === 0 ? "independent" : "assisted";
}

/** Every misconception tag the student's wrong answers produced, in order, without repeats. */
export function tagsOf(s: PlayerState): string[] {
  const out: string[] = [];
  for (const a of s.attempts) if (a.result.status === "incorrect") for (const t of a.result.tags) if (!out.includes(t)) out.push(t);
  return out;
}
