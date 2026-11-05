// Fast unit checks using a deliberately small DOM double. Browser behavior is
// covered separately by game.browser.test.cjs; these are not browser tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
function game() {
  const timers = new Map();let nextTimer=1,document;
  class Element {
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.style={};this.attributes={};this.listeners={};this.captured=new Set();this.className='';this.textContent='';}
    append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}}
    replaceChildren(...nodes){for(const n of this.children)n.parentElement=null;this.children=[];this.append(...nodes);}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    dispatch(type,options={}){const event={target:this,preventDefault(){this.defaultPrevented=true;},...options};for(const fn of this.listeners[type]||[])fn(event);return event;}
    setAttribute(k,v){this.attributes[k]=String(v);}
    contains(n){return n===this||this.children.some(c=>c.contains(n));}
    closest(selector){if(selector==='.tile'&&this.className.split(' ').includes('tile'))return this;return this.parentElement?.closest(selector)||null;}
    querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...n.querySelectorAll('*')]);if(selector==='*')return all;return all.filter(n=>n.className.split(' ').includes(selector.slice(1)));}
    querySelector(selector){const id=selector.match(/data-piece-id="(\d+)"/)[1];return this.querySelectorAll('.tile').find(n=>String(n.dataset.pieceId)===id)||null;}
    focus(){document.activeElement=this;}
    setPointerCapture(id){this.captured.add(id);}
    hasPointerCapture(id){return this.captured.has(id);}
    releasePointerCapture(id){this.captured.delete(id);this.dispatch('lostpointercapture',{pointerId:id});}
    getBoundingClientRect(){return {left:this.parentElement?this.parentElement.children.indexOf(this)*100:0,width:600};}
  }
  const elements=Object.fromEntries(['board','message','mp','score','energyFill','status','history','play','join','flip','unjoin','left','right','up','down','undo','reset'].map(id=>[id,new Element()]));
  document=new Element('document');document.activeElement=new Element('body');document.getElementById=id=>elements[id];document.createElement=tag=>new Element(tag);
  const window=new Element('window');
  const scope=vm.createContext({document,window,structuredClone,Date,console,setTimeout(fn){const id=nextTimer++;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
  const html=readFileSync(join(__dirname,'..','index.html'),'utf8');
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1],scope);
  const run=code=>vm.runInContext(code,scope),snapshot=()=>JSON.parse(run('JSON.stringify({state,history,undoStack})'));
  const tile=id=>elements.board.querySelector(`[data-piece-id="${id}"]`);
  const pointer=(type,id=1,options={})=>elements.board.dispatch(type,{target:tile(id)||elements.board,pointerId:1,isPrimary:true,button:0,clientX:100,clientY:100,...options});
  const key=(name,id)=>document.dispatch('keydown',{target:id?tile(id):document.activeElement,key:name});
  return {run,snapshot,tile,pointer,key,elements,document,window,timers,hold(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());}};
}
test('drag captures on stable board, releases outside tile, costs once, and undo restores',()=>{
  const g=game(),before=g.snapshot();g.pointer('pointerdown');assert.ok(g.elements.board.hasPointerCapture(1));
  g.pointer('pointerup',1,{target:g.elements.board,clientX:200});let s=g.snapshot();
  assert.equal(s.state.pieces[0].x,2);assert.equal(s.state.mp,11);assert.equal(s.undoStack.length,1);
  g.elements.undo.onclick();assert.deepEqual(g.snapshot().state,before.state);
});
test('moving cancels hold and returning drag to origin does not select',()=>{
  const g=game(),before=g.snapshot();g.pointer('pointerdown');g.pointer('pointermove',1,{clientX:200});g.hold();
  g.pointer('pointerup');assert.deepEqual(g.snapshot(),before);
});
test('long hold survives rendering and release has no movement/flip',()=>{
  const g=game();g.pointer('pointerdown',2);g.hold();g.pointer('pointerup',2,{clientX:200});
  const s=g.snapshot();assert.deepEqual(s.state.selected,[2,3]);assert.equal(s.state.mp,12);assert.equal(s.history.length,0);
});
test('cancel, reset, blur, and lost capture remove hold timers and gestures',()=>{
  for(const type of ['pointercancel','reset','blur','lostpointercapture']){
    const g=game(),before=g.snapshot();g.pointer('pointerdown');
    if(type==='reset')g.elements.reset.onclick();else if(type==='blur')g.window.dispatch('blur');else g.pointer(type);
    g.hold();g.pointer('pointerup',1,{clientX:200});assert.deepEqual(g.snapshot(),before);
  }
});
test('secondary pointers and right mouse button cannot alter active gesture',()=>{
  const g=game();g.pointer('pointerdown',1,{button:2});g.pointer('pointerup');assert.equal(g.snapshot().state.mp,12);
  g.pointer('pointerdown');g.pointer('pointerdown',2,{pointerId:2,isPrimary:false});
  g.pointer('pointerup',2,{pointerId:2,clientX:300});assert.equal(g.snapshot().state.mp,12);
  g.pointer('pointerup',1,{clientX:200});assert.equal(g.snapshot().state.pieces[0].x,2);
});
test('keyboard focused move retains focus and selected fallback works',()=>{
  const g=game();g.tile(1).focus();let e=g.key('ArrowRight',1);assert.equal(e.defaultPrevented,true);
  assert.equal(g.snapshot().state.pieces[0].x,2);assert.equal(g.document.activeElement.dataset.pieceId,1);
  g.run('select(1)');g.elements.up.focus();g.key('ArrowUp');assert.equal(g.snapshot().state.pieces[0].y,1);
  assert.equal(g.document.activeElement,g.elements.up);
});
test('blocked movement preserves MP, undo, history; modified keys are ignored',()=>{
  const g=game();g.key('ArrowRight',1);let before=g.snapshot();g.key('ArrowRight',1);assert.deepEqual(g.snapshot(),before);
  g.document.dispatch('keydown',{target:g.tile(1),key:'ArrowUp',ctrlKey:true});assert.deepEqual(g.snapshot(),before);
  g.run('state.mp=0');before=g.snapshot();g.key('ArrowUp',1);assert.deepEqual(g.snapshot(),before);
});
test('non-goal preview leaves state, score, MP, history, and undo untouched',()=>{
  const g=game();g.run('flip(1);flip(2);flip(3);move(1,1,0);state.selected=[1,2,3];render()');
  assert.equal(g.elements.play.textContent,'PREVIEW CHORD');const before=g.snapshot();
  g.run('play();play();play()');assert.deepEqual(g.snapshot(),before);
  assert.match(g.elements.message.textContent,/E Minor.*goal is C major.*unchanged/);
  for(let i=0;i<4;i++)g.elements.undo.onclick();g.run('move(1,1,0);state.selected=[1,2,3];play()');assert.equal(g.snapshot().state.completed,true);assert.equal(g.snapshot().state.score,100);
});
test('goal completion, formation bonus, MP costs, and undo preserve original rules',()=>{
  const g=game();g.run('move(1,1,0);state.selected=[1,2,3];join();move(2,0,-1)');
  const before=g.snapshot();assert.equal(before.state.mp,8);g.run('play()');let s=g.snapshot();
  assert.equal(s.state.mp,11);assert.equal(s.state.score,125);assert.equal(s.state.pieces.length,2);assert.equal(s.state.completed,true);
  g.run('move(4,-1,0)');assert.deepEqual(g.snapshot(),s);g.elements.undo.onclick();assert.deepEqual(g.snapshot().state,before.state);
  g.run('unjoin()');assert.equal(g.snapshot().state.mp,6);assert.ok(g.snapshot().state.pieces.every(p=>p.group===null));
});
