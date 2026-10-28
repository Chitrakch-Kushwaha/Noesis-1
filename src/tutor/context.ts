// Builds the tutor's view of one question from identifiers, never from client-supplied content.
// The question, hints, feedback and solution come from the bundled, validated manifest; the student's
// answers are re-checked here; the visual state comes from a validated snapshot (snapshot.ts).
// Nothing about other questions, chapters, progress, class or the student is included.
import { check } from "@/src/checking/check";
import type { CheckInput, CheckResult } from "@/src/checking/types";
import { entryById } from "@/src/content/catalog";
import { instantiate, type QuestionInstance } from "@/src/content/instantiate";
import { feedbackFor } from "@/src/content/runtime";
import { formatValue } from "@/src/content/placeholders";
import { TUTOR_LIMITS, type ClientState, type QuestionKey, type TutorAction } from "./contract";
import { describeState, rebuildState, tutorTargets, type TutorTarget } from "./snapshot";

export class TutorContextError extends Error {
  constructor(public readonly code: "unknown-question" | "version-mismatch" | "bad-input", message: string) { super(message); }
}

/** What the tutor may use for this turn. `permissions` is the authoritative reveal policy. */
export interface TutorMaterial {
  question: QuestionKey;
  skill: string;
  format: QuestionInstance["format"];
  stem: string[];
  answerLabel: string | null;
  options: { id: string; text: string }[];
  visual: { type: string; instructions: string; altText: string; description: string; trusted: boolean; targets: { id: string; label: string }[] };
  /** hints the student has already consumed, plus the next one only when this turn consumes it */
  hints: { level: number; text: string }[];
  attempts: { status: "correct" | "incorrect"; tags: string[]; feedback: string }[];
  /** worked solution and answer: only once the question has ended (the lesson's reveal policy) */
  solution: string[] | null;
  answerText: string | null;
  permissions: Permissions;
}

export interface Permissions {
  /** hints already consumed by the student's own choice */
  hintsConsumed: number;
  /** the hint this turn consumes (only for "next-hint", and only the next one in sequence) */
  nextHintLevel: number | null;
  /** highest hint level the tutor may show or refer to */
  hintLevelAllowed: number;
  solutionAllowed: boolean;
  tools: ("show_hint" | "highlight")[];
  highlightTargets: string[];
}

/** Server-side: the instance for a question key, or an error if it isn't in the shipped manifest. */
export function instanceFor(key: QuestionKey): QuestionInstance {
  const entry = entryById.get(key.templateId);
  if (!entry) throw new TutorContextError("unknown-question", "That question isn't available.");
  if (entry.template.version !== key.version) throw new TutorContextError("version-mismatch", "The question changed; reload it.");
  return instantiate(entry.template, key.seed);
}

/** Re-check the student's reported answers with the question's own checker. */
export function recheckAttempts(q: QuestionInstance, raw: unknown[]): { status: "correct" | "incorrect"; tags: string[] }[] {
  const out: { status: "correct" | "incorrect"; tags: string[] }[] = [];
  for (const a of raw.slice(0, TUTOR_LIMITS.attempts)) {
    if (JSON.stringify(a ?? null).length > TUTOR_LIMITS.attemptInputChars * 4) continue;
    if (typeof a === "string" && a.length > TUTOR_LIMITS.attemptInputChars) continue;
    let r: CheckResult;
    try { r = check(q.check, a as CheckInput); } catch { continue; }
    if (r.status === "correct" || r.status === "incorrect") out.push({ status: r.status, tags: r.status === "incorrect" ? r.tags : [] });
  }
  return out;
}

export function permissionsFor(q: QuestionInstance, state: Pick<ClientState, "hintsShown" | "phase">, action: TutorAction, targets: TutorTarget[]): Permissions {
  const total = q.hints.length;
  const consumed = Math.max(0, Math.min(state.hintsShown, total));
  const answering = state.phase === "answering";
  const nextHintLevel = action === "next-hint" && answering && consumed < total ? consumed + 1 : null;
  const hintLevelAllowed = nextHintLevel ?? consumed;
  const tools: Permissions["tools"] = [];
  if (hintLevelAllowed >= 1 && q.hints.slice(0, hintLevelAllowed).some((h) => h.cues.length)) tools.push("show_hint");
  if (targets.length) tools.push("highlight");
  return { hintsConsumed: consumed, nextHintLevel, hintLevelAllowed, solutionAllowed: !answering, tools, highlightTargets: targets.map((t) => t.id) };
}

export function buildMaterial(q: QuestionInstance, key: QuestionKey, state: ClientState, action: TutorAction, skillTitle: string): { material: TutorMaterial; targets: TutorTarget[] } {
  const rebuilt = rebuildState(q.widget.type, q.widget.config, state.snapshot);
  const targets = tutorTargets(q.widget.type, rebuilt.state);
  // the phase is taken from re-checked answers where possible: a reported "correct" without a correct answer is ignored
  const attempts = recheckAttempts(q, state.attempts);
  const solved = attempts.some((a) => a.status === "correct");
  // "exhausted" is accepted only when the lesson would allow it: all tries used, or the student chose
  // "Show me the solution", which the lesson offers after one try or after every hint
  const mayHaveEnded = attempts.length >= 1 || state.hintsShown >= q.hints.length;
  const phase: ClientState["phase"] = solved ? "correct" : state.phase === "exhausted" && mayHaveEnded ? "exhausted" : "answering";
  const permissions = permissionsFor(q, { hintsShown: state.hintsShown, phase }, action, targets);
  const material: TutorMaterial = {
    question: key,
    skill: skillTitle,
    format: q.format,
    stem: q.stem,
    answerLabel: q.input?.label ?? null,
    options: (q.options ?? []).map((o) => ({ id: o.id, text: o.text })),
    visual: {
      type: q.widget.type, instructions: q.widget.instructions, altText: q.accessibility.altText,
      description: describeState(q.widget.type, rebuilt.state), trusted: rebuilt.trusted,
      targets: targets.map((t) => ({ id: t.id, label: t.label })),
    },
    hints: q.hints.slice(0, permissions.hintLevelAllowed).map((h, i) => ({ level: i + 1, text: h.text })),
    attempts: attempts.map((a) => ({ ...a, feedback: a.status === "incorrect" ? feedbackFor(q, a.tags).step.text : "" })),
    solution: permissions.solutionAllowed ? q.solution.map((s) => s.text) : null,
    answerText: permissions.solutionAllowed ? q.answerText : null,
    permissions,
  };
  return { material, targets };
}

/** Text forms of the final answer the tutor must not state while the question is open. */
export function answerForms(q: QuestionInstance): string[] {
  const forms = new Set<string>();
  const spec = q.check;
  if ((spec.kind === "quantity" || spec.kind === "number") && Number.isFinite(spec.value)) {
    const v = spec.value;
    for (const f of [formatValue(v), formatValue(v, "raw"), formatValue(v, "fixed2"), formatValue(v, "fixed1"), formatValue(Math.abs(v)), formatValue(v, "2"), formatValue(v, "4")]) {
      const plain = f.replace(/−/g, "-");
      if (plain.replace(/^-/, "").replace(/\.0+$/, "").length >= 2 || Math.abs(v) >= 10) { forms.add(f); forms.add(plain); }
    }
  }
  if (spec.kind === "single-choice") {
    const o = q.options?.find((x) => x.id === spec.correct);
    if (o && o.text.length > 12) forms.add(o.text);
  }
  const at = q.answerText.trim();
  if (at.length >= 4 && !/^\d+(\.\d+)?$/.test(at)) forms.add(at);
  return [...forms];
}

/** Every number the student can already see: the tutor may repeat these, and nothing else above 10. */
export function visibleNumbers(m: TutorMaterial, extra: string[] = []): Set<string> {
  const text = [...m.stem, m.visual.description, m.visual.instructions, ...m.visual.targets.map((t) => t.label), ...m.hints.map((h) => h.text), ...m.attempts.map((a) => a.feedback), ...m.options.map((o) => o.text), ...(m.solution ?? []), m.answerText ?? "", ...extra].join(" ");
  return new Set(numbersIn(text));
}
export const numbersIn = (s: string) => (s.replace(/−/g, "-").match(/-?\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n)));
