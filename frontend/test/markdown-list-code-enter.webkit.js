try{
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,100));
  const native=(inputAction,text)=>new Promise(resolve=>{window.nativeInputDone=resolve;window.webkit.messageHandlers.result.postMessage({inputAction,text})});
  const key=(key,options={})=>markdown.editable.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options}));
  const select=async element=>{
    markdown.editable.focus();
    const range=document.createRange();range.selectNodeContents(element);range.collapse(false);
    window.getSelection().removeAllRanges();window.getSelection().addRange(range);await settle();
  };
  applySnapshot({session:'list-code-enter',version:1,path:'代码块续号.md',source:'1. 第一项\n2. 第二项\n   ```\n   code\n   ```\n',root:{id:'r',label:'第一项',children:[]}},{resetView:true});
  const writes=[];let allow=true;
  markdown.onBeforeInput=()=>allow;markdown.onInput=value=>writes.push(value);
  const load=async(source,belowCode=true)=>{
    markdown.load(source,{session:'list-code-enter',path:'代码块续号.md',reset:true});markdown.setReadOnly(false);
    const original=markdown.editor.getValue();
    await select(markdown.editable.querySelector('pre code')||markdown.editable.querySelector('li'));
    if(belowCode){key('ArrowDown');await settle()}
    writes.length=0;return original;
  };
  const fixtures=[
    {source:'1. 第一项\n2. 第二项\n   ```\n   code\n   ```\n',list:'ol',index:1,number:'3.'},
    {source:'1. 第一项\n   ```\n\n   ```\n',list:'ol',index:0,number:'2.'},
    {source:'8. 第一项\n9. 第二项\n   ```js\n   code\n   ```\n',list:'ol',index:1,number:'10.'},
    {source:'1. 父级\n   1. 子项\n      ```\n      code\n      ```\n',list:'ol ol',index:0,number:'2.'},
    {source:'1. 第一项\n2. 第二项\n   ```\n   code\n   ```\n3. 后续项目\n',list:'ol',index:1,number:'3.'}
  ];
  for(const fixture of fixtures){
    const original=await load(fixture.source);
    const code=markdown.editable.querySelector('[data-type="code-block"]'),paragraph=code.nextElementSibling;
    assert(paragraph?.tagName==='P'&&paragraph.contains(window.getSelection().anchorNode),'ArrowDown must move into a paragraph below list code');
    const codeText=code.querySelector('code').textContent;
    const count=markdown.editable.querySelector(fixture.list).children.length;
    await native('enter');await settle();
    const source=markdown.currentSource(),state=JSON.stringify({fixture,source,html:markdown.editable.innerHTML});
    const list=markdown.editable.querySelector(fixture.list),next=list.children[fixture.index+1];
    assert(list.children.length===count+1&&next.getAttribute('data-marker')===fixture.number,'Enter below code must continue ordered numbering: '+state);
    assert(next.contains(window.getSelection().anchorNode)&&window.getSelection().isCollapsed,'Caret must enter the new numbered item: '+state);
    assert(markdown.editable.querySelectorAll('pre code').length===1&&markdown.editable.querySelector('pre code').textContent===codeText,'Continuation must preserve the code block: '+state);
    assert(writes.length===1&&writes[0]===source,'Continuing numbering must save exactly once: '+state);
    if(fixture.source.includes('后续项目'))assert(list.children[fixture.index+2].textContent==='后续项目','Existing following items must remain after the inserted item');
    if(fixture.source.includes('```js'))assert(source.includes('```js'),'Continuation must preserve the code language');
    key('z',{metaKey:true});await settle();assert(markdown.editor.getValue()===original,'One undo must remove only the new numbered item: '+JSON.stringify({original,actual:markdown.editor.getValue()})+state);
    key('y',{metaKey:true});await settle();assert(markdown.currentSource()===source,'Redo must restore the new numbered item: '+state);
    await native('commit','继续');await settle();
    assert(markdown.editable.querySelector(fixture.list).children[fixture.index+1].textContent==='继续','Typing must edit the new item without duplicating its number');
    const typed=markdown.currentSource();markdown.load(typed,{session:'list-code-enter',path:'代码块续号.md',reset:true});
    assert(markdown.editable.querySelector(fixture.list).children[fixture.index+1].textContent==='继续'&&markdown.editable.querySelector('pre code').textContent===codeText,'Saved numbering and code must survive reload');
  }
  await load('1. 第一项\n2. 第二项\n3. \n',false);
  await select(markdown.editable.querySelector('ol > li:last-child'));key('k',{metaKey:true});await settle();key('ArrowDown');await settle();
  await native('enter');await settle();
  assert(markdown.editable.querySelectorAll('ol > li').length===3&&markdown.editable.querySelector('ol > li:last-child').getAttribute('data-marker')==='3.','Command+K then leaving code and pressing Enter must restore item 3');
  await native('enter');await settle();
  assert(markdown.editable.querySelectorAll('ol > li').length===2&&window.getSelection().anchorNode.parentElement.closest('li')===null,'Enter on the new empty item must still exit the ordered list');
  for(const guard of ['composition','event-composition','blocked','readonly','line-break','text']){
    await load(fixtures[0].source);
    if(guard==='text'){document.execCommand('insertText',false,'正文');await settle();writes.length=0}
    const original=markdown.currentSource();
    if(guard==='composition')markdown.composing=true;
    if(guard==='blocked')allow=false;
    if(guard==='readonly')markdown.setReadOnly(true);
    markdown.editable.dispatchEvent(new InputEvent('beforeinput',{inputType:guard==='line-break'?'insertLineBreak':'insertParagraph',isComposing:guard==='event-composition',bubbles:true,cancelable:true}));
    markdown.composing=false;allow=true;markdown.setReadOnly(false);await settle();
    assert(markdown.currentSource()===original&&writes.length===0,'The '+guard+' case must not run list-code continuation');
  }
  await load(fixtures[0].source,false);const beforeCode=markdown.editable.querySelector('pre code').textContent;
  await native('enter');await settle();
  assert(markdown.editable.querySelectorAll('ol > li').length===2&&markdown.editable.querySelector('pre code').textContent.length>beforeCode.length,'Enter inside code must remain a code newline');
  await load('```\ncode\n```\n');await native('enter');await settle();
  assert(!markdown.editable.querySelector('ol'),'A standalone code block must not start a numbered list');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit list-code Enter checks (numbering, nested lists, caret, saving, undo/redo, reload, list exit and input guards)'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
