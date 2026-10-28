// Live verification of the OpenAI tutor adapter. It makes real, billable calls, so it runs only when
// OPENAI_API_KEY is in the environment AND --confirm is passed. Without them it reports "pending" and
// makes no network request. It never prints the key, request bodies or audio.
//
//   OPENAI_API_KEY=... npm run tutor:verify-openai -- --confirm [--voice]
//
// This is a developer check of the adapter; it does not activate live tutoring for students.
import { createOpenAIAdapter } from "@/adapters/openai";
import { TUTOR_LIMITS, type TutorRequest } from "@/src/tutor/contract";
import { answerForms, buildMaterial, instanceFor } from "@/src/tutor/context";
import { runTurn } from "@/src/tutor/orchestrator";
import { entryById } from "@/src/content/catalog";

const SAMPLES = [
  { templateId: "lom.fbd.m.box-pulled-by-rope", seed: 7, action: "guide-visual" as const },
  { templateId: "lim.derivative-rules.m.power-rule-tangent", seed: 7, action: "begin" as const },
];

async function main() {
  const confirm = process.argv.includes("--confirm");
  const voice = process.argv.includes("--voice");
  const adapter = createOpenAIAdapter(process.env);
  console.log(`Models: ${Object.entries(adapter.models).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  if (!adapter.configured || !adapter.provider) { console.log("PENDING: OPENAI_API_KEY is not set on this machine. No call was made."); return; }
  if (!confirm) { console.log("PENDING: pass --confirm to make real, billable calls to OpenAI. No call was made."); return; }
  const provider = adapter.provider;
  let failed = 0;
  for (const s of SAMPLES) {
    const entry = entryById.get(s.templateId);
    if (!entry) { console.log(`SKIP ${s.templateId}: not in the manifest`); continue; }
    const key = { templateId: s.templateId, version: entry.template.version, seed: s.seed };
    const q = instanceFor(key);
    const state = { hintsShown: 0, phase: "answering" as const, attempts: [] };
    const req: TutorRequest = { requestId: `verify-${s.seed}`, question: key, action: s.action, state, history: [] };
    const { material } = buildMaterial(q, key, state, s.action, q.skillId);
    const t0 = Date.now();
    const reply = await runTurn(provider, material, req, { answerForms: answerForms(q), timeoutMs: TUTOR_LIMITS.requestTimeoutMs });
    const ok = reply.source === "live" && !reply.fallback;
    if (!ok) failed++;
    console.log(`${ok ? "PASS" : "FAIL"} text turn ${s.templateId} (${Date.now() - t0} ms): source=${reply.source}${reply.fallback ? ` fallback=${reply.fallback.reason}` : ""} tools=${reply.tools.map((x) => x.name).join("+") || "none"}`);
    if (ok) console.log(`     "${reply.text}"`);
  }
  if (voice && provider.speak && provider.transcribe) {
    const ctrl = new AbortController();
    const phrase = "Which forces act on the box?";
    try {
      const speech = await provider.speak(phrase, ctrl.signal);
      console.log(`PASS speech: ${speech.audio.byteLength} bytes ${speech.mimeType}, aiGenerated=${speech.aiGenerated}`);
      const heard = await provider.transcribe(new Blob([speech.audio], { type: speech.mimeType }), ctrl.signal);
      const match = heard.text.toLowerCase().includes("forces");
      if (!match) failed++;
      console.log(`${match ? "PASS" : "FAIL"} transcription round trip: "${heard.text}"`);
    } catch (e) { failed++; console.log(`FAIL voice: ${(e as Error).message}`); }
  }
  console.log(failed ? `${failed} check(s) failed.` : "All live checks passed. Record the date, models and results in docs/phase-5-report.md.");
  process.exitCode = failed ? 1 : 0;
}
main().catch((e) => { console.error(`FAIL: ${(e as Error).message}`); process.exitCode = 1; });
