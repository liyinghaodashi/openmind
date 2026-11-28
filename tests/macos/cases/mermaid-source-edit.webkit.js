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
  const field=viewer.querySelector('textarea');
  assert(field.value==='graph LR\nA --> B','初始源码错误：'+JSON.stringify(field.value));
  assert(!field.readOnly,'编辑文档中的 Mermaid 源码应可编辑');
  field.focus();field.select();document.execCommand('insertText',false,'invalid diagram');
  await settle();
  assert(!viewer.querySelector('[role="status"]').hidden,'语法错误应允许在原位修正');
  const source='flowchart LR\nA[输入] --> B[保存]';
  field.select();document.execCommand('insertText',false,source);
  await settle();await state.queue.drain();
  assert(!viewer.hidden&&!viewer.querySelector('img').hidden&&viewer.querySelector('[role="status"]').hidden,'纠错后没有恢复预览');
  assert(documentFile.source.includes(source+'\n```')&&documentFile.source.includes('正文')&&documentFile.source.includes('结尾'),'保存结果错误：'+documentFile.source);
  viewer.querySelector('button').click();await open();
  assert(viewer.querySelector('textarea').value===source,'重新放大时源码错误');
  await openDocument('根.md');await openDocument(path);await settle();await open();
  assert(viewer.querySelector('textarea').value===source,'重开文档后源码丢失');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: Mermaid live edit, syntax recovery, save queue and reopen'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:error.message})}
