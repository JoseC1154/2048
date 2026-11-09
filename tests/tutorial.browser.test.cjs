const { test, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { chromium } = require('playwright');
let server, browser, context, page, url, errors;
const t = suffix => page.locator('#tutorial-' + suffix);
const note = id => page.locator(`[data-tutorial-note="${id}"]`);
const liveState = () => page.evaluate(() => JSON.stringify({ state, undoStack, history, celebration, flipping }));
const open = () => page.locator('#tutorial-open').click();
async function choose(ids) { for (const id of ids) await note(id).click(); }
async function next() { await t('next').click(); }
async function first() { await choose([1,2,3]); await t('play').click(); }
async function second() { await choose([1]); await t('move').click(); }
async function third() { await choose([1]); await t('flip').click(); }
async function fourth() { await t('play').click(); await choose([11,12,13]); await t('play').click(); }
async function fifth() { await choose([4]); await t('move').click(); await choose([1,2,3]); await t('play').click(); }
async function reach(index) {
  await open();
  for (let i=0; i<index; i++) { await [first,second,third,fourth][i](); await next(); }
}
before(async () => {
  server = createServer((req,res) => {
    const name = req.url.split('?')[0].slice(1) || 'index.html';
    if (!['index.html','tutorial.js','tutorial.css'].includes(name)) { res.writeHead(404); return res.end(); }
    res.setHeader('Content-Type', name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : 'text/html');
    res.end(readFileSync(join(__dirname,'..',name)));
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  url = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless:true, ...(process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH} : {}) });
});
after(async()=>{await browser?.close();await new Promise(r=>server?.close(r));});
beforeEach(async()=>{
  context=await browser.newContext({viewport:{width:390,height:844}});page=await context.newPage();errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
});
afterEach(async()=>{await context.close();assert.deepEqual(errors,[],'No uncaught browser errors');});

test('complete all five lessons, replay, and return without changing a live run',async()=>{
  // Establish nontrivial game/Undo history before opening the separate lesson.
  await page.evaluate(()=>{state.score=300;state.mp=8;state.selected=[state.pieces[0].id];record('Existing action');render();});
  const original=await liveState();
  await open();
  assert.match(await t('feedback').textContent(),/Selected 0 of 3/);
  assert.equal(await t('play').isDisabled(),true);
  await first();assert.match(await t('feedback').textContent(),/100 practice points/);
  await next();await second();assert.match(await t('energy').textContent(),/11 \/ 18/);
  await next();await third();assert.match(await t('feedback').textContent(),/B → C/);assert.match(await t('energy').textContent(),/10 \/ 18/);
  await next();await t('play').click();assert.equal(await page.locator('.tutorial-marker').filter({hasText:'NEW'}).count(),3);
  assert.match(await t('description').textContent(),/real refills are random/);
  await choose([11,12,13]);await t('play').click();await next();
  assert.match(await note(5).getAttribute('aria-label'),/^C,/);
  await choose([4]);await t('move').click();assert.match(await t('feedback').textContent(),/1 → 0 → 3 MP/);assert.match(await note(1).getAttribute('aria-label'),/charged/);
  await choose([5]);assert.match(await t('feedback').textContent(),/CHARGED C/);assert.equal(await note(5).getAttribute('aria-pressed'),'false');
  await choose([1,2,3]);await t('play').click();assert.match(await t('energy').textContent(),/18 \/ 18/);
  assert.equal(await t('next').textContent(),'Return to game');assert.equal(await t('retry').textContent(),'Replay tutorial');
  await t('retry').click();assert.match(await t('progress').textContent(),/Lesson 1 of 5/);
  await t('skip').click();assert.equal(await liveState(),original);assert.equal(await page.locator('#forge-tutorial').evaluate(d=>d.open),false);
  assert.equal(await page.locator('#tutorial-open').evaluate(e=>e===document.activeElement),true);
  await open();assert.match(await t('progress').textContent(),/Lesson 1 of 5/);await page.keyboard.press('Escape');assert.equal(await liveState(),original);
});

test('keyboard selection, wrong arrows, restart and Escape never reach the live game',async()=>{
  const original=await liveState();await open();
  for(const id of [1,2,3]) { await note(id).focus();await page.keyboard.press(id===2?'Space':'Enter'); }
  await t('play').click();await next();
  await page.keyboard.press('ArrowRight');assert.match(await t('feedback').textContent(),/Tap C first/);
  await note(1).focus();await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowUp');assert.match(await t('feedback').textContent(),/No energy spent/);
  assert.match(await t('energy').textContent(),/12 \/ 18/);
  await page.keyboard.press('ArrowRight');assert.match(await t('energy').textContent(),/11 \/ 18/);
  await page.keyboard.press('ArrowRight');assert.match(await t('energy').textContent(),/11 \/ 18/);
  await t('retry').click();assert.match(await t('energy').textContent(),/12 \/ 18/);assert.equal(await note(1).getAttribute('aria-pressed'),'false');
  await page.keyboard.press('Escape');assert.equal(await liveState(),original);
});

test('skip at every lesson, reopen, repeated play, and final return keep game state',async()=>{
  const original=await liveState();
  for(let lesson=0;lesson<5;lesson++) { await reach(lesson);await t('skip').click();assert.equal(await liveState(),original); }
  await reach(4);await fifth();
  await page.evaluate(()=>document.getElementById('tutorial-play').click());
  assert.match(await t('energy').textContent(),/18 \/ 18/);
  await next();assert.equal(await page.locator('#forge-tutorial').evaluate(d=>d.open),false);assert.equal(await liveState(),original);
});

test('dragging right completes exactly one move; wrong drag costs nothing',async()=>{
  await reach(1);
  const center=async el=>{const r=await el.boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2};};
  let a=await center(note(1));
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x,a.y-55,{steps:5});await page.mouse.up();
  assert.match(await t('feedback').textContent(),/No energy spent/);assert.match(await t('energy').textContent(),/12 \/ 18/);
  a=await center(note(1));const dest=await center(page.locator('.tutorial-target'));
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(dest.x,dest.y,{steps:5});await page.mouse.up();
  assert.match(await t('energy').textContent(),/11 \/ 18/);assert.equal(await t('next').isDisabled(),false);
});

test('mobile touch flow, short viewport scrolling and focus containment',async()=>{
  await context.close();context=await browser.newContext({viewport:{width:320,height:568},hasTouch:true,isMobile:true,deviceScaleFactor:2});page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(url);
  await page.locator('#tutorial-open').tap();
  for(const id of [1,2,3])await note(id).tap();await t('play').tap();await t('next').tap();await note(1).tap();await t('move').tap();
  assert.match(await t('energy').textContent(),/11 \/ 18/);
  const metrics=await page.evaluate(()=>{const d=document.querySelector('#forge-tutorial'),body=d.querySelector('.tutorial-body');return {width:d.getBoundingClientRect().width,right:d.getBoundingClientRect().right,viewport:innerWidth,bodyScrollable:body.scrollHeight>body.clientHeight,footerVisible:d.querySelector('.tutorial-footer').getBoundingClientRect().bottom<=innerHeight};});
  assert.ok(metrics.right<=metrics.viewport);assert.ok(metrics.width<=320);assert.ok(metrics.bodyScrollable);assert.ok(metrics.footerVisible);
  for(const key of ['Tab','Shift+Tab'])for(let i=0;i<15;i++){await page.keyboard.press(key);assert.equal(await page.evaluate(()=>document.querySelector('#forge-tutorial').contains(document.activeElement)),true);}
  await page.screenshot({path:join(__dirname,'..','tutorial-mobile.png')});
  await t('skip').tap();assert.equal(await page.locator('#forge-tutorial').evaluate(d=>d.open),false);
});

test('tutorial does not open during an unfinished live action',async()=>{
  await page.evaluate(()=>{celebration={ids:[],name:'Test'};});
  await open();assert.equal(await page.locator('#forge-tutorial').evaluate(d=>d.open),false);
  assert.match(await page.locator('#message').textContent(),/Let the current action finish/);
  await page.evaluate(()=>{celebration=null;});await open();assert.equal(await page.locator('#forge-tutorial').evaluate(d=>d.open),true);
});

test('reduced motion has a usable complete path',async()=>{
  await page.emulateMedia({reducedMotion:'reduce'});const original=await liveState();await reach(4);await fifth();await next();assert.equal(await liveState(),original);
});
