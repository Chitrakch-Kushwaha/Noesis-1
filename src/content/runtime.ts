// Runtime helpers shared by the lesson player and the content validator: resolving `$` tokens in cues
// from a check result, and choosing the feedback for a set of misconception tags.
import type { CheckInput, CheckResult } from "@/src/checking/types";
import type { Cues, QuestionInstance, Step } from "./instantiate";

export interface CueContext { result: CheckResult; input: CheckInput }

const UNRESOLVED = Symbol("unresolved");

function token(name: string, ctx: CueContext): unknown {
  const r = ctx.result;
  const details = r.status === "incorrect" ? r.details ?? {} : {};
  if (name === "$value") return details.valueSI ?? details.value ?? details.elements ?? UNRESOLVED;
  if (name === "$tags") return r.status === "incorrect" ? r.tags : [];
  if (name === "$input") return typeof ctx.input === "string" ? ctx.input : UNRESOLVED;
  if (name.startsWith("$details.")) return details[name.slice(9)] ?? UNRESOLVED;
  return UNRESOLVED;
}

function resolve(x: unknown, ctx: CueContext): unknown {
  if (typeof x === "string" && /^\$[a-zA-Z.]+$/.test(x)) return token(x, ctx);
  if (Array.isArray(x)) { const out = x.map((y) => resolve(y, ctx)); return out.includes(UNRESOLVED) ? UNRESOLVED : out; }
  if (x && typeof x === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(x)) { const rv = resolve(v, ctx); if (rv === UNRESOLVED) return UNRESOLVED; out[k] = rv; }
    return out;
  }
  return x;
}

/** Substitute `$value`, `$tags`, `$input` and `$details.*`. Cues whose tokens can't be resolved are dropped. */
export function resolveCues(cues: Cues, ctx: CueContext): Cues {
  const out: Cues = [];
  for (const c of cues) {
    if (!c.args) { out.push(c); continue; }
    const args = resolve(c.args, ctx);
    if (args !== UNRESOLVED) out.push({ cue: c.cue, args: args as Record<string, unknown> });
  }
  return out;
}

export const usesTokens = (cues: Cues) => JSON.stringify(cues).includes('"$');

/** The feedback for the first tag that has an entry, else the generic feedback. */
export function feedbackFor(q: Pick<QuestionInstance, "feedback">, tags: string[]): { tag: string; step: Step } {
  for (const t of tags) if (q.feedback[t]) return { tag: t, step: q.feedback[t]! };
  return { tag: "generic", step: q.feedback.generic! };
}

/** Flashcards to schedule after an attempt: one per tag that has a card, or the generic card. */
export function flashcardsFor(q: Pick<QuestionInstance, "flashcards">, tags: string[]): { tag: string; front: string; back: string }[] {
  const cards = [...new Set(tags)].filter((t) => q.flashcards[t]).map((t) => ({ tag: t, ...q.flashcards[t]! }));
  return cards.length ? cards : [{ tag: "generic", ...q.flashcards.generic! }];
}
