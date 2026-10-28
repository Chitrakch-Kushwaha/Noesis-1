# 08 · Accessibility

**Target:** WCAG 2.2 level AA throughout, verified by automated checks (axe in Playwright on every screen and state) plus a manual keyboard and screen-reader pass (VoiceOver on iOS/macOS, TalkBack on Android, NVDA on Windows) at the end of each phase that adds UI.

## Colour and contrast

- The token pairs are checked by `scripts/check-contrast.mjs`; full results are in [`generated/contrast.md`](generated/contrast.md). Every required pair passes. Two of the brief's implied combinations fail and are therefore **not used**:
  - white text on `--accent-orange`: **2.57:1**. Primary buttons use `--text-on-accent` #050505 (**7.29:1**).
  - `--border-subtle` as a control boundary: **2.57:1** on background. Controls and nodes use `--border-strong` #7C7875 (**4.66:1**); `--border-subtle` is for decorative dividers only.
- Status is never colour-only. Every state has an icon and/or text:
  - mastered ✓, paused ❚❚, gap badge, attempts dots plus "2 tries left";
  - subject marked by a glyph as well as colour.
- Diagrams use **shape and pattern** as well as colour to tell elements apart: dashed for components, solid for forces, labelled arrowheads. Physics and maths widgets are checked under protanopia and deuteranopia simulation in visual tests.

## Keyboard

| Area | Keys |
|---|---|
| Global | `Tab` order follows the visual order; a skip link jumps to the main content; `Esc` closes drawers and sheets; `?` shows the shortcut list |
| View switcher | `role=tablist`. `←/→` move between views, `Home/End` go to the first/last; `1`–`4` jump directly from anywhere on the dashboard |
| Search | `/` focuses search. It is a combobox: `↓/↑` move through results, `Enter` opens one, `Esc` clears |
| Roadmap | Chapter and ghost nodes are real `<button>`s with full accessible names (title, subject, class, state, skills tried, playable or preview only, recommendation). Arrow keys move focus spatially to the nearest node in that direction, and the camera follows focus. `Enter` opens the chapter preview; `Esc` closes it and returns focus to the node. `+`/`−` zoom, `0` fits, `L` toggles list view. |
| List view | A full equivalent of the map as a heading-structured outline (subject › class › chapter) with status text and Start/Resume buttons |
| Question screen | `Enter` submits from the answer field. `H` opens Help. `Alt+→` goes to Next after feedback. The transport bar uses `Space` (play/pause) and `,` / `.` (step). |
| Widgets | Every draggable element is focusable. Arrow keys move or rotate it by one step; `Shift`+arrow moves by a fine step; `PageUp/PageDown` moves by a coarse step. `Enter` opens precise numeric controls for that element. `Delete` removes a student-added element. |

## Dragging alternatives (SC 2.5.7) and target size (SC 2.5.8)

- Every drag interaction has a **single-pointer, non-drag alternative**. *Precise controls* (⌨ toggle) lists each manipulable element with numeric, angle and select inputs:
  - adding a force means choosing from an "Add force" menu (weight, normal, friction, tension, applied, …), then setting angle and magnitude;
  - drag-and-drop formats have a "Place in…" select for each item;
  - ordering uses Move up / Move down buttons.

  The content validator rejects a template whose drag input lacks `nonDragAlternative`.
- Touch targets are ≥ 44 × 44 px for buttons, selects and form controls. SVG drag handles have a 40-unit hit area, about 24 px on a phone (the WCAG 2.2 AA minimum, D-060); every handle also has a 44 px form equivalent.

## Screen readers

- **Live regions:**
  - Polite: each widget's `describe()` output after changes, throttled to one announcement per 500 ms while dragging, with a final announcement on release. Example: "Net force along plank 0 newtons. Friction 19.6 newtons up the plank."
  - Assertive: answer results only.
- **Questions:**
  - The stem is a heading plus a paragraph. Maths is rendered with KaTeX's MathML output for screen readers.
  - Maths input is plain text (D-049), so screen readers read it as typed; the KaTeX preview below it is hidden from them to avoid double reading.
  - Each diagram has `altText` from the template, with parameters substituted, and an expandable long description generated from the model state.
- **Feedback** is linked to the input via `aria-describedby`. Focus does not jump on an incorrect answer; it moves to the result text only for correct answers and frame changes.
- **Detours and returns** announce the change and move focus to the new question heading (docs/07).
- **Roadmap nodes** have accessible names such as "Laws of Motion, Physics, Class 11. In progress, 4 of 9 skills. Builds on Motion in a Plane. Recommended next."

## Motion and timing

- `prefers-reduced-motion` and the in-app Motion setting are honoured as specified in docs/07. Teaching animations become stepped stills; nothing essential is lost.
- Nothing auto-advances on a timer. There are no time limits on questions; the estimated time is shown as guidance only.
- Nothing flashes more than 3 times per second.

## Voice tutor

- The voice tutor is **optional**. The text tutor and authored hints give the same help.
- Live captions (output transcription) are shown while the tutor speaks.
- Push-to-talk is the default, with a visible recording state that never relies on colour alone.
- Microphone use is asked for explicitly (docs/09 and docs/10).

## Language and reading

- English at an accessible reading level. Physics and maths terms follow NCERT usage.
- Line length is ≤ 64 characters in reading panels. Body text is 17 px on desktop and 16 px on phones, with a line height of 1.55.
- The app supports 200% zoom and 320 px width without loss of content (reflow). The canvas offers list view at narrow widths.

## Automated checks added in Phase 1

- `@axe-core/playwright` on: dashboard (map and list), chapter sheet, question screen (each format), feedback state, hint drawer, detour, stuck, mastery and settings.
- A keyboard-only e2e path for each learner journey in docs/02.
- Contrast script in CI.

## Automated checks added in Phase 2

- axe (WCAG 2.2 AA tags) on six lesson-player screens, before and after hints and the worked solution: no serious or critical violations.
- Every one of the 20 questions is answered in the browser through its non-drag controls (text, choices, Move up/down, selects, Precise controls).
- Keyboard routes: vector tips (arrows, Shift for fine steps), number-line endpoints (arrows, Enter/Space toggles, Home/End for ±∞), graph points (arrows), ordering (Alt + arrows). Pointer drag routes give the same answer as the keyboard and form routes.
- Reduced motion: consequences jump to their end state, nothing animates, and the result is announced in the polite live region.
- Phone layout: the visual stacks above the question with no horizontal scrolling and no button shorter than 32 px.
- Live regions: widget descriptions at most once every 500 ms while dragging, with the final state always announced; answer results are assertive. Focus moves to the result only when the question ends.

