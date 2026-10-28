# 10 · Privacy and data minimisation

**Not legal advice.** This document records engineering choices and the questions a qualified reviewer must answer before a public launch.

## What data exists and where

| Data | Where | Leaves the device? | Retention |
|---|---|---|---|
| Class (11/12/unset) | IndexedDB | no | until the student erases it |
| Progress: sessions, evidence, stack, flashcards, recommendations | IndexedDB | no | until erased; *Export* and *Erase everything* in Settings |
| Motion and voice preferences | IndexedDB | no | as above |
| Tutor panel in **authored mode** (default): actions, the lesson's own hints and feedback, *Read this aloud* | the browser only | **no**. Read-aloud uses only voices the device synthesises locally (`localService`) | nothing stored beyond the existing attempt record, which now notes `tutorAssists` (a count) |
| Live tutor turn (**only if every activation gate in docs/09 is met; off by default**): template id, version, seed, action, hints shown, phase, the student's raw answers on **this question** (≤ 3), a small snapshot of their work on the visual, typed or transcribed text (≤ 1,000 chars), the last ≤ 6 turns about this question | browser → our server → the approved provider | only on an explicit student action, and only when activated | Our server stores nothing (no bodies in logs). Requests use `store: false`. Provider-side abuse-monitoring retention (OpenAI: up to 30 days unless zero data retention is approved) must be assessed in the privacy review |
| Push-to-talk audio (**only if voice is activated; off by default**) | browser → our server → provider transcription | only while the student holds a recording (≤ 30 s, ≤ 1 MB) | Not stored by us; the transcript is shown for editing and kept only in the open panel |
| Speech of a tutor reply (**only if voice is activated**) | our server → provider speech → browser | the reply text only (≤ 600 chars, signed by our server) | Not stored by us; the audio buffer lives in the open panel and is discarded on close |
| **Optional cloud backup (D-086):** the student's Google account (held by Firebase Auth) and their progress JSON | browser → Firebase Auth and Firestore (Google), only after the student taps *Sign in with Google* | yes, when signed in | Until the student signs out and deletes it, or the account is removed. We write no name, email or photo. Needs verifiable parental consent for under-18s under DPDP before launch |
| Server logs | host | — | route, status, latency, token counts only. **No bodies, no IPs beyond rate-limit memory.** |

**Not collected:** name, email, phone, school, age or birth date, location, device identifiers, contacts, analytics or advertising identifiers, cookies (none are needed in v1).

## Minimisation rules (enforced in code)

0. **Default: the student runtime sends nothing to any AI service.** Student AI is disabled and no vendor SDK is installed in the app (docs/09).
1. AI payloads carry **only the current question's context**. They contain no session history, no other chapters and no profile.
2. The class value is **never** sent to AI.
3. Typed student text is length-capped and sent only on an explicit action (Ask / Submit reasoning).
4. There is no persistent identifier. Rate limiting uses the IP in memory for 60 s.
5. Microphone access follows explicit opt-in, as in docs/09. Recording state is always visible, and the mic is released immediately afterwards. `Permissions-Policy` keeps `microphone=()` unless voice is fully activated.
5a. **Tutor context is rebuilt on the server** from the shipped manifest. Client-reported state is untrusted, and the context never includes progress, class, sessions or other chapters (`src/tutor/context.ts`, unit-tested).
5b. **No permanent credential reaches the browser.** Provider keys are read only by the server adapter; future streaming voice would use a short-lived, scoped grant. `npm run check:no-ai-sdk` enforces the source and bundle rules.
6. **Offline drafting** (adults, developer machines) sends only template text and drafting prompts, never student data. Use a paid API tier for it: Google's terms say content sent to *unpaid* Gemini services may be used to improve products and read by human reviewers.

## Pre-launch privacy review (required gate)

A public launch is blocked until someone qualified signs off on each item and the outcome is recorded in `docs/decision-log.md`:

1. **Age and provider terms (OQ-1).** Before any student AI is enabled, confirm the chosen provider's terms permit use by an application likely to be accessed by under-18s, and record the decision. For example, the Gemini API Additional Terms (last updated 2026-04-28) prohibit this, which is why Gemini is limited to adult-only offline drafting. OpenAI, the proposed first live provider (Phase 5), publishes [Under 18 API guidance](https://developers.openai.com/api/docs/guides/safety-checks/under-18-api-guidance) (read 2026-10-28). It requires compliance with child-protection and privacy laws, and it requires **zero data retention before processing personal data of children under 13**. It also asks for:
   - an AI disclosure to minors;
   - age-appropriate content filters;
   - monitoring and reporting with escalation paths;
   - age assurance where appropriate.

   Its usage policies also require telling listeners that a TTS voice is AI-generated. The tutor already labels AI voice and AI replies; filters, monitoring and escalation, age assurance and zero data retention are **not** built and need a decision.
2. **India DPDP Act 2023 and Rules.** Confirm current obligations and timelines with counsel, especially:
   - verifiable parental consent before processing a child's personal data;
   - the bar on tracking, behavioural monitoring and targeted advertising directed at children;
   - notices, grievance redressal and data-principal rights.

   Assess whether server-side AI processing of question context and voice counts as processing a child's personal data, and design consent accordingly.
3. **Privacy notice and in-app explanations:** a plain-language notice, the microphone explainer and the tutor explainer, written for students and parents.
4. **Data flows confirmed** against this document by inspecting network traffic in a production build.
5. **Security review:**
   - key handling, ephemeral token scope;
   - rate limits, CSP;
   - dependency audit;
   - logging configuration.
6. **Children's content safety:** a tutor red-team on off-topic, self-harm, abuse and personal-information prompts, with the expected refusals and redirections documented.
7. **Data subject rights in a browser-only model:** export and erase work, and the app explains that no copy exists on our servers.

None of this blocks the build phases: by default the student runtime uses no AI (the tutor runs in authored mode on the device) and keeps all progress on the device. Recording a completed review is the `privacyReview` field of `config/student-ai.json`, which live tutoring requires (docs/09).
