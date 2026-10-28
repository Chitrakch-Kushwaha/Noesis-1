// Development-only adapter registry for the local AI preview (D-083). `next dev` loads the OpenAI and
// Gemini adapters on demand, so a key in .env.local is enough to try live tutoring on localhost.
// In any other build `process.env.NODE_ENV` is "production", the dynamic imports sit in a dead branch,
// and no adapter code or vendor host reaches the bundle (verified by `npm run check:no-ai-sdk`).
import type { AdapterFactory } from "./adapterTypes";

let loaded: Promise<Record<string, AdapterFactory>> | null = null;

export function devAdapters(): Promise<Record<string, AdapterFactory>> {
  if (process.env.NODE_ENV !== "development") return Promise.resolve({});
  return (loaded ??= Promise.all([import("@/adapters/openai"), import("@/adapters/gemini")])
    .then(([o, g]) => ({ openai: o.createOpenAIAdapter, gemini: g.createGeminiAdapter })));
}
