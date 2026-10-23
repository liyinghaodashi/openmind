try {
  let checks=0;
  const assert=(value,message)=>{checks++;if(!value)throw new Error(message)};
  const settle=async()=>{await new Promise(resolve=>setTimeout(resolve,90));await new Promise(requestAnimationFrame)};
  for(const [path,labels,roots] of [
    ['缺失父级.mind.md',['二级起点','直接列表','子列表','跳级标题','六级标题','细分','另一个起点'],2],
    ['纯列表.mind.md',['缩进起点','子项','独立节点'],2]
  ]) {
    state.queue.reset();map.collapsed.clear();map.selected=null;
    applySnapshot(await call('OpenDocument',path),{resetView:true});
    const original=state.snapshot.source;
    for(const style of ['processon','mindnode']) {
      map.setStyle(style);map.fit();map.render();await settle();
      assert(map.layout.positions.map(p=>p.node.label).join('|')===labels.join('|'),style+': every node must be laid out');
      assert(map.layout.positions.every(p=>map.elements.has(p.id)),style+': every node must render');
      assert(map.layout.positions.filter(p=>p.depth===0).length===roots,style+': missing parents must produce independent roots');
      assert(map.layout.edges.length===labels.length-roots,style+': edges must follow actual parents');
      assert(!map.elements.has('root'),style+': file root must remain hidden');
    }
    assert(await window.__mindRules.request('ReadDisk',path)===original,'Opening and rendering must preserve source');
    const first=state.snapshot.root.children[0];
    await editNode(first.id);state.editor.value=labels[0]+'修改';state.editor.dispatchEvent(new InputEvent('input',{bubbles:true}));await state.queue.drain();await finishNodeSelection();await settle();
    assert(state.snapshot.root.children[0].label===labels[0]+'修改','Orphan root must remain editable');
    const copy=await call('CopyNodeMarkdown',state.snapshot.session,state.snapshot.root.children[0].id,null);
    assert(copy.includes(labels[1])&&!copy.includes(labels.at(-1)),'Copy must preserve subtree boundaries');
    await selectNode(state.snapshot.root.children[0].id);await addChild();await settle();
    assert(state.editor,'Orphan root must accept a child');
    state.editor.value='新增子节点';state.editor.dispatchEvent(new InputEvent('input',{bubbles:true}));await state.queue.drain();await finishNodeSelection();await settle();
    assert(map.layout.positions.some(p=>p.node.label==='新增子节点'),'New child must render');
    await deleteNode();await settle();
    assert(map.layout.positions.length===labels.length,'Deleting added child must preserve existing nodes');
    assert($('error-banner').hidden,'Operations must not produce save errors');
  }
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' relaxed hierarchy WebKit checks'});
} catch(error) {window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
