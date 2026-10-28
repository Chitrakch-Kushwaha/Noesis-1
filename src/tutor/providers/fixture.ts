// Developer fixture provider: deterministic, labelled test doubles for the live tutor and voice
// pipeline. It exists so the interface, the guards and every failure path can be exercised without a
// key. It is selectable only in development (never in a production build) and the UI labels it
// "Developer fixture — not a live tutor" wherever it appears.
import { TutorProviderError, type ProviderOutput, type TutorProvider, type VoiceGrant } from "../contract";
import type { TutorMaterial } from "../context";

/** Words in the student's message that select a failure path, so tests can drive each one. */
export const FIXTURE_TRIGGERS = {
  malformed: "fixture:malformed",
  leak: "fixture:leak",
  tool: "fixture:bad-tool",
  slow: "fixture:slow",
  /** a normal reply after 2.5 s, for testing stale-reply rejection */
  delay: "fixture:delay",
  error: "fixture:error",
  ratelimit: "fixture:rate-limit",
} as const;

export const FIXTURE_TRANSCRIPT = "How do I start this question?";

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => { clearTimeout(t); reject(new TutorProviderError("cancelled", "cancelled")); }, { once: true });
  });
}

/** A short, quiet tone as 16-bit mono WAV: clearly not speech, so it can't pass for a voice. */
export function fixtureTone(seconds: number): ArrayBuffer {
  const rate = 16000, n = Math.round(rate * Math.min(3, Math.max(0.4, seconds)));
  const buf = new ArrayBuffer(44 + n * 2);
  const v = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE"); str(12, "fmt ");
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); str(36, "data"); v.setUint32(40, n * 2, true);
  for (let i = 0; i < n; i++) {
    const env = Math.min(1, i / 800, (n - i) / 800);
    v.setInt16(44 + i * 2, Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 3000 * env), true);
  }
  return buf;
}

export const fixtureProvider: TutorProvider = {
  id: "developer-fixture",
  mode: "fixture",
  capabilities: { text: true, freeText: true, transcribe: true, speak: true, voiceGrant: true },
  async turn(m: TutorMaterial, req, signal): Promise<unknown> {
    const msg = (req.message ?? "").toLowerCase();
    if (msg.includes(FIXTURE_TRIGGERS.slow)) { await sleep(60_000, signal); }
    if (msg.includes(FIXTURE_TRIGGERS.delay)) { await sleep(2_500, signal); }
    if (msg.includes(FIXTURE_TRIGGERS.error)) throw new TutorProviderError("provider-error", "fixture provider error");
    if (msg.includes(FIXTURE_TRIGGERS.ratelimit)) throw new TutorProviderError("rate-limited", "fixture rate limit", 30);
    if (msg.includes(FIXTURE_TRIGGERS.malformed)) return { say: 42, tools: "none" };
    if (msg.includes(FIXTURE_TRIGGERS.leak)) return { kind: "guidance", say: `The answer is ${m.answerText ?? "123.4"} so write that down.`, tools: [] } satisfies ProviderOutput;
    if (msg.includes(FIXTURE_TRIGGERS.tool)) return { kind: "guidance", say: "Look at this part of the visual.", tools: [{ name: "show_hint", args: { level: 3 } }] } satisfies ProviderOutput;
    const target = m.visual.targets[0];
    const tools: ProviderOutput["tools"] = target && m.permissions.tools.includes("highlight") ? [{ name: "highlight", args: { target: target.id } }] : [];
    const say = req.action === "next-hint" && m.permissions.nextHintLevel
      ? `Here is the next step to think about. ${m.hints[m.permissions.nextHintLevel - 1]!.text}`
      : target ? `Fixture reply: look at ${target.label.replace(/\s*\(from [^)]*\)$/, "")}. What do you notice about it?` : "Fixture reply: what is the question asking you to find?";
    return { kind: "guidance", say: say.slice(0, 600), tools } satisfies ProviderOutput;
  },
  async transcribe(audio, signal) {
    if (signal.aborted) throw new TutorProviderError("cancelled", "cancelled");
    if (audio.size === 0) throw new TutorProviderError("malformed", "empty recording");
    return { text: FIXTURE_TRANSCRIPT };
  },
  async speak(text, signal) {
    if (signal.aborted) throw new TutorProviderError("cancelled", "cancelled");
    return { audio: fixtureTone(text.length / 40), mimeType: "audio/wav", aiGenerated: false };
  },
  async createVoiceGrant(): Promise<VoiceGrant> {
    return { transport: "websocket", endpoint: "fixture://voice", credential: `fixture-${Math.random().toString(36).slice(2, 10)}`, expiresAt: new Date(Date.now() + 60_000).toISOString(), tools: ["show_hint", "highlight"] };
  },
};
