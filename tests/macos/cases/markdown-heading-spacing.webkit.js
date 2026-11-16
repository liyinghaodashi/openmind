try{
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,100));
  const source='# 大标题\n\n小标题，放大后又被缩小了\n\n你好\n';
  applySnapshot({session:'heading-spacing',version:1,path:'标题间距.md',source,root:{id:'r',label:'大标题',children:[]}},{resetView:true});
  const writes=[];markdown.onBeforeInput=()=>true;markdown.onInput=value=>writes.push(value);
  const key=value=>markdown.editable.dispatchEvent(new KeyboardEvent('keydown',{key:value,metaKey:true,bubbles:true,cancelable:true}));
  for(let level=1;level<=5;level++){
    markdown.load(source,{session:'heading-spacing',path:'标题间距.md',reset:true});markdown.setReadOnly(false);writes.length=0;
    markdown.editable.focus();
    const range=document.createRange();range.selectNodeContents(markdown.editable.querySelector('p'));range.collapse(false);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    markdown.editable.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));await settle();
    const before=markdown.editor.getValue();
    key(String(level));await settle();
    assert(markdown.headings().some(heading=>heading.level===level&&heading.label==='小标题，放大后又被缩小了'),'H'+level+' shortcut must enlarge the target paragraph');
    key(String(level));await settle();
    assert(markdown.editor.getValue()===before,'H'+level+' toggle must preserve document text');
    const paragraphs=markdown.editable.querySelectorAll('p');
    assert(paragraphs.length===2,'H'+level+' toggle must not insert an empty paragraph');
    const gap=paragraphs[1].getBoundingClientRect().top-paragraphs[0].getBoundingClientRect().bottom;
    assert(Math.abs(gap)<1,'H'+level+' restored paragraph must not leave a blank line before following content: '+gap+'px');
    assert(writes.length===2,'H'+level+' round trip must save each formatting change once');
    key('z');await settle();assert(markdown.headings().some(heading=>heading.level===level&&heading.label==='小标题，放大后又被缩小了'),'H'+level+' restoration must support undo');
    key('y');await settle();assert(markdown.editor.getValue()===before,'H'+level+' restoration must support redo');
  }
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit heading spacing checks'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
