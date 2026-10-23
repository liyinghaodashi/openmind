try {
  let checks=0;
  const assert=(value,message)=>{checks++;if(!value)throw new Error(message)};
  applySnapshot(await call('OpenDocument','颜色.mind.md'),{resetView:true});
  const source='# 第一行 [color:#abc]\n第二行\n第三行\n## 子节点\n# 两行\n第二行\n# '+ '自动换行测试'.repeat(40)+'\n';
  enqueue('source',source);await state.queue.drain();
  const menu=id=>{map.render();map.showNodeMenu({target:map.elements.get(id),clientX:50,clientY:50,preventDefault(){}})};
  for(const style of ['processon','mindnode']){
    map.setStyle(style);map.x=24;map.y=20;
    const id=state.snapshot.root.children[0].id;
    await selectNode(id);menu(id);assert(!map.textFoldButton.hidden,'three lines must offer folding');
    await toggleNodeFold(id);assert(state.snapshot.source.includes('[isFold]'),'fold must persist');
    await restoreMindHistory('undo');assert(!state.snapshot.root.children[0].isFold,'undo fold');
    await restoreMindHistory('redo');assert(state.snapshot.root.children[0].isFold,'redo fold');
    assert(map.layout.positions.find(p=>p.id===id).displayLabel===undefined,'selected folded node stays expanded');
    await selectNode(null);map.render();
    const p=map.layout.positions.find(p=>p.id===id),element=map.elements.get(id);
    assert(p.displayLabel.endsWith('...')&&!p.displayLabel.includes('\n'),'multiline folds to first line');
    assert(Math.abs(element.getBoundingClientRect().height-p.height)<1,'folded DOM must match layout');
    assert(map.layout.positions.some(p=>p.node.label==='子节点'),'text folding must keep children');
    menu(id);assert(map.textFoldButton.textContent==='取消折叠','folded node can be unfolded');
    await selectNode(id);assert(map.layout.positions.find(p=>p.id===id).height>p.height,'selection restores size');
    await editNode(id);assert(state.editor.value==='第一行\n第二行\n第三行','editor hides metadata');
    state.editor.value+='修改';state.editor.dispatchEvent(new Event('input',{bubbles:true}));await state.queue.drain();await finishNodeSelection();
    assert(state.snapshot.root.children[0].isFold,'editing retains fold');
    await setNodeColor(id,'#123456');assert(state.snapshot.root.children[0].isFold,'color retains fold');
    await toggleNodeFold(id);assert(!state.snapshot.root.children[0].isFold,'unfold clears metadata');
    const two=state.snapshot.root.children[1].id;await selectNode(two);menu(two);assert(map.textFoldButton.hidden,'two lines cannot fold');
    const long=state.snapshot.root.children[2].id;await selectNode(long);menu(long);assert(!map.textFoldButton.hidden,'automatic wrapping counts');
    await toggleNodeFold(long);await selectNode(null);map.render();
    const lp=map.layout.positions.find(p=>p.id===long);assert(lp.displayLabel.endsWith('...')&&!lp.displayLabel.includes('\n'),'wrapped text ellipsis');
    assert(Math.abs(map.elements.get(long).getBoundingClientRect().height-lp.height)<1,'wrapped folded height');
    await toggleNodeFold(long);
    enqueue('source',source);await state.queue.drain();
  }
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' text fold checks'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
