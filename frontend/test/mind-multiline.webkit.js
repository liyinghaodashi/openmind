try{
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=async()=>{await state.queue.drain();await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)};
  const nodes=()=>{const all=[];const visit=node=>{all.push(node);node.children.forEach(visit)};visit(state.snapshot.root);return all};
  const find=label=>nodes().find(node=>node.label===label);
  const paste=async text=>{
    const editor=state.editor;editor.focus();editor.select();
    const transfer=new DataTransfer();transfer.setData('text/plain',text);
    const event=new ClipboardEvent('paste',{clipboardData:transfer,bubbles:true,cancelable:true});
    editor.dispatchEvent(event);
    assert(!event.defaultPrevented,'Multiline paste must not show the single-line rejection');
    assert(document.execCommand('insertText',false,text),'WebKit must insert the pasted text');
    await settle();
    assert(!state.blocked&&$('error-banner').hidden,'Multiline input must save successfully');
  };
  for(const style of ['processon','mindnode']){
    map.setStyle(style);
    state.queue.reset();applySnapshot(await call('OpenDocument','颜色.mind.md'),{resetView:true});map.fit();map.render();await settle();
    const original=state.snapshot.source;
    await editNode(find('子项').id);
    const label='第一行\n第二行\n\n第三行🐱';
    await paste(label);
    assert(state.editor.value===label,'Editor must retain every pasted line');
    assert(await call('CopyNodeText',state.snapshot.session,map.editing,null)===label,'Copy must include all node lines without color metadata');
    await finishNodeSelection();await settle();
    let node=find(label);
    assert(node&&node.color==='#D5AA45'&&node.children[0].label==='深层','Reparse must retain continuation, color and children');
    const bounds=map.elements.get(node.id).getBoundingClientRect();
    assert(bounds.height>=4*22*map.scale,'Rendered node must reserve height for every line');
    const saved=state.snapshot.source;
    assert(await window.__mindRules.request('ReadDisk','颜色.mind.md')===saved,'Pasted lines must reach disk');
    await restoreMindHistory('undo');await settle();assert(state.snapshot.source===original,'Undo must restore the whole paste');
    await restoreMindHistory('redo');await settle();assert(state.snapshot.source===saved,'Redo must restore all lines');
    applySnapshot(await call('OpenDocument','颜色.mind.md'),{resetView:true});map.fit();map.render();await settle();
    node=find(label);assert(node&&node.children[0].label==='深层','Reopening must preserve multiline node and children');
    await editNode(node.id);
    await paste('第一行\n普通续行\n- 新同级\n同级续行');
    await finishNodeSelection();await settle();
    assert(find('第一行\n普通续行')&&find('新同级\n同级续行')?.children[0].label==='深层','List markers must split nodes according to Markdown');
    await editNode(find('新同级\n同级续行').id);await paste('恢复单行');await finishNodeSelection();await settle();
    assert(find('恢复单行')&&!state.snapshot.source.includes('同级续行'),'Replacing multiline text must remove old continuation');
    applySnapshot(await call('ApplyEdit',{kind:'restore-mind',text:original,session:state.snapshot.session,version:state.snapshot.version,opId:state.clientID+':'+(++state.opSeq)}));
  }
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' multiline mind checks (WebKit paste event, input, disk, reparse, reopen, colors, hierarchy, layout, undo/redo, both styles)'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
