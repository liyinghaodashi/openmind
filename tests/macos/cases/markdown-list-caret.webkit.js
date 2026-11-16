try{
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=async()=>{await new Promise(resolve=>setTimeout(resolve,150));window.dispatchEvent(new Event('focus'));await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)};
  applySnapshot({session:'list-caret',version:1,path:'光标.md',source:'### 新节点\n',root:{id:'r',label:'新节点',children:[]}},{resetView:true});
  const writes=[];markdown.onInput=value=>writes.push(value);markdown.onBeforeInput=()=>true;markdown.setReadOnly(false);
  for(const level of [1,3,5])for(const shortcut of ['[',']']){
    markdown.load('#'.repeat(level)+' 新节点\n',{session:'list-caret',path:'光标.md',reset:true});
    markdown.editable.focus();
    const range=document.createRange();range.selectNodeContents(markdown.editable.querySelector('h'+level));range.collapse(false);
    window.getSelection().removeAllRanges();window.getSelection().addRange(range);
    document.execCommand('insertParagraph');await settle();
    markdown.editable.dispatchEvent(new KeyboardEvent('keydown',{key:shortcut,metaKey:true,bubbles:true,cancelable:true}));
    const source=markdown.currentSource(),writeCount=writes.length;
    await settle();
    const caret=document.querySelector('.global-caret'),before=caret.getBoundingClientRect().toJSON();
    const label='H'+level+' / '+(shortcut==='['?'ordered':'unordered');
    assert(!caret.hidden&&before.height>0,label+': empty list must have a measurable custom caret before typing');
    assert(markdown.currentSource()===source&&writes.length===writeCount&&!source.includes('\u200b'),label+': measuring must not modify or save document');
    const selection=window.getSelection();
    assert(selection.isCollapsed&&selection.anchorNode.nodeName==='LI'&&selection.anchorOffset===0,label+': measuring must preserve insertion point');
    document.execCommand('insertText',false,'a');await settle();
    const after=caret.getBoundingClientRect().toJSON();
    assert(!caret.hidden&&Math.abs(before.top-after.top)<1&&Math.abs(before.height-after.height)<1,label+': empty caret must align with typed text: '+JSON.stringify({before,after}));
  }
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit empty-list caret checks (heading levels, ordered/unordered, alignment and no document changes)'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
