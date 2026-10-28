# Phase 1 report — Animated chapter roadmap

**Date:** 2026-10-27. **Status:** built and verified; stopped for your review. Phase 2 has not been started.

## Part A — Phase 0 corrections (done first)

| # | Your request | What changed | Source files |
|---|---|---|---|
| 1 | Review Rotation → Electric Charges and Fields, Oscillations → EMI, and the route into Current Electricity | **Rotation → ECF kept, narrowed.** `ecf.dipole` was split; only the new `ecf.dipole-torque` (τ = p × E) requires `rot.torque-equilibrium`. **Oscillations → EMI removed.** The AC generator needs θ = ωt and cos θ, not SHM; it is now a labelled *related* link. **Electrostatic Potential → Current Electricity added** (`cur.emf` needs `epc.potential`). The route is now ECF → EPC → CUR. Reasons are in docs/03 "Edge review". | `content/curriculum/skills.json`, `content/curriculum/related-links.json`, `scripts/validate-curriculum.mjs` (same-subject related links allowed, never duplicating a prerequisite), `docs/03-curriculum-graph.md` |
| 2 | Rename to *Applications of Derivatives* everywhere | Renamed in data, docs, diagram and app | `content/curriculum/chapters.json`, docs 03/04, open-questions, generated files |
| 3 | Provider-independent student AI, disabled by default; no Gemini in the student runtime; offline drafting separate | Student runtime has a neutral `TutorProvider` contract; only `AuthoredHintsProvider` ships; tutor routes are unregistered by default; no AI SDK in the app (CI guard). Adult-only drafting lives in `tools/content-drafting/` (planned). | `docs/09-ai-and-voice.md` (rewritten), `docs/01-architecture.md`, `docs/10-privacy.md`, `docs/open-questions.md`, `docs/BLUEPRINT.md`, `docs/decision-log.md` (U-14, D-036), `docs/phase-plan.md`, `scripts/check-no-ai-sdk.mjs`, `next.config.ts` (CSP `connect-src 'self'`) |
| 4 | Coverage matrix and the 16-question cap | The validator generates [`generated/coverage-matrix.md`](generated/coverage-matrix.md), with a per-chapter perfect-run order, free slots, misses tolerated at Q10 and the maximum misses before the cap. It fails the build if any chapter breaks the rule. The cap behaviour is explained in docs/04. | `scripts/validate-curriculum.mjs`, `docs/04-adaptive-engine.md`, `config/learning.config.json` (`coverageScope`, `maxSiblingDetoursPerSuspendedQuestion`) |
| 5 | Legend: solid = prerequisite; dotted = related, cannot trigger remediation | Added to the Phase 1 design, the diagram and the app | `docs/06-layout.md`, `docs/diagrams/chapter-graph.{mmd,svg}`, `src/ui/roadmap/Chrome.tsx` |

**Check results after the corrections:**

- Validator: pass. 24 chapters, 146 skills, 26 foundations, 268 prerequisite edges, 48 derived and 23 drawn chapter edges.
- Mutation tests: every earlier mutation is still rejected, plus a new one (a related link duplicating a prerequisite).
- Contrast: pass.

## Part B — What Phase 1 delivers

**Four selectable roadmap views:** Class 11 Physics, Class 12 Physics, Class 11 Maths and Class 12 Maths. Each view places its six chapters in their real branches and merges, with curved prerequisite connectors:

| View | Branch structure |
|---|---|
| Class 11 Physics | kin → mip → lom → wep, which branches to rot and osc |
| Class 12 Physics | ecf → epc → cur → mcm → emi; Ray Optics stands alone |
| Class 11 Maths | set → rel → trg, which branches to sl → con and to lim |
| Class 12 Maths | cnd branches to aod and to int → aoi; vec → tdg |

**Cross-map relationships:**

- *Builds on* / *Leads to* ghost nodes for the 6 cross-view prerequisites, shown consistently in both views.
- Dotted *related* links to chapters in other views.
- Selecting a ghost jumps to its view and focuses the chapter.

**Canvas:**

- Dark dotted canvas in the orange-and-black theme, with a soft warm diagonal band and grain at the edges (from the atmosphere reference).
- Pan by drag, wheel or touch; zoom with Ctrl/⌘ + wheel, pinch, `+`/`−` or buttons; **Fit map**; a zoom readout.
- **Search** across chapters and skills, with keyboard combobox behaviour and `/` to focus.
- **List view** (`L`): a full keyboard-accessible equivalent of all four views.

**Nodes:**

- Show real states from saved progress (Unvisited, Learning, Needs review, Mastered), each with a distinct ring shape and text.
- Show a progress underline and *Preview only*, *Good place to start* and *Recommended* tags.
- Have full accessible names and spatial arrow-key navigation.

**Animation** (all with reduced-motion equivalents):

- Nodes arrive in dependency order and connectors draw from prerequisite to chapter.
- The camera eases to a selected chapter.
- Selection highlights the prerequisite path, which flows toward the chapter, and its successors, which flow away; the rest dims.
- Recommended paths carry a travelling dash.
- On returning from a question, the progress underline fills from the last-seen value and the status ring blooms once.
- Switching views replays the arrival sequence.

**Chapter preview:**

- Skills with per-skill state.
- Every direct prerequisite chapter with its exact skill links (for example "Cells, emf and internal resistance uses electrostatic potential and potential difference"), plus the earlier-level basics used.
- *Leads to* and *Related*, with a note that related links never trigger remediation.
- Progress.
- **Try a question.** It is enabled for playable chapters, with copy saying the student can try even if prerequisites are weak. It is disabled and labelled for the others.

**Diagnostic question** (playable chapters: Motion in a Straight Line, Current Electricity, Sets, Vector Algebra):

- A real parameterised medium question with the initial answer plus 2 retries.
- Unit-aware checking: a missing unit doesn't use a try, and a wrong dimension is tagged.
- Misconception-specific feedback, with a **consequence visual that replays the student's own wrong answer**.
- Progressive hints, marked as assisted.
- A scrubbable worked solution that drives the visual. The braking question has a play/pause/reset/step/scrub simulation.
- Saves the attempt and schedules flashcards.

**Right-side progress panel:**

- Questions attempted by difficulty, with first-try counts.
- Mastered chapters, total and per view.
- Reviews due, with a working Leitner review dialog.
- 14-day activity.
- Motion setting (follow device / reduced / full).
- Export, Import and Erase progress.

On tablet it is a drawer; on phones it collapses to a 56 px bar that expands into a sheet.

**Persistence:** IndexedDB via Dexie, surviving refresh. If storage is unavailable there is an in-memory fallback with a banner.

## How to try it

```bash
cd ~/AI/noesis
npm install
npm run dev        # open http://localhost:3000
```

1. Start in **Class 11 Physics**. Watch the arrival sequence. Select *Laws of Motion* and see its prerequisite path flow in.
2. Open **Motion in a Straight Line** → *Try a question*. Give a wrong answer (for example the final speed × time) and watch the visual show the over-counted triangle. Use *Help*, then step through the worked solution.
3. Go *Back to the map*: the node's state and underline animate, and the panel updates. Refresh: everything is still there.
4. Try search (`/`, type "kirchhoff"), list view (`L`), the arrow keys, and the ghost nodes that jump between views.
5. In the panel, set *Motion* to *Reduced* to see the static equivalents.

## Verification results

| Check | Result |
|---|---|
| `node scripts/validate-curriculum.mjs` | pass |
| `node scripts/check-contrast.mjs` | pass (all required pairs) |
| `npm run typecheck` | pass |
| Unit tests (Vitest) | **86 passed**. Curriculum corrections; layout for every view (no overlaps, prerequisites above dependents, ghosts only for other views, cross-view links in both views, exact branch structure); progress states and recommendations; panel stats and Leitner; safe parser (rejects code, deep nesting, overlong input); units, sets and intervals; **all 8 diagnostic templates over 200 seeds each** (correct inputs accepted in several forms, every wrong method rejected with its tag, no placeholder text, hints 1–2 never reveal the answer); IndexedDB persistence and memory fallback |
| `npm run build` | pass (production build; 24 diagnostic routes prerendered) |
| `node scripts/check-no-ai-sdk.mjs` | pass: no AI SDK among 144 packages; no AI hosts or `GEMINI_` in 224 built files (mutation-tested to fail when one is planted) |
| Browser tests (Playwright, desktop 1440×900 + Pixel 7) | **19 passed**. Four views; legend semantics; preview contents and labels; ghost navigation; path animation and dimming; search; pan, zoom and fit; keyboard navigation and shortcuts; list view; weak-prerequisite diagnostic attempt and persistence across refresh; correct first try and the underline animation; mastered state and recommended path via import; reduced motion (no running animations, announcements still made); in-app motion setting; **axe: no serious or critical WCAG 2.2 AA violations** on dashboard, preview, list view and question; phone: no horizontal overflow, collapsible panel, bottom-sheet preview, stacked question layout |
| Frame timing while panning (Chromium, software rendering) | p50 **16.7 ms** and p95 16.8 ms normally; p50 **16.7 ms** and p95 33.3 ms under **4× CPU throttling**. A profiling pass found that the dotted grid was repainting every frame (p50 33 ms); it now moves on a compositor-only layer. |

## Limits, stated plainly

- **Mastered** cannot yet be *earned*. The mastery engine is Phase 5. The state renders from saved records and is tested via *Import progress*.
- **Only 4 of 24 chapters are playable**, each with 2 diagnostic templates, all `in-review` (authored and self-tested, not yet human-approved; D-043). The other 20 are clearly labelled *Preview only*.
- Phase 1 diagnostic visuals are purpose-built SVGs. The reusable, draggable widget library (vector board, graph with draggable points and so on) is Phase 2.
- Frame timing was measured in a headless container, not on a physical phone. Please check on your own mid-range Android device.
- No git repository was initialised. Committing from this session would leave lock files in your folder, because deletion isn't permitted there. Run `git init && git add -A && git commit -m "Phase 0–1"` yourself, or let me know if you'd like me to.

## What's next (Phase 2, not started)

The full checking engine (Compute Engine, mathjs units, worker), the question-screen widget library with non-drag controls and cues, and the offline content validation and review CLI.
