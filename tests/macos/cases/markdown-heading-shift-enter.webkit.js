try{
  let checks=0,allow=true;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,60));
  const native=(inputAction,text)=>new Promise(resolve=>{window.nativeInputDone=resolve;window.webkit.messageHandlers.result.postMessage({inputAction,text})});
  const key=(key,options={})=>markdown.editable.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true,...options}));
  const select=async(heading,position='marker')=>{
    markdown.editable.focus();const range=document.createRange();
    const marker=heading.querySelector('.vditor-ir__marker--heading');
    if(position==='marker')range.setStartAfter(marker);
    else if(position==='element')range.setStart(heading,0);
    else if(position==='text')range.setStart(marker.nextSibling,0);
    else if(position==='inline')range.setStart(heading.querySelector('strong').lastChild,0);
    else {range.selectNodeContents(heading);range.collapse(false)}
    range.collapse(true);window.getSelection().removeAllRanges();window.getSelection().addRange(range);await settle();
  };
  applySnapshot({session:'heading-shift-enter',version:1,path:'标题换行.md',source:'## 标题\n',root:{id:'r',label:'',children:[]}},{resetView:true});
  const writes=[];markdown.onBeforeInput=()=>allow;markdown.onInput=value=>writes.push(value);
  const load=async(source,position='marker')=>{
    markdown.load(source,{session:'heading-shift-enter',path:'标题换行.md',reset:true});markdown.setReadOnly(false);
    await select(markdown.editable.querySelector('h1,h2,h3,h4,h5,h6'),position);writes.length=0;return markdown.currentSource();
  };
  const fixtures=[];
  for(let level=1;level<=6;level++)for(const prefix of ['', '上一段\n\n'])fixtures.push({source:prefix+'#'.repeat(level)+' 标题\n\n后续正文\n',level,label:'标题'});
  fixtures.push({source:'## **标题**与[链接](https://example.com)\n',level:2,label:'标题与链接',position:'inline'});
  fixtures.push({source:'## \n',level:2,label:''});
  for(const position of ['element','text'])fixtures.push({source:'## 标题\n',level:2,label:'标题',position});
  for(const fixture of fixtures){
    const original=await load(fixture.source,fixture.position);
    const paragraphCount=markdown.editable.querySelectorAll('p').length;
    const top=markdown.editable.querySelector('h'+fixture.level).getBoundingClientRect().top;
    await native('shift-enter');await settle();
    const state=()=>JSON.stringify({source:markdown.currentSource(),html:markdown.editable.innerHTML});
    const headings=markdown.headings(),heading=headings[0]?.element,paragraph=heading?.previousElementSibling;
    assert(headings.length===1&&headings[0].level===fixture.level&&headings[0].label===fixture.label,'Heading level and text must survive: '+state());
    assert(paragraph?.tagName==='P'&&!paragraph.textContent.trim(),'An empty paragraph must precede the heading: '+state());
    assert(heading.getBoundingClientRect().top>=top+20,'Heading must visibly move down by a line: '+state());
    assert(heading.contains(window.getSelection().anchorNode)&&window.getSelection().isCollapsed,'Caret must move with the heading: '+state());
    const saved=markdown.currentSource();
    assert(!saved.includes('<br')&&!saved.includes('<wbr')&&!saved.includes('\u200b'),'Placeholders must not leak into Markdown');
    assert(writes.length<=1&&writes.every(value=>value===saved),'Saving must never write an empty heading or detached body text: '+state());
    key('z',{metaKey:true});await settle();assert(markdown.currentSource()===original&&markdown.editable.querySelectorAll('p').length===paragraphCount,'One undo must restore the original document: '+state());
    key('y',{metaKey:true});await settle();assert(markdown.currentSource()===saved&&markdown.editable.querySelectorAll('p').length===paragraphCount+1,'Redo must restore the blank line: '+state());
    if(fixture.position==='inline')assert(markdown.editable.querySelector('strong')?.textContent.replace(/\u200B/g,'')==='标题'&&saved.includes('**标题**与[链接](https://example.com)'),'Inline formatting must survive: '+state());
    await native('commit','新');await settle();
    assert(markdown.headings()[0]?.label==='新'+fixture.label,'Typing must insert at the moved heading start: '+state());
    if(fixture.source.includes('后续正文'))assert(markdown.currentSource().includes('后续正文'),'Following paragraphs must survive');
    const typed=markdown.currentSource();markdown.load(typed,{session:'heading-shift-enter',path:'标题换行.md',reset:true});await settle();
    assert(markdown.headings()[0]?.label==='新'+fixture.label,'Heading must remain a heading after save and reload');
  }
  await load('## 标题\n');await native('shift-enter');await settle();await native('shift-enter');await settle();
  assert(markdown.headings()[0]?.label==='标题'&&markdown.editable.querySelectorAll('p').length===2,'Repeated Shift+Enter must add lines before the heading: '+markdown.editable.innerHTML);
  await native('commit','前');await settle();
  assert(markdown.headings()[0]?.label==='前标题','Typing after repeated Shift+Enter must remain in the heading');
  for(const guard of ['composition','event-composition','blocked','readonly','selection','middle','end','plain-enter','modified','quote']){
    const original=await load(guard==='quote'?'> ## 标题\n':'## 标题\n');
    if(guard==='composition')markdown.composing=true;
    if(guard==='blocked')allow=false;
    if(guard==='readonly')markdown.setReadOnly(true);
    const range=window.getSelection().getRangeAt(0),text=markdown.editable.querySelector('h2').lastChild;
    if(guard==='selection')range.setEnd(text,1);
    if(guard==='middle'){range.setStart(text,1);range.collapse(true)}
    if(guard==='end'){range.setStart(text,text.length);range.collapse(true)}
    const event=new KeyboardEvent('keydown',{key:'Enter',shiftKey:guard!=='plain-enter',metaKey:guard==='modified',isComposing:guard==='event-composition',bubbles:true,cancelable:true});
    markdown.editable.dispatchEvent(event);
    markdown.composing=false;allow=true;markdown.setReadOnly(false);await settle();
    assert(markdown.currentSource()===original&&writes.length===0,'The '+guard+' case must not insert a paragraph');
  }
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit heading Shift+Enter checks (H1-H6, caret, layout, save, undo/redo, inline formatting and guards)'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
