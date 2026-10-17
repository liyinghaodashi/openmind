try{
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,100));
  const input=(inputAction,text)=>new Promise(resolve=>{window.nativeInputDone=resolve;window.webkit.messageHandlers.result.postMessage({inputAction,text})});
  const key=value=>markdown.editable.dispatchEvent(new KeyboardEvent('keydown',{key:value,metaKey:true,bubbles:true,cancelable:true}));
  const select=(element,all=false)=>{
    markdown.editable.focus();
    const range=document.createRange();range.selectNodeContents(element);
    if(all){const marker=element.querySelector('.vditor-ir__marker--heading');if(marker)range.setStartAfter(marker)}
    else range.collapse(false);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
  };
  const check=(level,label,context)=>{
    const heading=markdown.headings().find(item=>item.level===level&&item.label===label)?.element;
    assert(heading,context+': heading must remain H'+level+': '+markdown.editor.getValue());
    assert(heading.getBoundingClientRect().height>20,context+': heading must have a visible line');
    assert(heading.contains(window.getSelection().anchorNode),context+': caret must remain in the heading');
    if(label){
      const text=[...heading.childNodes].find(node=>node.nodeType===Node.TEXT_NODE&&node.textContent.includes(label));
      assert(text,context+': committed text must remain outside the invisible marker');
      const range=document.createRange();range.selectNodeContents(text);
      assert(range.getBoundingClientRect().width>0,context+': committed text must be visible');
    }
    return heading;
  };
  applySnapshot({session:'heading-input',version:1,path:'标题输入.md',source:'\n',root:{id:'r',label:'',children:[]}},{resetView:true});
  const writes=[],events=[];
  markdown.onBeforeInput=()=>true;markdown.onInput=value=>writes.push(value);
  markdown.editable.addEventListener('beforeinput',event=>events.push(event.inputType));
  for(let level=1;level<=5;level++)for(const middle of [false,true]){
    const prefix=middle?'上一段\n\n':'',suffix=middle?'\n## 后一节\n':'';
    markdown.load(middle?'上一段\n\n## 后一节\n':'\n',{session:'heading-input',path:'标题输入.md',reset:true});markdown.setReadOnly(false);
    select(markdown.editable.querySelector('p')||markdown.editable);await settle();
    if(middle){document.execCommand('insertParagraph');await settle()}
    key(String(level));await settle();
    writes.length=0;events.length=0;
    await input('mark','pin');await settle();
    await input('mark',"pin'yin");await settle();
    assert(writes.length===0,'Uncommitted pinyin must not be saved');
    await input('commit','拼音');await settle();
    check(level,'拼音','Native IME commit');
    assert(events.includes('insertCompositionText')&&events.includes('deleteCompositionText')&&events.includes('insertFromComposition'),'Test must exercise native WebKit composition replacement');
    assert(writes.length===1&&writes[0]===prefix+'#'.repeat(level)+' 拼音\n'+suffix,'IME must save the heading exactly once with surrounding text intact');
    key('z');await settle();check(level,'','Undo IME commit');
    key('y');await settle();check(level,'拼音','Redo IME commit');
    for(let i=0;i<2;i++){document.execCommand('delete');await settle()}
    check(level,'','Backspace through all heading text');
    document.execCommand('insertText',false,'再次');await settle();
    const heading=check(level,'再次','Retype after deleting all text');
    select(heading,true);document.execCommand('delete');await settle();
    check(level,'','Delete selected heading text');
    await input('mark','zhong');await settle();
    await input('commit','中文');await settle();
    check(level,'中文','Native IME after deleting selected text');
    assert(markdown.editor.getValue()===prefix+'#'.repeat(level)+' 中文\n'+suffix,'Editing must preserve heading level and surrounding content');
    select(markdown.headings().find(item=>item.label==='中文').element);
    document.execCommand('insertParagraph');await settle();
    document.execCommand('insertText',false,'正文');await settle();
    assert([...markdown.editable.querySelectorAll('p')].some(p=>p.textContent==='正文'),'Enter at the end of a heading must still create a normal paragraph');
  }
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit heading input checks'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
