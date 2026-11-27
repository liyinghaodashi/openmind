try {
  const file='颜色.mind.md';
  const open=async()=>applySnapshot(await call('OpenDocument',file),{resetView:true});
  const assert=(ok,message)=>{if(!ok)throw new Error(message)};
  await open();
  enqueue('source','# A [isFoldKid]\n## B [isFocus]\n### C\n# D\n');
  await state.queue.drain();
  await open();
  assert(map.viewRoot.label==='B'&&map.layout.positions.length===2,'Reopening must reveal focus below a folded ancestor');
  const child=map.viewRoot.children[0];
  await toggleFocusMode(child.id,{fromOutline:true});
  const disk=()=>window.__mindRules.request('ReadDisk',file);
  assert(await disk()==='# A [isFoldKid]\n## B\n### C [isFocus]\n# D\n','Switch focus in one saved revision');
  await open();
  assert(map.viewRoot.label==='C'&&map.layout.positions.length===1,'Reopen the new focused leaf');
  await toggleFocusMode(map.focusedId);
  assert(!(await disk()).includes('[isFocus]')&&!map.focusedId,'Exit must clear focus');
  await restoreMindHistory('undo');
  assert(map.viewRoot.label==='C'&&(await disk()).includes('C [isFocus]'),'Undo must restore disk and canvas focus');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: focus persistence'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
