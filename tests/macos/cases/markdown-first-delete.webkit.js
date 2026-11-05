try{
  const settle=()=>new Promise(resolve=>setTimeout(resolve,180));
  const assert=(ok,message)=>{if(!ok)throw new Error(message)};
  const key=name=>new Promise(resolve=>{window.__mindKeyDone=resolve;window.webkit.messageHandlers[name].postMessage({})});
  const source='**测试标题**\n\n1. 第一条文字需要删除\n2. 第二条保留\n';
  applySnapshot({session:'first-delete',version:1,path:'首次删除.md',source,root:{id:'r',children:[]}},{resetView:true});
  const writes=[];markdown.onInput=value=>writes.push(value);markdown.onBeforeInput=()=>true;
  for(const backward of [false,true]){
    markdown.load(source,{session:'first-delete',path:'首次删除.md',reset:true});markdown.setReadOnly(false);await settle();
    const walker=document.createTreeWalker(markdown.editable,NodeFilter.SHOW_TEXT);let text;
    while(text=walker.nextNode()){if(text.textContent.startsWith('第一条'))break}
    assert(text,'List text must exist');
    markdown.editable.focus();
    window.getSelection().setBaseAndExtent(text,backward?3:0,text,backward?0:3);
    markdown.editable.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    await settle();
    assert(window.getSelection().toString()==='第一条','Selection must contain target text');
    const before=markdown.editor.getValue();writes.length=0;
    await key('deleteKey');await settle();markdown.flush();
    assert(markdown.editor.getValue()===before.replace('第一条',''),'First Backspace must delete selection ('+backward+')');
    assert(writes.at(-1)===before.replace('第一条',''),'Deletion must reach save callback');
    markdown.editor.vditor.toolbar.elements.undo.firstElementChild.click();await settle();
    assert(markdown.editor.getValue()===before,'Undo must restore deleted text: '+JSON.stringify({backward,value:markdown.editor.getValue(),before}));
  }
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: WebKit forward/backward selection, first Backspace, save and undo'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message})}
