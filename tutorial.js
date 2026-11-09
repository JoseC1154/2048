/* Safe, deterministic practice. This module never reads or replaces live game state. */
(() => {
  'use strict';
  const entry = document.getElementById('tutorial-open');
  if (!entry || typeof HTMLDialogElement === 'undefined') return;
  const dialog = document.createElement('dialog');
  dialog.id = 'forge-tutorial';
  dialog.setAttribute('aria-labelledby', 'tutorial-title');
  dialog.setAttribute('aria-describedby', 'tutorial-description');
  dialog.innerHTML = `
    <div class="tutorial-shell">
      <header class="tutorial-header"><span id="tutorial-progress">Lesson 1 of 5</span><button id="tutorial-skip" type="button">Skip tutorial</button></header>
      <div class="tutorial-body">
        <h2 id="tutorial-title" tabindex="-1"></h2>
        <p id="tutorial-description"></p>
        <div class="tutorial-stats"><span id="tutorial-energy"></span><span id="tutorial-shift"></span></div>
        <div id="tutorial-board" role="group" aria-label="Four by three practice board"></div>
        <div class="tutorial-actions"><button id="tutorial-move" type="button">Move right → · 1 MP</button><button id="tutorial-flip" type="button">Flip B → C · 2 MP</button><button id="tutorial-play" class="primary" type="button" aria-describedby="tutorial-feedback">Play C major</button></div>
        <p id="tutorial-feedback" role="status" aria-live="polite" aria-atomic="true"></p>
        <p class="tutorial-safety">Practice only. Your game, score and Undo history stay untouched.</p>
      </div>
      <footer class="tutorial-footer"><button id="tutorial-retry" type="button">Restart lesson</button><button id="tutorial-next" class="primary" type="button">Next lesson</button></footer>
    </div>`;
  document.body.append(dialog);
  const get = id => document.getElementById('tutorial-' + id);
  const board = get('board');
  const titles = ['Play your first chord', 'Move a note into place', 'Turn B into C', 'Meet the replacement notes', 'Use energy and recover'];
  let lesson = 0, phase = 0, done = false, pieces = [], selected = new Set(), energy = 12;
  let feedback = '', returnFocus = null, drag = null, suppressClick = false;
  const piece = (id, name, x, y, extra = {}) => ({ id, name, x, y, ...extra });
  const chordPieces = () => [piece(1, 'C', 1, 1), piece(2, 'E', 2, 1), piece(3, 'G', 2, 2)];
  const movementLesson = () => !done && phase === 0 && (lesson === 1 || lesson === 4);
  const target = () => lesson === 1 ? { x: 1, y: 1 } : { x: 1, y: 2 };
  const movingId = () => lesson === 1 ? 1 : 4;
  const goal = () => lesson === 3 && phase === 1 ? 'A minor' : 'C major';
  const goalIds = () => lesson === 3 && phase === 1 ? [11, 12, 13] : [1, 2, 3];
  const canPlay = () => !done && (lesson === 0 || lesson === 3 || (lesson === 4 && phase === 1)) && goalIds().every(id => selected.has(id)) && selected.size === 3;
  const canMove = () => movementLesson() && selected.has(movingId());
  const canFlip = () => lesson === 2 && !done && selected.has(1);
  const speakSound = notes => { if (typeof chordSound === 'function') chordSound(notes); };
  function description() {
    if (done) return [
      'C, E and G make C major: three notes played together. In the game, a chord earns 100 points, fills energy to 18 MP and brings three new notes.',
      'Now C touches E, and E touches G. Notes must connect along their edges, not just their corners. One cell with one note costs 1 MP.',
      'B → C is one semitone: one small step between notes. This flip cost 2 MP. In the game, each move or flip advances the shift, so check the next preview.',
      'You made A minor from A, C and E. New notes replace the three you played. Real refills are random, so they may need moving or flipping before the next chord.',
      'You used the charged C in C major and refilled to 18 MP. Keep making chords to stay in play. JOIN and other advanced controls are optional; learn them later.'
    ][lesson];
    if (lesson === 0) return 'A chord is a few notes played together. Tap C, E and G, then press Play C major. These three already touch along their edges.';
    if (lesson === 1) return 'Tap C to make it active. Use Move right →, the Right arrow key, or drag C one square right into the outlined target.';
    if (lesson === 2) return 'Tap B, then Flip B → C. The shift is +1: this changes B into C. The result and 2 MP cost are shown before you act.';
    if (lesson === 3) return phase === 0 ? 'First, play this C major chord. Watch the three used notes become three NEW notes in the same squares.' : 'These NEW notes are A, C and E. Tap all three and play A minor. This practice refill is chosen for you; real refills are random.';
    return phase === 0 ? 'You have 1 MP and no connected chord. Tap D, then move it one square right for 1 MP. Watch what happens when your energy reaches zero.' : 'With no playable chord at zero energy, a charged copy of C appeared and gave you 3 MP. Tap the CHARGED C, E and G, then play C major to fill your energy.';
  }
  function missingGuidance() {
    if (done) return feedback;
    if (movementLesson()) return canMove() ? 'Dotted target: move one square right. No energy is spent on a wrong direction.' : `Tap ${lesson === 1 ? 'C' : 'D'} first. The ACTIVE label shows which note will move.`;
    if (lesson === 2) return canFlip() ? 'Ready: B → C with +1. Press Flip B → C.' : 'Tap B first. Then use the Flip button.';
    const missing = goalIds().filter(id => !selected.has(id)).map(id => pieces.find(p => p.id === id)?.name);
    return missing.length ? `Selected ${selected.size} of 3. Next, tap ${missing.join(', ')}.` : `All three selected. Ready to play ${goal()}.`;
  }
  function render(focusNext = false) {
    const focusedId = board.contains(document.activeElement) ? document.activeElement.dataset.tutorialNote : null;
    get('progress').textContent = `Lesson ${lesson + 1} of 5 · Safe practice`;
    get('title').textContent = titles[lesson];
    get('description').textContent = description();
    get('energy').textContent = `Energy: ${energy} / 18 MP`;
    get('shift').textContent = lesson === 2 ? 'Shift: +1 · B → C' : 'No penalties for practice';
    get('shift').hidden = lesson === 4 && phase === 1;
    board.replaceChildren();
    for (let y = 0; y < 3; y++) for (let x = 0; x < 4; x++) {
      const cell = document.createElement('div');
      cell.className = 'tutorial-cell';
      const p = pieces.find(p => p.x === x && p.y === y);
      if (movementLesson() && x === target().x && y === target().y) {
        cell.classList.add('tutorial-target');
        cell.textContent = '→';
        cell.setAttribute('role', 'img');
        cell.setAttribute('aria-label', 'Target square, one cell right');
      }
      if (p) {
        const tile = document.createElement('button');
        tile.type = 'button';
        tile.className = 'tutorial-note';
        tile.dataset.tutorialNote = p.id;
        tile.textContent = p.name;
        tile.setAttribute('aria-pressed', String(selected.has(p.id)));
        const active = (movementLesson() && p.id === movingId() && selected.has(p.id)) || (lesson === 2 && !done && selected.has(p.id));
        const label = p.charged ? 'CHARGED' : active ? 'ACTIVE' : p.fresh ? 'NEW' : '';
        if (label) { const marker = document.createElement('span'); marker.className = 'tutorial-marker'; marker.textContent = label; tile.append(marker); }
        tile.classList.toggle('tutorial-charged', Boolean(p.charged));
        tile.classList.toggle('tutorial-active', active);
        tile.setAttribute('aria-label', `${p.name}${label ? ', ' + label.toLowerCase() : ''}, row ${y + 1}, column ${x + 1}`);
        tile.disabled = done;
        cell.append(tile);
      }
      board.append(cell);
    }
    get('move').hidden = !movementLesson();
    get('move').disabled = !canMove();
    get('flip').hidden = lesson !== 2 || done;
    get('flip').disabled = !canFlip();
    get('play').hidden = done || lesson === 1 || lesson === 2 || (lesson === 4 && phase === 0);
    get('play').disabled = !canPlay();
    get('play').textContent = `Play ${goal()}`;
    get('feedback').textContent = feedback || missingGuidance();
    get('next').disabled = !done;
    get('next').textContent = lesson === 4 ? 'Return to game' : 'Next lesson';
    get('retry').textContent = lesson === 4 && done ? 'Replay tutorial' : 'Restart lesson';
    get('skip').textContent = lesson === 4 && done ? 'Close tutorial' : 'Skip tutorial';
    if (focusNext) get('next').focus({ preventScroll: false });
    else if (focusedId) board.querySelector(`[data-tutorial-note="${focusedId}"]`)?.focus({ preventScroll: true });
  }
  function startLesson(index) {
    lesson = index; phase = 0; done = false; selected = new Set(); energy = 12; feedback = ''; drag = null; suppressClick = false;
    pieces = chordPieces();
    if (lesson === 1) pieces[0].x = 0;
    if (lesson === 2) pieces = [piece(1, 'B', 1, 1)];
    if (lesson === 3) { selected = new Set([1, 2, 3]); energy = 8; }
    if (lesson === 4) { pieces = [piece(2, 'E', 2, 0), piece(3, 'G', 2, 1), piece(4, 'D', 0, 2), piece(5, 'C', 0, 0)]; energy = 1; }
    render(); get('title').focus(); get('title').scrollIntoView({ block: 'nearest' });
  }
  function selectNote(id) {
    if (done) return;
    if (movementLesson() && id !== movingId()) { feedback = `For this step, tap ${lesson === 1 ? 'C' : 'D'} and move it into the target.`; render(); return; }
    if (lesson === 4 && phase === 1 && !goalIds().includes(id)) { feedback = 'Use the CHARGED C with E and G for this step. Leave the other notes for later.'; render(); return; }
    if (selected.has(id)) selected.delete(id); else selected.add(id);
    feedback = ''; render();
  }
  function moveRight() {
    if (!canMove()) return;
    const p = pieces.find(p => p.id === movingId());
    p.x++; energy--;
    if (lesson === 1) { done = true; feedback = 'Moved C one square right. Cost: 1 MP. The three notes now connect.'; render(true); }
    else {
      pieces.push(piece(1, 'C', 1, 1, { charged: true }));
      energy = 3; phase = 1; selected.clear();
      feedback = '1 → 0 → 3 MP: a charged copy of C appeared. Practice chooses C and places it beside E and G; real charged notes copy a random existing note into a random empty square. Select the CHARGED C, E and G.';
      render(); board.querySelector('[data-tutorial-note="1"]')?.focus();
    }
  }
  function playChord() {
    if (!canPlay()) return;
    speakSound(goalIds().map(id => pieces.find(p => p.id === id).name));
    energy = 18; selected.clear();
    if (lesson === 3 && phase === 0) {
      pieces = [piece(11, 'A', 1, 1, { fresh: true }), piece(12, 'C', 2, 1, { fresh: true }), piece(13, 'E', 2, 2, { fresh: true })];
      phase = 1;
      feedback = 'C major played! +100 points, 18 MP, and three replacement notes marked NEW. Next: select A, C and E.';
      render(); board.querySelector('[data-tutorial-note="11"]')?.focus();
    } else {
      done = true;
      feedback = `${goal()} played! +100 practice points. Energy filled to 18 MP.${lesson === 4 ? ' Your real game is still untouched.' : ''}`;
      if (lesson === 4) { entry.textContent = 'Replay tutorial'; }
      render(true);
    }
  }
  function ignoreDragClick() {
    suppressClick = true;
    // A re-render can remove the native click target. Never swallow a later keyboard click.
    setTimeout(() => { suppressClick = false; }, 0);
  }
  function close() {
    if (!dialog.open) return;
    drag = null; dialog.close();
    (returnFocus?.isConnected ? returnFocus : entry).focus({ preventScroll: true });
  }
  entry.addEventListener('click', () => {
    if (dialog.open) return;
    // Opening mid-animation would let a pending live action continue behind the lesson.
    if ((typeof celebration !== 'undefined' && celebration !== null) || (typeof flipping !== 'undefined' && flipping !== null)) {
      if (typeof message === 'function') message('Let the current action finish, then open the tutorial.');
      return;
    }
    returnFocus = document.activeElement;
    if (typeof interruptGesture === 'function') interruptGesture();
    const extras = document.querySelector('details.extras');
    if (extras) extras.open = false;
    dialog.showModal(); startLesson(0);
  });
  get('skip').addEventListener('click', close);
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  get('next').addEventListener('click', () => { if (done) lesson === 4 ? close() : startLesson(lesson + 1); });
  get('retry').addEventListener('click', () => startLesson(lesson === 4 && done ? 0 : lesson));
  get('move').addEventListener('click', moveRight);
  get('flip').addEventListener('click', () => {
    if (!canFlip()) return;
    pieces[0].name = 'C'; energy -= 2; done = true;
    feedback = 'B → C. One semitone is one small step; this flip cost 2 MP.';
    speakSound(['C']); render(true);
  });
  get('play').addEventListener('click', playChord);
  board.addEventListener('click', event => {
    if (suppressClick) { suppressClick = false; return; }
    const tile = event.target.closest('[data-tutorial-note]');
    if (tile) selectNote(Number(tile.dataset.tutorialNote));
  });
  board.addEventListener('pointerdown', event => {
    suppressClick = false;
    const tile = event.target.closest('[data-tutorial-note]');
    if (!tile || !movementLesson() || Number(tile.dataset.tutorialNote) !== movingId() || event.button !== 0 || !event.isPrimary) return;
    drag = { id: Number(tile.dataset.tutorialNote), pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    board.setPointerCapture(event.pointerId);
  });
  board.addEventListener('pointerup', event => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const current = drag; drag = null;
    if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
    const dx = event.clientX - current.x, dy = event.clientY - current.y;
    if (Math.hypot(dx, dy) < 14) {
      ignoreDragClick(); selectNote(current.id);
      board.querySelector(`[data-tutorial-note="${current.id}"]`)?.focus({ preventScroll: true });
      return;
    }
    ignoreDragClick();
    if (dx > 14 && Math.abs(dx) > Math.abs(dy)) { selected = new Set([current.id]); moveRight(); }
    else { feedback = 'Try one square to the right, into the outlined target. No energy spent.'; render(); }
  });
  for (const type of ['pointercancel', 'lostpointercapture']) board.addEventListener(type, () => { drag = null; });
  // The live game owns document-level arrows. Stop them before they reach its listener.
  document.addEventListener('keydown', event => {
    if (!dialog.open || !event.key.startsWith('Arrow')) return;
    event.stopImmediatePropagation();
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (movementLesson()) {
      event.preventDefault();
      if (event.key === 'ArrowRight') { if (canMove()) moveRight(); else { feedback = `Tap ${lesson === 1 ? 'C' : 'D'} first, then press Right.`; render(); } }
      else { feedback = 'This lesson uses one move to the right. No energy spent.'; render(); }
    }
  }, true);
})();
