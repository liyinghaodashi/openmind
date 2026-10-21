try{
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,80));
  const native=(inputAction,text)=>new Promise(resolve=>{window.nativeInputDone=resolve;window.webkit.messageHandlers.result.postMessage({inputAction,text})});
  const select=async(element,offset)=>{
    markdown.editable.focus();
    const range=document.createRange();
    if(offset===undefined){range.selectNodeContents(element);range.collapse(false)}
    else {range.setStart(element,offset);range.collapse(true)}
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    await settle();
  };
  applySnapshot({session:'heading-enter',version:1,path:'标题回车.md',source:'# 1.你好\n',root:{id:'r',label:'',children:[]}},{resetView:true});
  const writes=[];markdown.onInput=value=>writes.push(value);markdown.onBeforeInput=()=>true;markdown.setReadOnly(false);
  const load=async(source,selector='h1')=>{
    markdown.load(source,{session:'heading-enter',path:'标题回车.md',reset:true});markdown.setReadOnly(false);
    await select(markdown.editable.querySelector(selector));writes.length=0;
  };
  const fixtures=[];
  for(let level=1;level<=6;level++)for(const suffix of ['', ' '])fixtures.push({level,label:'1.你好'+suffix,marker:'2.'});
  for(const [label,marker] of [['1. 你好','2.'],['9.你好','10.'],['1)你好','2)'],['1.**你好**','2.']])fixtures.push({level:1,label,marker});
  fixtures.push({level:1,label:'1.你好',marker:'2.',after:'\n原有正文\n'});
  for(const {level,label,marker,after=''} of fixtures){
    const source='#'.repeat(level)+' '+label+'\n'+after;
    await load(source,'h'+level);
    await native('enter');await settle();
    // Replay the observed native sequence: insertParagraph, then a separate insertText for the next number.
    await native('commit',marker+' ');await settle();
    const heading=markdown.editable.querySelector('h'+level),paragraph=heading?.nextElementSibling;
    assert(heading&&markdown.headings()[0].label===label.replace(/\*\*/g,'').trim(),'Enter must preserve numbered H'+level+': '+markdown.editor.getValue());
    assert(paragraph?.tagName==='P'&&!paragraph.textContent.trim(),'Native continuation after H'+level+' must leave an empty paragraph: '+markdown.editor.getValue());
    assert(!markdown.editable.querySelector('ol,ul'),'Heading Enter must not create a list');
    assert(paragraph.contains(window.getSelection().anchorNode),'Caret must remain in the empty paragraph');
    assert(writes.every(value=>!value.includes('\n'+marker)),'Native continuation must never be autosaved');
    if(after)assert(markdown.editor.getValue().includes('原有正文'),'Existing following paragraphs must be preserved');
  }
  await load('# 标题\n');
  const heading=markdown.editable.querySelector('h1'),range=document.createRange();range.selectNodeContents(heading);range.setStartAfter(heading.querySelector('.vditor-ir__marker--heading'));
  window.getSelection().removeAllRanges();window.getSelection().addRange(range);
  await native('commit','1.你好 ');await settle();await native('enter');await settle();await native('commit','2.');await settle();
  assert(!markdown.editable.querySelector('h1').nextElementSibling.textContent.trim(),'Freshly typed numbered headings must also reject native continuation');
  for(const action of ['keydown','pointerdown','paste']){
    await load('# 1.你好\n');await native('enter');await settle();
    if(action==='keydown')markdown.editable.dispatchEvent(new KeyboardEvent('keydown',{key:'2',bubbles:true}));
    if(action==='pointerdown')markdown.editable.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
    if(action==='paste')markdown.editable.dispatchEvent(new ClipboardEvent('paste',{clipboardData:new DataTransfer(),bubbles:true,cancelable:true}));
    await native('commit','2.');await settle();
    assert(markdown.editor.getValue()==='# 1.你好\n\n2.\n','Explicit '+action+' must allow manually entering 2.');
  }
  await load('# 1.你好\n');await native('enter');await settle();await native('commit','正文');await settle();await native('commit','2.');await settle();
  assert(markdown.editor.getValue()==='# 1.你好\n\n正文2.\n','Ordinary text must consume the continuation guard without losing subsequent input');
  markdown.editable.dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true,cancelable:true}));await settle();
  assert(!markdown.editor.getValue().includes('正文2.'),'Body input must still support undo');
  markdown.editable.dispatchEvent(new KeyboardEvent('keydown',{key:'y',metaKey:true,bubbles:true,cancelable:true}));await settle();
  assert(markdown.editor.getValue().includes('正文2.'),'Body input must still support redo');
  await load('1. 项目\n','li');await native('enter');await settle();await native('commit','下一项');await settle();
  assert(markdown.editable.querySelectorAll('ol > li').length===2&&markdown.editor.getValue().includes('2. 下一项'),'Normal ordered lists must continue numbering');
  await load('# 1.你好\n');await select(markdown.editable.querySelector('h1').lastChild,3);await native('enter');await settle();await native('commit','2.');await settle();
  assert(markdown.editor.getValue().includes('2.'),'Splitting inside a heading must not discard input');
  await load('# 1.你好\n');await native('enter');await settle();await load('# 其他标题\n');await native('enter');await settle();await native('commit','2.');await settle();
  assert(markdown.editor.getValue().includes('2.'),'Loading a document must clear the continuation guard');
  await load('# 标题\n');await native('enter');await settle();await native('commit','2.');await settle();
  assert(markdown.editor.getValue().includes('2.'),'Unnumbered headings must allow numeric body text');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit heading Enter checks (native continuation, H1-H6, typed headings, manual input, undo/redo and normal lists)'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
