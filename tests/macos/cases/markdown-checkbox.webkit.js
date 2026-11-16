try{
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,220));
  const pointer=element=>new Promise(resolve=>{
    window.__nodePointerDone=resolve;
    const rect=element.getBoundingClientRect();
    window.webkit.messageHandlers.pointer.postMessage({x:rect.x+rect.width/2,y:rect.y+rect.height/2,count:1});
  });
  const writes=[];
  markdown.onInput=value=>writes.push(value);markdown.onBeforeInput=()=>true;markdown.onOutline=()=>{};
  document.querySelector('#markdown-page').hidden=false;document.querySelector('#canvas').hidden=true;
  markdown.load('- [ ] 任务文字\n',{session:'checkbox',path:'任务.md',reset:true});markdown.setReadOnly(false);await settle();
  markdown.editable.focus();
  const initialRange=document.createRange();initialRange.setStartBefore(markdown.editable.querySelector('input'));initialRange.collapse(true);
  window.getSelection().removeAllRanges();window.getSelection().addRange(initialRange);
  for(const checked of [true,false]){
    await pointer(markdown.editable.querySelector('input'));await settle();
    const checkbox=markdown.editable.querySelector('input');
    assert(checkbox.checked===checked,'Click must toggle checkbox');
    assert(markdown.currentSource().includes(checked?'[X]':'[ ]')||checked&&markdown.currentSource().includes('[x]'),'Toggle must update Markdown: '+markdown.currentSource());
    const selection=window.getSelection();
    const visibleCaret=selection.rangeCount&&selection.isCollapsed&&markdown.editable.contains(selection.anchorNode);
    const rect=visibleCaret?selection.getRangeAt(0).getBoundingClientRect():null;
    assert(!rect||rect.x>checkbox.getBoundingClientRect().right,'Checkbox click must not leave caret beside checkbox: '+JSON.stringify({caret:rect?.x,box:checkbox.getBoundingClientRect().right,html:markdown.editable.innerHTML}));
  }
  assert(writes.length===2,'Each toggle must save once');
  await pointer(markdown.editable.querySelector('li'));await settle();
  assert(window.getSelection().rangeCount&&markdown.editable.contains(window.getSelection().anchorNode),'Clicking task text must restore editing selection');
  const text=markdown.editable.querySelector('li').lastChild,range=document.createRange();
  range.setStart(text,text.textContent.length);range.collapse(true);
  window.getSelection().removeAllRanges();window.getSelection().addRange(range);markdown.editable.focus();
  document.execCommand('insertText',false,'新增');await settle();markdown.flush();
  assert(markdown.currentSource().includes('任务文字新增'),'Task text must remain editable');
  const savedCount=writes.length;
  markdown.setReadOnly(true);const before=markdown.currentSource();await pointer(markdown.editable.querySelector('input'));await settle();
  assert(markdown.currentSource()===before&&writes.length===savedCount,'Readonly checkbox must not change');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit checkbox checks'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message})}
