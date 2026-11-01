try{
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,250));
  const key=(value,options={},target=markdown.editable)=>{
    const event=new KeyboardEvent('keydown',{key:value,code:/^[1-5]$/.test(value)?'Digit'+value:value==='k'?'KeyK':value==='z'?'KeyZ':'',metaKey:true,bubbles:true,cancelable:true,...options});
    target.dispatchEvent(event);return event;
  };
  const writes=[];
  applySnapshot({session:'shortcuts',version:1,path:'快捷键.md',source:'正文\n',root:{id:'r',label:'正文',children:[]}},{resetView:true});
  markdown.onInput=value=>writes.push(value);
  let allow=true;
  markdown.onBeforeInput=()=>allow;
  const select=async(selector,all=false)=>{
    markdown.editable.focus();
    const range=document.createRange();range.selectNodeContents(markdown.editable.querySelector(selector)||markdown.editable);
    if(!all)range.collapse(false);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    markdown.editable.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
    await settle();
  };
  const load=async(source='正文\n',selector='p',all=false)=>{
    markdown.load(source,{session:'shortcuts',path:'快捷键.md',reset:true});markdown.setReadOnly(false);
    await select(selector,all);writes.length=0;
  };
  for(const [source,selector,readOnly] of [['正文\n','p',false],['正文\n','p',true],['```\nplain code\n```\n','pre code',false],['| A | B |\n| --- | --- |\n| C | D |\n','td',false]]){
    await load(source,selector);markdown.setReadOnly(readOnly);
    const before=markdown.editor.getValue(),tables=markdown.editable.querySelectorAll('table').length;
    const event=key('m',{code:'KeyM',keyCode:77});await settle();
    assert(!event.defaultPrevented,'Command+M must remain available to macOS minimisation');
    assert(markdown.editor.getValue()===before&&markdown.editable.querySelectorAll('table').length===tables,'Command+M must not insert a table or change document content');
    assert(writes.length===0&&!markdown.tableDialog?.element.open,'Command+M must not autosave or open the table dialog');
  }
  await load();assert(key('t',{code:'KeyT'}).defaultPrevented,'Command+T must still open the table dialog');await settle();
  assert(markdown.tableDialog?.element.open&&writes.length===0,'Opening the table dialog must not change the document');
  markdown.tableDialog.confirm();await settle();
  assert(markdown.editable.querySelector('table')&&writes.length===1,'Command+T must still insert a table and autosave exactly once');
  for(let level=1;level<=5;level++){
    await load();assert(key(String(level)).defaultPrevented,'Heading shortcut must be consumed');await settle();
    assert(markdown.editor.getValue()==='#'.repeat(level)+' 正文\n','Heading '+level+' must preserve text');
    assert(writes.length===1&&writes[0]===markdown.currentSource(),'Heading must autosave exactly once');
    assert(markdown.headings()[0]?.level===level,'Heading must update outline');
    key('z');await settle();assert(markdown.editor.getValue()==='正文\n','Heading must support undo');
    key('y');await settle();assert(markdown.editor.getValue()==='#'.repeat(level)+' 正文\n','Heading must support redo');
    writes.length=0;key(String(level));await settle();
    assert(markdown.editor.getValue()==='正文\n','Repeated heading '+level+' shortcut must toggle off');
    assert(writes.length===1&&writes[0]===markdown.currentSource(),'Removing heading must autosave exactly once');
    assert(markdown.headings().length===0,'Removing heading must update outline');
    assert(markdown.editable.contains(window.getSelection().anchorNode),'Removing heading must preserve editor selection');
    key('z');await settle();assert(markdown.editor.getValue()==='#'.repeat(level)+' 正文\n','Removing heading must support undo');
    key('y');await settle();assert(markdown.editor.getValue()==='正文\n','Removing heading must support redo');
    await load('#'.repeat(level)+' 已有**标题**\n','h'+level);
    key(String(level));await settle();
    assert(markdown.editor.getValue()==='已有**标题**\n','Existing heading '+level+' must toggle off and preserve inline formatting');
  }
  await load('## 已有标题\n','h2');key('5');await settle();
  assert(markdown.editor.getValue()==='##### 已有标题\n','Changing heading level must not duplicate markers');
  for(const [shortcut,tag,pattern] of [['[','ol',/^1\. 正文\n$/],[']','ul',/^[*+-] 正文\n$/]]){
    await load();key(shortcut);await settle();
    assert(pattern.test(markdown.editor.getValue())&&markdown.editable.querySelector(tag),'List shortcut must convert paragraph');
    assert(writes.length===1,'List must autosave exactly once');
    key(shortcut);await settle();assert(markdown.editor.getValue()==='正文\n','Repeated list shortcut must toggle off');
  }
  await load('第一段\n\n第二段\n');
  const paragraphs=markdown.editable.querySelectorAll('p'),range=document.createRange();
  range.setStart(paragraphs[0],0);range.setEnd(paragraphs[1],paragraphs[1].childNodes.length);
  window.getSelection().removeAllRanges();window.getSelection().addRange(range);await settle();key('[');await settle();
  assert(markdown.editable.querySelectorAll('ol > li').length===2,'Selected paragraphs must become separate list items');
  key(']');await settle();assert(markdown.editable.querySelectorAll('ul > li').length===2,'Ordered list must switch to unordered');
  await load('const answer = 42;\n','p',true);key('k');await settle();
  assert(markdown.editable.querySelector('pre code')?.textContent.includes('const answer = 42;'),'Command+K must wrap selection as code');
  assert(!markdown.editable.querySelector('a')&&writes.length===1,'Command+K must not insert a link or save twice');
  key('z');await settle();assert(markdown.editor.getValue()==='const answer = 42;\n','Code block must support undo');
  await load('\n');key('k');await settle();assert(markdown.editable.querySelector('pre code'),'Command+K must create an empty code block');
  for(const shortcut of ['1','[',']','k']){
    await load();const before=markdown.editor.getValue();
    key(shortcut,{repeat:true});key(shortcut,{isComposing:true});key(shortcut,{keyCode:229});
    markdown.composing=true;key(shortcut);markdown.composing=false;
    allow=false;key(shortcut);allow=true;
    markdown.setReadOnly(true);key(shortcut);markdown.setReadOnly(false);
    await settle();assert(markdown.editor.getValue()===before&&writes.length===0,'IME, held keys, blocked saves and read-only must not change content');
    assert(!key(shortcut,{ctrlKey:true,metaKey:false}).defaultPrevented,'Control must not substitute for Command');
    assert(!key(shortcut,{},$('source-editor')).defaultPrevented,'Source editor must not receive body shortcuts');
  }
  await load('```\nplain code\n```\n','pre code');key('1');key('[');key(']');await settle();
  assert(markdown.editor.getValue()==='```\nplain code\n```\n'&&writes.length===0,'Formatting inside code must preserve code content: '+JSON.stringify({value:markdown.editor.getValue(),writes}));
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit Markdown shortcut checks'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
