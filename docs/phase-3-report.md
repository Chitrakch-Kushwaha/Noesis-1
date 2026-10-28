# Phase 3 report — pilot content, adaptive sessions and mastery (2026-10-28)

Consolidated scope (D-062): former Phases 3, 4 and 5. Built on the Phase 2 player, checker, widgets, content tools and browser persistence without replacing them. **No content was approved.** Everything new is `in-review` with `reviewedBy: null`, awaiting a named reviewer in `npm run content:review`.

## What now works

**Adaptive chapter session** (`/chapter/<id>/try`). The single-question route `?q=&seed=` is kept for the review tool and tests.

- **Selection** (`src/engine/session.ts`): the first question is the most central required skill at medium. After that, skills are scored by coverage (+3 uncovered), needs review (+2; hints and retries make an outcome *assisted*), teaching order (+1), the previous skill (−2) and open gaps (excluded). Difficulty steps up after an independent answer, stays after an assisted one and steps down after an exhausted one (medium floor). Hard is forced near the cap when hard evidence is missing. Templates are not repeated while unused ones remain (D-065).
- **Tries:** the initial answer plus the configured two retries. Invalid and indeterminate input never uses a try, now pinned in the config schema.
- **Remediation:** an exhausted question leads to an easy diagnostic on the same skill.
  - Independent on the diagnostic: worked solution of the original, and the next main question steps down.
  - Otherwise the planner (`src/engine/planner.ts`) runs over the prerequisite closure. It applies the cycle guard, the sibling limit and the class filter, and needs available content. Candidates are ordered by misconception `implicates`, then graph distance, then the weakest evidence. Up to two easy probes follow; the first probe that is not independent opens the detour.
- **Recursive detours:** the frame stack has depth ≤ 4.
  - A **detour** opens with the *why* screen (the paused card docks, the route edge draws, and the evidence is listed) and an optional explainer. It needs mini-mastery: 3 questions, ≥ 2 independent, the last one independent, at most 6 questions.
  - A **foundation** runs the micro-lesson, then 2 of 3 practice questions. After a miss it repeats once with the alternate representation, then goes to Stuck.
  - **Stuck** offers Try again (once per visit), Back to the question anyway (the gap stays open and selection avoids dependent skills) and Pause.
  - **Return:** a worked-solution replay of the suspended question, then a fresh variant of the same template at the same difficulty. Return questions never count as main questions or toward frame goals (D-066).
- **Class guard:** the class is asked once (11, 12, or Skip, which is treated as 11). A Class 11 student never gets a Class 12 detour; they see the class-ahead notice instead. Every chapter stays open.
- **Persistence and resume** (D-071):
  - Each transition is written before the screen moves on: session, attempt, flashcards and chapter record in one IndexedDB transaction.
  - The unfinished answer, tries, hints and widget work state are saved as the student works.
  - A refresh restores the exact frame, question, seed and state. Attempt ids are derived from the session and item, so a retry can't duplicate an attempt.
  - A stale tab can't overwrite newer progress.
  - "Saved" appears only after the write succeeds; a failure offers *Try saving again*.
- **Mastery** (`src/engine/mastery.ts`), with thresholds from `config/learning.config.json` (D-063): ≥ 10 main questions; ≥ 8 independent and ≥ 2 hard independent in the last 10; every required skill covered independently this session; at the 16-question cap, *Not yet*. Only independent main answers on eligible content count. Hinted, retried, remediation, return, unapproved and written-reasoning evidence never do.
- **Completion:** the summary shows the result, solid / needs-practice / uncovered skills and ranked successors (*Recommended* / *Next after …*).
  - Chapter records drive the existing roadmap state, the mastered counter and the "Recommended" highlight.
  - Flashcards reuse the existing Leitner scheduler, now with configured intervals. *Review cards* opens the existing dialog (`/?review=1`).
- **Roadmap:** a Continue card names the exact place ("Paused · Motion in a Plane › Resolving vectors — first: Trigonometric ratios…"). The chapter preview says *Start a session* or *Resume session*, and the progress panel has a class setting.
- **Reviewer preview** (`?preview=review`, D-069): lets a named reviewer walk the journeys before approval. In-review content counts *inside that session only*, results are labelled, chapter records carry `basis: "reviewer-preview"`, and they appear as mastered only while preview is on (*Turn off reviewer preview* hides them).

## Content (all `in-review`, none approved)

| Skill | Easy | Medium | Hard | Notes |
|---|---|---|---|---|
| lom.first-law | 1 | 1 | 0 | |
| lom.second-law | 1 | 1 | 1 | |
| lom.third-law | 1 | 1 | 1 | |
| lom.fbd | 1 | 1 | 0 | explainer lesson |
| lom.resolve-forces | 1 | 1 | 1 | **new skill coverage**; explainer lesson |
| lom.friction | 1 | 1 | 1 | |
| lom.connected-bodies | 1 | 1 | 1 | |
| lom.momentum-conservation | 1 | 1 | 1 | **new skill coverage** |
| lom.circular-dynamics | 1 | 1 | 1 | **new skill coverage** |
| mip.vector-addition | 0 | 1 | 0 | Journey 3 pack |
| mip.resolution | 1 | 1 | 1 | Journey 3 pack (also a Laws of Motion detour target) |
| mip.projectile | 0 | 1 | 0 | existing |
| f.trig-ratios (foundation) | 3 | — | — | micro-lesson with alternate ("shadows of a vector") and recap; `triangle-explorer` |
| sl.slope / angle-between / general-form / distance | 0 | 0 | 1 each | Journey 1 pack |
| sl.forms | 0 | 1 | 1 | Journey 1 pack |

- **Totals:** 51 templates (25 Laws of Motion, 5 Motion in a Plane, 6 Straight Lines, 3 foundation, 12 elsewhere) and 3 lessons. Laws of Motion has 16 distinct main-question templates, so a 16-question session never repeats one.
- **Per template:** misconception-tagged wrong methods (buggy solvers or tagged options), feedback for every tag, three progressive hints, a worked solution that drives the visual, flashcards, an accessibility description and a non-drag route. Every template passes the 50-seed validation.
- **Catalogues:** misconception catalogues for `lom`, `mip`, `sl` and `f` give `implicates` for every tag a pilot or pack template can produce. The validator now warns about uncatalogued tags.
- **Golden answers:** `content/golden/phase3.json` has 25 hand-worked cases, checked against the solvers by tests. They are author-computed and still need a reviewer's confirmation.

## Approval gate (remaining)

- **Real mastery is impossible today.** Nothing is approved, so no answer counts toward mastery. In production sessions a strong student ends with *Not yet* and the note that new questions don't count yet. To clear this, a named reviewer must approve each template and lesson in `npm run content:review` (lessons are at `/l/<id>`).
- **Ship rule (docs/05) not met:** it needs two approved templates per skill × difficulty. Most pilot skills have one per difficulty; the first law and free-body diagrams have no hard template; the Straight Lines pack is hard-only apart from `sl.forms`. When unused templates run out, the engine falls back to the other main difficulty, then to fresh variations (D-065).
- **Decisions still open:** D-053, OQ-1 and OQ-2 remain unresolved. The OQ-2 *proposed* default (class-ahead notice) is what is built.

## Checks actually run (2026-10-28, this machine)

| Check | Result |
|---|---|
| `npm ci` (lockfile unchanged) | Installed; the checkout had no `node_modules` |
| `npm run check` (curriculum, content validation, contrast, no-AI-SDK, typecheck, unit tests) | **Pass**: 51 templates and 3 lessons, 0 errors, 2 pre-existing warnings; **267 unit tests passed** |
| `npm run build` | **Pass** (production build; `prebuild` validates content) |
| `npx playwright test tests/e2e/session.spec.ts --project=desktop` | **4 passed**: Journey 1 quick mastery (reviewer preview), Journey 2 detour with mid-detour reload and return, Journey 3 foundation failure → Stuck → pause → Continue → recap → return, invalid input and no forward routing |
| Full `npx playwright test` (desktop + phone) | See the last row: the first full run found 31 failures, all in the Phase 2 "every question renders" test (fixed and re-run) |
| `content:review` smoke | Lists templates and lessons; lesson page renders all variants; a decision without the terminal session code is refused, and nothing was recorded |
| Built-in browser smoke (dev server) | Class prompt → main question 1 (medium, most central skill); a wrong answer, a hint and a refresh restore the same question, seed, chosen answer, hint and "2 tries left" with no attempt record; an exhausted question saves with its flashcard, then the easy diagnostic follows |

Unit tests added: `tests/unit/engine.test.ts` (19: config, mastery boundaries and evidence exclusions, selection and quick mastery, preview-only eligibility, Not yet at the cap, remediation, Journey 2 recursion, cycle, class, unavailable-content, depth and sibling guards, foundation/Stuck/pause/resume, idempotence, serialisation, retired-template substitution), `tests/unit/phase3-content.test.ts` (coverage, packs, lessons, catalogues, no auto-approval, 25 golden cases), triangle-explorer and session-commit persistence tests. Engine tests use **fixture** template ids marked approved inside the test only; they never touch the shipped manifest.

Fixed while verifying:

- The lessons manifest wasn't being written.
- When the last practice question popped its frame, that question's feedback vanished. The finished question is now kept on screen until Continue.
- Selection preferred another skill over the same skill at the other main difficulty (D-065).
- Return questions counted toward detour goals (D-066).
- The Phase 2 render test assumed one intro text for every template and had no route for foundation templates (`playerChapterFor`).

## Demonstration path

```bash
npm run dev    # http://localhost:3000
```

1. **Journey 3 (detour, foundation, Stuck, resume):** open *Motion in a Plane* → *Start a session* → Class 11.
   - Answer Q1. Get Q2 (*Resolving vectors*, hard) wrong three times, then get the easy check wrong. The probe on *Trigonometric ratios* follows; get it wrong too.
   - Watch the "why" screen, then the triangle micro-lesson: mark θ at B and the labels swap.
   - Miss the practice twice, then twice more after the "shadows" lesson. At **Stuck**, choose *Pause for today*.
   - On the map, use the Continue card: the recap opens. Get 2 of 3 right, then step through the worked return and the fresh variant.
2. **Journey 2 (misconception-driven detour):** open *Laws of Motion* and answer correctly until *Resolving forces* appears (Q5). Get it and its easy check wrong (choose "W cos θ"-style answers).
   - The probe on *Resolving vectors* opens a detour. Refresh mid-detour: the same question returns, and the breadcrumb shows *Resolving forces · Paused*.
   - Three right answers lead back through the worked solution and a fresh variant.
3. **Journey 1 (quick mastery, reviewer preview only):** open `/chapter/sl/try?preview=review`, choose Class 12 and answer 10 questions correctly. The summary shows mastered and *Conic Sections · Recommended*.
   - On the map, *Straight Lines* is mastered and the counter shows 1. *Turn off reviewer preview* removes both.

Add `?q=<templateId>&seed=<n>` to open a single question as before (review tool links).

## Changed and added files

- **Engine (new):** `src/domain/config.ts`, `src/engine/{content,graph,planner,mastery,session}.ts`
- **Content runtime:**
  - `src/content/{lessons,validateLesson,misconceptions}.ts` and `src/content/generated/lessons.json` (new)
  - `src/content/catalog.ts` (`playerChapterFor`)
  - solvers in `src/content/solvers/{physics11,others}.ts`
  - generated manifests
- **Content (new):**
  - 31 templates under `content/templates/{lom,mip,sl,f}/…`
  - `content/lessons/*.lesson.json` (3)
  - `content/misconceptions/{mip,sl,f}.json`; `lom.json` extended and moved from draft to in-review
  - `content/golden/phase3.json`
- **Widget:** `src/widgets/triangle-explorer/{model.ts,View.tsx}`, registered in `src/widgets/registry.ts` and `src/ui/player/WidgetStage.tsx`
- **Persistence:** `src/persistence/{db,store}.ts` (sessions table, atomic commit, stale guard, export schema 2), `src/domain/progress.ts` (record fields, config-driven rules, `masteredRecord`, `successorRecommendations`)
- **UI:**
  - `src/ui/session/{SessionPlayer,screens}.tsx` and `src/ui/settings.ts` (new)
  - `src/ui/player/{LessonPlayer,ChapterLesson,playerModel,useWidgetHost}.ts(x)`
  - `src/ui/roadmap/{ContinueCard (new),ProgressPanel,ChapterPreview,Dashboard}.tsx`
  - `app/globals.css`
- **Tools:** `scripts/content/{lib,validate,review}.ts`; `config/learning.config.json` (two new keys)
- **Tests:**
  - `tests/unit/{engine,phase3-content}.test.ts` (new); `tests/unit/{widgets,persistence}.test.ts`
  - `tests/e2e/session.spec.ts` (new); `tests/e2e/{lesson,roadmap,mobile}.spec.ts` updated for the class prompt and per-template intros
- **Docs:** this report, `docs/phase-plan.md`, `docs/decision-log.md` (D-062–D-072), `docs/04-adaptive-engine.md` and `docs/05-content-and-checking.md` status notes, `README.md`
- **Local only:** `.claude/launch.json` (dev-server preview config)

## Remaining gaps

- **Human approval** of all 51 templates, 3 lessons, 4 catalogues and the golden cases, then a re-run of the journeys without preview.
- **Ship rule:** second templates per skill × difficulty, plus hard first-law and free-body-diagram templates. Lessons exist for only three skills (other detours start straight with practice). Prerequisite closure beyond the packs (for example `kin.*`, `mip.ucm`, `f.force-intro`) has no remediation content, so those candidates give a worked solution instead.
- **Not built:**
  - the Chocolate Problem
  - interactive guided-example steps (a worked-solution step-through is shown instead)
  - the paused marker and foundation thread drawn on the map itself (the Continue card and Resume label cover the route back)
  - a dashboard recommendation card per open gap (the gaps are listed on the Continue card)
- **Content warnings carried from Phase 2:** `rank-accelerations` has no hint that drives the visual, and `action-reaction-pairs` has only 4 variations.
- **Phase 2.1 remainder:** phone keyboard and fraction entry, 44 px widget handles, the compact roadmap legend, input-to-visual transitions and payload measurement. Real-device performance was not measured.
- **Line endings:** on Windows with `core.autocrlf=true`, `content:validate --check` reports the generated manifests as out of date because of CRLF line endings, not content.
