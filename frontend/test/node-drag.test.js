import test from 'node:test';
import assert from 'node:assert/strict';
import {nodeDropTarget} from '../src/node-drop.js';
import {MindMap} from '../src/mindmap.js';
import {layoutTree} from '../src/layout.js';

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

function gapFixture(){
  const root=node('root',[node('a',[node('a1'),node('a2'),node('a3')]),node('b',[node('b1'),node('b2'),node('b3')]),node('source')]);
  const {positions}=layoutTree(root,new Set(),()=>({width:100,height:40}));
  const a=positions.find(p=>p.id==='a'),b=positions.find(p=>p.id==='b');
  return {root,positions,a,b,x:a.x+50,y:(a.y+a.height+b.y)/2};
}

test('同级节点之间整段空白均可插入，即使子树撑开间距',()=>{
  const {root,positions,a,b,x}=gapFixture();
  for(let y=a.y+a.height+1;y<b.y;y++){
    const target=nodeDropTarget(root,positions,'source',x,y);
    assert.ok(target?.targetId==='a'&&target.placement==='after'||target?.targetId==='b'&&target.placement==='before',`间隔 y=${y} 应落在 a 和 b 之间`);
  }
});

test('间隔判定只覆盖同父节点的相邻节点列，不扩展到其他空白',()=>{
  const {root,positions,a,b,x,y}=gapFixture();
  assert.deepEqual(nodeDropTarget(root,positions,'source',x,y),{targetId:'b',placement:'before'});
  for(const px of [a.x-21,a.x+a.width+37])assert.equal(nodeDropTarget(root,[a,b],'source',px,y),null);
  const separate=node('root',[node('left',[node('a')]),node('right',[node('b')]),node('source')]);
  assert.equal(nodeDropTarget(separate,[a,b],'source',x,y),null);
});

test('间隔判定排除拖动子树、隐藏节点，支持文件根和折叠节点',()=>{
  const {root,positions,x,y}=gapFixture();
  assert.equal(nodeDropTarget(root,positions,'root',x,y),null);
  const hidden=positions.filter(p=>p.id!=='b');
  assert.notEqual(nodeDropTarget(root,hidden,'source',x,y)?.targetId,'b');
  const file={...root,kind:'file'};
  const folded=layoutTree(file,new Set(['a','b']),()=>({width:100,height:40})).positions;
  const a=folded.find(p=>p.id==='a'),b=folded.find(p=>p.id==='b');
  assert.deepEqual(nodeDropTarget(file,folded,'source',50,(a.y+a.height+b.y)/2),{targetId:'b',placement:'before'});
});

test('实际拖动按缩放和平移换算间隔落点，松手只提交一次同级插入',()=>{
  const {root,positions,x,y}=gapFixture(),moves=[];
  const map=Object.assign(Object.create(MindMap.prototype),{
    viewRoot:root,layout:{positions},scale:.5,x:80,y:60,
    canvas:{getBoundingClientRect:()=>({left:25,top:30}),classList:{remove(){}},hasPointerCapture:()=>false},
    nodeDrag:{id:'source',pointer:1,active:true},schedule(){},onMove:(...args)=>moves.push(args)
  });
  const event={pointerId:1,clientX:25+80+x*.5,clientY:30+60+y*.5};
  map.moveNodeDrag(event);
  assert.deepEqual(map.nodeDrag.target,{targetId:'b',placement:'before'});
  map.stopNodeDrag(event,true);map.stopNodeDrag(event,true);
  assert.deepEqual(moves,[['source','b','before']]);
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
