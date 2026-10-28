# 06 · Layout specification

References (kept in `docs/reference/`):

- `roadmap-layout-reference.png` (NeetCode roadmap) for **layout only**: top-down tree, nodes with underline progress bars, dotted canvas, zoom controls bottom-left, stats panel right.
- `theme-atmosphere-reference.jpeg` for **palette and atmosphere only**: near-black ground, a diagonal orange-to-amber light band with film grain, bevelled dark "metal" tiles, a glassy input panel.

No logos, icons, names or exact compositions are copied.

## Design tokens

The brief's tokens are kept unchanged. The additions below exist to meet contrast requirements. They were verified with `node scripts/check-contrast.mjs`; the results table is in docs/08.

```css
:root {
  /* brief */
  --background: #050505; --surface: #141517; --surface-raised: #2F231A;
  --accent-orange: #FC710C; --accent-amber: #FE9400; --accent-coral: #F37F58; --highlight-peach: #F7B198;
  --text-primary: #F5F5F5; --text-muted: #A5A19E; --border-subtle: #515151;
  /* Phase 0 additions */
  --text-on-accent: #050505;   /* labels on orange/amber fills (white on orange is only 2.57:1) */
  --border-strong: #7C7875;    /* boundaries of controls and nodes (4.66:1 on background) */
  --focus-ring: #FE9400;       /* 2px ring + 2px offset */
  --danger: #FF6B6B; --success: #5FD39A;
  --grid-dot: #2A2A2C;         /* canvas dots, decorative */
  --radius-s: 6px; --radius-m: 10px; --radius-l: 16px;
  --space: 4px;                /* 4-pt spacing scale */
}
```

**Usage rules:**

- **Orange** marks *action and discovery*: primary buttons, the recommended path, the progress fill.
- **Amber** marks focus and live interaction: the dragged handle, the focus ring.
- **Coral and peach** are for emphasis inside content: the highlighted misconception element, the detour frame.
- **Glow** is reserved for state changes, such as a just-mastered node or a correct resolution. It fades to a static style within 1 s.
- `--border-subtle` is for decorative dividers only. Never use it as the only boundary of a control.
- **Subject marking never relies on colour alone.** Physics nodes carry a small ⟂ glyph; Maths nodes carry ∑. Each node's aria-label states the subject.
- **Atmosphere** (from the reference) appears in two places only:
  - a soft diagonal warm gradient band with fine grain behind the dashboard canvas edges, at ≤ 12% opacity;
  - a subtle top-left inner highlight on node tiles that suggests the bevelled tiles.

  Reading surfaces, such as the question text, are flat and calm. Backdrop blur is not used on mobile (see docs/07 for performance).

## A. Roadmap dashboard (Phase 1, revised for four views)

The dashboard has **four selectable roadmap views**, each with its six chapters:

1. Class 11 Physics
2. Class 12 Physics
3. Class 11 Maths
4. Class 12 Maths

A single merged canvas of all 24 chapters was rejected: its cross-subject lines were unreadable (see the overview SVG). Each view lays out its chapters top-down by prerequisite layer. The layout is computed deterministically by `src/domain/roadmapLayout.ts` from the corrected graph and unit-tested: no overlaps, prerequisites above the chapters that need them, and cross-view links shown in both views.

### Legend (always on the canvas; collapsible, remembered per browser)

| Mark | Meaning |
|---|---|
| **Solid curved arrow** (from prerequisite to chapter) | **Prerequisite.** Skills in the arrow's source are required by skills in its target. Only prerequisites can lead to remediation detours. |
| **Dotted connector labelled "related"** | **Related concept.** Helpful context only. **Never a prerequisite, never triggers remediation, never gates.** |
| **Outlined "ghost" node with a view tag** (e.g. "Physics 11") | A chapter in another view. Activate it to jump to that view and focus the chapter. |
| Status ring and text: *Unvisited*, *Learning*, *Needs review*, *Mastered* | The chapter's real state from saved progress |
| *Preview only* tag | Questions not yet playable in this phase. The preview still shows skills and prerequisites. |
| Orange *Recommended* tag and moving dashes | A suggested next step. Nothing is locked. |

### Desktop (≥ 1200 px)

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│ NOÊSIS  [Physics 11][Physics 12][Maths 11][Maths 12]  [🔍 Search chapters & skills ]  [☰ List] │
├──────────────────────────────────────────────────────────────────┬─────────────────────┤
│ · · · BUILDS ON (other views) · · · · · · · · · · · · · · · · · ·│ YOUR PROGRESS       │
│ ·  ┌ ┄ ┄ ┄ ┄ ┄ ┄ ┐            ┌ ┄ ┄ ┄ ┄ ┄ ┐                       ·│ Questions attempted │
│ ·  ┆ Physics 11   ┆            ┆ Physics 11┆                       ·│ easy ▏0  medium ▇ 6 │
│ ·  ┆ Rotational…  ┆            ┆ Work, En… ┆                       ·│ hard ▏0             │
│ ·  └ ┄ ┄ ┬ ┄ ┄ ┄ ┘            └ ┄ ┄ ┬ ┄ ┄ ┘     RELATED          ·├─────────────────────┤
│ ·        ▼                           ▼        ┌ ┄ ┄ ┄ ┄ ┐         ·│ Mastered  0 / 24    │
│ ·   ┌──────────────┐          ┌──────────────┐ ┆ Maths 12┆ ·┄related│ ⟂11 0/6  ⟂12 0/6    │
│ ·   │⟂ Electric    │─────────▶│⟂ Electrostat.│ ┆ Vector  ┆         ·│ ∑11 0/6  ∑12 0/6    │
│ ·   │  Charges…    │          │  Potential…  │ └ ┄ ┄ ┄ ┄ ┘         ·├─────────────────────┤
│ ·   │ ◐ Learning   │          │ ○ Unvisited  │                     ·│ Reviews due  1      │
│ ·   │▔▔▔▔▔░░░░░░░░░│          │ Preview only │                     ·│ [Review now]        │
│ ·   └──────────────┘          └──────┬───────┘                     ·├─────────────────────┤
│ ·          …   (pan / zoom / fit)    ▼                             ·│ Activity (14 days)  │
│ ┌──┐                                                ┌ LEGEND ─────┐·│ ▁ ▁ ▃ ▁ ▇ ▁ …       │
│ │+ │ │− │ │⤢ fit│                                   │ ──▶ prereq  │·│ 6 this week         │
│ └──┘                                                │ ┄┄ related  │·│                     │
│                                                     └─────────────┘·│                     │
└──────────────────────────────────────────────────────────────────┴─────────────────────┘
```

- **View switcher:** a tablist (`role="tablist"`).
  - Arrow keys move between tabs; `1`–`4` switch directly.
  - The active view is remembered per browser.
  - Switching animates the camera and plays the arrival sequence for the new view (docs/07).
- **Canvas:**
  - Dotted grid: 24 px spacing, 1.5 px dots.
  - Pan by dragging, with the mouse wheel or trackpad scroll, or with two fingers on touch. Keyboard users move between chapters with the arrow keys and the camera follows focus. Zoom from 0.4× to 2× with Ctrl/⌘ + wheel, trackpad pinch, touch pinch, `+`/`−` or the buttons. **Fit map** (`0`).
  - Columns: a **left column** of ghost nodes for links to other views. *Builds on* ghosts (solid arrow into the chapter) sit just above their chapter's row; *Leads to* ghosts (solid arrow out of the chapter) sit just below it. A **right column** holds *Related* ghosts (dotted connector labelled *related*). As built, side columns replaced the top and bottom bands in the wireframe, because cross-view links attach to chapters in different rows.
  - Initial camera: fit the whole view, but never below a readable zoom (80% desktop, 62% phone); if fitting would be smaller, the view's chapters are centred and top-aligned. **Fit map** (`0`) always shows everything.
- **Node** (200 × 76 px):
  - subject glyph, title (two lines maximum), status ring and **status text**;
  - 4 px progress underline: the share of the chapter's skills with recorded evidence in Phase 1, and of skills at *independent* once the mastery engine exists;
  - *Preview only* tag when not playable; *Recommended* tag when suggested.
- **Selecting a node:**
  1. The camera centres it.
  2. Its **prerequisite path** (all ancestors visible in the view, including ghost nodes) and its **successors** highlight, and the connectors animate in flow direction.
  3. The **chapter preview** opens (desktop: a card that overlays the canvas's right side, beside the panel; phone: a bottom sheet) with:
     - title, subject and class, state, playable status;
     - progress (skills with evidence / total; questions tried);
     - **skills** list with per-skill state;
     - **prerequisites:** the chapters it builds on and the exact skill links (e.g. "Torque on a dipole ← Torque, couples and equilibrium");
     - **leads to** and **related**, with a note that related links never trigger remediation;
     - **Try a question:** enabled for playable chapters, with "You can try even if the prerequisites are new to you — this first question shows where to start." For other chapters it is disabled and labelled "Questions for this chapter arrive in a later phase".
- **Search:** a combobox over all 24 chapters and 146 skills. Results show the view tag. Choosing a result switches view, focuses the chapter and opens its preview; skill results also highlight the skill.
- **List view** (`L` or the ☰ button): a keyboard-accessible outline of all four views (headings: view › chapter). Each row has status text, the playable label and an *Open preview* button. It is fully equivalent to the canvas.
- **Right panel ("Your progress"), 320 px:**
  - **questions attempted by difficulty** (easy / medium / hard counts with first-try correct);
  - **mastered chapters** (total and per view);
  - **reviews due** (count, *Review now* opens due flashcards);
  - **activity** (attempts per day over the last 14 days, with a text summary).

  All values come from IndexedDB.

### Tablet (768–1199 px)

The panel becomes a collapsible drawer (toggle in the top bar). The canvas fills the width.

### Phone (< 768 px)

- The view switcher becomes a horizontally scrollable tab row under the top bar. Search collapses to an icon that expands to full width.
- The canvas is full screen. Zoom and fit buttons sit bottom-left, and the legend button sits bottom-right; the legend opens as a small sheet.
- **Progress panel:** collapsed by default into a 56 px bar ("Progress · 6 tried · 1 review due ▲") that expands to a sheet.
- The chapter preview is a bottom sheet at 85% height with a close button and a drag handle.
- Pinch zoom applies on the canvas only (`touch-action: none` on the canvas). The page itself stays zoomable.

### States

| State | Rule (Phase 1) | Visual |
|---|---|---|
| **Unvisited** | no attempts recorded for the chapter | hollow ring ○, muted border, "Unvisited" |
| **Learning** | attempts exist and no review is pending | half ring ◐, orange underline, "Learning" |
| **Needs review** | a skill's latest outcome is *exhausted* (all tries wrong), or a flashcard from this chapter is due | coral ring with ! , "Needs review" |
| **Mastered** | chapter marked mastered by the mastery engine (from a later phase; rendered and tested now) | full amber ring ✓, "Mastered" |

### Dashboard edge cases

- **First visit:** every chapter is unvisited. The entry chapters of the view (no in-view prerequisites) carry *Good place to start*.
- **Storage unavailable:** a banner says progress can't be saved in this browser, and the app keeps state in memory.

## B. Focused question screen

### Desktop (≥ 1024 px)

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│ ← Map   Laws of Motion › Friction  ┊ Detour: Resolving forces › FBD   ●●●◐○○○○○○  [Help]│ 56px
├───────────────────────────────────────────────────┬──────────────────────────────────┤
│                                                   │  Question 4 · Hard               │
│                STAGE (widget)                     │  A 4 kg block rests on a plank   │
│                                                   │  tilted at 30°. μs = 0.65 …      │
│        ╱│                                         │                                  │
│      ╱  │  ← draggable forces, tilted axes        │  Friction force                  │
│    ╱____│                                         │  ┌──────────────┐ ┌────┐         │
│                                                   │  │ 19.6         │ │ N ▾│         │
│  Net force along plank: 0.0 N   Friction: 19.6 N  │  └──────────────┘ └────┘         │
│                                                   │  Attempts ● ● ●                  │
│  ⏮  ▶  ⏸  ⟲   ━━━━━━━●━━━━━━━  0.8 s            │  [ Check ]  (orange, dark text)  │
│  (sim / explanation transport, when present)      │                                  │
│                                                   │  ┌ feedback appears here inline ┐│
│                                                   │  └──────────────────────────────┘│
└───────────────────────────────────────────────────┴──────────────────────────────────┘
          stage 58%                                      prompt panel 42%, max 64ch
```

- **Header:**
  - *← Map* exits; the session is saved automatically.
  - **Breadcrumb:** chapter › skill. While in a detour it extends with a peach "Detour" segment for each level. Each suspended level is a chip that can be focused to peek at the paused question (read-only).
  - **Progress dots:** 10 main slots (the target), extending visibly up to 16.

    | Dot | Meaning |
    |---|---|
    | filled orange | independent |
    | half | assisted |
    | ring with × | exhausted |
    | small satellites | remediation items |

  - **Help:** opens the hint drawer (levels 1–3); later also voice and text tutor.
- **Stage:**
  - widget canvas, 16:10 maximum;
  - live readouts in JetBrains Mono, with tabular numerals;
  - transport bar when the widget has a timeline (simulation or explanation);
  - non-drag controls toggle (⌨ "Precise controls") showing numeric/angle inputs for every draggable element.
- **Prompt panel:**
  - stem (KaTeX); answer input appropriate to the format;
  - attempts indicator (3 dots, with text "2 tries left");
  - **Check** button;
  - **inline feedback** below the input. Never a modal. It contains the mistake explanation, the "Show me" button that replays the visual cue, and Retry.
- **After exhaustion:** the prompt panel shows "Let's check the basics" and the easy diagnostic. The worked solution appears per the rules in docs/04 as a vertical stepper synchronised with the stage timeline.
- **Detour frame:** a 2 px peach inset border around both panels; the panel title reads "Detour · Free-body diagrams · 2 of 3".
- **Hint drawer:** slides over the prompt panel from the right (380 px). Each level is a card. Level 3 needs one extra tap ("Show a stronger hint").

### Phone (< 768 px)

```
┌───────────────────────────┐
│ ←  Friction  ●●●◐○○  Help │
│ Detour › FBD (chip row)   │
├───────────────────────────┤
│        STAGE              │  max 45vh, aspect 4:3
│   (widget)       ⌨ ⟲ ▶   │
├───────────────────────────┤
│ Q4 · Hard                 │
│ A 4 kg block rests …      │  scrolls
│ [ 19.6     ][ N ▾ ]       │
│ Attempts ● ● ●            │
├───────────────────────────┤
│ [        Check          ] │  sticky bottom bar, 56px
└───────────────────────────┘
```

- *As built in Phase 2:* the symbol keypad sits under the answer field (D-049). On phones the visual stacks above the question; the stage does not collapse yet while the system keyboard is open.
- Feedback slides up as a sheet over the prompt area (not over the stage), so the visual consequence stays visible.

### Other session screens

| Screen | Content |
|---|---|
| Session start | chapter title, "We'll begin with one medium question", skill list, [Begin] |
| Mastery resolution | chapter bar fills, "Mastered" plus 1-line summary, successors (2 cards), Chocolate Problem card (optional), flashcards queued |
| Not yet (cap reached) | solid skills, skills to review, [Review cards] [Back to map] |
| Stuck | "Your next step" card with time estimate, saved place, 3 choices (docs/04) |
| Class-ahead notice | one card naming the Class 12 prerequisite and chapter, [Open in map] [Continue here] |
