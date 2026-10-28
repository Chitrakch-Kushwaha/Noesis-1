// Decides, on the server, which tutor mode is active. Live tutoring needs every gate at once:
//   1. config/student-ai.json names the provider and records the provider decision and privacy review;
//   2. the server environment sets STUDENT_AI_ENABLED=true and STUDENT_AI_PROVIDER to that provider;
//   3. the provider's adapter is compiled in (npm run tutor:select-adapter);
//   4. the adapter's own credentials are present (for OpenAI, OPENAI_API_KEY).
// A key alone activates nothing in a production build. The developer fixture is available only in
// development builds.
//
// Local preview (D-083, development only): under `next dev`, a key in .env.local turns on live tutoring
// on that machine (OPENAI_API_KEY or GEMINI_API_KEY; STUDENT_AI_PROVIDER picks one when both are set;
// STUDENT_AI_ENABLED=false turns it off). Production builds never take this path.
import record from "@/config/student-ai.json";
import { AUTHORED_FEATURES, type TutorFeatures, type TutorProvider } from "../contract";
import { fixtureProvider } from "../providers/fixture";
import type { AdapterFactory } from "./adapterTypes";
import { ADAPTERS } from "./adapters.generated";

export interface ActivationRecord { provider: string | null; providerDecision: string | null; privacyReview: string | null; text: boolean; voice: boolean }
export interface Activation { features: TutorFeatures; provider: TutorProvider | null; reasons: string[] }

const filled = (s: unknown) => typeof s === "string" && s.trim().length > 0;

const LOCAL_ORDER = ["openai", "gemini"];

export function resolveActivation(env: Record<string, string | undefined> = process.env, rec: ActivationRecord = record as ActivationRecord, adapters: Record<string, AdapterFactory> = ADAPTERS, dev: Record<string, AdapterFactory> = {}): Activation {
  const reasons: string[] = [];
  // developer fixture: never in a production build
  if (env.NOESIS_TUTOR_FIXTURES === "1") {
    if (env.NODE_ENV === "development") return { features: { mode: "fixture", text: true, voice: true, providerName: "developer fixture" }, provider: fixtureProvider, reasons: ["developer fixture (development only)"] };
    reasons.push("NOESIS_TUTOR_FIXTURES is ignored outside development");
  }
  // local preview: development builds only, on the developer's own machine
  if (env.NODE_ENV === "development" && env.STUDENT_AI_ENABLED !== "false" && Object.keys(dev).length) {
    const order = env.STUDENT_AI_PROVIDER ? [env.STUDENT_AI_PROVIDER] : LOCAL_ORDER;
    for (const name of order) {
      const a = dev[name]?.(env);
      if (a?.configured && a.provider) {
        const voice = env.STUDENT_AI_VOICE !== "false" && !!a.provider.capabilities.transcribe && !!a.provider.capabilities.speak;
        return { features: { mode: "live", text: true, voice, providerName: a.name, localPreview: true }, provider: a.provider, reasons: ["local preview (development only)"] };
      }
    }
    reasons.push(`local preview: no key for ${order.join(" or ")} in .env.local`);
  }
  if (env.STUDENT_AI_ENABLED !== "true") reasons.push("STUDENT_AI_ENABLED is not true");
  if (!filled(rec.provider)) reasons.push("no provider selected in config/student-ai.json");
  if (!filled(rec.providerDecision)) reasons.push("provider decision not recorded");
  if (!filled(rec.privacyReview)) reasons.push("privacy review not recorded");
  if (!rec.text) reasons.push("live text not switched on in config/student-ai.json");
  if (filled(rec.provider) && env.STUDENT_AI_PROVIDER !== rec.provider) reasons.push("STUDENT_AI_PROVIDER does not match the recorded provider");
  const factory = rec.provider ? adapters[rec.provider] : undefined;
  if (rec.provider && !factory) reasons.push(`the ${rec.provider} adapter is not compiled in`);
  const adapter = factory?.(env);
  if (adapter && !adapter.configured) reasons.push(`${adapter.name} credentials are not configured on the server`);
  if (reasons.length || !adapter?.provider) return { features: AUTHORED_FEATURES, provider: null, reasons };
  const voice = rec.voice && env.STUDENT_AI_VOICE === "true" && !!adapter.provider.capabilities.transcribe && !!adapter.provider.capabilities.speak;
  return { features: { mode: "live", text: true, voice, providerName: adapter.name }, provider: adapter.provider, reasons: [] };
}

/** Whether pages may use the microphone (Permissions-Policy). Read by next.config at build time. */
export function microphoneAllowed(env: Record<string, string | undefined> = process.env, rec: ActivationRecord = record as ActivationRecord): boolean {
  if (env.NOESIS_TUTOR_FIXTURES === "1" && env.NODE_ENV === "development") return true;
  // local preview with OpenAI voice (development only)
  if (env.NODE_ENV === "development" && env.STUDENT_AI_ENABLED !== "false" && env.STUDENT_AI_VOICE !== "false" && !!env.OPENAI_API_KEY?.trim() && (!env.STUDENT_AI_PROVIDER || env.STUDENT_AI_PROVIDER === "openai")) return true;
  return env.STUDENT_AI_ENABLED === "true" && env.STUDENT_AI_VOICE === "true" && rec.voice === true && filled(rec.provider) && filled(rec.providerDecision) && filled(rec.privacyReview);
}
