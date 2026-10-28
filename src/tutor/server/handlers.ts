// Tutor route handlers as plain functions of a Request, so they can be unit-tested without Next.js.
// Every route answers 404 unless the corresponding feature is active (docs/09). Logs carry no bodies.
import { skillById, foundationById } from "@/src/domain/curriculum";
import { TUTOR_LIMITS, TutorProviderError, TutorRequest, type TutorFeatures, type TutorProvider, type VoiceGrant } from "../contract";
import { answerForms, buildMaterial, instanceFor, TutorContextError } from "../context";
import { runTurn } from "../orchestrator";
import { resolveActivation, type Activation } from "./activation";
import { devAdapters } from "./adapters.dev";
import { clientKey, RateLimiter, readLimited, signSpeech, verifySpeech } from "./limits";

export interface Deps { activation: () => Activation | Promise<Activation>; turnLimiter: RateLimiter; voiceLimiter: RateLimiter; timeoutMs: number }

let shared: Deps | null = null;
export const defaultDeps = (): Deps => (shared ??= {
  activation: async () => resolveActivation(process.env, undefined, undefined, await devAdapters()),
  turnLimiter: new RateLimiter(20),
  voiceLimiter: new RateLimiter(10),
  timeoutMs: TUTOR_LIMITS.requestTimeoutMs,
});

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
const notFound = () => json({ error: "not-found" }, 404);
const limited = (s: number) => json({ error: "rate-limited" }, 429, { "retry-after": String(s) });

/** GET /api/tutor/features: booleans and a disclosure name only; never a key, endpoint or model id. */
export async function handleFeatures(deps: Deps = defaultDeps()): Promise<Response> {
  const f: TutorFeatures = (await deps.activation()).features;
  return json({ mode: f.mode, text: f.text, voice: f.voice, providerName: f.providerName, ...(f.localPreview ? { localPreview: true } : {}) });
}

const titleOf = (id: string) => skillById.get(id)?.title ?? foundationById.get(id)?.title ?? "this skill";

/** POST /api/tutor/turn: one validated tutor turn about the current question. */
export async function handleTurn(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  const act = await deps.activation();
  if (act.features.mode === "authored" || !act.provider) return notFound();
  const wait = deps.turnLimiter.take(clientKey(req));
  if (wait !== null) return limited(wait);
  const body = await readLimited(req, 32_000);
  if (body === null) return json({ error: "too-large" }, 413);
  let parsed: TutorRequest;
  try {
    const r = TutorRequest.safeParse(JSON.parse(body));
    if (!r.success) return json({ error: "invalid" }, 400);
    parsed = r.data;
  } catch { return json({ error: "invalid" }, 400); }
  let q;
  try { q = instanceFor(parsed.question); } catch (e) {
    if (e instanceof TutorContextError) return json({ error: e.code }, e.code === "version-mismatch" ? 409 : 404);
    return json({ error: "invalid" }, 400);
  }
  const { material } = buildMaterial(q, parsed.question, parsed.state, parsed.action, titleOf(q.skillId));
  // closing Help or leaving the question aborts the request, which cancels the provider call
  const reply = await runTurn(act.provider, material, parsed, { answerForms: answerForms(q), timeoutMs: deps.timeoutMs, signal: req.signal });
  return json({ ...reply, ...(act.features.voice ? { speechToken: signSpeech(reply.text) } : {}) });
}

const cleanText = (s: string) => s.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, TUTOR_LIMITS.messageChars);

async function withTimeout<T>(signal: AbortSignal, ms: number, run: (s: AbortSignal) => Promise<T>): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  const onAbort = () => ctrl.abort();
  signal.addEventListener("abort", onAbort, { once: true });
  try { return await run(ctrl.signal); } finally { clearTimeout(t); signal.removeEventListener("abort", onAbort); }
}

/** POST /api/tutor/transcribe: push-to-talk audio → text. Audio is not stored. */
export async function handleTranscribe(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  const act = await deps.activation();
  const p = act.provider;
  if (!act.features.voice || !p?.transcribe) return notFound();
  const wait = deps.voiceLimiter.take(clientKey(req));
  if (wait !== null) return limited(wait);
  if (Number(req.headers.get("content-length") ?? "0") > TUTOR_LIMITS.audioBytes + 20_000) return json({ error: "too-large" }, 413);
  let file: Blob | null = null;
  try { const f = (await req.formData()).get("audio"); file = f instanceof Blob ? f : null; } catch { return json({ error: "invalid" }, 400); }
  if (!file || file.size === 0) return json({ error: "invalid" }, 400);
  if (file.size > TUTOR_LIMITS.audioBytes) return json({ error: "too-large" }, 413);
  if (file.type && !/^audio\/(webm|ogg|wav|x-wav|mp4|mpeg|m4a)/.test(file.type)) return json({ error: "unsupported-type" }, 415);
  try {
    const r = await withTimeout(req.signal, deps.timeoutMs, (s) => p.transcribe!(file!, s));
    return json({ text: cleanText(r.text) });
  } catch (e) {
    if (e instanceof TutorProviderError && e.reason === "rate-limited") return limited(e.retryAfterSeconds ?? 30);
    return json({ error: "unavailable" }, 502);
  }
}

/** POST /api/tutor/speak: speech for a reply this server approved (signed token), never arbitrary text. */
export async function handleSpeak(req: Request, deps: Deps = defaultDeps()): Promise<Response> {
  const act = await deps.activation();
  const p = act.provider;
  if (!act.features.voice || !p?.speak) return notFound();
  const wait = deps.voiceLimiter.take(clientKey(req));
  if (wait !== null) return limited(wait);
  const body = await readLimited(req, 8_000);
  if (body === null) return json({ error: "too-large" }, 413);
  let text = "", token = "";
  try { const j = JSON.parse(body) as { text?: unknown; speechToken?: unknown }; text = typeof j.text === "string" ? j.text : ""; token = typeof j.speechToken === "string" ? j.speechToken : ""; } catch { return json({ error: "invalid" }, 400); }
  if (!text || text.length > TUTOR_LIMITS.speechChars || !verifySpeech(text, token)) return json({ error: "not-approved" }, 403);
  try {
    const r = await withTimeout(req.signal, deps.timeoutMs, (s) => p.speak!(text, s));
    return new Response(r.audio, { status: 200, headers: { "content-type": r.mimeType, "cache-control": "no-store", "x-ai-generated": String(r.aiGenerated) } });
  } catch (e) {
    if (e instanceof TutorProviderError && e.reason === "rate-limited") return limited(e.retryAfterSeconds ?? 30);
    return json({ error: "unavailable" }, 502);
  }
}

/** A grant must be short-lived and scoped to the tutor's two tools. */
export function grantProblem(g: VoiceGrant, now = Date.now()): string | null {
  const exp = Date.parse(g.expiresAt);
  if (!Number.isFinite(exp) || exp <= now) return "expired";
  if (exp - now > 10 * 60_000) return "lives too long";
  if (!g.credential || /^sk-/.test(g.credential)) return "looks like a permanent key";
  if (g.tools.some((t) => t !== "show_hint" && t !== "highlight")) return "unscoped tools";
  return null;
}

/** POST /api/tutor/voice-session: a short-lived, scoped grant for a future streaming voice adapter. */
export async function handleVoiceSession(req: Request, deps: Deps = defaultDeps(), override?: TutorProvider | null): Promise<Response> {
  const act = await deps.activation();
  const provider = override === undefined ? act.provider : override;
  if (!act.features.voice || !provider) return notFound();
  if (!provider.createVoiceGrant) return json({ error: "not-available" }, 501);
  const wait = deps.voiceLimiter.take(clientKey(req));
  if (wait !== null) return limited(wait);
  const body = await readLimited(req, 8_000);
  if (body === null) return json({ error: "too-large" }, 413);
  let parsed: TutorRequest;
  try { const r = TutorRequest.safeParse(JSON.parse(body)); if (!r.success) return json({ error: "invalid" }, 400); parsed = r.data; } catch { return json({ error: "invalid" }, 400); }
  let q;
  try { q = instanceFor(parsed.question); } catch { return json({ error: "unknown-question" }, 404); }
  const { material } = buildMaterial(q, parsed.question, parsed.state, "begin", titleOf(q.skillId));
  try {
    const g = await withTimeout(req.signal, deps.timeoutMs, (s) => provider.createVoiceGrant!(material, s));
    const problem = grantProblem(g);
    if (problem) return json({ error: "unsafe-grant" }, 502);
    return json(g);
  } catch { return json({ error: "unavailable" }, 502); }
}
