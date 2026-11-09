https://josec1154.github.io/2048/

## Run the prototype

Open `index.html` in a modern browser, or serve this folder with a static server.
No build step is needed.

## Controls and level rules

- Tap/click a note to select it; double-tap/click to flip it.
- Drag a note to move it along the dominant axis. Releases outside its starting
  tile are captured, and movement stops at collisions, board edges, or the MP limit.
- Hold a note to select its edge-connected neighbors. Moving before the hold
  completes cancels the hold. A canceled gesture spends no MP.
- Arrow keys move the focused note (including its joined formation), or the
  first selected note when a board note does not have focus. Tab visits notes;
  Enter and Space toggle selection. The arrow buttons work as before.
- This first level's goal is C major. Other connected major/minor triads are
  audible previews only: they do not consume notes, spend/restore MP, earn points,
  or add an undo step. Use Undo to revisit earlier actions or Reset to start over.
- C major retains the original 100-point reward, 3 MP restoration, and 25-point
  bonus for a joined formation that has moved. Undo can reverse a win.

## Regression tests

Requires Node.js 22 or newer. Fast logic and event-handler tests need no packages:

```sh
npm test
```

The logic suite uses a small DOM double; it does not replace real browser checks.
Run the desktop and mobile Chromium interaction suite with:

```sh
npm install
npx playwright install chromium
npm run test:browser
```

On Linux CI, use `npx playwright install --with-deps chromium`. To use an existing
Chromium installation, set `CHROMIUM_EXECUTABLE_PATH` to its executable path.
GitHub Actions runs both suites on pushes and pull requests to main.

Browser coverage includes drag capture, holds/cancellation, keyboard/focus,
touch input, E minor preview and recovery, collisions, MP, joined bonuses,
goal completion, undo, and reset. Audio synthesis is exercised but its audible
quality is not automatically judged.
