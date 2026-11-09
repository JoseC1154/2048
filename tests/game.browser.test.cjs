const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const fixture = require('./game.fixture.cjs');
const { chromium } = require('playwright');
let server, browser, context, page, url;
let errors;
const tile = id => page.locator(`[data-piece-id="${id}"]`);
const center = async locator => {
  const r = await locator.boundingBox();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};
const boardState = () => page.evaluate(() => ({
  mp: Number(document.querySelector('#mp').textContent),
  score: Number(document.querySelector('#score').textContent),
  pieces: [...document.querySelectorAll('.tile')].map(t => ({
    id: Number(t.dataset.pieceId), note: t.getAttribute('aria-label'),
    x: [...t.parentElement.parentElement.children].indexOf(t.parentElement) % 6,
    y: Math.floor([...t.parentElement.parentElement.children].indexOf(t.parentElement) / 6),
    selected: t.getAttribute('aria-pressed') === 'true', joined: t.classList.contains('joined')
  })).sort((a,b) => a.id-b.id),
  history: [...document.querySelectorAll('#history li')].map(li=>li.textContent)
}));
const piece = async id => (await boardState()).pieces.find(p=>p.id===id);
const message = () => page.locator('#message').innerText();
const focusId = () => page.evaluate(() => document.activeElement.dataset.pieceId);
const pressOn = async (id, key) => { await tile(id).focus(); await page.keyboard.press(key); };
const select = id => pressOn(id, 'Enter');
const loadFixture = () => page.evaluate(value=>{interruptGesture();state=value;undoStack=[];history=[];celebration=null;flipping=null;spawnedIds=[];render();message('');},fixture());
const reset = async () => {await page.locator('#reset').click();await loadFixture();};
const playChord = async () => {await page.locator('#play').click();await page.waitForFunction(()=>celebration===null);};
const unit = async () => (await center(page.locator('.cell').nth(1))).x-(await center(page.locator('.cell').nth(0))).x;
async function drag(id, dx, dy, pause = false) {
  const p=await center(tile(id)), step=await unit();
  await page.mouse.move(p.x,p.y);await page.mouse.down();
  await page.mouse.move(p.x+dx*step,p.y+dy*step,{steps:5});
  if(pause)await page.waitForTimeout(500);
  await page.mouse.up();
}
async function goalSetup() {
  await pressOn(1,'ArrowRight');
  for(const id of [1,2,3])await select(id);
}
before(async()=>{
  server=createServer((req,res)=>{
    const name=req.url==='/'?'index.html':req.url.slice(1);
    if(!['index.html','tutorial.js','tutorial.css'].includes(name)){res.writeHead(404);res.end();return;}
    try {res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':name.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(readFileSync(join(__dirname,'..',name)));}
    catch {res.writeHead(404);res.end();}
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
beforeEach(async()=>{
  context=await browser.newContext({viewport:{width:1000,height:1000},reducedMotion:'reduce'});
  page=await context.newPage();errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await loadFixture();
});
afterEach(async()=>{await context?.close();assert.deepEqual(errors,[],'No uncaught browser errors');});

test('mouse drag released over a different cell moves exactly once and can be undone',async()=>{
  const before=await boardState();await drag(1,1,0);
  assert.equal((await piece(1)).x,2);assert.equal((await boardState()).mp,11);
  assert.equal((await boardState()).history.length,1);
  await page.locator('#undo').click();assert.deepEqual(await boardState(),before);
});
test('mouse drag beyond the board is captured and stops at the boundary',async()=>{
  await drag(1,-3,0);assert.equal((await piece(1)).x,0);assert.equal((await boardState()).mp,11);
});
test('slow drag cancels hold; drag returned to origin is neither a tap nor a move',async()=>{
  await drag(1,1,0,true);assert.equal((await piece(1)).x,2);assert.equal((await piece(1)).selected,false);
  await reset();const before=await boardState(),p=await center(tile(1)),step=await unit();
  await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+step,p.y);
  await page.mouse.move(p.x,p.y);await page.mouse.up();assert.deepEqual(await boardState(),before);
});
test('long hold selects touching group and survives render without release action',async()=>{
  const p=await center(tile(2));await page.mouse.move(p.x,p.y);await page.mouse.down();
  await page.waitForTimeout(500);await page.mouse.move(p.x-100,p.y);await page.mouse.up();
  const s=await boardState();assert.deepEqual(s.pieces.filter(p=>p.selected).map(p=>p.id),[2,3]);
  assert.equal(s.mp,12);assert.equal(s.history.length,0);assert.equal((await piece(2)).x,3);
});
test('pointer cancellation and lost capture leave no delayed hold or phantom release',async()=>{
  for(const action of ['pointercancel','lostpointercapture']){
    await reset();const before=await boardState(),p=await center(tile(1));
    await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+5,p.y);
    await page.evaluate(type=>{
      const b=document.querySelector('#board');
      if(type==='lostpointercapture')b.releasePointerCapture(1);
      else b.dispatchEvent(new PointerEvent(type,{pointerId:1,bubbles:true}));
    },action);
    await page.waitForTimeout(500);await page.mouse.up();assert.deepEqual(await boardState(),before);
  }
});
test('reset and window blur interrupt an active hold',async()=>{
  for(const action of ['reset','blur']){
    await reset();const before=await boardState(),p=await center(tile(1));
    await page.mouse.move(p.x,p.y);await page.mouse.down();
    await page.evaluate(action=>action==='reset'?document.querySelector('#reset').click():window.dispatchEvent(new Event('blur')),action);
    const after=await boardState();await page.waitForTimeout(500);await page.mouse.move(p.x+100,p.y);await page.mouse.up();
    assert.deepEqual(await boardState(),action==='reset'?after:before);
  }
});
test('right mouse button is ignored; double tap flips once without dragging',async()=>{
  const before=await boardState();await tile(1).click({button:'right'});assert.deepEqual(await boardState(),before);
  await tile(1).dblclick({delay:70});assert.match((await piece(1)).note,/^Note C♯,/);
  assert.equal((await boardState()).mp,10);assert.equal((await boardState()).history.length,1);
});
test('keyboard arrows move focused tile, keep focus across renders, and do not scroll',async()=>{
  await tile(1).focus();const scroll=await page.evaluate(()=>window.scrollY);
  for(const key of ['ArrowUp','ArrowRight','ArrowDown','ArrowLeft']){
    await page.keyboard.press(key);assert.equal(await focusId(),'1');
  }
  assert.equal((await piece(1)).x,1);assert.equal((await piece(1)).y,2);
  assert.equal((await boardState()).mp,8);assert.equal(await page.evaluate(()=>window.scrollY),scroll);
  await page.keyboard.press('Enter');assert.equal((await piece(1)).selected,true);
  await page.keyboard.press('Space');assert.equal((await piece(1)).selected,false);assert.equal(await focusId(),'1');
});
test('keyboard supports selected fallback and preserves movement-button focus',async()=>{
  await select(1);await page.locator('#right').click();assert.equal((await piece(1)).x,2);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'right');
  await page.keyboard.press('ArrowUp');assert.equal((await piece(1)).y,1);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'right');
});
test('collision, boundary, and insufficient MP moves do not spend extra MP',async()=>{
  await pressOn(1,'ArrowRight');const collision=await boardState();await page.keyboard.press('ArrowRight');
  assert.deepEqual(await boardState(),collision);assert.match(await message(),/Blocked by another note/);
  await reset();await pressOn(5,'ArrowLeft');assert.equal((await boardState()).mp,12);assert.match(await message(),/edge of the board/);
  await page.evaluate(()=>{state.mp=0;render();});await tile(1).focus();
  const empty=await boardState();await page.keyboard.press('ArrowRight');assert.deepEqual(await boardState(),empty);
  assert.match(await message(),/Not enough MP/);
});
test('modified keys and editable fields keep their own keyboard behavior',async()=>{
  await select(1);const before=await boardState();await page.keyboard.press('Control+ArrowRight');
  assert.deepEqual(await boardState(),before);
  await page.evaluate(()=>{const input=document.createElement('input');input.value='abc';document.body.append(input);input.focus();});
  await page.keyboard.press('ArrowLeft');assert.deepEqual(await boardState(),before);
});
test('any major or minor chord scores and refills three notes with Undo available',async()=>{
  for(const notes of [['C','E','G'],['E','G','B']]){
    await reset();await page.evaluate(notes=>{state.pieces.slice(0,3).forEach((p,i)=>p.front=notes[i]);render();},notes);
    await goalSetup();assert.match(await page.locator('#play').innerText(),/FOUND!/);
    const before=await boardState();await playChord();const s=await boardState();
    assert.equal(s.pieces.length,5);assert.equal(s.mp,18);assert.equal(s.score,100);
    assert.equal(s.pieces.some(p=>p.selected),false);assert.equal(s.pieces.filter(p=>p.id>=6).length,3);
    await page.locator('#undo').click();assert.deepEqual(await boardState(),before);
  }
});
test('joined formation movement, bonus, unjoin cost and undo retain endless rules',async()=>{
  await goalSetup();await page.locator('#join').click();assert.equal((await boardState()).mp,10);
  await pressOn(2,'ArrowUp');assert.equal((await boardState()).mp,8);
  assert.equal((await piece(1)).y,1);assert.equal((await piece(2)).y,1);assert.equal((await piece(3)).y,2);
  await playChord();assert.equal((await boardState()).score,125);assert.equal((await boardState()).mp,18);
  await page.locator('#undo').click();await page.locator('#unjoin').click();assert.equal((await boardState()).mp,6);
  assert.equal((await boardState()).pieces.some(p=>p.joined),false);
  await page.locator('#undo').click();assert.equal((await boardState()).pieces.filter(p=>p.joined).length,3);
});
test('touch tap, drag, hold, and cancellation work at a mobile viewport',async()=>{
  await context.close();context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2,reducedMotion:'reduce'});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);await loadFixture();
  await tile(1).tap();assert.equal((await piece(1)).selected,true);await reset();
  const cdp=await context.newCDPSession(page);
  const touch=async(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[{x:p.x,y:p.y,id:1}]:[]});
  let p=await center(tile(1)),step=await unit();
  await touch('touchStart',p);await touch('touchMove',{x:p.x+step,y:p.y});await touch('touchEnd');
  assert.equal((await piece(1)).x,2);assert.equal((await boardState()).mp,11);await reset();
  p=await center(tile(2));await touch('touchStart',p);await page.waitForTimeout(500);await touch('touchEnd');
  assert.deepEqual((await boardState()).pieces.filter(p=>p.selected).map(p=>p.id),[2,3]);await reset();
  const before=await boardState();p=await center(tile(1));await touch('touchStart',p);await touch('touchCancel');
  await page.waitForTimeout(500);assert.deepEqual(await boardState(),before);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile horizontal overflow');
});

test('multi-selection keeps one visible active target across keys and arrow buttons',async()=>{
  for(const id of [1,2,3])await select(id);
  await page.keyboard.press('ArrowRight');await page.locator('#right').click();
  assert.equal((await piece(3)).x,5);assert.equal((await piece(2)).x,3);assert.equal((await piece(1)).x,1);
  assert.deepEqual((await boardState()).pieces.filter(p=>p.selected).map(p=>p.id),[1,2,3]);
  assert.equal(await page.locator('.tile.active').count(),1);
  assert.equal(await page.locator('.tile.active').getAttribute('data-piece-id'),'3');
  assert.equal(await page.locator('.tile.active .active-marker').isVisible(),true);
  assert.match(await page.locator('#flipPreview').innerText(),/ACTIVE G/);
});
test('double-click preserves selected and unselected notes, including joined selection',async()=>{
  for(const selected of [[],[1],[1,2,3]]){
    await reset();await page.evaluate(ids=>{state.selected=ids;render();},selected);
    await tile(1).dblclick({delay:70});assert.deepEqual((await boardState()).pieces.filter(p=>p.selected).map(p=>p.id),selected);
    assert.equal((await boardState()).mp,10);assert.match((await piece(1)).note,/Note C♯/);
  }
  await reset();await goalSetup();await page.locator('#join').click();
  await tile(2).dblclick({delay:70});assert.deepEqual((await boardState()).pieces.filter(p=>p.selected).map(p=>p.id),[1,2,3]);
});
test('invalid selection feedback updates immediately and clears a stale success event',async()=>{
  await page.evaluate(()=>message('C Major found! Previous success.'));
  await select(1);assert.equal(await message(),'');assert.match(await page.locator('#selectionStatus').innerText(),/Choose 3/);
  await select(2);await select(3);assert.match(await page.locator('#selectionStatus').innerText(),/touch edge-to-edge/);
  await pressOn(1,'ArrowRight');assert.match(await page.locator('#selectionStatus').innerText(),/C Major found/);
  await page.evaluate(()=>{state.pieces[0].front='F';render();});
  assert.equal(await page.locator('#play').isDisabled(),true);assert.match(await page.locator('#selectionStatus').innerText(),/do not make a major or minor/);
});
test('zero-equivalent flip shows same-note cost, keeps selection, and advances exactly once',async()=>{
  await select(1);await page.evaluate(()=>{state.semitones=-12;render();});
  assert.match(await page.locator('#flipPreview').innerText(),/Flip C → C · 2 MP · Same note/);
  await page.locator('#flip').click();assert.match((await piece(1)).note,/Note C,/);
  assert.equal((await piece(1)).selected,true);assert.equal((await boardState()).mp,10);
  assert.equal(await page.locator('#semitoneValue').innerText(),'-1');assert.match(await message(),/Same note/);
  await page.locator('#undo').click();assert.equal((await boardState()).mp,12);assert.equal(await page.locator('#semitoneValue').innerText(),'-12');
});
test('animated flip locks repeated input and preserves focus and selection',async()=>{
  await page.emulateMedia({reducedMotion:'no-preference'});await select(1);
  await tile(1).dblclick({delay:70});await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('#flip').isDisabled(),true);
  await page.waitForFunction(()=>flipping===null);
  assert.equal((await boardState()).mp,10);assert.equal((await piece(1)).x,1);assert.equal((await piece(1)).selected,true);
  assert.equal(await focusId(),'1');assert.equal((await boardState()).history.length,1);
});
test('unselected full-board chord stays available at zero MP; real game-over can be undone',async()=>{
  await page.evaluate(()=>{state.pieces=Array.from({length:36},(_,i)=>makePiece(i+1,{x:i%6,y:Math.floor(i/6)},i===1?'E':i===2?'G':'C'));state.mp=0;state.difficulty='advanced';state.selected=[];checkSurvival();render();});
  assert.equal(await page.evaluate(()=>state.gameOver),false);
  for(const id of [1,2,3])await select(id);assert.equal(await page.locator('#play').isDisabled(),false);
  await page.evaluate(()=>{state.pieces.forEach(p=>p.front='C');state.selected=[];state.mp=2;state.semitones=0;activate(1);render();});
  await page.locator('#flip').click();assert.equal(await page.evaluate(()=>state.gameOver),true);
  assert.equal(await page.locator('#undo').isDisabled(),false);await page.locator('#undo').click();
  assert.equal(await page.evaluate(()=>state.gameOver),false);assert.equal((await boardState()).mp,2);
});
test('phone layout keeps feedback and all controls inside the visible viewport',async()=>{
  for(const viewport of [{width:390,height:844},{width:320,height:568}]){
    await page.setViewportSize(viewport);await select(1);
    const fit=await page.evaluate(()=>{
      const rect=id=>{const r=document.getElementById(id).getBoundingClientRect();return {x:r.left,y:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};
      return {board:rect('board'),guidance:rect('guidance'),controls:rect('reset'),scroll:document.documentElement.scrollWidth,width:innerWidth,height:innerHeight};
    });
    assert.ok(fit.scroll<=fit.width);assert.ok(fit.board.width>75);assert.ok(fit.guidance.bottom<=fit.height);assert.ok(fit.controls.bottom<=fit.height);
  }
});
