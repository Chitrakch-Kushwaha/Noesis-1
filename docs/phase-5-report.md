# Phase 5 report: contextual tutor, interactive explanations and the animated owl

**Date:** 2026-10-28 · **Scope:** the "Phase 5" prompt. It covers the phase plan's Phase 7 (tutor contract and offline drafting) and Phase 8 (voice contract), plus the tutor character (decision log D-073 to D-082). **Live AI stays disabled.** No external provider was enabled or called, and nothing was deployed. Phase 6 (content scale-up) is not part of this work.

## What was built

| Area | What exists now | Where |
|---|---|---|
| **Tutor panel** | *Ask the tutor* in the question bar. On wide screens the panel is a rail beside the lesson; on screens under 1100 px it is a bottom sheet (≤ 44 % height) that can be minimised. Both keep the visual, the answer and Check reachable, and keyboard focus and scrolling stop above the sheet. Actions: *Help me begin*, *Explain my mistake*, *Guide me through the visual*, *Give me the next hint*, *Read this aloud*. Each mode states plainly whether it is AI. | `src/ui/tutor/TutorPanel.tsx`, `app/globals.css` |
| **Owl character** | An SVG and Motion owl built from the supplied artwork in theme colours. States: ready, listening, waiting, speaking, guiding, encouraging, unavailable. Each comes from a real event (the recorder, audio `onended`, in-flight requests, demonstrations, a correct answer, failures). Reduced motion gives still poses, and *Hide owl* is remembered. | `src/ui/tutor/OwlTutor.tsx` |
| **Context** | Rebuilt from `{templateId, version, seed}`. Answers are re-checked, the widget snapshot is validated, hints are limited by what was consumed, and the solution appears only after the question ends. Context covers the current question only. | `src/tutor/context.ts`, `src/tutor/snapshot.ts` |
| **Validated explanations** | Two tools only: `show_hint` (levels already reached) and `highlight` (rebuilt targets). Validation covers strict shape, text rules, a leak check and authored fallback with a labelled reason. Demonstrations play on a **copy** with *Back to my work*. Stale or late replies are set aside, and close or question change cancels the request. | `src/tutor/guard.ts`, `orchestrator.ts`, `LessonPlayer.applyTutorReply` |
| **Assistance** | A hint uses the existing hint action. Explanations and demonstrations increment `tutorAssists` before any further answer and make the outcome *assisted*. Opening the panel counts as nothing. The tutor never submits or changes mastery. | `playerModel.ts`, `progress.ts`, `session.ts` |
| **Provider contract** | `TutorProvider` with authored and fixture providers, a provider-neutral prompt and a per-turn reply schema. A conformance suite runs over the authored provider, the fixture and OpenAI (mocked). | `src/tutor/contract.ts`, `prompt.ts`, `providers/` |
| **Server routes** | `/api/tutor/features`, `turn`, `transcribe`, `speak` (signed text only) and `voice-session` (grant checks). All return 404 unless activated. They apply rate limits, size limits, a 15 s timeout and cancellation, and log no bodies. | `src/tutor/server/`, `app/api/tutor/*` |
| **Activation** | Five gates; a key alone activates nothing. The activation record is shipped empty and the adapter registry is shipped empty. The microphone Permissions-Policy opens only for an activated voice build. | `src/tutor/server/activation.ts`, `config/student-ai.json`, `next.config.ts` |
| **OpenAI adapter** | Plain fetch with no SDK. Text uses the Responses API with a strict JSON Schema, `store: false` and bounded output. Push-to-talk uses transcription and speech, with AI-voice labelling. It maps 401, 403, 429 (`Retry-After`, quota), 5xx, network, abort, refusal, incomplete and non-JSON responses. Selection: `npm run tutor:select-adapter`. Live check: `npm run tutor:verify-openai`. | `adapters/openai/index.ts`, `scripts/tutor/` |
| **Voice** | Push-to-talk through our server, with an opt-in explainer, visible recording and processing states, a 30 s cap, an editable transcript, captions, stop/mute/replay, interruption and microphone release. Authored *Read this aloud* uses on-device voices only. | `src/tutor/voice.ts`, `client.ts`, `TutorPanel.tsx` |
| **Bundle guard** | `check:no-ai-sdk` was extended with source rules (no `tools/` imports, adapters only via the registry, no server tutor code in client components, no credential `NEXT_PUBLIC_` names, vendor keys read only in `adapters/`). The build scan never allows a vendor host in the browser bundle; in the server bundle it allows one only when that adapter is selected and the record is complete. The key value is scanned for when present in the shell. | `scripts/check-no-ai-sdk.mjs` |
| **Offline drafting** | A separate package with no dependencies, offering Gemini, OpenAI and fixture modes. Drafts go to `content/drafts/` as `ai-draft` / `draft`, wording only. `check` rejects answers, approvals, placeholder changes and new numbers. Live `verify` needs a key and `--confirm`. It never edits templates or the manifest. | `tools/content-drafting/` |
| **Docs** | docs/09 rewritten; docs/10, docs/01, the decision log, phase plan, README and `.env.example` updated. | — |

## Demo path

**Production build (authored mode, the default):**

```bash
npm run build && npm start
```

1. **Force diagram:** open `http://localhost:3000/chapter/lom/try?q=lom.fbd.m.box-pulled-by-rope&seed=7`.
   1. Add a force (for example *tension* from *rope*).
   2. Click **Ask the tutor**, then **Guide me through the visual**. The owl shows *Pointing at the visual*, your force is highlighted on a copy, and the banner offers **Back to my work**.
   3. Click **Back to my work**: your diagram is exactly as you left it.
   4. Click **Give me the next hint**: the first authored hint appears in the lesson and in the panel.
   5. Finish the diagram and click **Check**. The saved attempt records `outcome: "assisted"` and `tutorAssists: 1`.
2. **Maths visual:** open `http://localhost:3000/chapter/lim/try?q=lim.derivative-rules.m.power-rule-tangent&seed=7`.
   1. Click **Ask the tutor**, then **Guide me through the visual**. Point P and its tangent are highlighted, with "Move point P along the curve… Where is it steepest?"
   2. Answer wrongly, then use **Explain my mistake**, which gives the lesson's own misconception feedback.
   3. At phone width the same journey uses the bottom sheet, and the visual scrolls above it.
3. **Fallback:** in the production build there are no voice controls. The panel says typed and spoken questions need the live tutor, which is off, and every button still works. `GET /api/tutor/features` returns `{"mode":"authored",…}` and the live routes return 404. *Read this aloud* appears only where the device has a local English voice.

**Developer fixture (voice journey, labelled test data):**

```bash
NOESIS_TUTOR_FIXTURES=1 npm run dev
```

4. Open the maths URL above and click **Ask the tutor**. A banner and the identity line say *Developer fixture. Not a live tutor*.
   1. Click **Use my voice**, read the explainer, click **Allow microphone**, then **Push to talk**. The owl listens and a recording timer shows.
   2. Click **Stop**. You see "I heard this…" with an editable transcript.
   3. Click **Send**. The reply is captioned, a **test tone** plays (labelled "not a voice") while the owl shows *Speaking*, and Stop, Mute and Replay are available.
   4. Type `fixture:leak`, `fixture:bad-tool`, `fixture:malformed`, `fixture:error` or `fixture:rate-limit` to see each one fall back to authored guidance with a reason. Type `fixture:delay …`, then press Check during the wait: the reply is set aside as stale.

## Commands run (2026-10-28, in the working copy) and results

| Command | Result |
|---|---|
| `npx tsc --noEmit` | Pass (also passes with the OpenAI adapter selected) |
| `npm run check` (curriculum, content validation, contrast, no-AI guard, typecheck, unit) | Pass. **467 unit tests**, including 25 tutor-core and 41 tutor-server tests (activation gates, routes, limits, OpenAI mocked, conformance over 3 providers, assistance). Content: 276 templates, 0 errors |
| `npm run drafting:test` | Pass, 4 tests (fixture drafts pass; approval, answers, new numbers and placeholder changes rejected; live providers need a key and a model) |
| Drafting CLI: `draft --fixture`, `check`, `verify` with no key | A draft was written and passed the checks (then deleted); `verify` reported **PENDING**, with no call made |
| `npm run tutor:verify-openai -- --confirm` (no key) | **PENDING**: "OPENAI_API_KEY is not set on this machine. No call was made." |
| `npm run build`, then `npm run check:no-ai-sdk` | Pass. The default build contains no vendor code (`grep openai .next` finds nothing) |
| Temporary test: select OpenAI with an incomplete record, build, check | **Fails as intended:** the vendor host and key name appear in the server bundle without a complete record |
| Temporary test: the same with a filled test record | Pass. The host is only in the server bundle (0 files in `.next/static`). `features` returned authored with no key, authored with a key but no env flag, and `live` with env flags plus a placeholder key. No turn was sent. Record and registry were restored and rebuilt afterwards |
| `npx playwright test tests/e2e/tutor.spec.ts tests/e2e/tutor.mobile.spec.ts` | Pass, 5/5 (force diagram with assisted outcome; graph; authored fallback with no microphone use and headers; hide owl, close and reduced motion; phone sheet reachability) |
| `npm run e2e:tutor-fixture` (`next dev`, fixture) | Pass, 5/5 (labelling; full voice journey with microphone release; stale reply; five failure paths; microphone denied) |
| `npx playwright test` (full suite) | **315 passed, 23 failed.** None of the failures involves the tutor (see below) |

**The 23 full-suite failures are outside Phase 5:**

- **22 oscillator and energy questions:** the lesson test's development-language rule `/phase \d/` matches the oscillator widget's description "phase 0°" (`src/widgets/oscillator/model.ts`, unchanged since the Phase 4 commit).
- **1 roadmap test:** it expects *Electric Charges and Fields* to be preview-only, but the uncommitted content work in `src/content/generated/playable-chapters.json` now makes it playable.

The fix belongs with that content work (for example, narrowing the test's regex or rewording "phase" to "phase angle"); Phase 5 doesn't change it.

## Capability table

| Capability | Authored (works now, no key) | Fixture-tested | Live-verified |
|---|---|---|---|
| Tutor panel, owl states, hide owl, reduced motion | ✓ | ✓ | n/a |
| Help me begin / Explain my mistake / Next hint | ✓ (lesson content) | ✓ | — |
| Guide me through the visual (highlight on a copy, Back to my work) | ✓ (tested on the force diagram and graph; motion-track, number-line and triangle targets implemented but not yet exercised by tests) | ✓ | — |
| Stale-reply rejection, cancellation | ✓ (epoch guard) | ✓ (`fixture:delay`) | — |
| Assistance recorded before scoring | ✓ | ✓ | — |
| Typed questions | — (honest note) | ✓ | — |
| Guard: leak, tools, malformed, text | n/a (authored tools checked) | ✓ (unit and e2e) | — |
| OpenAI Responses turn | — | ✓ (mocked fetch) | **pending** |
| Push-to-talk → transcript → reply → speech, captions, stop/mute/replay | — | ✓ (test tone) | **pending** |
| Read aloud | ✓ (device local voice, where available) | ✓ (test tone) | — |
| Microphone denied / unsupported / missing credentials | ✓ (no voice offered) | ✓ | — |
| Streaming voice grant | — | ✓ (grant checks; OpenAI adapter returns 501) | not built |
| Offline drafting | — | ✓ (`--fixture`) | **pending** |

## Remaining activation requirements (not done; need people, credentials or approval)

1. **Provider decision (OQ-1).** Record whether OpenAI's terms and [Under 18 API guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance) suit an app used by CBSE students. That guidance requires zero data retention before processing personal data of under-13s, AI disclosure, age-appropriate filters, monitoring and escalation, and age assurance where appropriate. Write the decision id into `providerDecision`.
2. **Privacy review (docs/10)**, including DPDP parental consent, the student/parent notice and verified data flows, recorded in `privacyReview`.
3. **Children's content-safety red-team** of the live tutor: off-topic, self-harm, abuse, personal information and answer extraction. Document the expected redirects. The guard cannot prove that no answer leaks.
4. **Live verification** on a developer machine:

   ```bash
   OPENAI_API_KEY=… npm run tutor:verify-openai -- --confirm --voice
   ```

   Record the date, models and results here. Confirm the default model ids or set `OPENAI_*_MODEL`.
5. **Then, and only then:**
   1. Fill in `config/student-ai.json`.
   2. Run `npm run tutor:select-adapter -- --provider openai`.
   3. Set `STUDENT_AI_ENABLED=true`, `STUDENT_AI_PROVIDER=openai`, `OPENAI_API_KEY` (and `STUDENT_AI_VOICE=true` for voice) in the **server** environment.
   4. Build, then run `npm run check:no-ai-sdk`.

## Known limitations

- **The leak check reduces, but cannot eliminate, answer leakage.** It catches the answer's own forms, "the answer is" phrasing and unseen numbers, not every paraphrase.
- **TTS model retirement.** OpenAI lists `gpt-4o-mini-tts` (and `tts-1`) as deprecated, shutting down on **2027-01-06** ([text-to-speech guide](https://developers.openai.com/api/docs/guides/text-to-speech)). The suggested successor works only through the Realtime API, so continued AI voice would need a streaming adapter that uses the `VoiceGrant` contract.
- **Model ids are unverified.** The defaults come from OpenAI's documentation, and no live call was made from this project.
- **Under-18 safeguards are not built.** There is no content filter, abuse monitoring or escalation, or age assurance beyond the guard, and zero data retention needs an OpenAI agreement.
- **Single-instance state.** Rate limits and the speech-token secret are held in memory per server process. A multi-instance deployment needs a shared store and secret.
- **Conversation history is client-reported.** It is capped at 6 turns, limited to the current question, and treated as data in the prompt, but it is not authenticated.
- **Browser coverage.** Voice was tested in headless Chromium with a fake microphone. Safari's MediaRecorder formats are accepted by the server but untested on real devices.
- **Authored mode can't answer free-typed questions.** It says so plainly and points to the buttons.
- **The bundle check reads the record at check time.** `check:no-ai-sdk` reads `config/student-ai.json` from the working tree, so run it in the same tree that was built.

## Follow-up (2026-10-28): AI chat on localhost, Gemini, Brilliant-style lesson screen

You asked for a visible AI chatbot and a Brilliant-like look. Your choices: the lesson screen and tutor only; both providers, switchable; AI turned on automatically on your own computer when a key is present.

- **Local AI preview (D-083).** Put `OPENAI_API_KEY=…` (or `GEMINI_API_KEY=…`) in `.env.local` in the project folder and run `npm run dev`. The tutor then shows "AI · local preview", accepts typed questions and, with OpenAI, push-to-talk voice. `STUDENT_AI_PROVIDER=gemini` switches provider. Production builds still need every activation gate.
- **Gemini adapter (D-085):** text only; the default model `gemini-3.8-flash` is not live-verified.
- **Lesson design (D-084):**
  - light page with the visual on a white card;
  - sticky top bar and a bottom action bar with a large Check button;
  - green and red feedback bands;
  - the tutor as a chat (owl header, bubbles, typing dots, suggestion chips, composer);
  - an orange "Ask the tutor" pill, plus "Ask the tutor about it" after a wrong answer.
- **Checks run:**
  - `tsc` passes;
  - 472 unit tests pass (5 new: Gemini mocked, local preview gates);
  - contrast passes, with the light-theme pairs added;
  - production build and `check:no-ai-sdk` pass, and no adapter code is in the build;
  - in `next dev` with a placeholder key, `features` returned `{"mode":"live",…,"localPreview":true}` and `microphone=(self)`, read from `.env.local`;
  - tutor browser tests pass (5 production, 5 fixture);
  - lesson, mobile and session suites: 297 passed, 23 failed. These are the same 22 oscillator "phase 0°" failures as before, plus one mobile tutor assertion, which was fixed and re-run green.
- **Still not live-verified.** No real OpenAI or Gemini call has been made from this project.
