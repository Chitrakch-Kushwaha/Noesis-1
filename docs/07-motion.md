# 07 · Motion specification

**Principle:** every animation either **teaches** (it shows a cause and its consequence in the model) or **communicates state** (where you are, what changed, what's next). Anything else is optional polish and is the first thing removed under reduced motion or low power.

**Classes used below:**

| Class | Meaning | Under reduced motion |
|---|---|---|
| **E-teach** | Essential to understanding | Kept, as stepped frames or a static annotated diagram with the same information |
| **E-state** | Essential to orientation | Replaced by an instant change plus a text announcement |
| **P** | Polish | Removed |

## Motion tokens

```css
:root {
  --dur-instant: 90ms;   /* press, toggle */
  --dur-fast: 160ms;     /* hover, small state */
  --dur-base: 240ms;     /* panels, feedback in */
  --dur-slow: 400ms;     /* progress fills, card dock */
  --dur-camera: 600ms;   /* roadmap camera moves */
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-emphasized: cubic-bezier(0.3, 0, 0, 1);
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);
  --stagger: 28ms;
}
/* Springs (Motion): drag release settle { stiffness: 420, damping: 38 }; card dock { stiffness: 300, damping: 34 } */
```

Animate `transform`, `opacity` and SVG `stroke-dashoffset` only. Never animate layout properties (width/height/top/left) during interaction.

## 1. Roadmap

| Moment | What animates | Why | Class |
|---|---|---|---|
| **Enter (first load per session)** | Clusters fade in (120 ms). Nodes rise 8 px and fade in **layer by layer** in dependency order (stagger 28 ms per node, ≤ 700 ms total). Each connector **draws from parent to child** (`stroke-dashoffset`, 240 ms) just after its parent appears. | The order of appearance teaches the direction of dependency: you watch the map grow from foundations outward. | E-state (order), P (rise) |
| Enter (later visits) | Instant. Only progress underlines animate from their last-seen value. | Avoids repeating the intro. | — |
| Any input during intro | Intro completes instantly. | The student is never made to wait. | — |
| **Switch view** (Physics 11 ↔ Physics 12 …) | Outgoing nodes fade (120 ms). The camera fits the new view (400 ms). The new view's arrival sequence plays in dependency order, staggered and compressed to ≤ 500 ms. | Each view is a different branch structure; re-growing it shows its dependency order. | E-state |
| **Prerequisite path highlight** (on select) | The selected chapter's ancestors and their connectors brighten. Each connector runs a **flow pulse** (dash animation moving *from prerequisite to chapter*) once. Successor connectors then pulse *away* from the chapter. Everything else dims to 40%. | Shows what this chapter builds on and what it leads to, in the direction of learning. | E-teach (direction), E-state (highlight) |
| **Select / navigate** | Camera eases (600 ms, emphasized) to frame the node plus its direct prerequisites and successors. Non-neighbour nodes dim to 55%. The chapter sheet slides in (240 ms). Keyboard focus moves the camera with a shorter 300 ms ease and never re-zooms. | Shows the node *in context*: what it builds on and what it unlocks. | E-state |
| Pan/zoom by user | Direct manipulation with no easing; inertia on release (≤ 300 ms decay). | Feels physical. | — |
| **Progress fill** | On returning from a session, the node underline fills from the old to the new value (400 ms). The rail counters tick in sync. | Makes progress tangible and attributable. | E-state |
| **Branch recommendation** | Recommended outgoing edges turn orange and carry a **travelling dash** moving in the edge direction, 2 passes (≈ 1.6 s), then rest as solid orange. The successor node gets a "Next" tag that fades in. | Points the way forward without locking anything. | E-state (colour and tag), P (travelling dash) |
| **Newly mastered** | 1. The node underline completes. 2. The border warms from `--border-strong` to amber with a single soft bloom (600 ms; the glow fades to none within 1 s). 3. Edges to successors **ignite in sequence** from the mastered node outward (150 ms stagger). 4. Recommended tags appear on successors. | Shows that mastery here is what opens those paths. | E-state (order and final state), P (bloom) |
| **Paused detour marker** | A dashed amber thread from the paused chapter to the foundation badge, drawn once (400 ms). | Shows where the saved place is. | E-state |
| Related links | Dotted peach connectors labelled *related* are always drawn at low emphasis and brighten when an end is selected. They never animate as flow, because there is no direction and no prerequisite. | Keeps the visual language distinct from prerequisites (U-15). | E-state |

**Reduced motion (roadmap):**

- The camera jumps (no zoom animation) and neighbours are framed instantly.
- The intro appears fully drawn.
- Progress values update instantly, and a polite live-region message reads, for example, "Laws of Motion mastered. Recommended next: Work, Energy and Power."
- Recommendation is shown by colour plus the "Next" tag.

## 2. Lesson visuals

### Dragging (continuous response)

- Model updates run **every frame** while dragging: `reduce` → `derive` → render in the same `requestAnimationFrame`. Derived objects (resultant arrow, components, trajectory preview, tangent line, area shading, image position in a ray diagram) **never lag the handle**. Budget: ≤ 4 ms per frame for model and render on a mid-range phone.
- **Simulations** split into two parts:
  - **Ghost preview:** while dragging a parameter, a thin, low-opacity ghost path (trajectory, motion envelope) is recomputed analytically or with a fast low-resolution integration.
  - **Run:** on release, the full simulation plays.

  Example: moving a force arrow on the block updates the resultant at once. The block's acceleration arrow and a ghost "where it will be in 1 s" marker update with it. Release plays the motion.
- **Snapping:** handles snap to grid or angle increments (5°) with a 90 ms settle spring. The readout shows the snapped value. Snapping is shown, not hidden.
- **Readouts** use tabular numerals and change without tweening (numbers must be truthful at every frame).
- Optional: `navigator.vibrate(8)` on snap on Android. **P**.

### Typing values

- A valid parse (debounced 150 ms) **tweens the model** from its old state to the new state over 200 ms, so the cause → effect link is visible even when the value is typed rather than dragged. **E-teach.**
- Invalid input never moves the model. The field shows an inline message and does not shake.
- Under reduced motion the model jumps to the new state and the readout change is announced.

### Incorrect answers (the core teaching moment)

1. **Consequence playback** (E-teach). Where meaningful, the stage plays out *the student's own answer*:
   - The friction force they gave is applied, and the block visibly accelerates up the plank, contradicting "at rest".
   - The projectile with their angle misses the target.
   - The tangent with their slope cuts through the curve.

   Before attempts are exhausted, only the consequence is shown, never the correct state.
2. **Misconception cue** (E-teach). The template's tag maps to a named widget cue that shows *why*:
   - `decompose-weight`: the weight arrow splits into components, and the normal force resizes to match only the perpendicular part.
   - `ask-for-agent`: arrows without an agent fade and are labelled.
   - Each cue is ≤ 2.5 s and can be replayed with "Show me".
3. **Field signal** (E-state). The answer field gets a 2 px coral outline that fades in over 160 ms, plus text such as "Not quite — 2 tries left". **No shaking** (vestibular safety), and colour is never the only signal.
4. After exhaustion, the **correct state** is shown as a **ghost overlay** next to the student's state, so the difference is visible.

*As built in Phase 2 (D-055):* consequences are template cue lists played on the same live model (`stop-at` brakes the car to the distance the student gave and reports the deceleration that needs; `land-at` finds the launch speed the student's range implies; `student-tangent` draws the student's f′ as a tangent; the free-body board plays the student's forces against the box's observed constant velocity). The correct state appears only through the template's `resolution` cues once the question ends, and in the worked solution. Typed values move the model immediately (no 200 ms tween yet); this is a known gap.

### Correct answers

The resolution is brief: ≤ 700 ms total.

1. The model completes its motion to the stated outcome (the block stays put; the projectile lands on target).
2. A check mark draws (300 ms).
3. The progress dot fills with an amber sweep.
4. The **Next** button appears.

There is no confetti and no sound by default. A slightly larger bloom is reserved for **chapter mastery**: one 900 ms bloom on the chapter bar, never a loop.

### Pause, reset, replay, scrub

- Any widget with a timeline (simulation, cue, worked solution) has a transport bar: play/pause, step back/forward (to keyframes), reset, and a scrubber.
- Simulations use a **fixed timestep (1/120 s)** and record keyframes every 0.1 s, so scrubbing is exact and replay is identical.
- **Worked solutions** are step lists bound to stage keyframes. Selecting a step scrubs the stage to that step's state.

## 3. Prerequisite detour and return

**Spatial metaphor:** prerequisites are *beneath* the current work. You step down into a detour and climb back up. The breadcrumb is the persistent map of where you are.

| Step | Animation | Duration | Class |
|---|---|---|---|
| Decision shown | A card slides into the prompt panel: "This uses *Resolving forces*. Let's check that first." It contains a **[Let's go]** button; a secondary *Skip for now* goes to the guided example. | 240 ms | E-state |
| **Dive** | The current question card **scales to 0.92 and docks** into a breadcrumb chip labelled *Paused: Friction on an incline* (shared-element transition, 400 ms spring). The stage dims and slides **down and out** (24 px, fade). The detour stage rises from below. A **peach inset frame** draws around the workspace. A new peach breadcrumb segment appears: *Detour › Resolving forces*. | ~600 ms total | E-state |
| Inside the detour | The breadcrumb chip of the paused question can be focused or hovered to show a read-only peek (160 ms). The depth indicator shows one peach chevron per level (max 4). | — | E-state |
| Deeper detour | The same dive. The previous detour card docks next to the first chip. | ~600 ms | E-state |
| **Prerequisite learned** | Mini-mastery dots complete. The detour card collapses into a **check chip** that **travels up into the breadcrumb**. That segment turns solid with ✓, the peach frame retracts, and the paused card **undocks and expands back** into place (reverse shared-element). The previously wrong element is softly highlighted with the line "Now try it with what you just practised." | ~800 ms total | E-state |
| Stuck at a foundation | No dive back. A "Your next step" card appears. The breadcrumb chip shows a bookmark icon labelled *Saved place*. | 240 ms | E-state |

**Reduced motion (detours):**

- A 120 ms cross-fade replaces the dive and the return.
- The breadcrumb text updates immediately.
- A polite announcement is made: "Paused Friction on an incline. Now practising Resolving forces, detour level 1 of up to 4." On return: "Resolving forces done. Back to Friction on an incline."
- Focus moves to the new question heading.

## 4. Essential vs optional — summary

| Essential to understanding (E-teach) | Essential to orientation (E-state) | Optional polish (P) |
|---|---|---|
| continuous widget response to drag | node/connector arrival order | node rise on intro |
| typed-value tween (cause → effect) | camera framing on select | travelling dash on recommended edges |
| consequence playback of a wrong answer | progress underline fill | mastery bloom and glow |
| misconception cues | newly-mastered edge ignition order | inertia after pan |
| ghost overlay of the correct state after exhaustion | detour dive/return and breadcrumb | snap haptics |
| scrubbable simulations and worked solutions | correct/incorrect field signal | hover lifts |

## 5. Reduced-motion and low-power behaviour

- **Trigger:** `prefers-reduced-motion: reduce`, or the in-app setting *Motion: Full / Reduced / Minimal*. Reduced is the default when the OS asks for it.
  - **Reduced:** E-teach animations become **stepped**. Each cue is shown as 2–4 annotated still frames with Next/Previous controls, auto-advancing only if the student presses Play. Simulations do not autoplay. E-state becomes instant with announcements. P is removed.
  - **Minimal:** like Reduced, plus no ghost previews while dragging; the model updates on release or on input only.
- **Static equivalents:** every cue has a `describe()` text and a final-state diagram, so the information is available without motion and to screen readers.
- **Non-drag controls** exist for every drag (docs/08). Changing a numeric control uses the same typed-value tween, which becomes an instant change under reduced motion.
- **Low-power mode** switches on automatically when p95 frame time exceeds 24 ms over 2 s, or when `navigator.hardwareConcurrency ≤ 4` and `deviceMemory ≤ 4`. It:
  - removes P;
  - drops canvas resolution to devicePixelRatio 1.5;
  - halves field-line density;
  - disables grain and gradient layers.

## 6. Performance targets

| Metric | Target | Measured how |
|---|---|---|
| Drag/interaction frame rate | 60 fps on a mid-range laptop; **≥ 50 fps** sustained on a mid-range Android phone (4 GB RAM, 2021–2023 mid-tier SoC), with no long task > 50 ms during drag | Playwright trace with 4× CPU throttle in CI; manual run on a real device each phase that adds a widget |
| Model + render per frame | ≤ 4 ms (phone) | `performance.measure` around the frame callback; a test fails if p95 is above budget on the throttled profile |
| Roadmap pan/zoom | 60 fps; one view's nodes and edges; the dotted grid moves on its own compositor layer (transform only) and the atmosphere layer uses no filters | Phase 1 measured: p50 16.7 ms on the test machine, and p50 16.7 ms under 4× CPU throttling (`tests/e2e` performance test). Before the fix, the grid repainted on every pan frame (p50 33 ms). |
| Interaction to Next Paint | < 200 ms | web-vitals in e2e |
| LCP (dashboard, 4G, mid phone) | < 2.5 s | Lighthouse CI mobile preset |
| Initial JS (dashboard route) | ≤ 200 KB gzip | bundle analyser budget in CI |
| Per-widget chunk | ≤ 80 KB gzip, lazy-loaded | budget |
| Checking worker (own parser + units, D-048) | warmed when a question opens, ≤ 450 KB gzip, off main thread | Phase 2 measured about 15 KB gzip |
| Animations in background tabs | paused (`visibilitychange`) | unit test |
| Glow/blur | No `backdrop-filter` or animated `filter: blur` on phones. Glows are pre-rendered radial gradients animated by opacity only. | code review rule |
