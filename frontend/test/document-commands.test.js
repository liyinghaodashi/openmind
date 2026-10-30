import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentCommands} from '../src/document/commands.js';
import {EditQueue} from '../src/queue.js';
import {MindHistory} from '../src/features/mind-history.js';

function setup(path='test.mind.md') {
  let snapshot={session:'a',version:1,path,source:'A'};
  const writes=[],history=new MindHistory();
  const commands=createDocumentCommands({clientID:'test',getSnapshot:()=>snapshot,
    captureHistory:()=>({source:snapshot.source}),history,
    write:async command=>{writes.push(command);if(command.text==='fail')throw new Error('disk');return {...snapshot,version:snapshot.version+1,source:command.text};}});
  return {commands,writes,history,get snapshot(){return snapshot},commit:value=>{snapshot=value}};
}

test('queued commands bind the latest committed version, retain unique operation IDs',async()=>{
  const ui=setup();
  const queue=new EditQueue({write:ui.commands.apply,onCommit:ui.commit});
  queue.push(ui.commands.prepare({kind:'source',text:'B'}));
  queue.push(ui.commands.prepare({kind:'source',text:'C'}));
  assert.equal(await queue.drain(),true);
  assert.deepEqual(ui.writes.map(c=>[c.session,c.version,c.opId]),[['a',1,'test:1'],['a',2,'test:2']]);
  assert.equal(ui.snapshot.source,'C');
});

test('node typing groups history; failed writes and history restoration do not add entries',async()=>{
  const ui=setup();
  for(const text of ['B','C'])ui.commit(await ui.commands.apply(ui.commands.prepare({kind:'label',nodeId:'n1',text})));
  assert.equal(ui.history.undo.length,1);
  assert.equal(ui.history.target('undo').source,'A');
  await assert.rejects(ui.commands.apply(ui.commands.prepare({kind:'label',nodeId:'n1',text:'fail'})),/disk/);
  ui.commit(await ui.commands.apply(ui.commands.prepare({kind:'restore-mind',text:'A'})));
  assert.equal(ui.history.undo.length,1);
});

test('Markdown editing does not enter mind history',async()=>{
  const ui=setup('test.md');
  ui.commit(await ui.commands.apply(ui.commands.prepare({kind:'source',text:'B'})));
  assert.equal(ui.history.undo.length,0);
});
