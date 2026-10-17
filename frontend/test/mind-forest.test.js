import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {layoutTree} from '../src/layout.js';
import {MindMap} from '../src/mindmap.js';
import {findNodeMatches} from '../src/features/document-search.js';
import {nodeDropTarget} from '../src/node-drop.js';

const node=(id,children=[])=>({id,label:id,kind:'heading',children});
const forest={id:'root',label:'文件名',kind:'file',children:[node('A',[node('A2',[node('A3',[node('Detail')])])]),node('B',[node('B2')])]};
const measure=()=>({width:100,height:40});

test('多个主节点独立排列，隐藏文件根，不绘制主节点之间的连线',()=>{
  const out=layoutTree(forest,new Set(),measure);
  assert.deepEqual(out.positions.map(p=>p.id),['A','A2','A3','Detail','B','B2']);
  for(const id of ['A','B']){
    const p=out.positions.find(p=>p.id===id);
    assert.equal(p.depth,0);assert.equal(p.pathDepth,1);assert.equal(p.x,0);
  }
  assert.equal(out.positions.find(p=>p.id==='A2').depth,1);
  assert.equal(out.edges.length,4);
  assert(out.edges.every(e=>e.from.id!=='root'&&e.to.id!=='B'));
  assert(out.positions.find(p=>p.id==='B').y>out.positions.find(p=>p.id==='Detail').y+40);
});

test('主节点折叠保持其他主节点可见，搜索跳过文件根，允许调整主节点顺序',()=>{
  const folded=layoutTree(forest,new Set(['A']),measure);
  assert.deepEqual(folded.positions.map(p=>p.id),['A','B','B2']);
  assert.equal(folded.positions[0].hiddenCount,3);
  assert.deepEqual(findNodeMatches(forest,'文件名'),[]);
  assert.deepEqual(findNodeMatches(forest,'B').map(m=>m.id),['B','B2']);
  const b=folded.positions.find(p=>p.id==='B');
  assert.deepEqual(nodeDropTarget(forest,folded.positions,'A',b.x+20,b.y+1),{targetId:'B',placement:'before'});
});

test('没有有效主节点时布局和缩放仍然有限，重新打开导图重置视图',()=>{
  const empty=layoutTree({...forest,children:[]},new Set(),measure);
  assert.deepEqual(empty,{positions:[],edges:[],width:0,height:0});
  const map=Object.assign(Object.create(MindMap.prototype),{root:forest,layout:empty,scale:.5,x:NaN,y:NaN,canvas:{clientWidth:800,clientHeight:600},schedule(){}});
  map.fit();assert.equal(map.scale,1);assert(Number.isFinite(map.x)&&Number.isFinite(map.y));
  map.layout=layoutTree(forest,new Set(),measure);map.resetView();
  assert.equal(map.scale,1);assert.equal(map.y+map.layout.positions[0].y+20,300);
});

test('方向键在主节点之间切换，左键不会选中隐藏的文件根',async()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const navigation=source.slice(source.indexOf('function nodePath('),source.indexOf('\n',source.indexOf('function nodeAtPath(')));
  const move=source.slice(source.indexOf('async function moveSelection('),source.indexOf('\nfunction copyNodeText('));
  const map={root:forest,selected:'A',collapsed:new Set(),layout:layoutTree(forest,new Set(),measure),elements:new Map(),setRoot(root){this.layout=layoutTree(root,this.collapsed,measure)},reveal(){},render(){}};
  const state={snapshot:{root:forest},queue:{drain:async()=>true},editor:null};
  const context=vm.createContext({state,map,preview:false,addingChild:false,deletingNode:false,movingNode:false,editRequest:0,finishNode:async()=>true,$:()=>({}),banner:message=>assert.fail(message),errorText:String});
  vm.runInContext(navigation+'\n'+move,context);
  await context.moveSelection('ArrowLeft');assert.equal(map.selected,'A');
  await context.moveSelection('ArrowDown');assert.equal(map.selected,'B');
  await context.moveSelection('ArrowUp');assert.equal(map.selected,'A');
  await context.moveSelection('ArrowRight');assert.equal(map.selected,'A2');
  await context.moveSelection('ArrowLeft');assert.equal(map.selected,'A');
});
