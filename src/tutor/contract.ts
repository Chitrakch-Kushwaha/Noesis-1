// Provider-neutral tutor contract (docs/09). No vendor types and no network code live here, so the
// student bundle can import it freely. Every provider (authored hints, a developer fixture, or an
// approved live adapter) is driven through these shapes and validated by `guard.ts`.
import { z } from "zod";

/** Hard limits shared by the client, the server routes and the validators. */
export const TUTOR_LIMITS = {
  /** typed or transcribed student text */
  messageChars: 1000,
  /** bounded conversation about the current question only */
  historyTurns: 6,
  replyChars: 600,
  replySentences: 5,
  attempts: 3,
  attemptInputChars: 500,
  snapshotBytes: 8000,
  /** push-to-talk recordings */
  audioBytes: 1_000_000,
  audioSeconds: 30,
  /** text to speech */
  speechChars: 600,
  /** server-side provider timeout */
  requestTimeoutMs: 15_000,
  maxTools: 2,
} as const;

/** authored: the lesson's own hints and cues (always available, no network).
 *  live: an approved provider, only after every activation gate is met.
 *  fixture: a labelled developer fixture; never available in a production build. */
export type TutorMode = "authored" | "live" | "fixture";

export const TutorAction = z.enum(["begin", "explain-mistake", "guide-visual", "next-hint", "ask"]);
export type TutorAction = z.infer<typeof TutorAction>;

export const QuestionKey = z.object({
  templateId: z.string().min(3).max(120).regex(/^[a-z0-9.-]+$/),
  version: z.number().int().positive(),
  seed: z.number().int().positive().max(2 ** 31),
});
export type QuestionKey = z.infer<typeof QuestionKey>;
export const sameQuestion = (a: QuestionKey, b: QuestionKey) => a.templateId === b.templateId && a.version === b.version && a.seed === b.seed;

export const Turn = z.object({ role: z.enum(["student", "tutor"]), text: z.string().max(TUTOR_LIMITS.messageChars) });
export type Turn = z.infer<typeof Turn>;

/** What the client reports. All of it is untrusted: the server re-derives everything it can. */
export const ClientState = z.object({
  hintsShown: z.number().int().min(0).max(3),
  phase: z.enum(["answering", "correct", "exhausted"]),
  /** the student's raw answers on this question; the server re-checks them to get statuses and tags */
  attempts: z.array(z.unknown()).max(TUTOR_LIMITS.attempts),
  /** a small structured snapshot of the student's work on the visual (see snapshot.ts) */
  snapshot: z.unknown().optional(),
});
export type ClientState = z.infer<typeof ClientState>;

export const TutorRequest = z.object({
  requestId: z.string().min(1).max(64),
  question: QuestionKey,
  action: TutorAction,
  message: z.string().max(TUTOR_LIMITS.messageChars).optional(),
  state: ClientState,
  history: z.array(Turn).max(TUTOR_LIMITS.historyTurns).default([]),
});
export type TutorRequest = z.infer<typeof TutorRequest>;

/** The only actions a tutor may request on the visual (docs/09). Replay, reset and solution
 *  navigation stay under the lesson's own controls. */
export const TutorTool = z.discriminatedUnion("name", [
  z.object({ name: z.literal("show_hint"), args: z.object({ level: z.number().int().min(1).max(3) }).strict() }).strict(),
  z.object({ name: z.literal("highlight"), args: z.object({ target: z.string().min(1).max(80) }).strict() }).strict(),
]);
export type TutorTool = z.infer<typeof TutorTool>;
export const TOOL_NAMES = ["show_hint", "highlight"] as const;

/** What a provider returns before validation. Live adapters map their vendor output to this shape. */
export const ProviderOutput = z.object({
  kind: z.enum(["guidance", "redirect"]),
  say: z.string().min(1).max(TUTOR_LIMITS.replyChars),
  tools: z.array(TutorTool).max(TUTOR_LIMITS.maxTools),
}).strict();
export type ProviderOutput = z.infer<typeof ProviderOutput>;

/** How the help counts under the existing assistance policy. "hint" consumes the next authored hint;
 *  "explanation" and "demonstration" are recorded as assistance; "none" is orientation or a redirect. */
export type Assistance = "none" | "hint" | "explanation" | "demonstration";

export interface TutorReply {
  requestId: string;
  question: QuestionKey;
  text: string;
  tools: TutorTool[];
  assistance: Assistance;
  source: TutorMode;
  /** which verified material the reply is built from, e.g. "hint:2", "feedback:missing-normal" */
  grounding: string[];
  /** set when a live or fixture provider failed and authored guidance was used instead */
  fallback?: { reason: FallbackReason };
}

export type FallbackReason =
  | "disabled" | "timeout" | "cancelled" | "rate-limited" | "provider-error" | "malformed" | "unauthorised-tool"
  | "ungrounded" | "answer-leak" | "unsafe-text" | "off-topic";

/** Speech and transcription contract. Transport-neutral, so a streaming adapter can be added later. */
export interface VoiceGrant {
  transport: "webrtc" | "websocket";
  endpoint: string;
  /** short-lived, single-use and scoped; never a long-lived key */
  credential: string;
  expiresAt: string;
  tools: (typeof TOOL_NAMES)[number][];
}

export interface TranscribeResult { text: string }
export interface SpeechResult { audio: ArrayBuffer; mimeType: string; aiGenerated: boolean }

/** The provider-neutral interface every tutor implements. */
export interface TutorProvider {
  readonly id: string;
  readonly mode: TutorMode;
  readonly capabilities: { text: boolean; freeText: boolean; transcribe: boolean; speak: boolean; voiceGrant: boolean };
  /** one turn. Must honour `signal` (closing Help or changing question cancels it). */
  turn(material: import("./context").TutorMaterial, req: TutorRequest, signal: AbortSignal): Promise<unknown>;
  transcribe?(audio: Blob, signal: AbortSignal): Promise<TranscribeResult>;
  speak?(text: string, signal: AbortSignal): Promise<SpeechResult>;
  createVoiceGrant?(material: import("./context").TutorMaterial, signal: AbortSignal): Promise<VoiceGrant>;
}

/** Errors a provider may throw; the orchestrator maps them to authored fallback. */
export class TutorProviderError extends Error {
  constructor(public readonly reason: Extract<FallbackReason, "timeout" | "cancelled" | "rate-limited" | "provider-error" | "malformed">, message: string, public readonly retryAfterSeconds?: number) {
    super(message);
  }
}

/** Booleans the browser may see (docs/09: /api/tutor/features). Never a key, endpoint or model id. */
export interface TutorFeatures {
  mode: TutorMode;
  text: boolean;
  voice: boolean;
  /** human-readable provider name for disclosure, e.g. "OpenAI"; null in authored mode */
  providerName: string | null;
  /** live AI running on a developer's own machine (next dev + a key in .env.local), not an approved deployment */
  localPreview?: boolean;
}
export const AUTHORED_FEATURES: TutorFeatures = { mode: "authored", text: false, voice: false, providerName: null };
