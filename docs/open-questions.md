# Open product questions

Only questions that would **materially change the student experience** are listed here. Everything else was decided and recorded in the decision log.

## OQ-1 · Which provider, if any, for student-facing AI — decide before enabling it (no deadline; not blocking)

**Resolved for now by U-14.** Student-facing AI is provider-independent and **disabled by default**. The student runtime makes no Gemini calls, and Gemini is used only by the adult-only offline drafting tool.

**Still open:** whether to enable a text or voice tutor later, and with which provider. Requirements before enabling any provider:

- Its terms must permit an application likely to be accessed by under-18s. The Gemini API Additional Terms (last updated 2026-04-28) do not: they require API users to be 18+ and prohibit use in services "directed towards or is likely to be accessed by individuals under the age of 18".
- The privacy review in docs/10 must be complete.
- The adapter must pass the conformance suite in docs/09.

Until then, Help gives authored hints and visual cues directly in the player. The provider-neutral contract, offline drafting package and voice client remain planned work in Phases 7–8.

## OQ-2 · Class 11 student inside a Class 12 chapter hits a Class 12 prerequisite gap — please confirm the default

**Rule (U-03):** no forward routing. **Proposed default for Phase 4 (not yet implemented):** the student sees a one-line notice naming the Class 12 prerequisite and its chapter, then the worked solution, and the session continues. The student may open that chapter themselves from the map. The engine never sends them there.

**Effect:** a Class 11 student exploring, for example, *Applications of Derivatives* may be unable to reach mastery there without first choosing *Continuity and Differentiability* themselves. The generated report lists, for each Class 12 chapter, which Class 12 prerequisites this affects. Electric Charges and Fields, Ray Optics, Continuity and Differentiability, and Vector Algebra have none.

**Alternative:** if a Class 11 student *voluntarily* opened a Class 12 chapter, allow detours into Class 12 skills for that session only, with a clear "this is Class 12 material" label. Say if you prefer this.
