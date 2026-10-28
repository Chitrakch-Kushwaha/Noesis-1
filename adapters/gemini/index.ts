// Google Gemini adapter for the live tutor (text turns only).
//
// - Server only, plain fetch, no SDK. Compiled in only through the generated adapter registry (production)
//   or the development-only registry (local preview, src/tutor/server/adapters.dev.ts).
// - GEMINI_API_KEY is read from the server environment passed in by the activation code. It is never
//   logged, returned to the browser or placed in an error message.
// - Each turn asks for JSON against a schema narrowed to this turn's tools and targets. The reply is then
//   mapped to the provider-neutral shape and validated by guard.ts like every other provider.
// - Voice (transcription and speech) is not offered by this adapter; the tutor stays text-only with Gemini.
//
// Note (docs/10, OQ-1): the Gemini API Additional Terms (2026-04-28) bar services likely to be accessed by
// under-18s, so this adapter is for local testing unless that decision changes. Model ids are configuration
// (GEMINI_TUTOR_MODEL); the default comes from Google's documentation (2026-10) and is not live-verified.
import { TutorProviderError, type TutorProvider, type TutorRequest } from "@/src/tutor/contract";
import type { TutorMaterial } from "@/src/tutor/context";
import { TUTOR_INSTRUCTIONS, tutorContext } from "@/src/tutor/prompt";
import type { AdapterFactory, TutorAdapter } from "@/src/tutor/server/adapterTypes";

export const GEMINI_API = "https://generativelanguage.googleapis.com/v1beta";
export const GEMINI_DEFAULT_MODELS = { tutor: "gemini-3.8-flash" } as const;
/** tried in order if the configured model is not found */
export const GEMINI_FALLBACK_MODELS = ["gemini-3.6-flash", "gemini-2.5-flash"];

export interface GeminiConfig { apiKey: string; models: { tutor: string }; maxOutputTokens: number; fetch: typeof fetch }

const MODEL_ID = /^[A-Za-z0-9._-]{1,80}$/;

export function geminiConfig(env: Record<string, string | undefined>, f: typeof fetch = fetch): GeminiConfig | null {
  const apiKey = env.GEMINI_API_KEY?.trim();
  if (!apiKey) return null;
  const m = env.GEMINI_TUTOR_MODEL?.trim();
  return {
    apiKey,
    models: { tutor: m && MODEL_ID.test(m) ? m : GEMINI_DEFAULT_MODELS.tutor },
    maxOutputTokens: Math.min(1200, Math.max(200, Number(env.GEMINI_TUTOR_MAX_OUTPUT_TOKENS) || 600)),
    fetch: f,
  };
}

/** A flat reply schema (Gemini's schema support is narrower than JSON Schema): each tool is
 *  {name, level, target} with the unused field null. Enums carry this turn's permitted values only. */
export function geminiSchema(m: TutorMaterial) {
  const names: string[] = [];
  const levels = Array.from({ length: m.permissions.hintLevelAllowed }, (_, i) => i + 1);
  if (m.permissions.tools.includes("show_hint") && levels.length) names.push("show_hint");
  if (m.permissions.tools.includes("highlight") && m.permissions.highlightTargets.length) names.push("highlight");
  const tool = {
    type: "object",
    properties: {
      name: { type: "string", enum: names.length ? names : ["none"] },
      level: levels.length ? { type: ["integer", "null"], enum: [...levels, null] } : { type: "null" },
      target: m.permissions.highlightTargets.length ? { type: ["string", "null"], enum: [...m.permissions.highlightTargets, null] } : { type: "null" },
    },
    required: ["name", "level", "target"],
    additionalProperties: false,
  };
  return {
    type: "object",
    properties: {
      kind: { type: "string", enum: ["guidance", "redirect"] },
      say: { type: "string" },
      tools: { type: "array", items: tool, maxItems: names.length ? 2 : 0 },
    },
    required: ["kind", "say", "tools"],
    additionalProperties: false,
  };
}

/** Gemini's flat tools → the provider-neutral shape. Anything unexpected is passed through for guard.ts to reject. */
export function mapGeminiReply(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const r = raw as { kind?: unknown; say?: unknown; tools?: unknown };
  if (!Array.isArray(r.tools)) return raw;
  const tools = r.tools.map((t) => {
    const x = t as { name?: unknown; level?: unknown; target?: unknown };
    if (x?.name === "show_hint") return { name: "show_hint", args: { level: x.level } };
    if (x?.name === "highlight") return { name: "highlight", args: { target: x.target } };
    return t;
  });
  return { kind: r.kind, say: r.say, tools };
}

async function failure(res: Response): Promise<TutorProviderError> {
  let status = "", retry: number | undefined;
  try {
    const j = (await res.json()) as { error?: { status?: string; details?: { retryDelay?: string }[] } };
    status = String(j.error?.status ?? "");
    const d = j.error?.details?.find((x) => typeof x?.retryDelay === "string")?.retryDelay;
    if (d) retry = Math.ceil(parseFloat(d));
  } catch { /* ignore */ }
  if (res.status === 429) {
    const ra = Number(res.headers.get("retry-after"));
    const s = retry ?? (Number.isFinite(ra) && ra > 0 ? ra : 30);
    return new TutorProviderError("rate-limited", "Gemini rate limit", Math.min(Math.max(1, s), 300));
  }
  if (res.status === 400 && /INVALID_ARGUMENT/.test(status)) return new TutorProviderError("provider-error", "Gemini rejected the request (check the key and model)");
  if (res.status === 401 || res.status === 403) return new TutorProviderError("provider-error", "Gemini refused the server credentials or region");
  if (res.status === 404) return new TutorProviderError("provider-error", "Gemini model not found (check GEMINI_TUTOR_MODEL)");
  return new TutorProviderError("provider-error", `Gemini error ${res.status}`);
}

interface GeminiBody {
  promptFeedback?: { blockReason?: string };
  candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[];
}

export function readGemini(body: GeminiBody): unknown {
  if (body.promptFeedback?.blockReason) throw new TutorProviderError("malformed", "prompt blocked");
  const c = body.candidates?.[0];
  if (!c) throw new TutorProviderError("malformed", "no candidate");
  if (c.finishReason && c.finishReason !== "STOP") throw new TutorProviderError("malformed", `finished: ${c.finishReason}`);
  const text = (c.content?.parts ?? []).map((p) => p.text ?? "").join("");
  try { return mapGeminiReply(JSON.parse(text)); } catch { throw new TutorProviderError("malformed", "reply was not JSON"); }
}

export function geminiRequest(cfg: GeminiConfig, m: TutorMaterial, req: TutorRequest, legacy = false) {
  if (legacy) {
    // older REST field names, used only if the current ones are rejected
    return {
      systemInstruction: { parts: [{ text: TUTOR_INSTRUCTIONS }] },
      contents: [{ role: "user", parts: [{ text: tutorContext(m, req) }] }],
      generationConfig: { maxOutputTokens: cfg.maxOutputTokens, temperature: 0.4, responseMimeType: "application/json", responseJsonSchema: geminiSchema(m) },
    };
  }
  return {
    systemInstruction: { parts: [{ text: TUTOR_INSTRUCTIONS }] },
    contents: [{ role: "user", parts: [{ text: tutorContext(m, req) }] }],
    generationConfig: {
      maxOutputTokens: cfg.maxOutputTokens,
      temperature: 0.4,
      responseFormat: { text: { mimeType: "APPLICATION_JSON", schema: geminiSchema(m) } },
    },
  };
}

export function geminiProvider(cfg: GeminiConfig): TutorProvider {
  return {
    id: "gemini",
    mode: "live",
    capabilities: { text: true, freeText: true, transcribe: false, speak: false, voiceGrant: false },
    async turn(m, req, signal) {
      // the configured model first, then a fallback model; the current request format first, then the legacy one
      const models = [...new Set([cfg.models.tutor, ...GEMINI_FALLBACK_MODELS])];
      let res: Response | null = null;
      outer: for (const model of models) {
        for (const legacy of [false, true]) {
          try {
            res = await cfg.fetch(`${GEMINI_API}/models/${encodeURIComponent(model)}:generateContent`, {
              method: "POST", signal,
              headers: { "content-type": "application/json", "x-goog-api-key": cfg.apiKey },
              body: JSON.stringify(geminiRequest(cfg, m, req, legacy)),
            });
          } catch {
            if (signal.aborted) throw new TutorProviderError("cancelled", "cancelled");
            throw new TutorProviderError("provider-error", "could not reach Gemini");
          }
          if (res.ok || res.status === 429 || res.status === 401 || res.status === 403) break outer;
          if (res.status === 404) continue outer; // unknown model: try the next one
          if (res.status !== 400) break outer;
        }
      }
      if (!res) throw new TutorProviderError("provider-error", "no Gemini response");
      if (!res.ok) throw await failure(res);
      let body: GeminiBody;
      try { body = (await res.json()) as GeminiBody; } catch { throw new TutorProviderError("malformed", "unreadable response"); }
      return readGemini(body);
    },
  };
}

export const createGeminiAdapter: AdapterFactory = (env, f: typeof fetch = fetch): TutorAdapter => {
  const cfg = geminiConfig(env, f);
  return { name: "Google Gemini", configured: cfg !== null, provider: cfg ? geminiProvider(cfg) : null, models: cfg ? { ...cfg.models } : { ...GEMINI_DEFAULT_MODELS } };
};
