const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
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
const reset = () => page.locator('#reset').click();
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
async function minorSetup() {
  for(const id of [1,2,3]){await select(id);await page.locator('#flip').click();await select(id);}
  await goalSetup();
}
before(async()=>{
  server=createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(readFileSync(join(__dirname,'..','index.html')));});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  url=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
beforeEach(async()=>{
  context=await browser.newContext({viewport:{width:1000,height:1000}});
  page=await context.newPage();errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);
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
    await page.waitForTimeout(500);await page.mouse.move(p.x+100,p.y);await page.mouse.up();
    assert.deepEqual(await boardState(),before);
  }
});
test('right mouse button is ignored; double tap flips once without dragging',async()=>{
  const before=await boardState();await tile(1).click({button:'right'});assert.deepEqual(await boardState(),before);
  await tile(1).dblclick({delay:70});assert.equal((await piece(1)).note,'Note E');
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
test('collision, boundary, and exhausted MP moves do not spend extra MP',async()=>{
  await pressOn(1,'ArrowRight');const collision=await boardState();await page.keyboard.press('ArrowRight');
  assert.deepEqual(await boardState(),collision);assert.match(await message(),/Blocked/);
  await reset();await pressOn(5,'ArrowLeft');assert.equal((await boardState()).mp,12);
  await tile(1).focus();for(let i=0;i<12;i++)await page.keyboard.press(i%2?'ArrowDown':'ArrowUp');
  assert.equal((await boardState()).mp,0);const empty=await boardState();await page.keyboard.press('ArrowRight');
  assert.deepEqual(await boardState(),empty);
});
test('modified keys and editable fields keep their own keyboard behavior',async()=>{
  await select(1);const before=await boardState();await page.keyboard.press('Control+ArrowRight');
  assert.deepEqual(await boardState(),before);
  await page.evaluate(()=>{const input=document.createElement('input');input.value='abc';document.body.append(input);input.focus();});
  await page.keyboard.press('ArrowLeft');assert.deepEqual(await boardState(),before);
});
test('E minor preview preserves every game field and can still become C major',async()=>{
  await minorSetup();assert.equal(await page.locator('#play').innerText(),'PREVIEW CHORD');
  const before=await boardState();
  for(let i=0;i<3;i++){await page.locator('#play').click();assert.deepEqual(await boardState(),before);}
  assert.match(await message(),/E Minor.*goal is C major.*unchanged/);
  // Undo still targets the last actual move, never a preview.
  await page.locator('#undo').click();assert.equal((await piece(1)).x,1);assert.equal((await boardState()).mp,6);
  await reset();await minorSetup();await page.locator('#play').click();
  for(let i=0;i<4;i++)await page.locator('#undo').click();
  for(const p of (await boardState()).pieces.filter(p=>p.selected))await select(p.id);
  await goalSetup();
  assert.equal(await page.locator('#play').innerText(),'PLAY CHORD');await page.locator('#play').click();
  assert.match(await message(),/Level complete/);assert.equal((await boardState()).score,100);
});
test('goal win consumes notes, restores MP, blocks further moves, and is undoable',async()=>{
  await goalSetup();const before=await boardState();await page.locator('#play').click();
  let s=await boardState();assert.equal(s.pieces.length,2);assert.equal(s.mp,14);assert.equal(s.score,100);
  await pressOn(4,'ArrowLeft');assert.deepEqual(await boardState(),s);
  await page.locator('#undo').click();assert.deepEqual(await boardState(),before);
  await reset();s=await boardState();assert.equal(s.pieces.length,5);assert.equal(s.mp,12);assert.equal(s.score,0);assert.equal(s.history.length,0);
});
test('joined formation movement, bonus, unjoin cost, and undo retain original rules',async()=>{
  await goalSetup();await page.locator('#join').click();assert.equal((await boardState()).mp,10);
  await pressOn(2,'ArrowUp');let s=await boardState();assert.equal(s.mp,8);
  assert.equal((await piece(1)).y,1);assert.equal((await piece(2)).y,1);assert.equal((await piece(3)).y,2);
  await page.locator('#play').click();s=await boardState();assert.equal(s.score,125);assert.equal(s.mp,11);
  await page.locator('#undo').click();await page.locator('#unjoin').click();s=await boardState();
  assert.equal(s.mp,6);assert.equal(s.pieces.some(p=>p.joined),false);
  await page.locator('#undo').click();assert.equal((await boardState()).pieces.filter(p=>p.joined).length,3);
});
test('touch tap, drag, hold, and cancellation work at a mobile viewport',async()=>{
  await context.close();context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:2});
  page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
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
