# NOÊSIS — Phase 0 blueprint

An English-language, student-only web app for CBSE/NCERT Class 11–12 Physics and Mathematics. It has two connected experiences:

- **The roadmap:** a branching, pannable chapter map.
- **The lesson:** question-first and highly interactive. Students manipulate models, see the consequences of their answers, and are guided down into prerequisite detours and back up again.

**Status (2026-10-28):** Phase 0 is complete, Phase 1 roadmap is built with approval recorded, Phase 2 is built with product review pending, and the consolidated Phase 3 (pilot content, adaptive engine, mastery) is built with content and product review pending ([report](phase-3-report.md)). No content is human-approved yet. The sections below describe the target product; use the [current phase plan and implementation prompts](phase-plan.md) for built-versus-planned status and the [limited local review](current-state-review-2026-10-28.md) for fresh verification. Historical reports: [Phase 1](phase-1-report.md), [Phase 2](phase-2-report.md).

## Read in this order

| # | Document | What it settles |
|---|---|---|
| 1 | [01-architecture.md](01-architecture.md) | Stack, module layout, data flow, environment variables, security baseline |
| 2 | [02-student-journeys.md](02-student-journeys.md) | The overall journey and **three complete learner journeys** |
| 3 | [03-curriculum-graph.md](03-curriculum-graph.md) → [generated/curriculum-graph.md](generated/curriculum-graph.md) | Chapters, 146 skills, 26 foundation micro-skills, edge rules, edge review, derived chapter graph |
| 4 | [04-adaptive-engine.md](04-adaptive-engine.md) → [generated/coverage-matrix.md](generated/coverage-matrix.md) | State machine, transitions, selection, mastery rule and coverage matrix, the 16-question cap, detour planner, persisted stack |
| 5 | [05-content-and-checking.md](05-content-and-checking.md) | Template schema, widget library, answer checking, validation boundaries, tests, verification workflow |
| 6 | [06-layout.md](06-layout.md) | Dashboard and question-screen layouts (desktop, tablet, phone), tokens |
| 7 | [07-motion.md](07-motion.md) | Roadmap motion, lesson motion, detour/return, essential vs optional, reduced motion, performance targets |
| 8 | [08-accessibility.md](08-accessibility.md) | WCAG 2.2 AA plan, keyboard, non-drag alternatives, screen readers |
| 9 | [09-ai-and-voice.md](09-ai-and-voice.md) | Provider-neutral student AI contract (disabled by default), voice architecture, separate adult-only offline drafting |
| 10 | [10-privacy.md](10-privacy.md) | Data inventory, minimisation rules, pre-launch privacy gate |
| — | [decision-log.md](decision-log.md) · [open-questions.md](open-questions.md) · [phase-plan.md](phase-plan.md) | What was decided, what still needs you, what comes next |

## The blueprint on one page

- **Stack:** Next.js + React + TypeScript; Motion; SVG/Canvas widgets over pure deterministic models; XState planned for Phase 4; Dexie (IndexedDB); Zod; KaTeX; our own safe expression parser and unit system (D-048, D-049); Vitest, Playwright, axe. **No AI vendor SDK in the app.**
- **Graph:**
  - 24 chapters, 146 skills, 26 foundations, 268 prerequisite edges.
  - Chapter edges are *derived* from skill edges: 48 derived, 23 drawn after transitive reduction.
  - **Legend:** solid arrows are prerequisites; dotted connectors labelled *related* never trigger remediation.
  - Machine-checked: acyclic; no forward-class edges; no hard Physics↔Maths edges; every skill bottoms out in a foundation.
- **Engine:**
  - Start medium; initial answer plus 2 retries; then an easy diagnostic.
  - Tag-and-evidence planner with probes; detours to depth 4 with a persisted stack.
  - Foundation micro-lessons at the leaves; "Stuck" saves a recommendation and the return point.
- **Mastery (configurable):** at least 10 main questions; in the last 10, ≥ 8 first-attempt independent and ≥ 2 hard; every required skill covered this session; cap of 16. Hinted, retried, remediation and AI-graded answers never count.
- **Content:**
  - Parameterised templates with code solvers and buggy solvers that detect misconceptions.
  - As implemented under proposed D-053, validated `in-review` demonstrations and unchanged `approved` templates are playable; only unchanged human-approved templates can count toward mastery. D-053 remains unresolved, and no template is currently human-approved.
  - AI drafts wording offline and never supplies answers.
- **Motion:** model-driven teaching animation (consequence playback, misconception cues, scrubbable simulations); state animation for the map and detours; polish is optional and removed first.
- **AI:** student-facing AI is provider-independent and **off by default**, and the student runtime makes no AI calls. Gemini is used only by a separate, adult-only offline drafting tool.
- **Privacy:** progress stays in the browser. A launch gate is required before any student AI is enabled.

## Needs your attention

1. **OQ-1** (not blocking): whether, and with which provider, to enable student AI later. It is off by default.
2. **OQ-2:** confirm the default for a Class 11 student who meets a Class 12 prerequisite inside a Class 12 chapter.
3. Optional: pilot chapter for Phase 3 (recommended: Laws of Motion, D-030).

## Re-run the Phase 0 checks

```bash
node scripts/validate-curriculum.mjs   # graph rules + regenerates docs/generated/curriculum-graph.md
node scripts/check-contrast.mjs        # token contrast table
```
