import test from 'node:test';
import assert from 'node:assert/strict';
import {MindHistory} from '../src/features/mind-history.js';

test('undo and redo only advance after a successful save; new edits discard redo',()=>{
  const history=new MindHistory();
  history.record({source:'A'},'B');
  assert.deepEqual(history.target('undo'),{source:'A'});
  assert.deepEqual(history.target('undo'),{source:'A'});
  history.commit('undo',{source:'B'});
  assert.deepEqual(history.target('redo'),{source:'B'});
  history.record({source:'A'},'C');
  assert.equal(history.target('redo'),undefined);
  history.commit('undo',{source:'C'});
  history.commit('redo',{source:'A'});
  assert.deepEqual(history.target('undo'),{source:'A'});
});

test('one node editing session is one step; no-op edits retain redo',()=>{
  const history=new MindHistory();
  history.record({source:'A'},'B','node-session');
  history.record({source:'B'},'C','node-session');
  assert.equal(history.undo.length,1);
  assert.equal(history.target('undo').source,'A');
  history.breakGroup();
  history.record({source:'C'},'D','node-session');
  assert.equal(history.undo.length,2);
  history.commit('undo',{source:'D'});
  history.record({source:'C'},'C');
  assert.equal(history.target('redo').source,'D');
});

test('history retention is bounded by count and source size and can be cleared',()=>{
  const history=new MindHistory({maxCount:2,maxBytes:8});
  for(const [before,after] of [['A','B'],['B','C'],['C','D']])history.record({source:before},after);
  assert.deepEqual(history.undo.map(entry=>entry.source),['B','C']);
  history.record({source:'long source'},'E');
  assert.equal(history.undo.length,0);
  history.record({source:'E'},'F');history.commit('undo',{source:'F'});
  history.clear();
  assert.equal(history.target('undo'),undefined);
  assert.equal(history.target('redo'),undefined);
});
