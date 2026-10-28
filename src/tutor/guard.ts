// Validates everything a provider returns before any of it reaches the student. A reply is accepted
// whole or rejected whole (the caller then falls back to authored guidance); nothing is streamed or
// shown before these checks pass.
//
// These checks reduce, but cannot eliminate, the risk of a generated reply giving too much away: they
// block the final answer's own forms, numbers the student hasn't seen, "the answer is" phrasing,
// links, markup and code. That residual risk is one reason live tutoring stays disabled until the
// red-team and privacy review in docs/10 are done.
import { ProviderOutput, TUTOR_LIMITS, type FallbackReason, type TutorTool } from "./contract";
import { numbersIn, visibleNumbers, type TutorMaterial } from "./context";

export type GuardResult =
  | { ok: true; kind: "guidance" | "redirect"; text: string; tools: TutorTool[] }
  | { ok: false; reason: FallbackReason; detail: string };

const fail = (reason: FallbackReason, detail: string): GuardResult => ({ ok: false, reason, detail });

/** Plain, short, English prose: no markup, links, code or control characters. */
export function textProblem(text: string): string | null {
  if (!text.trim()) return "empty";
  if (text.length > TUTOR_LIMITS.replyChars) return "too long";
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) return "control characters";
  if (/https?:\/\/|www\.|\b[a-z0-9-]+\.(com|org|net|io|ai)\b/i.test(text)) return "link";
  if (/<\/?[a-z][^>]*>|```|\bfunction\s*\(|=>|\$\{|<script/i.test(text)) return "markup or code";
  if (/!\[|\]\(/.test(text)) return "markdown link or image";
  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  if (sentences.length > TUTOR_LIMITS.replySentences) return "too many sentences";
  const letters = (text.match(/[A-Za-z]/g) ?? []).length;
  if (letters < Math.min(12, text.length * 0.5)) return "not English prose";
  return null;
}

/** Answer forms, "the answer is" phrasing, and numbers the student hasn't seen (while the question is open). */
export function leakProblem(text: string, m: TutorMaterial, answerForms: string[]): { reason: "answer-leak" | "ungrounded"; detail: string } | null {
  const open = !m.permissions.solutionAllowed;
  if (open) {
    const lower = text.toLowerCase();
    for (const f of answerForms) {
      const fl = f.toLowerCase();
      if (/^[−-]?\d/.test(f)) {
        const re = new RegExp(`(^|[^0-9.])${fl.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![0-9])`);
        if (re.test(lower)) return { reason: "answer-leak", detail: `states the answer (${f})` };
      } else if (lower.includes(fl)) return { reason: "answer-leak", detail: "states the answer" };
    }
    if (/\b(the\s+)?(final|correct|right)\s+(answer|option|value|result)\s+(is|=|would be|should be)\b/i.test(text) || /\banswer\s+is\b/i.test(text)) {
      return { reason: "answer-leak", detail: "announces an answer" };
    }
  }
  const seen = visibleNumbers(m);
  for (const n of numbersIn(text)) {
    const v = Math.abs(Number(n));
    if (v <= 10 && Number.isInteger(v)) continue; // counting words, small step numbers, "hint 2"
    if (!seen.has(n) && !seen.has(String(-Number(n)))) return { reason: "ungrounded", detail: `uses a number the student hasn't seen (${n})` };
  }
  return null;
}

/** Tool requests must name a permitted tool, a permitted hint level and an existing target. */
export function toolProblem(tools: TutorTool[], m: TutorMaterial): string | null {
  const p = m.permissions;
  for (const t of tools) {
    if (!p.tools.includes(t.name)) return `${t.name} is not permitted now`;
    if (t.name === "show_hint" && (t.args.level < 1 || t.args.level > p.hintLevelAllowed)) return `hint ${t.args.level} is not unlocked`;
    if (t.name === "highlight" && !p.highlightTargets.includes(t.args.target)) return `unknown target ${t.args.target}`;
  }
  return null;
}

/** Validate a provider's raw output against the contract, the content rules and the permissions. */
export function validateProviderOutput(raw: unknown, m: TutorMaterial, answerForms: string[]): GuardResult {
  const parsed = ProviderOutput.safeParse(raw);
  if (!parsed.success) return fail("malformed", parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 200));
  const out = parsed.data;
  const text = out.say.trim().replace(/\s+/g, " ");
  const tp = textProblem(text);
  if (tp) return fail("unsafe-text", tp);
  const leak = leakProblem(text, m, answerForms);
  if (leak) return fail(leak.reason, leak.detail);
  // tools: exact duplicates dropped, then every one must be permitted
  const tools = out.tools.filter((t, i) => out.tools.findIndex((u) => JSON.stringify(u) === JSON.stringify(t)) === i);
  const tool = toolProblem(tools, m);
  if (tool) return fail("unauthorised-tool", tool);
  if (out.kind === "redirect" && tools.length) return fail("unauthorised-tool", "a redirect cannot use the visual");
  return { ok: true, kind: out.kind, text, tools };
}
