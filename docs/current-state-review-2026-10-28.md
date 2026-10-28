# Limited local review — 2026-10-28

Purpose: run the existing app and refresh the implementation phases against the current source. This was a small smoke check and source review, not a button-by-button audit or implementation of the next phase.

## Local startup

The existing server on port 3000 showed a build error: `Can't resolve 'katex/dist/katex.min.css'`. `npm ls --depth=0` also identified missing `tsx` and `fast-check`. These were already declared in the package manifest and lockfile.

Restored installed dependencies without editing `package.json` or `package-lock.json`; restored the installed Playwright packages to their existing lockfile versions. Restarted the stale NOÊSIS development server with:

```bash
npm run dev -- --webpack --hostname 127.0.0.1
```

The app is available locally at `http://127.0.0.1:3000` while that server is running. This is a development run, not a fresh production build. Clean-machine installation and production performance remain future verification work.

## Checks actually run

| Check | Fresh result |
|---|---|
| `npm ls --depth=0` after restoring dependencies | Pass; no missing direct dependency |
| `./node_modules/.bin/tsc --noEmit --incremental false` | Pass |
| `node --import tsx scripts/content/validate.ts --check` | Pass: 20 template files; 0 errors, 2 warnings; manifest contains 20 in-review templates and 0 eligible for mastery |
| Browser smoke flow | Roadmap opens, Physics view/chapter preview opens, Laws of Motion lesson renders, one authored hint displays, empty-diagram input gives guidance without using a try, return to map and Fit map work |

The empty-diagram message was “Add at least one force to the diagram before checking.” The display retained three tries. No completed learning attempt or content approval was submitted during this smoke check.

Existing content warnings:

- `lom.second-law.m.rank-accelerations`: no hint drives the visual.
- `lom.third-law.m.action-reaction-pairs`: only four distinct variations across fifty seeds.

At the compact browser viewport, the expanded roadmap legend overlapped lower nodes, and fitting the full graph made labels small. Phase 2.1 now includes compact-layout readability and overlay placement. This observation is not a full mobile/device audit.

## Source-backed gaps that shape the next prompts

- The manifest has twenty demonstrations across ten chapters: nineteen medium, one hard, no easy and none human-approved. Laws of Motion covers six of nine required primary skills; resolving forces, conservation of momentum and circular-motion dynamics are missing.
- `src/ui/player/ChapterLesson.tsx` chooses a seeded template, and `LessonPlayer.tsx` records demonstration attempts as diagnostic. Neither implements adaptive question selection, easy diagnostics, probes or recursive detours.
- Refresh stores the selected question/seed in session storage. It does not restore an unfinished answer, retries, hints or widget state. Phase 2.1 addresses question restoration; Phase 4 adds the persisted adaptive stack.
- The player presents saved feedback before the asynchronous persistence write has completed. Phase 2.1 should tie pending/saved/error feedback to the real outcome and provide retry.
- `config/learning.config.json` is currently a design specification. No runtime config reader exists; retries, skill evidence thresholds and Leitner intervals are hard-coded.
- Chapter records and mastered-state derivation exist, but normal lesson playback does not write a mastered chapter record. Phase 5 must connect real mastery to roadmap states and successor recommendations.
- Flashcards already have creation, persisted five-box scheduling and a working review dialog. Phase 5 integrates and configures those features.
- Pilot content readiness is Phase 3; complete adaptive/mastery journeys depend on Phases 4–5. Journey 3 needs a targeted Motion in a Plane/foundation pack, and Journey 1 needs a Straight Lines pack before the broader Phase 6 scale-up.

## Documentation changes

The phase plan now includes a current baseline, phase gates and copy-ready prompts. README/blueprint status, the architecture inventory, adaptive-engine status and OQ-2 wording are aligned with the source. D-061 records this planning refresh. The original reference brief and historical phase reports are preserved.

D-053 and OQ-1/OQ-2 remain unresolved; no content was approved and no AI/voice provider was enabled. The Phase 2 report's 208 unit tests, 71 browser tests, bundle sizes and frame timings are historical figures from 2026-10-27. The full unit/browser suites, production build, all-feature audit and real-device review were not rerun here.
