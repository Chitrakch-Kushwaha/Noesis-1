# Phase plan and implementation prompts

Revised 2026-10-28 (second revision, D-062): former Phases 3, 4 and 5 are **consolidated into one Phase 3** (pilot content, adaptive sessions and remediation, mastery and completion), which is now built and awaiting named content review and product review. Phase numbers 6–8 and the launch gate are unchanged. The original brief remains a historical reference in `docs/reference/original-brief.txt`; the first 2026-10-28 revision is recorded as D-061.

## Current baseline

| Area | Built now | Still to build or improve |
|---|---|---|
| Roadmap (Phase 1) | Four subject/class views, pan/zoom/fit, search, list, chapter previews, motion, local progress and export/import; **Continue card**, **Start/Resume session**, class setting, reviewer-preview banner, `?review=1` | A paused marker and foundation thread drawn on the map itself; bars still mean **skills tried** |
| Lesson player (Phase 2) | Twelve checked answer formats, three tries, progressive hints, misconception feedback, consequences, solutions, unscored reasoning; **session mode** with exact restore of answer, tries, hints and widget work state; "Saved" only after the write | Phone keyboard/fraction-entry polish and 44 px widget handles (Phase 2.1) |
| Widgets | `vector-board`, `motion-track`, `graph-plot`, `number-line`, static `figure`; **`triangle-explorer`** (Phase 3) | Further widgets only as content needs them (Phase 6) |
| Content | **51 templates** (25 Laws of Motion, 5 Motion in a Plane, 6 Straight Lines, 3 trig-ratio foundation, 12 in other chapters), **3 lessons**, 4 misconception catalogues, 25 hand-worked golden cases; **0 approved** | Named human review; the docs/05 ship rule of **two approved templates per skill × difficulty** |
| Laws of Motion | All **nine** required skills have an easy diagnostic and a main template; resolving forces, momentum conservation and circular dynamics have easy, medium and hard; 16 distinct main templates | Second templates per skill × difficulty; hard templates for the first law and free-body diagrams; reviewed prerequisite closure beyond the packs |
| Adaptive journey | Config-driven selection, easy diagnostics, evidence planner and probes, recursive detours (cycle, depth-4 and sibling guards), foundation frames with a lesson repeat, Stuck (retry, back, pause), worked-solution return and a fresh return variant, class guard, exact resume, stale-tab protection | Interactive guided-example steps; Chocolate Problem; recommendation cards beyond the Continue card |
| Mastery and review | Evaluator over main evidence (10 answered, 8 of the last 10, 2 hard, coverage, cap 16 then Not yet), chapter records, ranked successors, existing flashcards and Leitner review reused with configured intervals | Real mastery requires approved content (none yet); reviewer preview demonstrates it with labelled, separate records |
| AI/voice | **Phase 5 (2026-10-28):** tutor panel with the owl; authored tutor on the device; validated `show_hint`/`highlight` demonstrations on a copy; provider contract and conformance suite; push-to-talk voice pipeline (fixture-tested); prepared OpenAI adapter, not compiled in; separate drafting tool; no AI SDK in the app | Provider decision (OQ-1), privacy review, red-team, live verification; see docs/phase-5-report.md |

Phase 1 is recorded as approved. Phase 2 is built and awaiting product review. **Phase 3 (consolidated) is built and awaiting content review and product review**; see [phase-3-report.md](phase-3-report.md). D-053 remains a proposed content-policy amendment. Only unchanged human-approved content counts toward mastery, so until a named reviewer approves content, chapters can be mastered only inside a clearly labelled reviewer preview (D-069).

## Phase sequence and completion gates

| Phase | Scope | Completion gate |
|---|---|---|
| **0 · Blueprint — complete** | Architecture, curriculum graphs, configuration specification, validators | Historical blueprint checks and corrections recorded |
| **1 · Roadmap — built, approval recorded** | Existing roadmap and browser progress experience | Preserve the working baseline |
| **2 · Player/checking — built, review pending** | Existing player, core widgets, checker and content tools | Product review |
| **2.1 · Player reliability and usability — partly done** | Honest save states and exact restore were delivered inside Phase 3; phone input, touch targets, compact roadmap layout, transitions and payload work remain | Remaining items in the prompt below |
| **3 · Pilot, adaptive sessions and mastery — built, review pending** | Laws of Motion pilot content; Motion in a Plane/trig-foundation and Straight Lines packs; runtime config; adaptive sessions, remediation, detours, foundations, Stuck/return and exact resume; mastery, Not yet, chapter records, successors and review integration | Named human review of the content (never automatic); then Journeys 1–3 and the pilot pass with approved content and no preview; ship-rule gaps closed or explicitly accepted |
| **4 · Adaptive sessions** | *Merged into Phase 3 (D-062).* | — |
| **5 · Mastery and completion** | *Merged into Phase 3 (D-062).* The optional Chocolate Problem remains open. | — |
| **6 · Content scale-up** | Remaining chapters, foundations and widgets in reviewable batches | The ship rule holds for every chapter; a visible map node alone is not playable content |
| **7 · Tutor contract and offline drafting — built as part of the requested "Phase 5"** | Provider-neutral interfaces, authored-hints adapter, fixture conformance, separate adult drafting tool; plus the tutor panel, owl and prepared OpenAI adapter | Offline contract verified (docs/phase-5-report.md); live tutor and live drafting verification **pending** a key and approval |
| **8 · Voice contract — built as part of "Phase 5"** | Disabled, opt-in push-to-talk, editable transcript, captions, text fallback and bounded cue tools | Fixture journeys pass; actual provider use needs the provider/privacy gates |
| **Launch gate** | Content readiness, representative real-device performance, accessibility and privacy review | Evidence and sign-offs recorded; unmet gates remain explicit |

## Shared preface for implementation prompts

Use this preface with one phase prompt below:

> Work in the existing NOÊSIS repository. Inspect the relevant implementation before editing and preserve the working roadmap, theme, checker and widget contracts. Follow applicable repository instructions and bundled framework documentation. Treat the original brief and phase reports as product references and historical evidence; the selected phase below defines the current task. Implement only that phase. Do not rebuild completed features or silently claim planned behavior is present. Keep unfinished development details out of the student UI. Run checks that exercise changed behavior and a small representative browser flow; do not click every feature or rerun the full browser matrix unless the change requires it. Report what changed, how to run it, checks actually run and remaining gaps. Do not reuse historical test counts as fresh results. Keep authored hints usable and student AI disabled. Content approval must come from a named human through the review workflow; never approve content automatically.

## Phase 2.1 prompt — player reliability and usability

> Stabilise the existing player before expanding it. Confirm startup from the committed package manifest and lockfile; the 2026-10-28 checkout was missing installed `katex`, `tsx` and `fast-check`, causing a build overlay. Restore dependencies without upgrading package ranges. Show pending, saved and failed states based on the actual persistence promise, with retry on failure. Define and implement restoration of an unfinished demonstration question: answer, hints, tries, visual state and question/seed, without duplicating completed attempts. Leave the recursive session stack to Phase 4.
>
> Improve phone input: keep the answer and Check action usable while the keyboard is open, add a convenient fraction-entry route, and move widget hit targets toward the documented 44 px goal. At compact viewport widths, keep the roadmap legend from obscuring nodes and preserve readable labels when fitting or closing a chapter preview. Add the planned short input-to-visual transition with a reduced-motion equivalent. Address the ranking-hint and low-variation content warnings. Review consequences that reveal partial answer information and preserve assisted-answer accounting. Split question/widget payloads where useful, then measure against the existing budgets. Acceptance: focused persistence/resume checks plus representative desktop/phone flows; record unmeasured real-device behavior rather than claiming it passes.

## Phase 3 prompt — consolidated pilot, adaptive sessions and mastery (built 2026-10-28; kept for re-runs and review)

> Turn the demonstration player into a complete adaptive learning experience, using Laws of Motion as the pilot. (1) Complete the pilot content: verify coverage and fill gaps across all nine required skills with medium main questions, easy diagnostics, hard questions, prerequisite practice and foundation micro-lessons, with misconception-specific feedback, progressive hints, worked solutions and teaching animations, through the existing template, solver, validation and review workflow. (2) Adaptive sessions and remediation: start at medium; select by coverage, difficulty, independent correctness, hint use and misconception evidence; keep the initial answer plus two retries, with invalid or indeterminate input never using a try; give an easy diagnostic after exhausted attempts; use evidence and probes to find prerequisite gaps; run recursive detours with cycle prevention, depth and sibling limits, foundation practice, bounded repetition and a clear Stuck state; animate why the detour happened and keep the route back; return through a worked explanation and a fresh variant; persist question, seed, answer, hints, attempts, visual state and suspended frames; resume exactly without duplicate attempts; show Saved only after persistence succeeds. (3) Mastery: read thresholds from validated config (at least 10 main questions; at least 8 independent and 2 hard independent in the last 10; every required skill covered independently; cap 16, then Not yet); hinted, retried, remediation, return, unapproved and written-reasoning evidence never inflate mastery; persist real records and connect them to roadmap states, counters and successors; reuse the flashcard review. Supply the small Motion in a Plane/foundation and Straight Lines packs for the documented journeys. Keep every chapter manually open; never route Class 11 students into Class 12 remediation. Do not approve content; prepare it for named review and report the approval gate. Stop after Phase 3; do not deploy.

**Next step after Phase 3:** run `npm run content:review` alongside `npm run dev` and have a named reviewer approve, or request changes to, each template and lesson. Then re-run the journeys *without* reviewer preview, and author second templates per skill and difficulty where the ship rule is still short (coverage table in phase-3-report.md).

## Phase 6 prompt — scale the content and remaining visuals

> Expand the remaining chapters in small batches through the pilot's authoring, validation, golden-seed and named-review process. At implementation time verify each skill list against current primary NCERT/CBSE source texts and record the edition/source used. Build the remaining interactive widgets only as their batch requires them; retain deterministic models, teaching cues, scrub controls, non-drag inputs and reduced-motion explanations. Replace static figures when a lesson needs real manipulation.
>
> Each chapter must meet the ship rule: required-skill/difficulty coverage, sufficient distinct templates for feasible sessions, misconception mappings, approved unchanged content, reachable prerequisite/foundation support and a real learner journey. Keep preview-only chapters labelled honestly. Acceptance is per batch and then across all 24 chapters; avoid declaring all content finished from a successful map render or a template count.

## Phase 7 prompt — tutor contract and separate offline drafting

> Wrap the existing authored hints and cue actions in the provider-neutral `TutorProvider`/`AuthoredHintsProvider` contract from docs/09. Add feature flags, bounded cue requests and fixture conformance checks while preserving the fully offline help experience. Build adult-only drafting as a separate `tools/content-drafting` package; no AI vendor SDK, secret or vendor host belongs in the student app. Drafts still need code solvers, validation and human review.
>
> Acceptance: contract fixtures pass and the student bundle has no AI dependency/calls. If a drafting key is available in the operator's shell, verify the separate tool live without exposing it. Otherwise report the live check as pending; lack of a key must not block the offline contract work. Enabling a student provider remains conditional on OQ-1 and the existing privacy gate.

## Phase 8 prompt — disabled voice contract

> Build a transport-neutral voice client against conformance fixtures: explicit microphone opt-in, push-to-talk, captions, text fallback, cancellation and bounded hint/highlight tools operating on the same model. Handle denied permission, disconnects and expired grants with clear text fallback. Keep the feature disabled by default. Acceptance: the fixture demonstrates the complete interface and failure paths. A simulated provider is labelled as a fixture, and real student voice access stays gated on an approved provider and the privacy decision.

## Launch-gate prompt

> Review the implemented product against docs/08 and docs/10, content ship rules and the performance budgets. Use representative real phones/laptops to supplement historical headless timing; measure initial/lesson payloads, responsiveness, keyboard/assistive access, reduced motion and resume behavior. Verify that all learner routes have suitable reviewed content and honest progress/mastery states. Record evidence, remaining defects and explicit sign-offs. If student AI remains disabled, do not make provider selection a prerequisite for launching the authored-hints experience. Deploy only when deployment is requested and the applicable launch gates are met.

## Verification for this revision

- The consolidated Phase 3 checks (unit, content validation, typecheck, production build, browser journeys and the full browser suite) are recorded with their actual results in [phase-3-report.md](phase-3-report.md). The first 2026-10-28 revision's smoke check remains in the review note.
- The Phase 2 report's 208 unit tests, 71 browser tests and performance numbers are historical results from 2026-10-27.
- No template, lesson or catalogue approval, mastery-policy approval (D-053) or AI/provider enablement is implied by this document.
