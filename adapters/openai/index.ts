// OpenAI adapter for the live tutor (proposed first live provider, docs/09 and the decision log).
//
// - Server only. It is compiled into the app only after `npm run tutor:select-adapter -- --provider openai`,
//   and it is used only when every activation gate in src/tutor/server/activation.ts is met.
// - Plain fetch against the REST API, no SDK, so the dependency check stays meaningful.
// - OPENAI_API_KEY is read from the server environment passed in by the activation code. It is never
//   logged, never returned to the browser and never placed in an error message.
// - Text turns use the Responses API with a strict JSON Schema narrowed to this turn's tools, store:false,
//   and a bounded output. The reply is returned unparsed-for-trust: guard.ts validates it before anything
//   is shown. Nothing is streamed to the student.
// - Push-to-talk voice uses the transcription and speech endpoints. Speech is labelled AI-generated.
//
// Model identifiers are configuration (OPENAI_TUTOR_MODEL etc.). The defaults were taken from OpenAI's
// documentation when this adapter was written; none has been verified with a live call from this
// project yet (see docs/phase-5-report.md and `npm run tutor:verify-openai`).
import { TutorProviderError, type SpeechResult, type TranscribeResult, type TutorProvider, type TutorRequest } from "@/src/tutor/contract";
import type { TutorMaterial } from "@/src/tutor/context";
import { replySchema, SPEECH_INSTRUCTIONS, TUTOR_INSTRUCTIONS, tutorContext } from "@/src/tutor/prompt";
import type { AdapterFactory, TutorAdapter } from "@/src/tutor/server/adapterTypes";

export const OPENAI_API = "https://api.openai.com/v1";

export const OPENAI_DEFAULT_MODELS = {
  tutor: "gpt-6-astra",
  transcribe: "gpt-transcribe",
  speech: "gpt-4o-mini-tts",
  voice: "marin",
} as const;

export interface OpenAIConfig {
  apiKey: string;
  models: { tutor: string; transcribe: string; speech: string; voice: string };
  maxOutputTokens: number;
  /** injectable for tests */
  fetch: typeof fetch;
}

const MODEL_ID = /^[A-Za-z0-9._:-]{1,80}$/;
const pick = (v: string | undefined, d: string) => (v && MODEL_ID.test(v.trim()) ? v.trim() : d);

export function openAIConfig(env: Record<string, string | undefined>, f: typeof fetch = fetch): OpenAIConfig | null {
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    models: {
      tutor: pick(env.OPENAI_TUTOR_MODEL, OPENAI_DEFAULT_MODELS.tutor),
      transcribe: pick(env.OPENAI_TRANSCRIBE_MODEL, OPENAI_DEFAULT_MODELS.transcribe),
      speech: pick(env.OPENAI_SPEECH_MODEL, OPENAI_DEFAULT_MODELS.speech),
      voice: pick(env.OPENAI_SPEECH_VOICE, OPENAI_DEFAULT_MODELS.voice),
    },
    maxOutputTokens: Math.min(1200, Math.max(200, Number(env.OPENAI_TUTOR_MAX_OUTPUT_TOKENS) || 500)),
    fetch: f,
  };
}

/** Maps an HTTP failure to a provider error without echoing the vendor's body (it may quote input). */
async function failure(res: Response): Promise<TutorProviderError> {
  let code = "";
  try { const j = (await res.json()) as { error?: { code?: unknown; type?: unknown } }; code = String(j.error?.code ?? j.error?.type ?? ""); } catch { /* ignore */ }
  if (res.status === 429) {
    // rate limits clear on their own; an exhausted quota does not, so it is not worth retrying soon
    if (code === "insufficient_quota") return new TutorProviderError("provider-error", "OpenAI quota exhausted");
    const ra = Number(res.headers.get("retry-after"));
    return new TutorProviderError("rate-limited", "OpenAI rate limit", Number.isFinite(ra) && ra > 0 ? Math.min(ra, 300) : 30);
  }
  if (res.status === 401) return new TutorProviderError("provider-error", "OpenAI rejected the server credentials");
  if (res.status === 403) return new TutorProviderError("provider-error", "OpenAI refused the request (region or permission)");
  if (res.status === 400) return new TutorProviderError("provider-error", `OpenAI rejected the request${code ? ` (${code})` : ""}`);
  return new TutorProviderError("provider-error", `OpenAI error ${res.status}`);
}

async function call(cfg: OpenAIConfig, path: string, init: RequestInit, signal: AbortSignal): Promise<Response> {
  let res: Response;
  try {
    res = await cfg.fetch(`${OPENAI_API}${path}`, { ...init, signal, headers: { authorization: `Bearer ${cfg.apiKey}`, ...(init.headers ?? {}) } });
  } catch {
    if (signal.aborted) throw new TutorProviderError("cancelled", "cancelled");
    throw new TutorProviderError("provider-error", "could not reach OpenAI");
  }
  if (!res.ok) throw await failure(res);
  return res;
}

interface ResponsesBody {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[];
}

/** Extracts the structured reply from a Responses API body. Refusals and incomplete replies throw. */
export function readResponse(body: ResponsesBody): unknown {
  if (body.status && body.status !== "completed") throw new TutorProviderError("malformed", `response ${body.status}${body.incomplete_details?.reason ? `: ${body.incomplete_details.reason}` : ""}`);
  for (const item of body.output ?? []) {
    if (item.type !== "message") continue;
    for (const c of item.content ?? []) {
      // a refusal falls back to the lesson's own guidance rather than being presented as a live reply
      if (c.type === "refusal") throw new TutorProviderError("malformed", "model refused");
      if (c.type === "output_text" && typeof c.text === "string") {
        try { return JSON.parse(c.text); } catch { throw new TutorProviderError("malformed", "reply was not JSON"); }
      }
    }
  }
  throw new TutorProviderError("malformed", "no reply text");
}

export function responsesRequest(cfg: OpenAIConfig, m: TutorMaterial, req: TutorRequest) {
  return {
    model: cfg.models.tutor,
    instructions: TUTOR_INSTRUCTIONS,
    input: [{ role: "user", content: tutorContext(m, req) }],
    text: { format: { type: "json_schema", name: "tutor_reply", strict: true, schema: replySchema(m) } },
    store: false,
    max_output_tokens: cfg.maxOutputTokens,
  };
}

export function openAIProvider(cfg: OpenAIConfig): TutorProvider {
  return {
    id: "openai",
    mode: "live",
    capabilities: { text: true, freeText: true, transcribe: true, speak: true, voiceGrant: false },
    async turn(m, req, signal) {
      const res = await call(cfg, "/responses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(responsesRequest(cfg, m, req)) }, signal);
      let body: ResponsesBody;
      try { body = (await res.json()) as ResponsesBody; } catch { throw new TutorProviderError("malformed", "unreadable response"); }
      return readResponse(body);
    },
    async transcribe(audio, signal): Promise<TranscribeResult> {
      const form = new FormData();
      const ext = /ogg/.test(audio.type) ? "ogg" : /mp4|m4a/.test(audio.type) ? "m4a" : /wav/.test(audio.type) ? "wav" : "webm";
      form.append("file", audio, `speech.${ext}`);
      form.append("model", cfg.models.transcribe);
      form.append("language", "en");
      form.append("response_format", "json");
      const res = await call(cfg, "/audio/transcriptions", { method: "POST", body: form }, signal);
      const j = (await res.json().catch(() => null)) as { text?: unknown } | null;
      if (!j || typeof j.text !== "string") throw new TutorProviderError("malformed", "no transcript");
      return { text: j.text };
    },
    async speak(text, signal): Promise<SpeechResult> {
      const res = await call(cfg, "/audio/speech", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: cfg.models.speech, voice: cfg.models.voice, input: text, instructions: SPEECH_INSTRUCTIONS, response_format: "mp3" }),
      }, signal);
      return { audio: await res.arrayBuffer(), mimeType: "audio/mpeg", aiGenerated: true };
    },
  };
}

export const createOpenAIAdapter: AdapterFactory = (env, f: typeof fetch = fetch): TutorAdapter => {
  const cfg = openAIConfig(env, f);
  return {
    name: "OpenAI",
    configured: cfg !== null,
    provider: cfg ? openAIProvider(cfg) : null,
    models: cfg ? { ...cfg.models } : { ...OPENAI_DEFAULT_MODELS },
  };
};
