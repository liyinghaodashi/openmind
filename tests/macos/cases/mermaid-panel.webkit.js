try{
  const path='源/笔记.md',documentFile=window.__fileDragFixture.documents.get(path);
  documentFile.source='正文\n\n```mermaid\ngraph LR\nA --> B\n```\n\n结尾\n';
  const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const assert=(value,message)=>{if(!value)throw new Error(message)};
  await openDocument(path);await settle();
  const open=async()=>{
    const selector='button[aria-label="放大代码块"]';
    for(let i=0;i<60&&!document.querySelector(selector);i++)await settle();
    document.querySelector(selector).click();
  };
  const viewer=document.querySelector('.markdown-code-viewer');
  await open();
  const original=documentFile.source;
  const checkPanel=()=>assert(viewer.querySelector('.markdown-mermaid-panel')?.childNodes.length===0,'工作台右栏应为空');
  checkPanel();
  viewer.querySelector('button').click();await open();checkPanel();
  await openDocument('根.md');await openDocument(path);await settle();await open();checkPanel();
  assert(markdown.currentSource()===original,'重开文档后 Mermaid 原文发生变化');
  const type=viewer.querySelector('select'),dialog=document.getElementById('mermaid-type-dialog');
  const choose=value=>{type.value=value;type.dispatchEvent(new Event('change',{bubbles:true}))};
  assert(type.value==='flowchart'&&[...type.options].map(item=>item.text).join(',')==='泳道图,流程图','图类型错误');
  choose('swimlane');
  assert(dialog.open&&document.activeElement.value==='cancel','缺少清空确认');
  dialog.querySelector('[value="cancel"]').click();await settle();
  assert(type.value==='flowchart'&&markdown.currentSource()===original,'取消后应保留原图');
  choose('swimlane');dialog.querySelector('[value="switch"]').click();await settle();await state.queue.drain();
  const changed=original.replace('graph LR\nA --> B','swimlane-beta LR');
  assert(documentFile.source===changed&&type.value==='swimlane'&&!viewer.querySelector('img').hidden,'泳道图未保存或预览失败');
  await openDocument('根.md');await openDocument(path);await settle();await open();
  assert(type.value==='swimlane'&&markdown.currentSource()===changed,'重新打开后图类型错误');
  choose('flowchart');await settle();await state.queue.drain();
  assert(!dialog.open&&type.value==='flowchart'&&documentFile.source===changed.replace('swimlane-beta LR','flowchart TD'),'空图切换失败');
  viewer.querySelector('button').click();
  assert(markdown.editable.querySelector('[data-mermaid-preview="ready"] pre code').textContent.trim()==='flowchart TD','正文预览未同步');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: Mermaid type switch, confirmation, inline preview, save and reopen'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:error.message})}
