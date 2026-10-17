import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {MindMap} from '../src/mindmap.js';
import {nodeDropTarget} from '../src/node-drop.js';

const node=(id,children=[])=>({id,label:id,kind:'heading',children});
const forest=()=>({id:'file',kind:'file',children:[node('A',[node('A2',[node('A3',[node('one'),node('two')])])]),node('B',[node('B2')])]});
function setup(collapsed=[]){
  const map=Object.assign(Object.create(MindMap.prototype),{
    root:forest(),collapsed:new Set(collapsed),elements:new Map(),scale:1.25,x:24,y:80,
    canvas:{clientWidth:800,clientHeight:600},closeNodeMenu(){},schedule(){},render(){},
    measure:()=>({width:100,height:40})
  });
  map.setRoot(map.root);return map;
}

test('聚焦仅显示指定分支，保留完整树和原层级，不产生祖先连线',()=>{
  const map=setup(),root=map.root;
  map.toggleFocus('A3');
  assert.equal(map.root,root);assert.equal(map.focusedId,'A3');assert.equal(map.viewRoot,root.children[0].children[0].children[0]);
  assert.deepEqual(map.layout.positions.map(p=>p.id),['A3','one','two']);
  assert.deepEqual(map.layout.positions.map(p=>p.pathDepth),[3,4,4]);
  assert.equal(map.layout.positions[0].depth,2);
  assert.deepEqual(map.layout.edges.map(e=>e.from.id),['A3','A3']);
  assert.equal(map.scale,1.25);
});

for(const id of ['A','A2','A3','one','B2'])test(id+' 聚焦开关保留节点及后代的位置、尺寸和层级，不平移或缩放',()=>{
  const map=setup(),before=map.layout,view={x:map.x,y:map.y,scale:map.scale};
  map.toggleFocus(id);
  for(const p of map.layout.positions)assert.deepEqual(p,before.positions.find(original=>original.id===p.id));
  assert.deepEqual({x:map.x,y:map.y,scale:map.scale},view);
  map.toggleFocus(id);
  assert.deepEqual(map.layout,before);
  assert.deepEqual({x:map.x,y:map.y,scale:map.scale},view);
});

test('聚焦中选择其他可见节点切换聚焦，当前入口再次选择退出，保留视图和折叠状态',()=>{
  const map=setup(['B']),root=map.root,layout=map.layout,before={x:map.x,y:map.y,scale:map.scale};
  for(const id of ['A','A2','A3','one']){
    map.toggleFocus(id);
    assert.equal(map.focusedId,id);assert.equal(map.selected,id);assert.equal(map.viewRoot.id,id);assert.equal(map.root,root);
    for(const p of map.layout.positions)assert.deepEqual(p,layout.positions.find(original=>original.id===p.id));
    assert.deepEqual({x:map.x,y:map.y,scale:map.scale},before);assert.deepEqual([...map.collapsed],['B']);
    assert(!map.layout.positions.some(p=>p.id==='B'));
  }
  assert.deepEqual(map.layout.positions.map(p=>p.id),['one']);
  assert.deepEqual(map.layout.edges,[]);
  map.toggleFocus('two');assert.equal(map.focusedId,'one');
  map.x=-240;map.y=123;map.scale=.65;map.toggleFocus('one');
  assert.equal(map.focusedId,null);assert.equal(map.viewRoot,root);assert.deepEqual(map.layout,layout);
  assert.deepEqual({x:map.x,y:map.y,scale:map.scale},{x:-240,y:123,scale:.65});
});

test('聚焦保留原有折叠状态，仍能手动展开；重新打开文档清除聚焦',()=>{
  const map=setup(['A2','A3']);
  const before=map.layout.positions.find(p=>p.id==='A2');
  map.toggleFocus('A2');assert.deepEqual(map.layout.positions,[before]);
  assert.deepEqual([...map.collapsed],['A2','A3']);
  map.toggleSelected('A2');assert.deepEqual(map.layout.positions.map(p=>p.id),['A2','A3']);
  assert.deepEqual([...map.collapsed],['A3']);
  map.setRoot(forest(),{resetView:true});
  assert.equal(map.focusedId,null);assert.equal(map.scale,1);
  assert(map.layout.positions.some(p=>p.id==='B'));
});

test('拖动子节点到聚焦入口只能成为子节点，不能移到隐藏范围',()=>{
  const map=setup();map.toggleFocus('A3');
  const p=map.layout.positions[0];
  assert.deepEqual(nodeDropTarget(map.viewRoot,map.layout.positions,'one',p.x+20,p.y+1),{targetId:'A3',placement:'child'});
  assert.deepEqual(nodeDropTarget(map.viewRoot,map.layout.positions,'one',p.x+20,p.y+p.height-1),{targetId:'A3',placement:'child'});
});

test('聚焦入口删除后自动恢复整图，避免空白画布',()=>{
  const map=setup();map.toggleFocus('A3');
  const next=forest();next.children[0].children[0].children=[];map.setRoot(next);
  assert.equal(map.focusedId,null);assert.equal(map.viewRoot,next);
  assert(map.layout.positions.some(p=>p.id==='B'));
});

test('方向键停在聚焦入口，同层导航只访问当前分支',async()=>{
  const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
  const navigation=source.slice(source.indexOf('function nodePath('),source.indexOf('\n',source.indexOf('function nodeAtPath(')));
  const move=source.slice(source.indexOf('async function moveSelection('),source.indexOf('\nfunction copyNodeText('));
  const map=setup();map.toggleFocus('A3');
  const state={snapshot:{root:map.root},queue:{drain:async()=>true},editor:null};
  const context=vm.createContext({state,map,preview:false,addingChild:false,deletingNode:false,movingNode:false,editRequest:0,finishNode:async()=>true,$:()=>({}),banner:message=>assert.fail(message),errorText:String});
  vm.runInContext(navigation+'\n'+move,context);
  await context.moveSelection('ArrowLeft');assert.equal(map.selected,'A3');
  await context.moveSelection('ArrowDown');assert.equal(map.selected,'A3');
  await context.moveSelection('ArrowRight');assert.equal(map.selected,'two');
  await context.moveSelection('ArrowUp');assert.equal(map.selected,'one');
  await context.moveSelection('ArrowLeft');assert.equal(map.selected,'A3');
});
