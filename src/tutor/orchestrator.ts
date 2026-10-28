// One tutor turn, end to end: build the permitted material, ask the provider, validate the whole reply,
// decide how it counts as assistance, and fall back to authored guidance on any failure. Transport,
// rendering and widget behaviour live elsewhere; this file is pure apart from the provider call.
import { TutorProviderError, type Assistance, type FallbackReason, type TutorProvider, type TutorReply, type TutorRequest } from "./contract";
import type { TutorMaterial } from "./context";
import { toolProblem, validateProviderOutput } from "./guard";
import { authoredOutput } from "./providers/authored";

export interface TurnOptions {
  /** the final answer's text forms, for the leak check (context.answerForms) */
  answerForms: string[];
  timeoutMs: number;
  signal?: AbortSignal;
}

/** How a reply counts under the existing assistance policy (docs/04: hinted answers are not independent). */
export function assistanceFor(req: Pick<TutorRequest, "action">, m: TutorMaterial, source: TutorReply["source"], kind: "guidance" | "redirect", toolCount: number): Assistance {
  if (kind === "redirect") return "none";
  if (req.action === "next-hint") return m.permissions.nextHintLevel !== null ? "hint" : "none";
  if (source === "authored") {
    // orientation and the misconception feedback the lesson already showed are not new help;
    // pointing at the visual with a guiding question is an instructional demonstration
    if (req.action === "guide-visual" && toolCount > 0) return "demonstration";
    return "none";
  }
  // anything a live provider writes is instructional help
  return toolCount > 0 ? "demonstration" : "explanation";
}

function authoredReply(req: TutorRequest, m: TutorMaterial, fallback?: FallbackReason): TutorReply {
  const out = authoredOutput(m, req);
  // authored replies are reviewed lesson content; only their tool requests need checking
  const tools = toolProblem(out.tools, m) ? [] : out.tools;
  const grounding = req.action === "next-hint" && m.permissions.nextHintLevel ? [`hint:${m.permissions.nextHintLevel}`]
    : req.action === "explain-mistake" && m.attempts.some((a) => a.status === "incorrect") ? ["feedback"]
    : req.action === "guide-visual" ? tools.map((t) => (t.name === "highlight" ? `target:${t.args.target}` : `hint:${t.args.level}`)) : ["question"];
  return {
    requestId: req.requestId, question: req.question, text: out.say, tools,
    assistance: assistanceFor(req, m, "authored", out.kind, tools.length), source: "authored", grounding,
    ...(fallback ? { fallback: { reason: fallback } } : {}),
  };
}

/** Run a turn with a provider. Authored providers answer directly; others are validated and fall back. */
export async function runTurn(provider: TutorProvider, m: TutorMaterial, req: TutorRequest, opts: TurnOptions): Promise<TutorReply> {
  if (provider.mode === "authored") return authoredReply(req, m);
  // typed questions are only meaningful with a provider that accepts free text
  if (req.action === "ask" && !provider.capabilities.freeText) return authoredReply(req, m, "disabled");

  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  opts.signal?.addEventListener("abort", onAbort, { once: true });
  const timer = setTimeout(() => ctrl.abort(new TutorProviderError("timeout", "timed out")), opts.timeoutMs);
  let raw: unknown;
  try {
    raw = await provider.turn(m, req, ctrl.signal);
  } catch (e) {
    const reason: FallbackReason = opts.signal?.aborted ? "cancelled"
      : e instanceof TutorProviderError ? (ctrl.signal.aborted && e.reason === "cancelled" ? "timeout" : e.reason)
      : ctrl.signal.aborted ? "timeout" : "provider-error";
    return authoredReply(req, m, reason);
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onAbort);
  }
  if (opts.signal?.aborted) return authoredReply(req, m, "cancelled");

  const g = validateProviderOutput(raw, m, opts.answerForms);
  if (!g.ok) return authoredReply(req, m, g.reason);
  const grounding = [
    ...(m.permissions.nextHintLevel ? [`hint:${m.permissions.nextHintLevel}`] : []),
    ...g.tools.map((t) => (t.name === "highlight" ? `target:${t.args.target}` : `hint:${t.args.level}`)),
  ];
  return {
    requestId: req.requestId, question: req.question, text: g.text, tools: g.tools,
    assistance: assistanceFor(req, m, provider.mode, g.kind, g.tools.length), source: provider.mode, grounding,
  };
}
