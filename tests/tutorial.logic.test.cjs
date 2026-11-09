// Deterministic event/state tests with a minimal DOM double. These do not
// substitute for the real focus, touch, layout and browser tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
function lessonApp() {
  let document;
  class Element {
    constructor(tag='div') { this.tagName=tag;this.children=[];this.dataset={};this.attributes={};this.listeners={};this.className='';this.captured=new Set();this.disabled=false;this.hidden=false;this.open=false; }
    set textContent(value){this.text=String(value);this.children=[];}
    get textContent(){return (this.text||'')+this.children.map(c=>c.textContent).join('');}
    set innerHTML(value) {
      this.children=[];const stack=[this];
      for(const match of value.matchAll(/<(\/?)([a-z0-9-]+)([^>]*)>/gi)) {
        if(match[1]){stack.pop();continue;}
        const child=new Element(match[2]);
        for(const attr of match[3].matchAll(/([\w-]+)="([^"]*)"/g))child.setAttribute(attr[1],attr[2]);
        stack.at(-1).append(child);stack.push(child);
      }
    }
    get classList(){return {add:name=>{this.className+=' '+name;},toggle:(name,on)=>{const names=new Set(this.className.split(' ').filter(Boolean));on?names.add(name):names.delete(name);this.className=[...names].join(' ');}};}
    append(...children){for(const c of children){c.parentElement=this;this.children.push(c);}}
    replaceChildren(...children){this.children=[];this.append(...children);}
    setAttribute(key,value){this.attributes[key]=String(value);if(key==='id')this.id=value;if(key==='class')this.className=value;}
    getAttribute(key){return this.attributes[key]??null;}
    addEventListener(type,fn){(this.listeners[type]??=[]).push(fn);}
    dispatch(type,props={}){const e={target:this,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;},...props};for(const fn of this.listeners[type]||[])fn(e);return e;}
    all(){return this.children.flatMap(c=>[c,...c.all()]);}
    contains(node){return node===this||this.all().includes(node);}
    get isConnected(){return document.contains(this);}
    querySelector(selector){const id=selector.match(/data-tutorial-note="(\d+)"/);return this.all().find(c=>id?String(c.dataset.tutorialNote)===id[1]:selector==='details.extras'?c.tagName==='details':false)||null;}
    querySelectorAll(selector){return selector==='button:not([disabled]):not([hidden])'?this.all().filter(c=>c.tagName==='button'&&!c.disabled&&!c.hidden):[];}
    closest(selector){return selector==='[data-tutorial-note]'&&this.dataset.tutorialNote?this:this.parentElement?.closest(selector)||null;}
    focus(){document.activeElement=this;}
    scrollIntoView(){}
    showModal(){this.open=true;}
    close(){this.open=false;}
    setPointerCapture(id){this.captured.add(id);}
    hasPointerCapture(id){return this.captured.has(id);}
    releasePointerCapture(id){this.captured.delete(id);this.dispatch('lostpointercapture',{pointerId:id});}
  }
  document=new Element('document');document.body=new Element('body');document.append(document.body);document.activeElement=document.body;
  document.createElement=tag=>new Element(tag);document.getElementById=id=>document.all().find(e=>e.id===id)||null;
  const entry=new Element('button');entry.id='tutorial-open';document.body.append(entry);
  const sound=[],scope=vm.createContext({document,setTimeout(){},HTMLDialogElement:Element,celebration:null,flipping:null,chordSound:notes=>sound.push([...notes]),interruptGesture(){},message:s=>{scope.messageText=s;},liveGame:{score:700,mp:9,history:['move'],selected:[9]}});
  vm.runInContext(readFileSync(join(__dirname,'..','tutorial.js'),'utf8'),scope);
  const get=id=>document.getElementById('tutorial-'+id);
  const click=id=>get(id).dispatch('click');
  const note=id=>get('board').querySelector(`[data-tutorial-note="${id}"]`);
  const select=ids=>{for(const id of ids)get('board').dispatch('click',{target:note(id)});};
  const open=()=>{entry.focus();entry.dispatch('click');};
  const key=(key,props={})=>document.dispatch('keydown',{key,...props});
  const pointer=(type,id,props={})=>get('board').dispatch(type,{target:note(id)||get('board'),pointerId:1,isPrimary:true,button:0,clientX:100,clientY:100,...props});
  const complete=[()=>{select([1,2,3]);click('play');},()=>{select([1]);click('move');},()=>{select([1]);click('flip');},()=>{click('play');select([11,12,13]);click('play');},()=>{select([4]);click('move');select([1,2,3]);click('play');}];
  const reach=index=>{open();for(let i=0;i<index;i++){complete[i]();click('next');}};
  return {document,entry,scope,get,click,note,select,open,key,pointer,complete,reach,sound,dialog:document.getElementById('forge-tutorial')};
}
test('first chord requires exactly C E G and only rewards once',()=>{
  const a=lessonApp();a.open();assert.equal(a.get('play').disabled,true);assert.equal(a.get('next').disabled,true);
  a.select([1,2]);assert.equal(a.get('play').disabled,true);assert.match(a.get('feedback').textContent,/tap G/);
  a.select([3]);assert.equal(a.get('play').disabled,false);a.click('play');a.click('play');assert.deepEqual(a.sound,[['C','E','G']]);assert.match(a.get('energy').textContent,/18 \/ 18/);assert.equal(a.get('next').disabled,false);
});
test('move requires an active note and spends one practice MP',()=>{
  const a=lessonApp();a.reach(1);a.click('move');assert.match(a.get('energy').textContent,/12 \/ 18/);
  a.select([2]);assert.match(a.get('feedback').textContent,/tap C/);a.select([1]);assert.match(a.note(1).getAttribute('aria-label'),/active/);
  a.click('move');a.click('move');assert.match(a.get('energy').textContent,/11 \/ 18/);assert.match(a.note(1).getAttribute('aria-label'),/row 2, column 2/);
});
test('flip previews B to C, costs two and cannot double-charge',()=>{
  const a=lessonApp();a.reach(2);assert.match(a.get('shift').textContent,/B → C/);a.click('flip');assert.match(a.get('energy').textContent,/12 \/ 18/);a.select([1]);a.click('flip');a.click('flip');assert.match(a.note(1).textContent,/C/);assert.match(a.get('energy').textContent,/10 \/ 18/);assert.match(a.get('description').textContent,/one semitone/);
});
test('replacement step clears selection and requires playing the next chord',()=>{
  const a=lessonApp();a.reach(3);a.click('play');assert.equal(a.get('next').disabled,true);assert.equal(a.get('play').disabled,true);assert.match(a.get('description').textContent,/real refills are random/);
  for(const id of [11,12,13])assert.match(a.note(id).getAttribute('aria-label'),/new/);
  a.select([11,12,13]);a.click('play');assert.equal(a.get('next').disabled,false);assert.deepEqual(a.sound.at(-1),['A','C','E']);
});
test('energy lesson copies an existing C and guides the charged recovery over distractors',()=>{
  const a=lessonApp();a.reach(4);assert.match(a.note(5).textContent,/C/);assert.match(a.get('description').textContent,/no connected chord/);
  a.select([4]);a.click('move');assert.match(a.get('energy').textContent,/3 \/ 18/);assert.match(a.get('feedback').textContent,/copy a random existing note into a random empty square/);assert.match(a.note(1).getAttribute('aria-label'),/charged/);
  for(const id of [4,5]){a.select([id]);assert.match(a.get('feedback').textContent,/CHARGED C/);assert.equal(a.note(id).getAttribute('aria-pressed'),'false');}
  a.select([1,2,3]);a.click('play');assert.match(a.get('energy').textContent,/18 \/ 18/);assert.equal(a.get('next').textContent,'Return to game');a.click('next');assert.equal(a.dialog.open,false);
});
test('Skip, Escape, restart, replay and repeated opening leave unrelated state intact',()=>{
  const a=lessonApp();const initial=JSON.stringify(a.scope.liveGame);a.reach(2);a.select([1]);a.click('retry');assert.equal(a.note(1).getAttribute('aria-pressed'),'false');a.click('skip');assert.equal(a.document.activeElement,a.entry);
  a.open();a.dialog.dispatch('cancel');assert.equal(a.dialog.open,false);
  a.reach(4);a.complete[4]();a.click('retry');assert.match(a.get('progress').textContent,/Lesson 1/);a.click('skip');a.open();a.entry.dispatch('click');assert.match(a.get('progress').textContent,/Lesson 1/);assert.equal(JSON.stringify(a.scope.liveGame),initial);
});
test('all modal arrows are stopped before live game; wrong direction never spends MP',()=>{
  const a=lessonApp();a.open();assert.equal(a.key('ArrowDown').stopped,true);a.click('skip');assert.equal(a.key('ArrowDown').stopped,undefined);
  a.reach(1);a.key('ArrowRight');assert.match(a.get('feedback').textContent,/Tap C/);a.select([1]);a.key('ArrowUp');assert.match(a.get('energy').textContent,/12 \/ 18/);a.key('ArrowRight');assert.match(a.get('energy').textContent,/11 \/ 18/);
});
test('Tab and Shift Tab wrap within the tutorial after disabled controls change',()=>{
  const a=lessonApp();a.open();assert.equal(a.key('Tab').defaultPrevented,true);assert.equal(a.document.activeElement,a.get('skip'));
  a.get('skip').focus();assert.equal(a.key('Tab',{shiftKey:true}).defaultPrevented,true);assert.equal(a.document.activeElement,a.get('retry'));
  a.complete[0]();assert.equal(a.document.activeElement,a.get('next'));assert.equal(a.key('Tab').defaultPrevented,true);assert.equal(a.document.activeElement,a.get('skip'));
  assert.equal(a.key('Tab',{shiftKey:true}).defaultPrevented,true);assert.equal(a.document.activeElement,a.get('next'));
  assert.equal(a.key('Tab',{ctrlKey:true}).defaultPrevented,undefined);a.click('skip');assert.equal(a.key('Tab').defaultPrevented,undefined);
});
test('pointer tap selects once; wrong drag is free; correct drag moves once',()=>{
  const a=lessonApp();a.reach(1);a.pointer('pointerdown',1);a.pointer('pointerup',1);a.get('board').dispatch('click',{target:a.note(1)});assert.equal(a.note(1).getAttribute('aria-pressed'),'true');
  a.pointer('pointerdown',1);a.pointer('pointerup',1,{clientY:20});a.get('board').dispatch('click',{target:a.note(1)});assert.match(a.get('energy').textContent,/12 \/ 18/);
  a.pointer('pointerdown',1);a.pointer('pointerup',1,{clientX:160});a.get('board').dispatch('click',{target:a.note(1)});assert.match(a.get('energy').textContent,/11 \/ 18/);
});
test('cancelled pointers, wrong pointer and nonprimary input cannot move notes',()=>{
  for(const type of ['pointercancel','lostpointercapture']){const a=lessonApp();a.reach(1);a.pointer('pointerdown',1);a.pointer(type,1);a.pointer('pointerup',1,{clientX:160});assert.match(a.get('energy').textContent,/12 \/ 18/);}
  const a=lessonApp();a.reach(1);a.pointer('pointerdown',1,{isPrimary:false});a.pointer('pointerup',1,{clientX:160});assert.match(a.get('energy').textContent,/12 \/ 18/);a.pointer('pointerdown',1);a.pointer('pointerup',1,{pointerId:2,clientX:160});assert.match(a.get('energy').textContent,/12 \/ 18/);
});
test('opening is refused while a real flip or chord is unfinished',()=>{
  for(const kind of ['flipping','celebration']){const a=lessonApp();a.scope[kind]={id:1};a.open();assert.equal(a.dialog.open,false);assert.match(a.scope.messageText,/current action finish/);a.scope[kind]=null;a.open();assert.equal(a.dialog.open,true);}
});
