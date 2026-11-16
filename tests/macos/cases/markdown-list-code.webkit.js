try{
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,200));
  const key=value=>markdown.editable.dispatchEvent(new KeyboardEvent('keydown',{key:value,code:'Key'+value.toUpperCase(),metaKey:true,bubbles:true,cancelable:true}));
  const writes=[];
  applySnapshot({session:'list-code',version:1,path:'列表代码.md',source:'1. 你好\n',root:{id:'r',label:'你好',children:[]}},{resetView:true});
  markdown.onBeforeInput=()=>true;markdown.onInput=value=>writes.push(value);
  const load=async(source,selector,selected)=>{
    markdown.load(source,{session:'list-code',path:'列表代码.md',reset:true});markdown.setReadOnly(false);markdown.editable.focus();
    const item=markdown.editable.querySelector(selector),range=document.createRange();range.selectNodeContents(item);range.collapse(false);
    if(selected){const text=item.firstChild;range.setStart(text,selected[0]);range.setEnd(text,selected[1])}
    window.getSelection().removeAllRanges();window.getSelection().addRange(range);
    markdown.editable.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));await settle();writes.length=0;
  };
  const cases=[
    {source:'1. 你好\n2. \n',selector:'ol > li:last-child',items:1},
    {source:'同步说明\n\n1. 下载 **文件** 并解压\n2. 启动 mac启动.command\n3. \n\n后续正文\n',selector:'ol > li:last-child',items:2},
    {source:'1. 父级\n   1. 你好\n   2. \n',selector:'ol ol > li:last-child',items:2},
    {source:'- 你好\n- \n',selector:'ul > li:last-child',items:1},
    {source:'1. \n',selector:'ol > li',items:1},
    {source:'1. 你好\n2. 后续\n',selector:'ol > li:first-child',items:2},
    {source:'1. before chosen after\n2. 后续\n',selector:'ol > li:first-child',selected:[7,13],items:2,text:'chosen'}
  ];
  for(const fixture of cases){
    await load(fixture.source,fixture.selector,fixture.selected);
    const original=markdown.editor.getValue();key('k');await settle();
    const source=markdown.currentSource(),state=JSON.stringify({fixture,source,html:markdown.editable.innerHTML});
    const codes=markdown.editable.querySelectorAll('pre code'),code=codes[0];
    assert(codes.length===1,'Command+K must create exactly one code block: '+state);
    assert(code.closest('li')&&markdown.editable.querySelectorAll('li').length===fixture.items,'Code must belong to the correct list item without an empty number: '+state);
    assert(code.textContent.trim()===(fixture.text||''),'Selected code text must be preserved: '+state);
    assert(code.contains(window.getSelection().anchorNode),'Command+K must put the caret inside code: '+state);
    if(!fixture.text)assert(window.getSelection().anchorOffset===0,'Empty code must place the caret on its first line: '+state);
    assert(writes.length===1&&writes[0]===source,'Code insertion must autosave exactly once: '+state);
    if(fixture.source.includes('**文件**'))assert(source.includes('**文件**')&&source.includes('启动 mac启动.command')&&source.startsWith('同步说明')&&source.endsWith('后续正文\n'),'Code insertion must preserve surrounding text and formatting: '+state);
    if(fixture.selected)assert(source.includes('before')&&source.includes('after')&&source.includes('后续'),'Wrapping selected text must preserve the rest of the list: '+state);
    if(fixture.source==='1. 你好\n2. \n'){
      const item=code.closest('li'),label=document.createRange();label.selectNodeContents(item);label.setEndBefore(item.querySelector('[data-type="code-block"]'));
      assert(Math.abs(label.getBoundingClientRect().left-code.closest('pre').getBoundingClientRect().left)<1,'Code must align with list text as in the reference image: '+state);
    }
    key('z');await settle();assert(markdown.editor.getValue()===original,'One undo must restore the original list: '+state);
    key('y');await settle();assert(markdown.currentSource()===source,'Redo must restore the list code block: '+state);
    document.execCommand('insertText',false,'echo <ok>');await settle();
    assert(markdown.editable.querySelector('li pre code')?.textContent.includes('echo <ok>'),'Typing after Command+K must edit the code block');
    const typed=markdown.currentSource();
    markdown.load(typed,{session:'list-code',path:'列表代码.md',reset:true});
    assert(markdown.editable.querySelectorAll('pre code').length===1&&markdown.editable.querySelector('li pre code')?.textContent.includes('echo <ok>'),'Saved Markdown must reload as one nested code block: '+typed);
  }
  await load('1. 你好\n','ol > li');
  await new Promise(resolve=>{window.nativeInputDone=resolve;window.webkit.messageHandlers.result.postMessage({inputAction:'enter'})});await settle();writes.length=0;
  assert(markdown.editable.querySelectorAll('ol > li').length===2,'Native Enter must create the empty numbered item');
  key('k');await settle();
  assert(markdown.editable.querySelectorAll('ol > li').length===1&&markdown.editable.querySelectorAll('pre code').length===1&&markdown.editable.querySelector('ol > li pre code'),'Native Enter followed by Command+K must create code under the existing text');
  assert(writes.length===1,'Native Enter then Command+K must save code insertion once');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit list code-block checks (empty items, nested lists, selection, caret, saving, undo/redo and reload)'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
