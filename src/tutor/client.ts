// Browser side of the tutor: which mode is active, and how a turn is run. In authored mode everything
// happens on the device. Live and fixture turns go through our own server routes (never straight to a
// vendor), and every reply is checked again here before it can touch the lesson.
import { z } from "zod";
import { AUTHORED_FEATURES, sameQuestion, TutorTool, TUTOR_LIMITS, type FallbackReason, type QuestionKey, type TutorFeatures, type TutorReply, type TutorRequest } from "./contract";
import { buildMaterial } from "./context";
import type { QuestionInstance } from "@/src/content/instantiate";
import { runTurn } from "./orchestrator";
import { authoredHintsProvider } from "./providers/authored";

let featuresPromise: Promise<TutorFeatures> | null = null;

/** Ask the server which tutor mode is active (booleans only). Any failure means authored mode. */
export function tutorFeatures(): Promise<TutorFeatures> {
  const p: Promise<TutorFeatures> = featuresPromise ?? fetch("/api/tutor/features", { cache: "no-store" })
    .then(async (r): Promise<TutorFeatures> => {
      if (!r.ok) return AUTHORED_FEATURES;
      const j = (await r.json()) as Partial<TutorFeatures>;
      const mode: TutorFeatures["mode"] = j.mode === "live" || j.mode === "fixture" ? j.mode : "authored";
      return { mode, text: mode !== "authored" && j.text === true, voice: mode !== "authored" && j.voice === true, providerName: typeof j.providerName === "string" ? j.providerName.slice(0, 40) : null, localPreview: mode === "live" && j.localPreview === true };
    })
    .catch(() => AUTHORED_FEATURES);
  featuresPromise = p;
  return p;
}
/** tests and the developer fixture page reset the cached answer */
export const resetTutorFeatures = () => { featuresPromise = null; };

const Reply = z.object({
  requestId: z.string(),
  question: z.object({ templateId: z.string(), version: z.number(), seed: z.number() }),
  text: z.string().max(4000),
  tools: z.array(TutorTool).max(TUTOR_LIMITS.maxTools),
  assistance: z.enum(["none", "hint", "explanation", "demonstration"]),
  source: z.enum(["authored", "live", "fixture"]),
  grounding: z.array(z.string()).max(8),
  fallback: z.object({ reason: z.string() }).optional(),
  speechToken: z.string().max(200).optional(),
});
export type ServerReply = TutorReply & { speechToken?: string };

/** Run one turn: on the device in authored mode, through the server otherwise. */
export async function requestTurn(features: TutorFeatures, q: QuestionInstance, key: QuestionKey, req: TutorRequest, skillTitle: string, signal: AbortSignal): Promise<ServerReply> {
  const local = async (reason?: FallbackReason): Promise<ServerReply> => {
    const { material } = buildMaterial(q, key, req.state, req.action, skillTitle);
    const r = await runTurn(authoredHintsProvider, material, req, { answerForms: [], timeoutMs: 1000 });
    return reason ? { ...r, fallback: { reason } } : r;
  };
  if (features.mode === "authored" || (req.action === "ask" && !features.text)) return local();
  let res: Response;
  try {
    res = await fetch("/api/tutor/turn", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(req), signal });
  } catch {
    if (signal.aborted) throw new DOMException("cancelled", "AbortError");
    return local("provider-error");
  }
  if (res.status === 429) return local("rate-limited");
  if (!res.ok) return local("provider-error");
  const parsed = Reply.safeParse(await res.json().catch(() => null));
  // a reply for another question or request is never applied
  if (!parsed.success || parsed.data.requestId !== req.requestId || !sameQuestion(parsed.data.question, key)) return local("malformed");
  return parsed.data as ServerReply;
}

export async function transcribe(audio: Blob, signal: AbortSignal): Promise<{ ok: true; text: string } | { ok: false; error: "rate-limited" | "unavailable" | "empty" }> {
  const form = new FormData();
  form.append("audio", audio, "speech.webm");
  try {
    const r = await fetch("/api/tutor/transcribe", { method: "POST", body: form, signal });
    if (r.status === 429) return { ok: false, error: "rate-limited" };
    if (!r.ok) return { ok: false, error: "unavailable" };
    const j = (await r.json()) as { text?: unknown };
    const text = typeof j.text === "string" ? j.text.slice(0, TUTOR_LIMITS.messageChars).trim() : "";
    return text ? { ok: true, text } : { ok: false, error: "empty" };
  } catch {
    if (signal.aborted) throw new DOMException("cancelled", "AbortError");
    return { ok: false, error: "unavailable" };
  }
}

/** Speech for an approved reply: the server only synthesises text it signed when the reply passed its checks. */
export async function synthesise(text: string, speechToken: string, signal: AbortSignal): Promise<{ ok: true; audio: ArrayBuffer; aiGenerated: boolean } | { ok: false }> {
  try {
    const r = await fetch("/api/tutor/speak", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, speechToken }), signal });
    if (!r.ok) return { ok: false };
    return { ok: true, audio: await r.arrayBuffer(), aiGenerated: r.headers.get("x-ai-generated") === "true" };
  } catch {
    if (signal.aborted) throw new DOMException("cancelled", "AbortError");
    return { ok: false };
  }
}

export const newRequestId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
