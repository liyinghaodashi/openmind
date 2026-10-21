import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutTree} from '../src/layout.js';
import {nodeColors} from '../src/node-colors.js';
import {MindMap} from '../src/mindmap.js';

for(const [name,parentColor,ownColor,expected] of [
  ['继承父节点','#DC6A5E','','#DC6A5E'],
  ['未配置颜色','','',''],
  ['蓝色预设','','#3B82F6','#3B82F6'],
  ['显式覆盖','#DC6A5E','#5EAA80','#5EAA80'],
])test(`节点颜色菜单选中生效颜色：${name}`,()=>{
  const child={id:'child',label:'child',editable:true,color:ownColor,children:[]};
  const root={id:'root',kind:'file',children:[{id:'parent',label:'parent',color:parentColor,children:[child]}]};
  const element=()=>({dataset:{},style:{},attributes:{},setAttribute(key,value){this.attributes[key]=value},focus(){},getBoundingClientRect:()=>({left:0,bottom:40,width:100,height:100})});
  const el=element();el.dataset.id=child.id;
  const buttons=nodeColors.map(({hex})=>Object.assign(element(),{dataset:{color:hex}}));
  const map=Object.assign(Object.create(MindMap.prototype),{
    layout:layoutTree(root,new Set(),()=>({width:100,height:40})),collapsed:new Set(),
    nodeMenu:Object.assign(element(),{firstChild:element(),lastChild:element()}),
    colorRow:element(),colorOptions:{children:buttons},copyTreeButton:element(),copyTreeEnabled:true,
  });
  const previous=globalThis.window;globalThis.window={innerWidth:800,innerHeight:600};
  try{
    map.showNodeMenu({target:{closest:selector=>selector==='.mind-node'?el:null},preventDefault(){},clientX:100,clientY:100});
    assert.deepEqual(buttons.filter(button=>button.attributes['aria-checked']==='true').map(button=>button.dataset.color),expected?[expected]:[]);
  }finally{if(previous===undefined)delete globalThis.window;else globalThis.window=previous}
});

test('节点连线向后代继承颜色，显式颜色覆盖继承，不为一级节点创建连线',()=>{
  const leaf={id:'leaf',label:'叶子',children:[]};
  const child={id:'child',label:'子节点',color:'#3B82F6',children:[leaf]};
  const root={id:'root',kind:'file',children:[{id:'main',label:'主节点',color:'#D4776A',children:[child]}]};
  const layout=layoutTree(root,new Set(),()=>({width:100,height:40}));
  assert.equal(layout.edges.find(edge=>edge.id==='child').color,'#3B82F6');
  assert.equal(layout.edges.find(edge=>edge.id==='leaf').color,'#3B82F6');
  assert(!layout.edges.some(edge=>edge.id==='main'));
});

test('分支颜色递归继承，删除显式颜色回到祖先颜色，独立主节点和兄弟分支互不影响',()=>{
  const node=(id,color='',children=[])=>({id,label:id,color,children});
  const deep=node('deep'),override=node('override','#D4776A',[deep]),leaf=node('leaf','',[override]);
  const branch=node('branch','#72A58A',[leaf]),peer=node('peer'),other=node('other');
  const root={id:'root',kind:'file',children:[node('main','#92969E',[branch,peer]),node('main2','',[other])]};
  const before=JSON.stringify(root);
  const colors=(collapsed=new Set())=>new Map(layoutTree(root,collapsed,()=>({width:100,height:40})).edges.map(edge=>[edge.id,edge.color]));
  let result=colors();
  assert.equal(result.get('branch'),'#72A58A');assert.equal(result.get('leaf'),'#72A58A');
  assert.equal(result.get('override'),'#D4776A');assert.equal(result.get('deep'),'#D4776A');
  assert.equal(result.get('peer'),'#92969E');assert.equal(result.get('other'),'');
  assert.equal(JSON.stringify(root),before);
  assert(!colors(new Set(['branch'])).has('leaf'));
  assert.equal(colors().get('deep'),'#D4776A');
  override.color='';result=colors();assert.equal(result.get('override'),'#72A58A');assert.equal(result.get('deep'),'#72A58A');
  branch.color='';result=colors();assert.equal(result.get('branch'),'#92969E');assert.equal(result.get('deep'),'#92969E');
  root.children[0].color='';assert([...colors().values()].every(color=>color===''));
});

test('颜色菜单保留四个 HEX 预设',()=>{
  assert.deepEqual(nodeColors.map(color=>color.name),['红','绿','黄','蓝']);
  for(const {hex} of nodeColors)assert.match(hex,/^#[\da-f]{6}$/i);
});
