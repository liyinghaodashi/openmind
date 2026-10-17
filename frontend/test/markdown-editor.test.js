import test from 'node:test';
import assert from 'node:assert/strict';
import {MarkdownEditor} from '../src/markdown-editor.js';

class Element {
  constructor(){this.listeners=new Map();this.attributes=new Map();this.scrollTop=40}
  addEventListener(name,fn){const entries=this.listeners.get(name)||[];entries.push(fn);this.listeners.set(name,entries)}
  setAttribute(name,value){this.attributes.set(name,value)}
  querySelectorAll(){return []}
  emit(name,event={}){for(const fn of this.listeners.get(name)||[])fn(event)}
}
class Editor {
  constructor(container,options){this.options=options;this.value='';this.vditor={ir:{},lute:{SetLinkBase:value=>this.base=value,SetInlineMath:()=>{}}};queueMicrotask(options.after)}
  getValue(){return this.value}
  setValue(value,clearStack){this.value=value.replace(/\r\n/g,'\n').trimEnd()+'\n';this.clearStack=clearStack}
  disabled(){this.disabledState=true}
  enable(){this.disabledState=false}
  focus(){}
}
async function setup(){
  globalThis.window={Vditor:Editor};
  const container=new Element(),editable=new Element(),scroll=new Element(),writes=[],composition=[];
  container.querySelector=selector=>selector.includes('contenteditable')?editable:scroll;
  const adapter=new MarkdownEditor({container,onInput:value=>writes.push(value),onComposition:value=>composition.push(value),onBeforeInput:()=>true});
  await adapter.ready;
  return {adapter,container,writes,composition,scroll:editable};
}

test('loading and switching documents never autosaves a normalized projection',async()=>{
  const {adapter,writes,scroll}=await setup();
  const source='\uFEFF# 中文\r\n\r\n';
  adapter.load(source,{session:'s1',path:'笔记.md',reset:true});adapter.setReadOnly(false);adapter.flush();
  assert.deepEqual(writes,[]);assert.equal(adapter.currentSource(),source);assert.equal(scroll.scrollTop,0);
  adapter.editor.clearStack=false;adapter.load(source,{session:'s1',path:'笔记.md'});assert.equal(adapter.editor.clearStack,false);
  adapter.load('# B',{session:'s2',path:'目录/B.md',reset:true});adapter.flush();
  assert.deepEqual(writes,[]);assert.equal(adapter.editor.clearStack,true);assert.equal(adapter.editor.base,'/document-assets/s2/%E7%9B%AE%E5%BD%95/');
});

test('IME commits once, each following input is preserved, and flush catches pending callbacks',async()=>{
  const {adapter,container,writes,composition}=await setup();
  adapter.load('\uFEFF# A\n',{session:'s',path:'a.md'});adapter.setReadOnly(false);
  container.emit('compositionstart');adapter.editor.value='# A中\n';container.emit('input',{isComposing:true});adapter.editor.options.input();
  assert.deepEqual(writes,[]);
  adapter.editor.value='# A中文\n';container.emit('compositionend');adapter.editor.options.input();
  assert.deepEqual(composition,[true,false]);assert.deepEqual(writes,['\uFEFF# A中文\n']);
  for(const value of ['# A中文a\n','# A中文ab\n']){adapter.editor.value=value;container.emit('input',{});adapter.editor.options.input()}
  assert.equal(writes.length,3);
  adapter.editor.value='# A中文abc\n';adapter.flush();assert.equal(writes.length,4);
  adapter.setReadOnly(true);adapter.editor.value='# 草稿\n';adapter.flush();
  assert.equal(writes.length,4);assert.equal(adapter.currentSource(),'\uFEFF# 草稿\n');
});

test('readonly prevents both text and task-list changes',async()=>{
  const {container}=await setup();
  let prevented=0,stopped=0;
  container.emit('beforeinput',{preventDefault:()=>prevented++});
  container.emit('click',{target:{matches:()=>true},preventDefault:()=>prevented++,stopImmediatePropagation:()=>stopped++});
  assert.equal(prevented,2);assert.equal(stopped,1);
});
