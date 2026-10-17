import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeDropTarget} from '../src/node-drop.js';
import {MindMap} from '../src/mindmap.js';

const node=(id,children=[])=>({id,label:id,children});
const root=node('root',[node('a',[node('child')]),node('b')]);
const positions=[{id:'root',node:root,x:0,y:50,width:100,height:40},{id:'a',node:root.children[0],x:150,y:0,width:100,height:40},{id:'child',node:root.children[0].children[0],x:300,y:0,width:100,height:40},{id:'b',node:root.children[1],x:150,y:80,width:100,height:40}];

test('目标上沿、下沿、中央对应前后顺序和子节点；根节点仅接受子节点',()=>{
  assert.deepEqual(nodeDropTarget(root,positions,'a',175,82),{targetId:'b',placement:'before'});
  assert.deepEqual(nodeDropTarget(root,positions,'a',175,118),{targetId:'b',placement:'after'});
  assert.deepEqual(nodeDropTarget(root,positions,'a',175,100),{targetId:'b',placement:'child'});
  assert.deepEqual(nodeDropTarget(root,positions,'a',50,51),{targetId:'root',placement:'child'});
});

test('自己、后代和空白区域不可作为放置目标；坐标兼容缩放和平移后的换算',()=>{
  for(const [x,y] of [[175,20],[350,20],[700,400]])assert.equal(nodeDropTarget(root,positions,'a',x,y),null);
  const scale=.5,pan={x:25,y:60},pointer={x:175*scale+pan.x,y:100*scale+pan.y};
  assert.deepEqual(nodeDropTarget(root,positions,'a',(pointer.x-pan.x)/scale,(pointer.y-pan.y)/scale),{targetId:'b',placement:'child'});
});

function setup(){
  const calls=[],classes=new Set();
  let captured=null;
  const canvas={setPointerCapture:id=>captured=id,hasPointerCapture:id=>captured===id,releasePointerCapture:()=>captured=null,classList:{add:name=>classes.add(name),remove:name=>classes.delete(name)}};
  const map=Object.assign(Object.create(MindMap.prototype),{root,canvas,layout:{positions},onMove:(...args)=>calls.push(['move',...args]),onSelect:id=>{calls.push(['select',id]);map.selected=id},onEdit:id=>calls.push(['edit',id]),onDragState:active=>calls.push(['drag',active]),schedule(){},updateNodeDrop(){}});
  const pointer=(overrides={})=>({button:0,pointerId:1,clientX:175,clientY:20,preventDefault(){},target:{closest:selector=>selector==='button,textarea'?null:{dataset:{id:'a'}}},...overrides});
  return {map,calls,pointer,captured:()=>captured};
}

test('轻微移动保留单击选中，选中后再次单击编辑，不产生结构写入',()=>{
  const ui=setup();ui.map.startNodeDrag(ui.pointer());
  ui.map.moveNodeDrag(ui.pointer({clientX:178}));
  assert.equal(ui.map.nodeDrag.active,false);
  ui.map.stopNodeDrag(ui.pointer(),true);
  assert.deepEqual(ui.calls,[['select','a']]);assert.equal(ui.captured(),null);
  ui.map.startNodeDrag(ui.pointer());ui.map.stopNodeDrag(ui.pointer(),true);
  assert.deepEqual(ui.calls,[['select','a'],['edit','a']]);
});

test('完成拖动只提交一次；取消和丢失捕获不提交，结束后清理状态',()=>{
  for(const commit of [true,false]){
    const ui=setup();ui.map.startNodeDrag(ui.pointer());ui.map.nodeDrag.active=true;ui.map.nodeDrag.target={targetId:'b',placement:'after'};
    ui.map.stopNodeDrag(ui.pointer(),commit);ui.map.stopNodeDrag(ui.pointer(),commit);
    assert.deepEqual(ui.calls,commit?[['drag',false],['move','a','b','after']]:[['drag',false]]);
    assert.equal(ui.map.nodeDrag,null);assert.equal(ui.captured(),null);assert.equal(ui.map.suppressClick,true);
  }
});

test('中键、编辑框、根节点和忙碌状态不启动节点拖动',()=>{
  const ui=setup();
  ui.map.startNodeDrag(ui.pointer({button:1}));assert.equal(ui.map.nodeDrag,undefined);
  ui.map.startNodeDrag(ui.pointer({target:{closest:()=>({})}}));assert.equal(ui.map.nodeDrag,undefined);
  ui.map.startNodeDrag(ui.pointer({target:{closest:selector=>selector==='button,textarea'?null:{dataset:{id:'root'}}}}));assert.equal(ui.map.nodeDrag,undefined);
  ui.map.focusedId='a';ui.map.startNodeDrag(ui.pointer());assert.equal(ui.map.nodeDrag,undefined);ui.map.focusedId=null;
  ui.map.canDrag=()=>false;ui.map.startNodeDrag(ui.pointer());assert.equal(ui.map.nodeDrag,undefined);
});
