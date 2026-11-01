try {
  let checks=0;
  const assert=(value,message)=>{checks++;if(!value)throw new Error(message)};
  const file='颜色.mind.md';
  const open=async()=>{map.collapsed.clear();applySnapshot(await call('OpenDocument',file),{resetView:true})};
  await open();
  for(const style of ['processon','mindnode']){
    map.setStyle(style);
    enqueue('source','# 主节点 [color:#abc]\n续行\n末行 [isFold]\n## 子节点 [isFoldKid]\n### 孙节点\n# 其他\n');await state.queue.drain();
    let parent=state.snapshot.root.children[0],child=parent.children[0];
    assert(map.collapsed.has(child.id)&&!map.layout.positions.some(p=>p.node.label==='孙节点'),'source marker must collapse children');
    await selectNode(parent.id);map.render();
    map.showNodeMenu({target:map.elements.get(parent.id),clientX:50,clientY:50,preventDefault(){}});
    assert(map.nodeMenu.firstChild.textContent==='折叠子节点','context menu offers child folding');
    map.nodeMenu.firstChild.click();
    while(movingNode)await new Promise(resolve=>setTimeout(resolve,10));
    assert(state.snapshot.source.includes('末行 [isFold] [isFoldKid]'),'menu writes marker to last line');
    assert(!map.layout.positions.some(p=>p.id===child.id),'children must be hidden');
    assert((await window.__mindRules.request('ReadDisk',file))===state.snapshot.source,'fold must be saved to disk');
    await restoreMindHistory('undo');
    assert(!state.snapshot.root.children[0].isFoldKid&&map.layout.positions.some(p=>p.id===child.id),'undo restores children and source');
    await restoreMindHistory('redo');
    assert(state.snapshot.root.children[0].isFoldKid&&!map.layout.positions.some(p=>p.id===child.id),'redo folds children');
    await open();parent=state.snapshot.root.children[0];child=parent.children[0];
    assert(map.collapsed.has(parent.id)&&map.collapsed.has(child.id),'reopening restores nested folds');
    assert(parent.label==='主节点\n续行\n末行'&&parent.isFold,'metadata must remain hidden and independent');
    await selectNode(parent.id);await moveSelection('ArrowRight');
    await editNode(child.id);state.editor.value+='修改';state.editor.dispatchEvent(new Event('input',{bubbles:true}));
    await state.queue.drain();await finishNodeSelection();
    assert(!map.collapsed.has(parent.id)&&map.layout.positions.some(p=>p.id===child.id),'editing a temporarily revealed child must keep it visible');
    assert(state.snapshot.root.children[0].isFoldKid,'temporary navigation must retain saved fold');
    await open();parent=state.snapshot.root.children[0];child=parent.children[0];
    await editNode(parent.id);state.editor.value+='修改';state.editor.dispatchEvent(new Event('input',{bubbles:true}));
    await state.queue.drain();await finishNodeSelection();
    await setNodeColor(parent.id,'#123456');
    assert(state.snapshot.root.children[0].isFoldKid,'label and color edits preserve child fold');
    const copied=await call('CopyNodeMarkdown',state.snapshot.session,parent.id,null);
    assert(!copied.includes('[isFold')&&copied.includes('孙节点'),'copy includes hidden descendants without metadata');
    await map.toggleSelected(parent.id);
    assert(!state.snapshot.root.children[0].isFoldKid&&state.snapshot.root.children[0].isFold,'unfold removes only child flag');
    assert(map.layout.positions.some(p=>p.id===child.id)&&!map.layout.positions.some(p=>p.node.label==='孙节点'),'unfold retains nested fold');
    await open();
    assert(!map.collapsed.has(state.snapshot.root.children[0].id),'unfold persists after reopen');
    enqueue('source',state.snapshot.source.replaceAll(' [isFoldKid]',''));await state.queue.drain();
    assert(map.layout.positions.some(p=>p.node.label==='孙节点'),'removing source marker expands children');
  }
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' children fold checks'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
