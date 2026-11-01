try{
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,60));
  const native=(inputAction,text)=>new Promise(resolve=>{window.nativeInputDone=resolve;window.webkit.messageHandlers.result.postMessage({inputAction,text})});
  const key=value=>markdown.editable.dispatchEvent(new KeyboardEvent('keydown',{key:value,metaKey:true,bubbles:true,cancelable:true}));
  const select=element=>{
    markdown.editable.focus();const range=document.createRange();range.selectNodeContents(element);range.collapse(false);
    window.getSelection().removeAllRanges();window.getSelection().addRange(range);
  };
  applySnapshot({session:'heading-ime',version:1,path:'标题输入位置.md',source:'\n',root:{id:'r',label:'',children:[]}},{resetView:true});
  const writes=[];markdown.onBeforeInput=()=>true;markdown.onInput=value=>writes.push(value);
  const checkPosition=async(heading,label)=>{
    const range=window.getSelection().getRangeAt(0),rect=range.getBoundingClientRect(),box=heading.getBoundingClientRect();
    assert(rect.height>=parseFloat(getComputedStyle(heading).fontSize)&&rect.y>=box.top-1&&rect.bottom<=box.bottom+2,label+': IME caret must be on the heading line: '+JSON.stringify({caret:rect.toJSON(),heading:box.toJSON(),html:heading.outerHTML}));
  };
  for(let level=1;level<=6;level++)for(const entry of ['shortcut','syntax','reload']){
    if(entry==='shortcut'&&level===6)continue;
    const prefix='# 权限标识\n\n';
    markdown.load(prefix+(entry==='reload'?'#'.repeat(level)+' \n':'正文\n'),{session:'heading-ime',path:'标题输入位置.md',reset:true});markdown.setReadOnly(false);
    if(entry==='reload'){
      const heading=markdown.editable.querySelectorAll('h1,h2,h3,h4,h5,h6')[1];
      const range=document.createRange();range.setStartBefore(heading.querySelector('br'));range.collapse(true);
      markdown.editable.focus();window.getSelection().removeAllRanges();window.getSelection().addRange(range);
    }else{
      const paragraph=markdown.editable.querySelector('p');select(paragraph);
      const range=window.getSelection().getRangeAt(0);range.selectNodeContents(paragraph);document.execCommand('delete');await settle();
      if(entry==='shortcut')key(String(level));
      else for(const character of '#'.repeat(level)+' ')await native('commit',character);
    }
    await settle();
    let heading=markdown.editable.querySelectorAll('h1,h2,h3,h4,h5,h6')[1];
    assert(heading?.tagName==='H'+level,entry+' must create H'+level+': '+markdown.editable.innerHTML);
    writes.length=0;
    await native('mark','q');await settle();
    heading=markdown.editable.querySelectorAll('h1,h2,h3,h4,h5,h6')[1];
    const node=window.getSelection().anchorNode,textRange=document.createRange();textRange.selectNodeContents(node);
    assert(textRange.getBoundingClientRect().height>=parseFloat(getComputedStyle(heading).fontSize),entry+' H'+level+': first IME text must use the heading font: '+heading.outerHTML);
    await checkPosition(heading,entry+' H'+level+' first composition');
    assert(writes.length===0,'Uncommitted pinyin must not be saved');
    await native('mark',"qian'duan");await settle();await checkPosition(heading,'Updated composition');
    await native('commit','前端');await settle();
    assert(markdown.currentSource()===prefix+'#'.repeat(level)+' 前端\n','IME commit must preserve the heading and surrounding text: '+markdown.currentSource());
    assert(writes.length===1,'IME must save exactly once');
    assert(!markdown.currentSource().includes('\u200b'),'Caret placeholder must not leak into Markdown');
    await native('mark','q');await settle();await checkPosition(markdown.headings()[1].element,'Second composition');
    await native('commit','请求');await settle();
    assert(markdown.headings()[1]?.label==='前端请求','Repeated IME input must stay in the heading');
    key('z');await settle();assert(markdown.headings()[1]?.label==='前端','Undo must restore the first commit');
    key('y');await settle();assert(markdown.headings()[1]?.label==='前端请求','Redo must restore the second commit');
    select(markdown.headings()[1].element);document.execCommand('delete');document.execCommand('delete');document.execCommand('delete');document.execCommand('delete');await settle();
    await native('mark','z');await settle();await checkPosition(markdown.headings()[1].element,'Composition after deleting all heading text');
    await native('commit','再写');await settle();assert(markdown.headings()[1]?.label==='再写','An emptied heading must accept IME text');
  }
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit heading IME position checks (H1-H6, shortcuts, syntax, reload, repeated composition, deletion, save and undo/redo)'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
