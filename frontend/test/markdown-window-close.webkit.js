try{
  window.__allowNativeBlur=true;
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=async()=>{await new Promise(resolve=>setTimeout(resolve,180));await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)};
  const fixture=window.__fileDragFixture,path='关闭光标.md';
  window.go.main.App.FinishWindowClose=()=>window.__compactRequest({action:'close'});
  const load=async source=>{
    fixture.documents.set(path,{session:'window-caret',version:1,path,source,root:{id:'r',label:'说明',children:[]}});
    await openDocument(path);markdown.editable.focus();
    const range=document.createRange();range.selectNodeContents(markdown.editable.querySelector('li:last-child')||markdown.editable.lastElementChild);range.collapse(false);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    document.execCommand('insertParagraph');
    const anchor=selection.anchorNode;
    (anchor.nodeType===Node.ELEMENT_NODE?anchor:anchor.parentElement).scrollIntoView({block:'nearest'});
    await settle();await state.queue.drain();
  };
  const reopen=async()=>{await closeApp(true);await window.__compactRequest({action:'reopen'});await settle()};
  const caret=document.querySelector('.global-caret');
  for(const [label,source] of [
    ['ordered','说明\n\n1. 第一项\n2. 第二项\n'],
    ['loose ordered','说明\n\n1. 第一项\n\n2. 第二项\n'],
    ['unordered','说明\n\n- 第一项\n- 第二项\n'],
    ['nested','1. 父项\n   1. 第一项\n   2. 第二项\n'],
    ['scrolled',Array.from({length:30},(_,i)=>'段落 '+i+'\n\n').join('')+'1. 第一项\n2. 第二项\n'],
    ['paragraph','说明\n\n正文\n']
  ]){
    await load(source);
    const selection=window.getSelection(),node=selection.anchorNode,offset=selection.anchorOffset;
    const before=caret.getBoundingClientRect().toJSON(),saved=markdown.currentSource(),writes=fixture.calls.length,scroll=markdown.scrollElement.scrollTop;
    assert(!caret.hidden,label+': caret must be visible before close');
    for(let attempt=0;attempt<3;attempt++){
      await reopen();
      const after=caret.getBoundingClientRect().toJSON();
      assert(document.activeElement===markdown.editable&&selection.anchorNode===node&&selection.anchorOffset===offset,label+': reopening must preserve editor focus and insertion point');
      assert(!caret.hidden&&Math.abs(before.top-after.top)<1&&Math.abs(before.left-after.left)<1&&Math.abs(before.height-after.height)<1,label+': closing and reopening must preserve caret alignment: '+JSON.stringify({before,after,html:markdown.editable.innerHTML}));
      assert(markdown.scrollElement.scrollTop===scroll,label+': closing must preserve scroll position');
      assert(markdown.currentSource()===saved&&fixture.calls.length===writes,label+': closing must not modify or save document');
    }
    document.execCommand('insertText',false,'继续');await settle();await state.queue.drain();
    assert(node.textContent==='继续'||node.parentElement?.textContent==='继续',label+': typing must continue at the restored insertion point');
    assert(fixture.documents.get(path).source===markdown.currentSource(),label+': typing after reopening must still autosave');
  }
  await load('说明\n\n1. 第一项\n2. 第二项\n');
  const text=markdown.editable.querySelector('li').firstChild,range=document.createRange();range.setStart(text,1);range.setEnd(text,3);
  window.getSelection().removeAllRanges();window.getSelection().addRange(range);await settle();await reopen();
  assert(window.getSelection().toString()==='一项'&&!window.getSelection().isCollapsed&&caret.hidden,'Closing must preserve an existing text selection');
  $('toggle-source').focus();await reopen();
  assert(document.activeElement!==markdown.editable,'Closing from a toolbar must not steal focus into the editor');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit window-close caret checks (repeated native hide/reopen, ordered/unordered/nested lists, scrolling, selection, typing and autosave)'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
