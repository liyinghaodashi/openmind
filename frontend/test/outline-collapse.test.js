import test from 'node:test';
import assert from 'node:assert/strict';
import {createOutline} from '../src/outline/controller.js';
import {layoutTree} from '../src/layout.js';
import {MindMap} from '../src/mindmap.js';

function setup(collapsed=[]) {
  const node=(id,children=[])=>({id,label:id,children});
  const root=node('root',[node('a',[node('inner',[node('leaf'),node('leaf2')])]),node('b',[node('other')]),node('empty')]);
  const attributes=new Map();
  const button={dataset:{id:'root'},setAttribute:(key,value)=>attributes.set(key,value),removeAttribute:key=>attributes.delete(key)};
  const map={root,collapsed:new Set(collapsed),scale:1.25,x:24,y:80,canvas:{clientWidth:800,clientHeight:600},schedule(){},focusBranch(id){MindMap.prototype.focusBranch.call(this,id)},setRoot(root){this.root=root;this.layout=layoutTree(root,this.collapsed,()=>({width:100,height:40}));context.syncCollapse()}};
  const state={snapshot:{root},navigating:false};
  const context=createOutline({state,map,readyToNavigate:async()=>true,updateDocumentView(){},preview:true,banner:message=>assert.fail(message),errorText:String,$:()=>({querySelectorAll:selector=>selector==='.outline-collapse'?[button]:[]})});
  map.setRoot(root);
  return {map,state,expanded:()=>attributes.get('aria-expanded'),toggle:id=>{map.selected=id;MindMap.prototype.toggleSelected.call(map)},click:(id='root')=>context.focus(id,{collapseChildren:true}),focus:id=>context.focus(id),visible:()=>map.layout.positions.map(p=>p.id)};
}

test('大纲折叠按钮再次点击展开，再次点击仍可折叠',async()=>{
  const ui=setup();
  await ui.click();assert.deepEqual(ui.visible(),['root','a','b','empty']);
  await ui.click();assert.deepEqual(ui.visible(),['root','a','inner','leaf','leaf2','b','other','empty']);
  await ui.click();assert.deepEqual(ui.visible(),['root','a','b','empty']);
  assert.equal(ui.map.scale,1.25);assert.equal(ui.map.selected,'root');assert.equal(ui.state.navigating,false);
});

test('部分分支折叠时先统一折叠，展开保留更深层的折叠状态',async()=>{
  const ui=setup(['a','inner']);
  await ui.click();assert.deepEqual(ui.visible(),['root','a','b','empty']);
  await ui.click();assert.deepEqual(ui.visible(),['root','a','inner','b','other','empty']);
  assert.deepEqual([...ui.map.collapsed],['inner']);
});


test('单箭头随统一折叠和展开更新，部分折叠仍显示向下',async()=>{
  const ui=setup(['a']);
  assert.equal(ui.expanded(),'true');
  await ui.click();assert.equal(ui.expanded(),'false');
  await ui.click();assert.equal(ui.expanded(),'true');
});

test('快捷键切换分支后，大纲箭头同步且不替换按钮',()=>{
  const ui=setup(['a']);
  ui.toggle('b');assert.equal(ui.expanded(),'false');
  ui.toggle('a');assert.equal(ui.expanded(),'true');
});

for(const id of ['root','a'])test(id+' 大纲折叠和展开保持操作节点屏幕位置与缩放',async()=>{
  const ui=setup();
  const screen=()=>{const p=ui.map.layout.positions.find(p=>p.id===id);return [ui.map.x+p.x*ui.map.scale,ui.map.y+p.y*ui.map.scale]};
  const before=screen();
  await ui.click(id);assert.deepEqual(screen(),before);assert.equal(ui.map.scale,1.25);
  await ui.click(id);assert.deepEqual(screen(),before);assert.equal(ui.map.scale,1.25);
});

test('点击大纲保留当前缩放、整图和折叠状态，大分支起点靠左',async()=>{
  const ui=setup(['inner']);
  ui.map.canvas={clientWidth:300,clientHeight:220};
  await ui.focus('a');
  assert.deepEqual(ui.visible(),['root','a','inner','b','other','empty']);
  assert.deepEqual([...ui.map.collapsed],['inner']);assert.equal(ui.map.selected,'a');
  assert.equal(ui.map.scale,1.25);
  const p=ui.map.layout.positions.find(p=>p.id==='a');
  assert.equal(p.x*ui.map.scale+ui.map.x,24);
  assert.equal((p.y+p.height/2)*ui.map.scale+ui.map.y,110);
});

test('小分支整体居中，大分支保持字号和起点可见',()=>{
  const ui=setup();
  ui.map.focusBranch('empty');
  const p=ui.map.layout.positions.find(p=>p.id==='empty');
  assert.equal(ui.map.scale,1.25);
  assert.equal((p.x+p.width/2)*ui.map.scale+ui.map.x,400);
  assert.equal((p.y+p.height/2)*ui.map.scale+ui.map.y,300);
  ui.map.canvas={clientWidth:300,clientHeight:220};
  ui.map.layout.positions.find(p=>p.id==='leaf').y=10000;
  ui.map.focusBranch('a');assert.equal(ui.map.scale,1.25);
  const target=ui.map.layout.positions.find(p=>p.id==='a');
  assert.equal(target.x*ui.map.scale+ui.map.x,24);
  assert.equal((target.y+target.height/2)*ui.map.scale+ui.map.y,110);
});
