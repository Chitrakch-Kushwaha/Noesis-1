# NOÊSIS

Interactive, adaptive Physics and Mathematics for CBSE/NCERT Class 11–12, covering a curated 24-chapter subset.

**Current state (2026-10-28):** the roadmap, player/checker and the consolidated **Phase 3** (Laws of Motion pilot content, adaptive sessions with recursive detours and exact resume, mastery and completion) are built. Phase 2 and Phase 3 product review and the **named human content review** are pending: no content is approved yet, so real mastery can't be earned until it is (a labelled reviewer preview demonstrates the journeys). See the [Phase 3 report](docs/phase-3-report.md) and the [phase plan](docs/phase-plan.md). **Phase 5** added the tutor panel with its owl, interactive visual explanations and a voice pipeline. Help runs on the lesson's own hints and visuals, and live AI is prepared but switched off; see the [Phase 5 report](docs/phase-5-report.md). Historical reports: [Phase 1](docs/phase-1-report.md), [Phase 2](docs/phase-2-report.md). The blueprint starts at [`docs/BLUEPRINT.md`](docs/BLUEPRINT.md).

## Run it

Needs Node.js 20.9 or newer.

```bash
npm install
npm run dev            # http://localhost:3000
# or a production build:
npm run build && npm start
```

Progress is stored only in your browser (IndexedDB). Use *Export progress* / *Import progress* / *Erase progress* in the right-hand panel.

## Checks

```bash
npm run check          # curriculum rules, content validation, contrast, no-AI-SDK guard, typecheck, unit tests
npm run build && npx playwright test   # browser tests (desktop + phone): navigation, persistence, keyboard,
                                       # reduced motion, accessibility (axe), frame timing, tutor journeys
npm run e2e:tutor-fixture              # tutor voice and failure paths against a labelled developer fixture (next dev)
npm run drafting:test                  # the separate offline drafting tool's own tests
```

## Content

51 templates (25 Laws of Motion, plus small Motion in a Plane, trigonometric-foundation and Straight Lines packs) and 3 lessons, all `in-review`; none counts toward mastery until a named reviewer approves it. `/chapter/<id>/try` runs an adaptive session; `?q=<templateId>&seed=<n>` opens a single question, and `?preview=review` starts a clearly labelled reviewer-preview session in which in-review content counts for that session only.

```bash
npm run content:validate   # validates every question template (50 seeds each) and writes the student manifest
npm run content:review     # local review tool at http://127.0.0.1:4100 (run npm run dev alongside it)
```

Question templates live in `content/templates/<chapter>/<skill>/<id>.json`, lessons in `content/lessons/<skill>.lesson.json`, misconception catalogues in `content/misconceptions/`. Approval is recorded only by a person through `content:review`; nothing approves itself. See docs/05 §4 and docs/phase-2-report.md.

Browser tests need Playwright's Chromium. Run `npx playwright install chromium` once on a new machine.

## What's here

```
app/ and src/               the web app (Next.js + React + TypeScript); see docs/01-architecture.md
content/curriculum/         chapters, skills, foundations, related links (source of truth) + generated graph data
config/learning.config.json adaptive-engine thresholds (all configurable)
content/templates/          question templates (JSON); answers come from code solvers in src/content/solvers
scripts/                    checks; scripts/content/ holds content:validate and content:review
tests/unit, tests/e2e       Vitest and Playwright
docs/                       blueprint, decision log, generated reports, reference images
```

## Tutor and AI

*Ask the tutor* opens a panel beside the lesson (a bottom sheet on phones) with an animated owl. By default it uses the lesson's own hints, feedback and visual cues on the device, and makes no AI calls. Demonstrations play on a copy of your work, with *Back to my work* to return.

**Try the AI chat on your own computer:** copy `.env.example` to `.env.local`, add your `OPENAI_API_KEY` (or `GEMINI_API_KEY`), and run `npm run dev`. The tutor then answers typed questions; OpenAI also adds push-to-talk voice.

For deployments, live AI tutoring and AI voice are built behind a provider-neutral contract, with OpenAI and Gemini adapters prepared. They stay **off** until a person records a provider decision and a privacy review in `config/student-ai.json`, the server environment enables them, the adapter is compiled in (`npm run tutor:select-adapter -- --provider openai`) and a server key is present. A key alone activates nothing. See docs/09, docs/10 and `.env.example`. The app contains no AI SDK (`npm run check:no-ai-sdk`). Offline drafting for adult content developers is a separate package in `tools/content-drafting/`.
