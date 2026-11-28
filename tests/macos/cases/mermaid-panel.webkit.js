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
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: empty Mermaid panel and document reopen'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:error.message})}
