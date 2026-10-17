try{
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=async()=>{await new Promise(resolve=>setTimeout(resolve,100));window.dispatchEvent(new Event('focus'));await new Promise(resolve=>setTimeout(resolve,50))};
  const key=value=>markdown.editable.dispatchEvent(new KeyboardEvent('keydown',{key:value,metaKey:true,bubbles:true,cancelable:true}));
  const select=element=>{
    markdown.editable.focus();
    const range=document.createRange();range.selectNodeContents(element);range.collapse(false);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    markdown.editable.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
  };
  const checkLine=(level,label)=>{
    const heading=markdown.headings().find(item=>item.level===level&&item.label==='')?.element;
    assert(heading,label+': empty heading must exist');
    assert(heading.getBoundingClientRect().height+0.1>=parseFloat(getComputedStyle(heading).lineHeight),label+': heading must retain an editable line, height='+heading.getBoundingClientRect().height);
    assert(heading.contains(window.getSelection().anchorNode),label+': heading must retain the caret');
    const caret=document.querySelector('.global-caret');
    assert(!caret.hidden&&caret.getBoundingClientRect().height>0,label+': caret must be visible');
  };
  applySnapshot({session:'empty-heading',version:1,path:'空标题.md',source:'\n',root:{id:'r',label:'',children:[]}},{resetView:true});
  const writes=[];markdown.onBeforeInput=()=>true;markdown.onInput=value=>writes.push(value);
  for(let level=1;level<=5;level++)for(const middle of [false,true]){
    const source=middle?'上一段\n\n## HTTP\n':'\n';
    markdown.load(source,{session:'empty-heading',path:'空标题.md',reset:true});markdown.setReadOnly(false);
    select(markdown.editable.querySelector('p')||markdown.editable);await settle();
    if(middle){document.execCommand('insertParagraph');await settle()}
    key(String(level));await settle();
    const label='H'+level+(middle?' between paragraphs':' in empty document');
    checkLine(level,label);
    const emptySource=markdown.editor.getValue();
    assert(!emptySource.includes('<br')&&!emptySource.includes('\u200b'),label+': placeholder must not leak into Markdown');
    key('z');await settle();
    assert(!markdown.headings().some(item=>item.label===''),label+': undo must remove empty heading');
    key('y');await settle();checkLine(level,label+' after redo');
    document.execCommand('insertText',false,'新标题');await settle();
    assert(markdown.headings().some(item=>item.level===level&&item.label==='新标题'),label+': typing must populate the heading');
    assert(markdown.editor.getValue()===(middle?'上一段\n\n':'')+'#'.repeat(level)+' 新标题\n'+(middle?'\n## HTTP\n':''),label+': typing must preserve surrounding text');
    writes.length=0;
    markdown.load(emptySource,{session:'empty-heading',path:'空标题.md',reset:true});await settle();
    const heading=markdown.headings().find(item=>item.label==='')?.element;
    assert(heading&&heading.getBoundingClientRect().height>20,label+': reloading must preserve an editable line');
    assert(writes.length===0&&markdown.currentSource()===emptySource,label+': reload must not rewrite source');
    const range=document.createRange();range.setStartBefore(heading.querySelector('br'));range.collapse(true);
    markdown.editable.focus();window.getSelection().removeAllRanges();window.getSelection().addRange(range);
    document.execCommand('insertText',false,'重新输入');await settle();
    assert(markdown.headings().some(item=>item.level===level&&item.label==='重新输入'),label+': reloaded heading must accept typing');
  }
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit empty heading checks'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
