# Phase 2 report: lesson player and checking engine

Phase 2 is complete and stops here for your review. Phase 3 has not been started.

Scope, as you chose: **the engine and widgets only**. That means:

- the reusable lesson player;
- the full checking engine;
- the four core widgets;
- the content tools;
- the 8 Phase 1 diagnostics migrated into the new template system;
- 12 short demonstration questions, so that every format and widget can be tried.

The full Laws of Motion chapter is Phase 3.

## Review corrections (done first)

**1. No development language for students.** The learner UI no longer says "Phase 1 question set, awaiting content review" or "arrive in a later phase":

- Playable chapters say *"This question helps us find the best place for you to begin."*
- Other chapters say *"Questions for this chapter are coming soon."*

Content validation now rejects development language in any student-facing text, and two browser tests scan every question screen for it.

**2. Widget phases fixed.** `docs/05` now shows `vector-board`, `motion-track`, `graph-plot` and `number-line` in Phase 2.

**3. Review status unchanged.** The 8 diagnostics are still `in-review`, with `reviewedBy: null`. Nothing is approved or presented as approved. A unit test asserts this.

## 1. What was built

### The lesson player (`src/ui/player/`)

One component plays every template, in this order:

1. Intro.
2. The live visual.
3. The answer input for the format.
4. Checking, in a worker.
5. Three progressive hints.
6. Misconception feedback with an animated consequence of the student's wrong answer.
7. The worked solution and an alternative solution.
8. Return to the map, with the attempt saved.
9. Flashcards scheduled.

**Controls on every visual:** play, pause, step back, step forward, replay, a time slider (scrub) and reset.

**Layout:**

- Desktop: split screen, visual on the left and question on the right.
- Phone: the visual stacks above the question.
- The roadmap and the visual identity are unchanged.

**One live model.** Hints, misconception feedback, consequences and every worked-solution step all drive the *same* live widget model. Nothing is prerecorded. Solution step *n* is the start state with the cues of steps 1…*n* applied, so stepping back and forward is exact. *Back to my work* restores the student's own state.

### The checking engine (`src/checking/`)

**Our own parser and unit system** (D-048): no `eval`, no `Function`, and hard limits on input size.

**Formats checked:**

- single choice and multiple choice;
- quantities with units;
- numbers and exact values;
- expressions, with declared domains;
- antiderivatives;
- equations of lines and planes;
- intervals and unions;
- sets;
- ordering;
- drag-and-drop mappings;
- free-body diagrams.

**Rules:**

- **Unparseable input and missing units never use a try.**
- **A wrong dimension is tagged** `dimension-mismatch`.
- **Unsafe, ambiguous or undecidable input returns `indeterminate`.** The student is asked to rewrite it, and it is never counted as wrong.
- **Complex checks run in a worker** with a 300 ms budget. On timeout the worker is restarted and the result is `indeterminate`.

### The widgets (`src/widgets/`)

Each widget is a pure, deterministic model plus a view:

- `vector-board`
- `motion-track`
- `graph-plot`
- `number-line`
- `figure`, which keeps the Phase 1 circuit, Venn and box-diagonal pictures as non-interactive visuals with the same cue system.

### The content system (`src/content/`, `scripts/content/`, `content/templates/`)

- JSON templates with registered code solvers and wrong-method ("buggy") solvers.
- `npm run content:validate` and `npm run content:review`.

### Approval gating

- Validation writes a student manifest containing only validated `in-review` and `approved` templates.
- Every attempt records `countsTowardMastery`. It is `true` only for a human-approved template whose content hash still matches.
- Skill independence ignores everything else, so the in-review questions can never count. This is D-053, which **needs your approval**.

## 2. How to try each widget

Start the app with `npm run dev`. Each link opens one question at a fixed variation:

```
http://localhost:3000/chapter/<chapter>/try?q=<template id>&seed=<n>
```

Without `?q=`, the chapter picks a question by seed. *Try another question* and *More questions in …* switch between them.

### Vector Board

Open these questions:

- `/chapter/lom/try?q=lom.fbd.m.box-pulled-by-rope&seed=7`: build a free-body diagram.
- `?q=lom.friction.h.incline-will-it-slide`: incline with tilted axes.
- `?q=lom.first-law.m.after-the-push`
- `?q=lom.connected-bodies.m.who-exerts-each-force`
- `/chapter/vec/try?q=vec.dot-product.m.components-2d&seed=7`: the grid mode.

What to try:

- In *Precise controls*, pick a force and its agent, then *Add force*.
- Drag an arrow tip, or Tab to it and use the arrow keys. Left and right rotate, up and down change the size, Shift gives fine steps, and Delete removes it.
- The amber dashed arrow is the **continuous resultant**.
- Press **Play** to watch the motion your forces predict.
- Tick *Show components* and *Tilted axes*.
- Submit a diagram without the normal force. Your box sinks away from the real one, which moves at a constant 1.5 m/s.

### Motion Track

1D:

- `/chapter/kin/try?q=kin.suvat.m.braking-distance&seed=7`
- `/chapter/lom/try?q=lom.second-law.m.rank-accelerations&seed=7`: four lanes.

2D:

- `/chapter/mip/try?q=mip.projectile.m.range&seed=7`

What to try:

- Use Play, Pause, the step buttons and the time slider. The linked x–t and v–t graphs (x, y, vx and vy in 2D) follow the same clock.
- In braking, answer **72 m**. The car brakes so that it stops at your flag, and the caption shows the deceleration that would need.
- In projectile, a wrong range shows the launch speed it would need.

### Graph Plot

- `/chapter/kin/try?q=kin.acceleration.m.vt-area&seed=7`: drag point P along the line. Answer **60 m** to see the region you counted against the real one.
- `/chapter/lim/try?q=lim.derivative-rules.m.power-rule-tangent&seed=7`: drag P and the tangent follows. A wrong f′ is drawn as a tangent that cuts the curve. Hint 2 shows slope dots, and the alternative solution animates a secant turning into the tangent.
- `/chapter/sl/try?q=sl.forms.m.line-through-two-points&seed=7`: the slope and intercept sliders update the line and its equation continuously.
- `/chapter/int/try?q=int.antiderivative.m.polynomial&seed=7`: a shaded area follows point X.
- `/chapter/trg/try?q=trg.unit-circle.m.exact-value&seed=7`

### Number Line

- `/chapter/set/try?q=set.intervals.m.inequality-to-interval&seed=7`
- `/chapter/set/try?q=set.intervals.m.union-from-inequality&seed=7`

What to try:

- Drag an endpoint, or focus it and use the arrow keys.
- **Enter** or **Space** toggles open and closed; **Home** and **End** set ±∞. *Add an interval* builds a union.
- Typing `(-2, 5]` in the answer box moves the line, and moving the line rewrites the box. It is the same answer either way.
- Get one bracket wrong and the endpoint you got wrong is ringed.

### Reduced motion

Set *Motion → Reduced* in the map's panel, or turn on your system's reduced-motion setting. Consequences and solution steps then jump straight to their end state and are described in the caption and the live region.

### Content review tool

```bash
npm run content:review     # http://127.0.0.1:4100
npm run dev                # so "Open in the player" works
```

## 3. Which formats work

| Format | Demonstrated by | Input routes |
|---|---|---|
| Single choice | `lom.first-law.m.after-the-push` | radio buttons; wrong options play their predicted motion |
| Multiple choice | `lom.third-law.m.action-reaction-pairs` | checkboxes |
| Quantity with units | `kin.*`, `cur.*`, `mip.projectile.m.range`, `lom.friction.*` | typed (`36 m`, `0.036 km`, `3600 cm`); missing unit = no try used |
| Number / exact value | `vec.dot-product.*`, `vec.basics.*` (`√29` or decimal), `trg.unit-circle.*` (exact only: `√3/2`, `-1/2`) | typed with keypad and preview |
| Expression | `lim.derivative-rules.*` (domain declared) | typed with keypad and preview |
| Antiderivative | `int.antiderivative.*` (`+ C` optional, with a note) | typed |
| Equation | `sl.forms.*` (any equivalent form: `y = 2x + 1`, `2y − 4x = 2`) | typed |
| Interval / union | `set.intervals.*` | typed or number line, kept in sync |
| Set | `set.operations.*` | typed roster `{2, 5, 9}`; duplicates and order ignored |
| Ordering | `lom.second-law.*` | Move up/down buttons, Alt + arrows, or pointer drag |
| Mapping (drag-and-drop) | `lom.connected-bodies.*` | a select per item, or drag a card onto a source |
| Diagram | `lom.fbd.*` | Precise controls, keyboard, or dragging arrow tips |
| Written reasoning + checked part | `lom.friction.h.incline-will-it-slide` | text box; rubric self-check and a model explanation afterwards; stored with `scored: false`; never affects the outcome or mastery |

**Every documented trap has a regression test:**

- √(x²) vs x;
- log(x²) vs 2 log x;
- removable discontinuities, such as (x²−1)/(x−1) vs x+1;
- trigonometric singularities (tan x near π/2);
- sin²x + cos²x vs 1;
- |x|/x vs sgn x;
- unit conversion and its error tag (km/h vs m/s, °C differences vs K);
- 1e-12 vs 0;
- open and closed endpoints, and `[1,2) ∪ [2,3]` vs `[1,3]`;
- duplicate set elements;
- equivalent line equations and equivalent plane equations.

## 4. Test results

All run on 2026-10-27 in a clean container.

| Check | Result |
|---|---|
| `npm run check:curriculum` | pass (24 chapters, 146 skills, 26 foundations, 268 edges) |
| `npm run content:validate` | pass: 20 templates × 50 seeds, 0 errors. The 2 warnings are advisory: the ranking question's hints don't move the visual, and the third-law question has only 4 variations. |
| `npm run check:contrast` | pass (all required pairs) |
| `npm run check:no-ai-sdk` | pass: no AI SDK among 176 packages; no AI hosts or `GEMINI_` in 284 built files |
| `npm run typecheck` | pass |
| Unit tests | **208 passed.** By file: checking 90, property 9, content 29, widgets 25, player 7, plus Phase 1 curriculum and layout 35, progress 10, persistence 3 |
| Production build (`npm run build`) | pass; `content:validate` runs first |
| Browser tests, desktop 1440×900 + Pixel 7 | **71 passed** (details below) |
| Console scan in the production build | no errors or warnings across all 20 questions (answer, 3 hints, solution steps) |

**Unit tests cover:**

- every checker;
- the traps;
- units;
- parser limits;
- worker timeouts, including restarts;
- property-based equivalence: reflexive, symmetric, rejecting x·(1+ε), accepting algebraic rewrites, unit round-trips, and union normalisation;
- widget accuracy against analytic results;
- deterministic replay, pause, step, reset and scrub;
- cue application;
- the player state machine: invalid and indeterminate never use a try, and outcomes;
- content validation catching each class of broken template;
- approval gating and review decisions.

**Browser tests cover:**

- all 20 questions answered through non-drag controls;
- invalid input not using a try;
- misconception tags and consequences;
- the worker;
- equivalent forms;
- hints and solution stepping;
- transport determinism;
- keyboard and pointer routes giving the same answers;
- reduced motion;
- saved progress after a refresh;
- reasoning stored as advisory;
- axe on six player screens;
- phone layouts;
- frame timing.

## 5. Animation and accessibility results

### Animation

**Deterministic.** Every model's state is a function of time, so the same time always gives the same picture:

- step forward then back returns the identical description;
- a scrub to *t* equals playing to *t* (unit-tested);
- replay restarts from 0.

**Driven by content.** Hints, misconception feedback, consequences and solution steps are cue lists in the template, applied to the live model.

**Consequences show the student's answer, not the solution** (D-055). The correct state appears only after the question ends (the free-body diagram then shows the correct forces as a ghost beside yours), and in the worked solution. Hints and feedback also avoid giving the answer away:

- graph areas can be shown without their value;
- weight components can be labelled *Weight sin θ* instead of a number;
- the friction meter can show bars without numbers;
- motion-track numbers stay hidden until the solution reveals them;
- the validator fails any template whose first two hints contain the answer.

**Frame timing** (Chromium, 4× CPU throttling):

| | p50 | p95 |
|---|---|---|
| Dragging a force | 16.7 ms | 16.7 ms |
| Simulation playback | 16.7 ms | 16.8 ms |

**Reduced motion.** Consequences and solution steps jump to their final state. No CSS or JS animations run (asserted). The final state is announced.

### Accessibility

**Every drag has a non-drag route** that sets the same model state and goes through the same checker:

- vector tips: arrows; Precise controls with add, size, direction, agent and remove;
- number-line endpoints: arrows, Enter/Space, Home/End; From, To, included and ∞ fields; the typed answer;
- graph points: arrows; a typed x;
- motion handles: arrows; sliders;
- ordering: buttons and Alt + arrows;
- mapping: selects.

**Instructions and descriptions:**

- Each question shows its non-drag alternative.
- Each visual has instructions under *How to use this visual*.
- Alt text comes from the template.
- A live text description follows the clock. It is announced at most every 500 ms while dragging, and the final state is always announced.

**Focus:**

- Focus rings are visible on every control and handle.
- Focus moves to the result only when the question ends; results use an assertive live region.

**Automated checks:**

- axe (WCAG 2.2 AA tags) finds no serious or critical issues on the six player screens tested, before and after hints and solutions.
- Drag handles are at least 24 px on a phone. Form controls are at least 36 px; most are 44 px.

## 6. Content-tool instructions

### `npm run content:validate`

It runs automatically before `npm run build` and `npm test`. For every file in `content/templates/` it checks:

- the schema;
- the file path;
- parameter names and ranges;
- satisfiable constraints;
- registered solvers and buggy solvers;
- 50 seeds, checking each for:
  - determinism, the same question twice;
  - unresolved `{{placeholders}}` and broken values (NaN, undefined);
  - development language in student text;
  - the widget config against the widget's schema;
  - every hint, feedback, consequence, solution and option cue against the widget's cue list and argument schema, then applied to the model;
  - that the reference answer and accepted alternatives check correct;
  - that every wrong-method answer checks incorrect with its declared tags;
  - that the consequence can be built for each wrong answer;
  - that the first two hints don't contain the answer;
- feedback and flashcards for every misconception tag;
- a worked solution that drives the visual;
- the non-drag alternative for any drag format or drag widget;
- approved templates whose content changed since review.

It writes `src/content/generated/templates.json` (the student manifest) and `playable-chapters.json`. `--check` fails instead of writing; `--quiet` prints errors only.

### `npm run content:review`

1. Open http://127.0.0.1:4100. Each template shows status, approval state, content hash, validation results, every review variation in full, and its review history. The full text covers stem, answer, accepted forms, wrong answers it recognises, hints, feedback, consequence, both solutions, flashcards, reasoning rubric and accessibility text.
2. For each variation, click *Open in the player* (with `npm run dev` running), try it, and tick *I reviewed this variation*.
3. Enter your name, choose *Approve* or *Request changes*, add a note, tick the attestation, and type the session code printed in the terminal.

The tool then:

- writes `status`, `reviewedBy`, `reviewedAt`, `contentHash` and a review-log entry into the template file;
- regenerates the manifest.

It refuses when:

- a variation is unticked;
- the attestation is missing;
- the code is wrong;
- validation fails.

There is no command-line approval. Requesting changes withdraws an approval. Any later edit to an approved template fails validation until it is re-reviewed.

### Authoring

The steps are:

1. Add a JSON file under `content/templates/<chapter>/<skill>/`.
2. Register its solver, and any wrong-method solvers, in `src/content/solvers/`.
3. Run `content:validate`.

## 7. Known limitations

- **No template is human-approved.** Nothing counts toward mastery, which is correct, and mastery itself is Phase 5. Golden seeds with hand-verified answers (docs/05 §3.4) are not committed yet; Phase 3 content review will add them.
- **Demonstration content is thin by design:** 20 templates and one per demonstrated format. Hard-difficulty coverage, easy remediation questions and the misconception catalogue beyond `lom.json` are Phase 3.
- **Consequences reveal some partial information.** The friction consequence adds the correct normal force; the Venn figure marks which of your elements belong. A later correct answer is then recorded as *assisted*, not independent.
- **Answer delivery.**
  - Typed values move the model at once; the 200 ms tween in docs/07 is not built.
  - The phone stage doesn't collapse when the keyboard opens.
  - The symbol keypad is basic: no fraction template.
- **JS weight.**
  - The map's initial JavaScript is about 282 KB gzip, above the 200 KB budget in docs/07. Phase 2 adds nothing to it: the map loads only a list of chapter ids, and the overage comes from React, Next.js, Dexie, Zod and the curriculum data.
  - The lesson route adds about 165 KB gzip, including KaTeX and every template.
  - The checking worker is about 15 KB gzip.
- **Touch targets.** SVG drag handles are about 24 px on a phone, the WCAG AA minimum, not the 44 px goal in docs/08. The form equivalents meet 44 px.
- **Timing and devices.** Frame timing was measured headless in a container. Please check on a real mid-range phone.
- **Tests.** The axe checks cover six of the 20 questions.
- **Decision log gap.** Phase 1 referred to D-039, D-040, D-041 and D-043 without recording them. I backfilled them from their references; D-038, D-042 and D-044–D-047 were never used.

## 8. Files changed

### Added (73)

**Checking engine:** `src/checking/`:

- `check.ts`, `client.ts`, `types.ts`, `units.ts`, `worker.ts`
- `expr/parse.ts`, `expr/evaluate.ts`, `expr/equivalence.ts`, `expr/latex.ts`

**Content system:** `src/content/`:

- `schema.ts`, `instantiate.ts`, `placeholders.ts`, `rng.ts` (moved from `src/questions/`), `runtime.ts`, `validate.ts`, `catalog.ts`, `playable.ts`
- `solvers/index.ts`, `solvers/types.ts`, `solvers/physics11.ts`, `solvers/others.ts`
- `generated/templates.json`, `generated/playable-chapters.json`

**Widgets:** `src/widgets/`:

- `types.ts`, `transport.ts`, `useTransport.ts`, `shared.tsx`, `registry.ts`
- `vector-board/{model.ts,View.tsx}`, `motion-track/{model.ts,View.tsx}`, `graph-plot/{model.ts,View.tsx}`, `number-line/{model.ts,View.tsx}`
- `figures/{model.ts,View.tsx,legacy.tsx}`

**Player:** `src/ui/player/`:

- `ChapterLesson.tsx`, `LessonPlayer.tsx`, `WidgetStage.tsx`, `answers.tsx`, `playerModel.ts`, `useWidgetHost.ts`

**Content tools:** `scripts/content/lib.ts`, `validate.ts`, `review.ts`.

**Templates:** 19 new files under `content/templates/`, in `cur/`, `int/`, `kin/`, `lim/`, `lom/`, `mip/`, `set/`, `sl/`, `trg/` and `vec/`.

**Tests:**

- `tests/unit/checking.test.ts`, `checking.property.test.ts`, `content.test.ts`, `player.test.ts`, `widgets.test.ts`
- `tests/e2e/lesson.spec.ts`

**Report:** `docs/phase-2-report.md`.

### Changed (23)

**App:** `app/chapter/[chapterId]/try/page.tsx` and `app/globals.css`.

**Data and storage:** `src/domain/progress.ts` and `src/persistence/store.ts`.

**Roadmap** (student-facing wording and the playable list):

- `src/ui/roadmap/ChapterPreview.tsx`
- `src/ui/roadmap/Chrome.tsx`
- `src/ui/roadmap/Dashboard.tsx`
- `src/ui/roadmap/Roadmap.tsx`

**Template:** `content/templates/lom/lom.friction/lom.friction.h.incline-will-it-slide.json`, rewritten to the built schema and now `in-review`.

**Package files:** `package.json` (new scripts; `katex` 0.19.1, `fast-check`, `tsx`) and `package-lock.json`.

**Tests:** `tests/e2e/roadmap.spec.ts`, `tests/e2e/mobile.spec.ts` and `tests/unit/progress.test.ts`.

**Docs and README:**

- `docs/01-architecture.md`, `05-content-and-checking.md`, `06-layout.md`, `07-motion.md`, `08-accessibility.md`
- `docs/BLUEPRINT.md`, `decision-log.md`, `phase-plan.md`
- `README.md`

### Removed (7)

Replaced by the new player, checker and tests:

- `src/questions/check.ts`, `rng.ts`, `templates.ts`, `types.ts`
- `src/ui/question/DiagnosticQuestion.tsx`, `visuals.tsx`
- `tests/unit/questions.test.ts`

## 9. Decisions needing your approval

1. **D-053, the gating amendment.** In-review templates keep shipping (as in Phase 1) but never count toward mastery. Only approved, hash-matching templates count. Drafts never ship, and an approved template edited after review fails the build until re-reviewed. D-025 as written would remove every question until you approve them.
2. **D-048 and D-049: our own parser and units, and text-plus-keypad maths input.** These replace Compute Engine, mathjs and MathLive.
3. **D-050: a 300 ms check budget** instead of 150 ms.
4. **D-051: `log` means natural log by default**, with a per-template override.
5. **D-055: consequence policy.** Consequences show the student's own answer and the correct state only after the question ends. Partial reveals are listed in §7.
6. **D-058: written reasoning is self-checked against the rubric**, with no AI.
7. **D-056: the circuit, Venn and box-diagonal visuals stay non-interactive figures** until Phase 6.
8. **Answer-safe display.** Is a *Show components* checkbox acceptable on the incline question? It computes mg sin θ for the student.
