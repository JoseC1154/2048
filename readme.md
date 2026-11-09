# Chord Forge

Play: https://josec1154.github.io/2048/

## Run locally

Serve this folder with a static server and open `index.html` in a modern browser.
No build step is needed. Keep `tutorial.js` and `tutorial.css` beside `index.html`.

## Learn to play

Choose **Learn to play** in the header for five interactive practice lessons:

1. Select C, E and G, then play C major.
2. Move C one square into an edge-connected position with the button, Right arrow
   key, or drag.
3. Preview and perform B → C with a +1 semitone flip.
4. See three replacement notes marked NEW, then play A minor.
5. Spend the last practice MP, receive a charged note and complete a recovery chord.

The tutorial uses a separate, deterministic practice board. It never changes the
live board, score, mode, energy, forecast, selection or Undo history. Restart a
lesson, skip at any time, close with Escape, or replay after completing it. An
in-progress live flip or chord must finish before opening the tutorial.

Practice refills and charged-note placements are deliberately chosen. Actual
refills and charged-note locations are random. The lessons show normal energy
costs but cannot lose a real run. JOIN, pitch numbers, equivalent shifts and the
full forecast are deferred until after the basics.

The tutorial supports native buttons, keyboard selection, focus containment and
return, announced feedback, large touch targets, and a scrollable short-screen
layout with persistent exit controls. Its success cues do not require sound or
animation. Automated browser coverage is included; real-device and assistive
technology checks are still useful.

## Controls and survival rules

- Tap/click a note to select it for a chord; Enter or Space also toggles selection.
- The ACTIVE label identifies the note targeted by the movement and Flip controls.
  Keyboard arrows and on-screen arrows use the same active note. A joined group
  moves together. Flip changes the active note, even within a larger selection.
- Double-tap/click a note to flip it, preserving selection. The preview shows its
  result and 2 MP cost. Equivalent shifts such as ±12 keep the same note name.
- Drag a note along the dominant axis. It stops at collisions, board edges or the
  MP limit. One cell with an independent note costs 1 MP; groups cost more.
- Hold a note to select its edge-connected neighbors. Moving or canceling the
  gesture prevents an accidental hold action.
- Select exactly three edge-connected notes that form a major or minor triad,
  then press Play. JOIN is not required. Each chord earns 100 points, restores
  energy to 18 MP, and replaces the three played notes with random notes.
- JOIN costs 1 MP. A joined formation that moves before being played can earn a
  25-point bonus. UNJOIN costs 2 MP and lets you select smaller subsets again.
- A successful move or flip advances the semitone forecast by one step. A flip
  uses the current shift before advancing. Undo restores the previous forecast.
- When energy runs out, no playable chord remains and space is available, a
  charged copy of a random existing note appears and grants 3 MP. Its location is
  random and it does not guarantee an easy chord. A playable chord can still be
  selected and played for free at zero MP.
  Beginner mode has one separate board-lock rescue; Advanced has none.
- Undo reverses an action, including from game-over when history is available.
  Reset and changing difficulty start a new run.

## Regression tests

Requires Node.js 22 or newer. Fast logic and event-handler tests need no packages:

```sh
npm test
```

Logic tests use small DOM doubles; they are not browser or layout checks. The
current-rule fixtures are deterministic so random openings do not destabilize
assertions. Tutorial tests cover lesson gating, moves, flips, replacement notes,
charged recovery, repeated actions, selection, skip/replay, input cancellation
and isolation from real gameplay.

Run the real desktop and mobile Chromium interaction suites with:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

On Linux CI, use `npx playwright install --with-deps chromium`. To use an existing
Chromium installation, set `CHROMIUM_EXECUTABLE_PATH` to its executable path.
GitHub Actions runs both suites on pushes and pull requests to main.

Tutorial browser coverage includes all five lessons, 320 × 568 touch layout,
keyboard navigation, Escape/focus return, skipping from every lesson, replay,
wrong-direction and rightward drags, reduced motion, and live-state preservation.
Audio synthesis is exercised but its audible quality is not automatically judged.
