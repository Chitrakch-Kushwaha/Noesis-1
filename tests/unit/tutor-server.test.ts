// Phase 5: activation gates, route handlers, request limits, the OpenAI adapter (mocked network only),
// a provider conformance suite and tutor-assistance accounting. No test makes a real network call.
import { describe, expect, it, vi } from "vitest";
import { createOpenAIAdapter, openAIConfig, openAIProvider, readResponse, responsesRequest } from "@/adapters/openai";
import { entryById } from "@/src/content/catalog";
import { instantiate } from "@/src/content/instantiate";
import { TutorProviderError, type ClientState, type TutorAction, type TutorProvider, type TutorRequest } from "@/src/tutor/contract";
import { answerForms, buildMaterial } from "@/src/tutor/context";
import { runTurn } from "@/src/tutor/orchestrator";
import { replySchema, tutorContext } from "@/src/tutor/prompt";
import { authoredHintsProvider } from "@/src/tutor/providers/authored";
import { fixtureProvider } from "@/src/tutor/providers/fixture";
import { microphoneAllowed, resolveActivation, type ActivationRecord } from "@/src/tutor/server/activation";
import type { AdapterFactory } from "@/src/tutor/server/adapterTypes";
import { grantProblem, handleFeatures, handleSpeak, handleTranscribe, handleTurn, handleVoiceSession, type Deps } from "@/src/tutor/server/handlers";
import { RateLimiter, signSpeech, verifySpeech } from "@/src/tutor/server/limits";
import { initialPlayer, outcomeOf, playerReduce, type PlayerAction, type PlayerState } from "@/src/ui/player/playerModel";
import record from "@/config/student-ai.json";

const FBD = "lom.fbd.m.box-pulled-by-rope";
const GRAPH = "lim.derivative-rules.m.power-rule-tangent";
const FAKE_KEY = "sk-test-not-a-real-key-0123456789";
const key = (id: string, seed = 7) => ({ templateId: id, version: entryById.get(id)!.template.version, seed });
const inst = (id: string, seed = 7) => instantiate(entryById.get(id)!.template, seed);
const state = (p: Partial<ClientState> = {}): ClientState => ({ hintsShown: 0, phase: "answering", attempts: [], ...p });
const treq = (id: string, action: TutorAction, s: Partial<ClientState> = {}, message?: string): TutorRequest => ({ requestId: "r1", question: key(id), action, state: state(s), history: [], ...(message ? { message } : {}) });
const material = (id: string, action: TutorAction, s: Partial<ClientState> = {}) => buildMaterial(inst(id), key(id), state(s), action, "Skill").material;

const COMPLETE: ActivationRecord = { provider: "openai", providerDecision: "D-0xx (test)", privacyReview: "docs/10 review (test)", text: true, voice: true };
const ENV_ON = { STUDENT_AI_ENABLED: "true", STUDENT_AI_PROVIDER: "openai", STUDENT_AI_VOICE: "true", OPENAI_API_KEY: FAKE_KEY };

/** a scripted live provider for handler tests */
function scripted(say = "Which object pulls the box? Look at the highlighted force.", extra: Partial<TutorProvider> = {}): TutorProvider {
  return {
    id: "scripted", mode: "live", capabilities: { text: true, freeText: true, transcribe: true, speak: true, voiceGrant: false },
    async turn(m) { const t = m.visual.targets[0]; return { kind: "guidance", say, tools: t ? [{ name: "highlight", args: { target: t.id } }] : [] }; },
    async transcribe() { return { text: "  How do I\u0007 start?  " }; },
    async speak() { return { audio: new Uint8Array([1, 2, 3]).buffer, mimeType: "audio/mpeg", aiGenerated: true }; },
    ...extra,
  };
}
const fakeAdapters = (p: TutorProvider | null = scripted()): Record<string, AdapterFactory> => ({ openai: (env) => ({ name: "OpenAI", configured: !!env.OPENAI_API_KEY, provider: env.OPENAI_API_KEY ? p : null, models: {} }) });
function deps(over: Partial<Deps> & { env?: Record<string, string | undefined>; rec?: ActivationRecord; provider?: TutorProvider | null } = {}): Deps {
  const env = over.env ?? ENV_ON, rec = over.rec ?? COMPLETE;
  return { activation: () => resolveActivation(env, rec, fakeAdapters(over.provider === undefined ? scripted() : over.provider)), turnLimiter: over.turnLimiter ?? new RateLimiter(100), voiceLimiter: over.voiceLimiter ?? new RateLimiter(100), timeoutMs: over.timeoutMs ?? 2000 };
}
const post = (path: string, body: unknown, headers: Record<string, string> = {}) => new Request(`http://local/api/tutor/${path}`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });

// ------------------------------------------------------------------------------------------ activation
describe("activation gates: a key alone activates nothing", () => {
  it("the shipped record keeps live tutoring off", () => {
    expect(record).toMatchObject({ provider: null, providerDecision: null, privacyReview: null, text: false, voice: false });
    expect(resolveActivation({ ...ENV_ON }).features.mode).toBe("authored");
  });
  it("needs the record, the environment, the compiled adapter and the key together", () => {
    expect(resolveActivation(ENV_ON, COMPLETE, fakeAdapters()).features).toEqual({ mode: "live", text: true, voice: true, providerName: "OpenAI" });
    const off = (env: Record<string, string | undefined>, rec: ActivationRecord = COMPLETE, adapters = fakeAdapters()) => resolveActivation(env, rec, adapters);
    const cases: [string, ReturnType<typeof off>][] = [
      ["key only", off({ OPENAI_API_KEY: FAKE_KEY })],
      ["flag not exactly true", off({ ...ENV_ON, STUDENT_AI_ENABLED: "1" })],
      ["provider mismatch", off({ ...ENV_ON, STUDENT_AI_PROVIDER: "other" })],
      ["no key", off({ ...ENV_ON, OPENAI_API_KEY: "" })],
      ["no privacy review", off(ENV_ON, { ...COMPLETE, privacyReview: null })],
      ["no provider decision", off(ENV_ON, { ...COMPLETE, providerDecision: " " })],
      ["text not switched on", off(ENV_ON, { ...COMPLETE, text: false })],
      ["adapter not compiled in", off(ENV_ON, COMPLETE, {})],
    ];
    for (const [why, a] of cases) {
      expect(a.features.mode, why).toBe("authored");
      expect(a.provider, why).toBeNull();
      expect(a.reasons.length, why).toBeGreaterThan(0);
    }
  });
  it("voice needs its own switch in both the record and the environment", () => {
    expect(resolveActivation({ ...ENV_ON, STUDENT_AI_VOICE: "false" }, COMPLETE, fakeAdapters()).features).toMatchObject({ mode: "live", voice: false });
    expect(resolveActivation(ENV_ON, { ...COMPLETE, voice: false }, fakeAdapters()).features).toMatchObject({ mode: "live", voice: false });
  });
  it("the developer fixture exists only in development builds", () => {
    expect(resolveActivation({ NOESIS_TUTOR_FIXTURES: "1", NODE_ENV: "development" }).features.mode).toBe("fixture");
    const prod = resolveActivation({ NOESIS_TUTOR_FIXTURES: "1", NODE_ENV: "production" });
    expect(prod.features.mode).toBe("authored");
    expect(prod.reasons.join(" ")).toMatch(/ignored outside development/);
  });
  it("the microphone policy opens only for an activated voice build or the development fixture", () => {
    expect(microphoneAllowed({})).toBe(false);
    expect(microphoneAllowed(ENV_ON)).toBe(false); // the shipped record has no decision
    expect(microphoneAllowed(ENV_ON, COMPLETE)).toBe(true);
    expect(microphoneAllowed({ ...ENV_ON, STUDENT_AI_VOICE: "false" }, COMPLETE)).toBe(false);
    expect(microphoneAllowed({ NOESIS_TUTOR_FIXTURES: "1", NODE_ENV: "production" }, COMPLETE)).toBe(false);
    expect(microphoneAllowed({ NOESIS_TUTOR_FIXTURES: "1", NODE_ENV: "development" })).toBe(true);
  });
});

// ------------------------------------------------------------------------------------------ handlers
describe("tutor routes", () => {
  it("features reports booleans and a disclosure name only", async () => {
    const off = await (await handleFeatures(deps({ env: { OPENAI_API_KEY: FAKE_KEY } }))).json();
    expect(off).toEqual({ mode: "authored", text: false, voice: false, providerName: null });
    const res = await handleFeatures(deps());
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ mode: "live", text: true, voice: true, providerName: "OpenAI" });
    expect(text).not.toContain(FAKE_KEY);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });
  it("every live route is 404 while live tutoring is off", async () => {
    const d = deps({ env: { OPENAI_API_KEY: FAKE_KEY } });
    expect((await handleTurn(post("turn", treq(FBD, "begin")), d)).status).toBe(404);
    expect((await handleSpeak(post("speak", { text: "hi", speechToken: "x" }), d)).status).toBe(404);
    expect((await handleTranscribe(new Request("http://local/api/tutor/transcribe", { method: "POST", body: new FormData() }), d)).status).toBe(404);
    expect((await handleVoiceSession(post("voice-session", treq(FBD, "begin")), d)).status).toBe(404);
  });
  it("a live turn is validated and comes back with a speech token for exactly its text", async () => {
    const res = await handleTurn(post("turn", treq(GRAPH, "guide-visual")), deps());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ requestId: "r1", source: "live", assistance: "demonstration" });
    expect(body.tools[0].name).toBe("highlight");
    expect(verifySpeech(body.text, body.speechToken)).toBe(true);
    expect(verifySpeech(body.text + " extra", body.speechToken)).toBe(false);
  });
  it("rejects malformed bodies, unknown questions and stale versions", async () => {
    const d = deps();
    expect((await handleTurn(post("turn", { nope: true }), d)).status).toBe(400);
    expect((await handleTurn(new Request("http://local/api/tutor/turn", { method: "POST", body: "{not json" }), d)).status).toBe(400);
    expect((await handleTurn(post("turn", { ...treq(FBD, "begin"), question: { templateId: "lom.none.m.x", version: 1, seed: 3 } }), d)).status).toBe(404);
    expect((await handleTurn(post("turn", { ...treq(FBD, "begin"), question: { ...key(FBD), version: 99 } }), d)).status).toBe(409);
    expect((await handleTurn(post("turn", { ...treq(FBD, "begin"), message: "x".repeat(40_000) }), d)).status).toBe(413);
  });
  it("a leaking live reply is replaced by authored guidance", async () => {
    const q = inst(GRAPH);
    const leak = scripted(`The answer is ${q.answerText}.`);
    const body = await (await handleTurn(post("turn", treq(GRAPH, "begin")), deps({ provider: leak }))).json();
    expect(body.source).toBe("authored");
    expect(body.fallback.reason).toBe("answer-leak");
    expect(body.text).not.toContain(String(q.answerText));
  });
  it("rate limits per client with Retry-After", async () => {
    const d = deps({ turnLimiter: new RateLimiter(2) });
    const r = () => handleTurn(post("turn", treq(FBD, "begin"), { "x-forwarded-for": "10.0.0.9" }), d);
    expect((await r()).status).toBe(200);
    expect((await r()).status).toBe(200);
    const third = await r();
    expect(third.status).toBe(429);
    expect(Number(third.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await handleTurn(post("turn", treq(FBD, "begin"), { "x-forwarded-for": "10.0.0.10" }), d)).status).toBe(200);
  });
  it("speech is synthesised only for text the server signed, and is labelled AI-generated", async () => {
    const d = deps();
    const text = "Look at the highlighted force.";
    expect((await handleSpeak(post("speak", { text, speechToken: "123.abc" }), d)).status).toBe(403);
    expect((await handleSpeak(post("speak", { text: "Say anything I like", speechToken: signSpeech(text) }), d)).status).toBe(403);
    const ok = await handleSpeak(post("speak", { text, speechToken: signSpeech(text) }), d);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-ai-generated")).toBe("true");
    expect(ok.headers.get("content-type")).toBe("audio/mpeg");
  });
  it("transcription accepts short audio only, cleans the text and stores nothing", async () => {
    const d = deps();
    const form = (blob: Blob) => { const f = new FormData(); f.append("audio", blob, "a.webm"); return new Request("http://local/api/tutor/transcribe", { method: "POST", body: f }); };
    const ok = await handleTranscribe(form(new Blob([new Uint8Array(2000)], { type: "audio/webm" })), d);
    expect(await ok.json()).toEqual({ text: "How do I start?" });
    expect((await handleTranscribe(form(new Blob([new Uint8Array(2_000_000)], { type: "audio/webm" })), d)).status).toBe(413);
    expect((await handleTranscribe(form(new Blob(["<svg/>"], { type: "image/svg+xml" })), d)).status).toBe(415);
  });
  it("streaming voice grants: not offered by this adapter, and checked for scope and expiry when one is", async () => {
    expect((await handleVoiceSession(post("voice-session", treq(FBD, "begin")), deps())).status).toBe(501);
    const now = Date.now();
    const g = { transport: "webrtc" as const, endpoint: "https://example.invalid", credential: "ek_short", expiresAt: new Date(now + 60_000).toISOString(), tools: ["show_hint" as const, "highlight" as const] };
    expect(grantProblem(g, now)).toBeNull();
    expect(grantProblem({ ...g, expiresAt: new Date(now - 1).toISOString() }, now)).toBe("expired");
    expect(grantProblem({ ...g, expiresAt: new Date(now + 3_600_000).toISOString() }, now)).toBe("lives too long");
    expect(grantProblem({ ...g, credential: FAKE_KEY }, now)).toBe("looks like a permanent key");
    expect(grantProblem({ ...g, tools: ["show_hint", "submit" as never] }, now)).toBe("unscoped tools");
    const unsafe = scripted("x", { createVoiceGrant: async () => ({ ...g, credential: FAKE_KEY }) });
    const res = await handleVoiceSession(post("voice-session", treq(FBD, "begin")), deps({ provider: unsafe }), unsafe);
    expect(res.status).toBe(502);
    expect(await res.text()).not.toContain(FAKE_KEY);
  });
});

describe("request limits", () => {
  it("token bucket refills over a minute", () => {
    let t = 0;
    const rl = new RateLimiter(2, () => t);
    expect(rl.take("a")).toBeNull();
    expect(rl.take("a")).toBeNull();
    expect(rl.take("a")).toBeGreaterThan(0);
    t += 30_000;
    expect(rl.take("a")).toBeNull();
  });
  it("speech tokens expire after ten minutes and cannot be forged", () => {
    const now = Date.now();
    const tok = signSpeech("hello", now);
    expect(verifySpeech("hello", tok, now + 9 * 60_000)).toBe(true);
    expect(verifySpeech("hello", tok, now + 11 * 60_000)).toBe(false);
    expect(verifySpeech("hello", `${now}.AAAA`, now)).toBe(false);
    expect(verifySpeech("hello", "garbage", now)).toBe(false);
  });
});

// ------------------------------------------------------------------------------------------ OpenAI adapter (mocked)
function mockFetch(reply: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const calls: { url: string; init: RequestInit }[] = [];
  const f = vi.fn(async (url: string | URL | Request, init?: RequestInit) => { calls.push({ url: String(url), init: init ?? {} }); return reply(String(url), init ?? {}); });
  return { f: f as unknown as typeof fetch, calls };
}
const okResponse = (obj: unknown) => new Response(JSON.stringify({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: JSON.stringify(obj) }] }] }), { status: 200, headers: { "content-type": "application/json" } });
const cfgWith = (f: typeof fetch) => openAIConfig({ OPENAI_API_KEY: FAKE_KEY }, f)!;

describe("OpenAI adapter (mocked network)", () => {
  it("is unconfigured without a key and uses documented default models", () => {
    const a = createOpenAIAdapter({});
    expect(a.configured).toBe(false);
    expect(a.provider).toBeNull();
    expect(createOpenAIAdapter({ OPENAI_API_KEY: FAKE_KEY, OPENAI_TUTOR_MODEL: "my-model" }).models.tutor).toBe("my-model");
    expect(createOpenAIAdapter({ OPENAI_API_KEY: FAKE_KEY, OPENAI_TUTOR_MODEL: "bad model; drop" }).models.tutor).toBe("gpt-6-astra");
  });
  it("builds a Responses request with store:false, a bounded output and a schema narrowed to this turn", async () => {
    const m = material(GRAPH, "guide-visual", { hintsShown: 1 });
    expect(m.permissions.highlightTargets.length).toBeGreaterThan(0);
    const { f, calls } = mockFetch(() => okResponse({ kind: "guidance", say: "Where is the curve steepest?", tools: [] }));
    await openAIProvider(cfgWith(f)).turn(m, treq(GRAPH, "guide-visual", { hintsShown: 1 }), new AbortController().signal);
    expect(calls[0]!.url).toBe("https://api.openai.com/v1/responses");
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Bearer ${FAKE_KEY}`);
    const body = JSON.parse(String(calls[0]!.init.body));
    expect(String(calls[0]!.init.body)).not.toContain(FAKE_KEY);
    expect(body).toMatchObject({ store: false, text: { format: { type: "json_schema", strict: true, name: "tutor_reply" } } });
    expect(body.max_output_tokens).toBeLessThanOrEqual(1200);
    const schema = JSON.stringify(body.text.format.schema);
    if (m.permissions.tools.includes("show_hint")) expect(schema).toContain('"enum":[1]'); // only hint levels already reached
    expect(schema).not.toContain('"enum":[1,2');
    for (const t of m.permissions.highlightTargets) expect(schema).toContain(JSON.stringify(t));
    expect(body.input[0].content).toContain('"solution":null');
  });
  it("the context names only the current question and leaves the answer out while it is open", () => {
    const m = material(GRAPH, "begin");
    const ctx = tutorContext(m, treq(GRAPH, "begin"));
    expect(ctx).toContain('"answer":null');
    expect(ctx).not.toMatch(/mastery|chapterId|class/i);
    const none = replySchema({ ...m, permissions: { ...m.permissions, tools: [], highlightTargets: [] } });
    expect(JSON.stringify(none)).toContain('"maxItems":0');
  });
  it("maps refusals, incomplete replies and non-JSON to malformed (authored fallback)", () => {
    expect(() => readResponse({ status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "no" }] }] })).toThrow(TutorProviderError);
    expect(() => readResponse({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })).toThrow(/incomplete/);
    expect(() => readResponse({ status: "completed", output: [{ type: "message", content: [{ type: "output_text", text: "not json" }] }] })).toThrow(/JSON/);
    expect(() => readResponse({ status: "completed", output: [] })).toThrow(/no reply/);
  });
  it.each([
    [429, { error: { code: "rate_limit_exceeded" } }, { "retry-after": "12" }, "rate-limited", 12],
    [429, { error: { code: "insufficient_quota" } }, {}, "provider-error", undefined],
    [401, { error: { code: "invalid_api_key" } }, {}, "provider-error", undefined],
    [403, { error: { code: "unsupported_country_region_territory" } }, {}, "provider-error", undefined],
    [500, {}, {}, "provider-error", undefined],
    [503, {}, {}, "provider-error", undefined],
  ])("HTTP %i maps to %s", async (status, body, headers, reason, retry) => {
    const { f } = mockFetch(() => new Response(JSON.stringify(body), { status, headers }));
    const err = await openAIProvider(cfgWith(f)).turn(material(FBD, "begin"), treq(FBD, "begin"), new AbortController().signal).catch((e: TutorProviderError) => e) as TutorProviderError;
    expect(err).toBeInstanceOf(TutorProviderError);
    expect(err.reason).toBe(reason);
    if (retry) expect(err.retryAfterSeconds).toBe(retry);
    expect(String(err.message)).not.toContain(FAKE_KEY);
  });
  it("cancellation and network failures are distinguished", async () => {
    const ctrl = new AbortController();
    const { f } = mockFetch(() => { ctrl.abort(); throw new DOMException("aborted", "AbortError"); });
    expect((await openAIProvider(cfgWith(f)).turn(material(FBD, "begin"), treq(FBD, "begin"), ctrl.signal).catch((e: TutorProviderError) => e) as TutorProviderError).reason).toBe("cancelled");
    const { f: down } = mockFetch(() => { throw new TypeError("fetch failed"); });
    expect((await openAIProvider(cfgWith(down)).turn(material(FBD, "begin"), treq(FBD, "begin"), new AbortController().signal).catch((e: TutorProviderError) => e) as TutorProviderError).reason).toBe("provider-error");
  });
  it("transcription and speech use the configured models; speech is marked AI-generated", async () => {
    const { f, calls } = mockFetch((url) => url.endsWith("/audio/transcriptions") ? new Response(JSON.stringify({ text: "where do I start" })) : new Response(new Uint8Array([9, 9]), { headers: { "content-type": "audio/mpeg" } }));
    const p = openAIProvider(cfgWith(f));
    expect((await p.transcribe!(new Blob([new Uint8Array(10)], { type: "audio/webm" }), new AbortController().signal)).text).toBe("where do I start");
    const form = calls[0]!.init.body as FormData;
    expect(form.get("model")).toBe("gpt-transcribe");
    expect(form.get("language")).toBe("en");
    const s = await p.speak!("Look at the rope.", new AbortController().signal);
    expect(s).toMatchObject({ mimeType: "audio/mpeg", aiGenerated: true });
    expect(JSON.parse(String(calls[1]!.init.body))).toMatchObject({ model: "gpt-4o-mini-tts", voice: "marin", input: "Look at the rope." });
  });
});

// ------------------------------------------------------------------------------------------ conformance
const openAIMock = (reply: (m: ReturnType<typeof material>) => unknown) => {
  let current: ReturnType<typeof material> | null = null;
  const { f } = mockFetch(() => okResponse(reply(current!)));
  const p = openAIProvider(cfgWith(f));
  return { ...p, turn: (m: ReturnType<typeof material>, r: TutorRequest, s: AbortSignal) => { current = m; return p.turn(m, r, s); } } as TutorProvider;
};
const PROVIDERS: [string, TutorProvider][] = [
  ["authored", authoredHintsProvider],
  ["fixture", fixtureProvider],
  ["openai (mocked)", openAIMock((m) => {
    const t = m.visual.targets[0];
    return { kind: "guidance", say: m.permissions.nextHintLevel ? "Try the next step: think about what this hint points at." : "What do you predict will happen? Try moving the visual and explain what you see.", tools: t ? [{ name: "highlight", args: { target: t.id } }] : [] };
  })],
];
const ACTIONS: TutorAction[] = ["begin", "explain-mistake", "guide-visual", "next-hint"];

describe.each(PROVIDERS)("provider conformance: %s", (_name, provider) => {
  it.each([FBD, GRAPH])("every action on %s returns a reply that respects permissions", async (id) => {
    for (const action of ACTIONS) {
      const s = action === "explain-mistake" ? { attempts: ["0"] } : {};
      const m = material(id, action, s);
      const r = await runTurn(provider, m, treq(id, action, s), { answerForms: answerForms(inst(id)), timeoutMs: 2000 });
      expect(r.requestId).toBe("r1");
      expect(r.question).toEqual(key(id));
      expect(r.text.length).toBeGreaterThan(0);
      expect(r.text.length).toBeLessThanOrEqual(600);
      for (const t of r.tools) {
        if (t.name === "show_hint") expect(t.args.level).toBeLessThanOrEqual(m.permissions.hintLevelAllowed);
        else expect(m.permissions.highlightTargets).toContain(t.args.target);
      }
      for (const form of answerForms(inst(id))) if (form.length > 2) expect(r.text).not.toContain(form);
      if (action === "next-hint") expect(r.assistance).toBe("hint");
      if (r.source !== "authored") expect(["hint", "explanation", "demonstration", "none"]).toContain(r.assistance);
    }
  });
});

describe("conformance failure paths (OpenAI shape, mocked)", () => {
  it.each([
    ["an unauthorised tool", (m: ReturnType<typeof material>) => ({ kind: "guidance", say: "Look here.", tools: [{ name: "show_hint", args: { level: 3 } }] }), "unauthorised-tool"],
    ["an unknown highlight target", () => ({ kind: "guidance", say: "Look here.", tools: [{ name: "highlight", args: { target: "force:invented" } }] }), "unauthorised-tool"],
    ["a submit tool", () => ({ kind: "guidance", say: "Done.", tools: [{ name: "submit", args: {} }] }), "malformed"],
    ["the final answer", (m: ReturnType<typeof material>) => ({ kind: "guidance", say: `The answer is ${inst(GRAPH).answerText}.`, tools: [] }), "answer-leak"],
    ["markup", () => ({ kind: "guidance", say: "<b>Look</b> at the curve.", tools: [] }), "unsafe-text"],
  ])("rejects %s", async (_what, reply, reason) => {
    const m = material(GRAPH, "begin");
    const r = await runTurn(openAIMock(reply as never), m, treq(GRAPH, "begin"), { answerForms: answerForms(inst(GRAPH)), timeoutMs: 2000 });
    expect(r.source).toBe("authored");
    expect(r.fallback?.reason).toBe(reason);
  });
});

// ------------------------------------------------------------------------------------------ assistance accounting
describe("tutor help is recorded as assistance", () => {
  const run = (...as: PlayerAction[]) => as.reduce<PlayerState>(playerReduce, initialPlayer());
  const right: PlayerAction = { type: "result", input: "y", result: { status: "correct" } };
  it("a demonstration or explanation before a correct first answer makes it assisted", () => {
    expect(outcomeOf(run(right))).toBe("independent");
    const s = run({ type: "assist" }, right);
    expect(s.tutorAssists).toBe(1);
    expect(outcomeOf(s)).toBe("assisted");
  });
  it("help after the question ended is not counted, and assistance never scores an answer", () => {
    const s = run(right, { type: "assist" });
    expect(s.tutorAssists).toBe(0);
    expect(outcomeOf(s)).toBe("independent");
    expect(run({ type: "assist" }, { type: "assist" }).attempts).toHaveLength(0);
    expect(run({ type: "assist" }).phase).toBe("answering");
  });
});

// ------------------------------------------------------------------------------------------ Gemini adapter (mocked) and local preview
import { createGeminiAdapter, geminiConfig, geminiProvider, geminiRequest, readGemini } from "@/adapters/gemini";

const geminiOk = (obj: unknown) => new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(obj) }] } }] }), { status: 200 });
const gcfg = (f: typeof fetch) => geminiConfig({ GEMINI_API_KEY: FAKE_KEY }, f)!;

describe("Gemini adapter (mocked network)", () => {
  it("is unconfigured without a key; the key goes in a header, never the URL or body", async () => {
    expect(createGeminiAdapter({}).configured).toBe(false);
    const m = material(GRAPH, "guide-visual");
    const { f, calls } = mockFetch(() => geminiOk({ kind: "guidance", say: "Where is the curve steepest?", tools: [{ name: "highlight", level: null, target: m.permissions.highlightTargets[0] }] }));
    const out = await geminiProvider(gcfg(f)).turn(m, treq(GRAPH, "guide-visual"), new AbortController().signal);
    expect(calls[0]!.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect(calls[0]!.url + String(calls[0]!.init.body)).not.toContain(FAKE_KEY);
    expect((calls[0]!.init.headers as Record<string, string>)["x-goog-api-key"]).toBe(FAKE_KEY);
    expect(out).toEqual({ kind: "guidance", say: "Where is the curve steepest?", tools: [{ name: "highlight", args: { target: m.permissions.highlightTargets[0] } }] });
    const body = geminiRequest(gcfg(f), m, treq(GRAPH, "guide-visual"));
    expect(body.generationConfig.responseFormat!.text.mimeType).toBe("APPLICATION_JSON");
    expect(JSON.stringify(body.generationConfig.responseFormat!.text.schema)).toContain(JSON.stringify(m.permissions.highlightTargets[0]));
  });
  it("a Gemini turn goes through the same guard and falls back on leaks, blocks and errors", async () => {
    const q = inst(GRAPH);
    const run = (reply: () => Response) => { const { f } = mockFetch(reply); return runTurn(geminiProvider(gcfg(f)), material(GRAPH, "begin"), treq(GRAPH, "begin"), { answerForms: answerForms(q), timeoutMs: 2000 }); };
    expect((await run(() => geminiOk({ kind: "guidance", say: "What do you predict for the slope at P?", tools: [] }))).source).toBe("live");
    expect((await run(() => geminiOk({ kind: "guidance", say: `The answer is ${q.answerText}.`, tools: [] }))).fallback?.reason).toBe("answer-leak");
    expect((await run(() => new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" } })))).fallback?.reason).toBe("malformed");
    const limited = await run(() => new Response(JSON.stringify({ error: { status: "RESOURCE_EXHAUSTED", details: [{ retryDelay: "12s" }] } }), { status: 429 }));
    expect(limited.fallback?.reason).toBe("rate-limited");
    expect(() => readGemini({ candidates: [{ finishReason: "MAX_TOKENS", content: { parts: [{ text: "{" }] } }] })).toThrow(/MAX_TOKENS/);
  });
});

describe("local preview (development only)", () => {
  const dev = { openai: createOpenAIAdapter, gemini: createGeminiAdapter };
  it("a key in .env.local turns on live tutoring under next dev, and never in production", () => {
    expect(resolveActivation({ NODE_ENV: "development", OPENAI_API_KEY: FAKE_KEY }, record as ActivationRecord, {}, dev).features).toEqual({ mode: "live", text: true, voice: true, providerName: "OpenAI", localPreview: true });
    expect(resolveActivation({ NODE_ENV: "production", OPENAI_API_KEY: FAKE_KEY }, record as ActivationRecord, {}, dev).features.mode).toBe("authored");
    expect(resolveActivation({ NODE_ENV: "development" }, record as ActivationRecord, {}, dev).features.mode).toBe("authored");
    expect(resolveActivation({ NODE_ENV: "development", OPENAI_API_KEY: FAKE_KEY, STUDENT_AI_ENABLED: "false" }, record as ActivationRecord, {}, dev).features.mode).toBe("authored");
  });
  it("switches provider with STUDENT_AI_PROVIDER; Gemini is text-only", () => {
    const both = { NODE_ENV: "development", OPENAI_API_KEY: FAKE_KEY, GEMINI_API_KEY: FAKE_KEY };
    expect(resolveActivation(both, record as ActivationRecord, {}, dev).features.providerName).toBe("OpenAI");
    expect(resolveActivation({ ...both, STUDENT_AI_PROVIDER: "gemini" }, record as ActivationRecord, {}, dev).features).toMatchObject({ providerName: "Google Gemini", voice: false });
    expect(resolveActivation({ NODE_ENV: "development", GEMINI_API_KEY: FAKE_KEY }, record as ActivationRecord, {}, dev).features.providerName).toBe("Google Gemini");
  });
  it("the microphone opens in development only for OpenAI voice", () => {
    expect(microphoneAllowed({ NODE_ENV: "development", OPENAI_API_KEY: FAKE_KEY })).toBe(true);
    expect(microphoneAllowed({ NODE_ENV: "production", OPENAI_API_KEY: FAKE_KEY })).toBe(false);
    expect(microphoneAllowed({ NODE_ENV: "development", OPENAI_API_KEY: FAKE_KEY, STUDENT_AI_PROVIDER: "gemini" })).toBe(false);
  });
});
