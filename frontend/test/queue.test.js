import test from 'node:test';
import assert from 'node:assert/strict';
import {EditQueue} from '../src/queue.js';
import {layoutTree} from '../src/layout.js';

test('每次输入依次提交，慢写入不会合并中间版本', async()=>{
  const writes=[],commits=[];let release;
  const first=new Promise(resolve=>release=resolve);
  const queue=new EditQueue({write:async edit=>{writes.push(edit.text);if(edit.text==='a')await first;return edit.text},onCommit:value=>commits.push(value)});
  queue.push({text:'a'});queue.push({text:'ab'});queue.push({text:'abc'});
  assert.deepEqual(writes,['a']);release();assert.equal(await queue.drain(),true);assert.deepEqual(writes,['a','ab','abc']);assert.deepEqual(commits,writes);
});
test('写入失败停止后续版本并保留队列',async()=>{
  const writes=[];let error;
  const queue=new EditQueue({write:async e=>{writes.push(e.text);throw Error('conflict')},onError:e=>{error=e}});
  queue.push({text:'a'});queue.push({text:'ab'});
  assert.equal(await queue.drain(),false);assert.deepEqual(writes,['a']);assert.equal(queue.pending,2);assert.equal(error.message,'conflict');
});
test('队列受内存与条数限制，不静默丢弃已排队编辑',async()=>{
  let release;const gate=new Promise(resolve=>release=resolve);const queue=new EditQueue({maxCount:2,maxBytes:8,write:()=>gate});
  queue.push({text:'abc'});queue.push({text:'abcd'});assert.throws(()=>queue.push({text:'x'}));assert.equal(queue.pending,2);release();assert.equal(await queue.drain(),true);
});
test('布局折叠仅隐藏子树且保留其他分支',()=>{
  const root={id:'root',label:'R',children:[{id:'a',label:'A',children:[{id:'b',label:'B',children:[]}]},{id:'c',label:'C',children:[]}]};
  const out=layoutTree(root,new Set(['a']),()=>({width:100,height:40}));assert.deepEqual(out.positions.map(x=>x.id),['root','a','c']);assert.equal(out.edges.length,2);assert(out.positions[1].y+40<=out.positions[2].y);
});
test('折叠标记统计所有隐藏后代，展开后移除并保留内层折叠',()=>{
  const root={id:'r',label:'R',children:[{id:'a',label:'A',children:[{id:'b',label:'B',children:[{id:'c',label:'C',children:[]}]}]}]};
  const collapsed=new Set(['a','b']);const measure=()=>({width:100,height:40});
  const folded=layoutTree(root,collapsed,measure);const a=folded.positions.find(p=>p.id==='a');
  assert.equal(a.hiddenCount,2);assert(folded.width>a.x+a.width);
  collapsed.delete('a');const expanded=layoutTree(root,collapsed,measure);
  assert.equal(expanded.positions.find(p=>p.id==='a').hiddenCount,0);
  assert.equal(expanded.positions.find(p=>p.id==='b').hiddenCount,1);
  assert.equal(expanded.positions.some(p=>p.id==='c'),false);
});
