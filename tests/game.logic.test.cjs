// Deliberately small DOM double for game rules. Real pointer/layout behavior is tested in Chromium.
const { test }=require('node:test');
const assert=require('node:assert/strict');
const fixture=require('./game.fixture.cjs');
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
function game(){
  const timers=new Map();let nextTimer=1,document;
  class Element{
    constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.style={setProperty(){}};this.attributes={};this.listeners={};this.captured=new Set();this.className='';this.textContent='';this.classList={toggle:(name,on)=>{const parts=new Set(this.className.split(' ').filter(Boolean));if(on===undefined)on=!parts.has(name);on?parts.add(name):parts.delete(name);this.className=[...parts].join(' ');},add:name=>this.classList.toggle(name,true),remove:name=>this.classList.toggle(name,false)};this.firstChild={};}
    append(...nodes){for(const n of nodes){n.parentElement=this;this.children.push(n);}}
    replaceChildren(...nodes){for(const n of this.children)n.parentElement=null;this.children=[];this.append(...nodes);}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    dispatch(type,options={}){const event={target:this,preventDefault(){this.defaultPrevented=true;},...options};for(const fn of this.listeners[type]||[])fn(event);return event;}
    setAttribute(k,v){this.attributes[k]=String(v);}
    contains(n){return n===this||this.children.some(c=>c.contains(n));}
    closest(selector){if(selector==='.tile'&&this.className.split(' ').includes('tile'))return this;return this.parentElement?.closest(selector)||null;}
    querySelectorAll(selector){const all=this.children.flatMap(n=>[n,...n.querySelectorAll('*')]);if(selector==='*')return all;return all.filter(n=>n.className.split(' ').includes(selector.slice(1)));}
    querySelector(selector){const match=selector.match(/data-piece-id="(\d+)"/);return match?this.querySelectorAll('.tile').find(n=>String(n.dataset.pieceId)===match[1])||null:this.querySelectorAll(selector)[0]||null;}
    focus(){document.activeElement=this;this.dispatch('focus');}
    setPointerCapture(id){this.captured.add(id);}
    hasPointerCapture(id){return this.captured.has(id);}
    releasePointerCapture(id){this.captured.delete(id);this.dispatch('lostpointercapture',{pointerId:id});}
    getBoundingClientRect(){return {left:this.parentElement?this.parentElement.children.indexOf(this)*100:0,width:600};}
  }
  const elements=Object.fromEntries(['board','message','mp','score','energyFill','status','history','play','join','flip','unjoin','left','right','up','down','undo','reset','difficulty','showValues','semitoneValue','semitoneEquivalent','semitoneForecast','selectionStatus','flipPreview'].map(id=>[id,new Element()]));
  document=new Element('document');document.activeElement=new Element('body');document.getElementById=id=>elements[id];document.createElement=tag=>new Element(tag);document.querySelector=()=>null;
  const window=new Element('window');window.matchMedia=()=>({matches:true});
  const scope=vm.createContext({document,window,structuredClone,Date,console,setTimeout(fn){const id=nextTimer++;timers.set(id,fn);return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext(script,scope);const run=c=>vm.runInContext(c,scope);
  run('state='+JSON.stringify(fixture())+';render()');
  const tile=id=>elements.board.querySelector(`[data-piece-id="${id}"]`);
  const pointer=(type,id=1,options={})=>elements.board.dispatch(type,{target:tile(id)||elements.board,pointerId:1,isPrimary:true,button:0,clientX:100,clientY:100,...options});
  const snapshot=()=>JSON.parse(run('JSON.stringify({state,undoStack,history})'));
  const key=(name,id)=>document.dispatch('keydown',{target:id?tile(id):document.activeElement,key:name});
  return {run,snapshot,elements,tile,pointer,key,document,window,timers,flush(){const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());}};
}
test('drag captures stable board, releases outside tile, spends once, and undo restores',()=>{
  const g=game(),before=g.snapshot();g.pointer('pointerdown');assert.ok(g.elements.board.hasPointerCapture(1));
  g.pointer('pointerup',1,{target:g.elements.board,clientX:200});const s=g.snapshot();
  assert.equal(s.state.pieces[0].x,2);assert.equal(s.state.mp,11);assert.equal(s.undoStack.length,1);
  g.elements.undo.onclick();assert.deepEqual(g.snapshot(),before);
});
test('moving cancels hold and returning drag to origin does not select or spend',()=>{
  const g=game(),before=g.snapshot();g.pointer('pointerdown');g.pointer('pointermove',1,{clientX:200});g.flush();
  g.pointer('pointerup');assert.deepEqual(g.snapshot(),before);
});
test('long hold selects touching notes without moving or suggesting JOIN',()=>{
  const g=game();g.pointer('pointerdown',2);g.flush();g.pointer('pointerup',2,{clientX:200});
  assert.deepEqual(g.snapshot().state.selected,[2,3]);assert.equal(g.snapshot().state.mp,12);
  assert.match(g.elements.message.textContent,/JOIN is optional/);
});
test('cancel, blur, and lost capture remove hold timers and gestures',()=>{
  for(const type of ['pointercancel','blur','lostpointercapture']){
    const g=game(),before=g.snapshot();g.pointer('pointerdown');
    if(type==='blur')g.window.dispatch('blur');else g.pointer(type);
    g.flush();g.pointer('pointerup',1,{clientX:200});assert.deepEqual(g.snapshot(),before);
  }
});
test('reset interrupts hold and creates a fresh random opening, with no delayed move',()=>{
  const g=game();g.pointer('pointerdown');g.elements.reset.onclick();const after=g.snapshot();
  g.flush();g.pointer('pointerup',1,{clientX:200});assert.deepEqual(g.snapshot(),after);
  assert.equal(after.state.mp,12);assert.equal(after.history.length,0);assert.equal(after.state.pieces.length,5);
});
test('deferred lost capture cannot leave a pending hold active',()=>{
  const g=game(),before=g.snapshot();g.pointer('pointerdown');g.elements.board.captured.clear();
  g.flush();g.pointer('pointerup');assert.deepEqual(g.snapshot(),before);
});
test('secondary pointers and right mouse button cannot alter an active gesture',()=>{
  const g=game();g.pointer('pointerdown',1,{button:2});g.pointer('pointerup');assert.equal(g.snapshot().state.mp,12);
  g.pointer('pointerdown');g.pointer('pointerdown',2,{pointerId:2,isPrimary:false});
  g.pointer('pointerup',2,{pointerId:2,clientX:300});assert.equal(g.snapshot().state.mp,12);
  g.pointer('pointerup',1,{clientX:200});assert.equal(g.snapshot().state.pieces[0].x,2);
});
test('keyboard and buttons move the same visible active note with multiple selected',()=>{
  const g=game();g.run('select(1);select(2);select(3)');g.key('ArrowRight',3);g.elements.right.onclick();
  const s=g.snapshot().state;assert.equal(s.pieces[2].x,5);assert.equal(s.pieces[1].x,3);assert.equal(s.pieces[0].x,1);
  assert.deepEqual(s.selected,[1,2,3]);assert.equal(s.activeId,3);assert.match(g.tile(3).className,/active/);
  assert.match(g.elements.flipPreview.textContent,/ACTIVE G/);
});
test('blocked movement gives specific reasons, costs nothing, ignores modified keys',()=>{
  const g=game();g.key('ArrowRight',1);const before=g.snapshot();g.key('ArrowRight',1);
  assert.deepEqual(g.snapshot(),before);assert.match(g.elements.message.textContent,/another note/);
  g.document.dispatch('keydown',{target:g.tile(1),key:'ArrowUp',ctrlKey:true});assert.deepEqual(g.snapshot(),before);
  g.run('state.mp=0');const empty=g.snapshot();g.key('ArrowUp',1);assert.deepEqual(g.snapshot(),empty);
  assert.match(g.elements.message.textContent,/Not enough MP/);
});
test('double tap preserves prior selected or unselected state and flips once',()=>{
  for(const selected of [[],[1],[1,2]]){
    const g=game();g.run('state.selected='+JSON.stringify(selected)+';render()');
    for(let i=0;i<2;i++){g.pointer('pointerdown');g.pointer('pointerup');}
    const s=g.snapshot();assert.deepEqual(s.state.selected,selected);assert.equal(s.state.pieces[0].front,'C♯');
    assert.equal(s.state.mp,10);assert.equal(s.undoStack.length,1);
  }
});
test('a failed double tap still preserves selection and spends no energy',()=>{
  const g=game();g.run('state.mp=1;state.selected=[1];render()');
  for(let i=0;i<2;i++){g.pointer('pointerdown');g.pointer('pointerup');}
  assert.deepEqual(g.snapshot().state.selected,[1]);assert.equal(g.snapshot().state.mp,1);assert.equal(g.snapshot().history.length,0);
});
test('selection feedback explains count, connectivity and invalid notes, clears stale events',()=>{
  const g=game();assert.match(g.elements.selectionStatus.textContent,/Choose 3/);
  g.run('message("Previous chord found!");select(1)');assert.equal(g.elements.message.textContent,'');
  g.run('select(2);select(3)');assert.match(g.elements.selectionStatus.textContent,/touch edge-to-edge/);
  g.run('move(1,1,0)');assert.match(g.elements.selectionStatus.textContent,/C Major found/);
  g.run('state.pieces[0].front="F";render()');assert.match(g.elements.selectionStatus.textContent,/do not make a major or minor/);
  g.run('select(4)');assert.match(g.elements.selectionStatus.textContent,/UNJOIN \(2 MP\)/);
});
test('no-op flip previews cost and same-note result, advances forecast, undo restores',()=>{
  for(const shift of [-12,0,12]){
    const g=game();g.run('state.semitones='+shift+';render()');const before=g.snapshot();
    assert.match(g.elements.flipPreview.textContent,/Flip C → C · 2 MP · Same note/);
    g.run('flip(1)');assert.equal(g.snapshot().state.pieces[0].front,'C');assert.equal(g.snapshot().state.mp,10);
    assert.equal(g.snapshot().state.semitones,-1);assert.match(g.elements.message.textContent,/Same note; the shift advanced/);
    g.elements.undo.onclick();assert.deepEqual(g.snapshot(),before);
  }
});
test('any major or minor chord scores, refills three random notes and clears selection',()=>{
  for(const notes of [['C','E','G'],['E','G','B']]){
    const g=game();g.run('move(1,1,0);state.selected=[1,2,3];state.pieces.slice(0,3).forEach((p,i)=>p.front='+JSON.stringify(notes)+'[i]);render()');
    const before=g.snapshot();assert.equal(g.elements.play.disabled,false);g.run('play();play()');g.flush();
    const s=g.snapshot();assert.equal(s.state.mp,18);assert.equal(s.state.score,100);assert.equal(s.state.pieces.length,5);
    assert.equal(s.state.completed,false);assert.deepEqual(s.state.selected,[]);assert.equal(s.state.chordsPlayed,1);
    assert.equal(s.state.nextPiece,9);assert.equal(new Set(s.state.pieces.map(p=>p.x+','+p.y)).size,5);
    g.elements.undo.onclick();assert.deepEqual(g.snapshot(),before);
  }
});
test('joined formation moves together, earns bonus, unjoin costs 2 MP, undo restores',()=>{
  const g=game();g.run('move(1,1,0);state.selected=[1,2,3];join();move(2,0,-1)');
  const before=g.snapshot();assert.equal(before.state.mp,8);g.run('play()');g.flush();
  assert.equal(g.snapshot().state.score,125);assert.equal(g.snapshot().state.mp,18);
  g.elements.undo.onclick();assert.deepEqual(g.snapshot(),before);g.run('unjoin()');
  assert.equal(g.snapshot().state.mp,6);assert.ok(g.snapshot().state.pieces.every(p=>p.group===null));
});
test('1000 random openings contain a connected playable triad without overlap',()=>{
  const g=game();for(let i=0;i<1000;i++){
    g.run('state=fresh()');assert.equal(g.run('Boolean(availableChord())'),true);
    assert.equal(g.run('new Set(state.pieces.map(key)).size'),5);
  }
});
test('full board with an unselected chord remains playable even at zero MP',()=>{
  const g=game();g.run('state.pieces=Array.from({length:36},(_,i)=>makePiece(i+1,{x:i%6,y:Math.floor(i/6)},i===1?"E":i===2?"G":"C"));state.mp=0;state.difficulty="advanced";state.selected=[];checkSurvival();render()');
  assert.equal(g.snapshot().state.gameOver,false);assert.equal(g.snapshot().state.mp,0);
  g.run('state.selected=[1,2,3];render()');assert.equal(g.elements.play.disabled,false);
});
test('a chord made with the last MP can play without an unnecessary recovery spawn',()=>{
  const g=game();g.run('state.mp=1;move(1,1,0)');
  assert.equal(g.snapshot().state.mp,0);assert.equal(g.snapshot().state.pieces.length,5);
  assert.equal(g.snapshot().state.recoveryCount,0);assert.equal(g.snapshot().state.rescueUsed,false);
  assert.equal(g.snapshot().state.gameOver,false);assert.equal(g.run('Boolean(availableChord())'),true);
  g.run('state.selected=[1,2,3];play()');g.flush();
  assert.equal(g.snapshot().state.score,100);assert.equal(g.snapshot().state.mp,18);
});
test('the recovery lesson setup has no playable chord and recovery copies an existing note',()=>{
  const g=game();g.run('state.pieces=[makePiece(2,{x:2,y:0},"E"),makePiece(3,{x:2,y:1},"G"),makePiece(4,{x:0,y:2},"D"),makePiece(5,{x:0,y:0},"C")];state.mp=1;state.activeId=null;render()');
  assert.equal(g.run('availableChord()'),null);g.run('move(4,1,0)');
  const s=g.snapshot().state;assert.equal(s.mp,3);assert.equal(s.recoveryCount,1);
  assert.ok(['C','D','E','G'].includes(s.pieces.find(p=>p.recovery).front));
  assert.equal(new Set(s.pieces.map(p=>p.x+','+p.y)).size,5);
});
test('a locked joined formation with enough MP to unjoin does not end the game',()=>{
  const g=game();g.run('state.difficulty="advanced";state.pieces=[...Array.from({length:6},(_,x)=>makePiece(x+1,{x,y:0},"C")),...Array.from({length:5},(_,i)=>makePiece(i+7,{x:0,y:i+1},"D"))];state.selected=state.pieces.map(p=>p.id);join()');
  assert.equal(g.run('canMove()'),false);assert.equal(g.run('canUnjoin()'),true);assert.equal(g.snapshot().state.gameOver,false);
  g.run('unjoin()');assert.equal(g.run('canMove()'),true);
});
test('full board can still flip with energy; actual loss permits undo',()=>{
  const g=game();g.run('state.difficulty="advanced";state.pieces=Array.from({length:36},(_,i)=>makePiece(i+1,{x:i%6,y:Math.floor(i/6)},"C"));state.mp=2;state.semitones=0;checkSurvival();render()');
  assert.equal(g.snapshot().state.gameOver,false);const before=g.snapshot();g.run('flip(1)');
  assert.equal(g.snapshot().state.gameOver,true);assert.equal(g.elements.undo.disabled,false);
  g.elements.undo.onclick();assert.deepEqual(g.snapshot(),before);
});
test('energy depletion adds a charged note, and beginner board-lock rescue is once only',()=>{
  const g=game();g.run('state.mp=1;move(1,0,-1)');
  assert.equal(g.snapshot().state.mp,3);assert.equal(g.snapshot().state.recoveryCount,1);assert.equal(g.snapshot().state.pieces.length,6);
  g.run('state.pieces=Array.from({length:36},(_,i)=>makePiece(i+1,{x:i%6,y:Math.floor(i/6)},"C"));state.mp=0;checkSurvival()');
  assert.equal(g.snapshot().state.rescueUsed,true);assert.equal(g.snapshot().state.mp,3);assert.equal(g.snapshot().state.gameOver,false);
  g.run('state.mp=0;checkSurvival();render()');assert.equal(g.snapshot().state.gameOver,true);
});
test('a chord subset of a larger joined formation is not a playable escape',()=>{
  const g=game();g.run('move(1,1,0);state.pieces[3].x=4;state.pieces[3].y=3;state.selected=[1,2,3,4];join();state.mp=0;state.selected=[1,2,3]');
  assert.equal(g.run('detect()'),null);assert.equal(g.run('availableChord()'),null);
});
