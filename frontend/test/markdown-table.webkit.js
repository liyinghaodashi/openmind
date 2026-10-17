try{
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,250));
  const key=(value,target=markdown.editable,options={})=>{const event=new KeyboardEvent('keydown',{key:value,code:'Key'+value.toUpperCase(),metaKey:target===markdown.editable,bubbles:true,cancelable:true,...options});target.dispatchEvent(event);return event};
  const writes=[];let allow=true;
  applySnapshot({session:'table',version:1,path:'表格.md',source:'保留正文\n',root:{id:'r',label:'表格',children:[]}},{resetView:true});
  markdown.onInput=value=>writes.push(value);markdown.onBeforeInput=()=>allow;
  const load=async(source='保留正文\n',selector='p')=>{
    markdown.load(source,{session:'table',path:'表格.md',reset:true});markdown.setReadOnly(false);markdown.editable.focus();
    const range=document.createRange();range.selectNodeContents(markdown.editable.querySelector(selector)||markdown.editable);range.collapse(false);
    window.getSelection().removeAllRanges();window.getSelection().addRange(range);await settle();writes.length=0;
  };
  const dialog=()=>markdown.tableDialog.element;
  const cell=(rows,columns)=>dialog().querySelector('[data-rows="'+rows+'"][data-columns="'+columns+'"]');
  await load();assert(key('t').defaultPrevented,'Command+T must consume native shortcut');await settle();
  assert(dialog().open&&dialog().contains(document.activeElement),'Command+T must focus table grid');
  assert(writes.length===0,'Opening grid must not save');
  cell(4,5).dispatchEvent(new PointerEvent('pointerenter'));assert(dialog().querySelectorAll('[aria-selected=true]').length===20,'Hover must preview selected rectangle');
  assert(dialog().querySelector('#table-size-label').textContent==='5 列 × 4 行（含表头）','Preview must show dimensions');
  cell(4,5).click();await settle();
  let table=markdown.editable.querySelector('table');
  assert(!dialog().open&&table?.rows.length===4&&table.rows[0].cells.length===5,'Click must insert exact dimensions: '+markdown.editor.getValue());
  assert(markdown.editor.getValue().includes('保留正文'),'Insertion must preserve surrounding text');
  assert(table.contains(window.getSelection().anchorNode),'Insertion must place caret in table');
  assert(writes.length===1&&writes[0]===markdown.currentSource(),'Insertion must autosave exactly once');
  key('z');await settle();assert(!markdown.editable.querySelector('table')&&markdown.editor.getValue()==='保留正文\n','One undo must remove table and preserve original');
  key('y');await settle();assert(markdown.editable.querySelector('table')?.rows.length===4,'Redo must restore table');
  await load();const original=markdown.editor.getValue();key('t');await settle();
  key('ArrowRight',document.activeElement);key('ArrowDown',document.activeElement);key('Enter',document.activeElement);await settle();
  table=markdown.editable.querySelector('table');assert(table?.rows.length===4&&table.rows[0].cells.length===4,'Keyboard must select and insert 4 by 4');
  await load();key('t');await settle();dialog().dispatchEvent(new Event('cancel',{cancelable:true}));await settle();
  assert(!dialog().open&&writes.length===0&&markdown.editor.getValue()===original,'Escape cancellation must not write');
  assert(document.activeElement===markdown.editable,'Cancellation must restore editor focus');
  key('t');await settle();const cancel=dialog().querySelector('[data-cancel]');cancel.focus();key('ArrowRight',cancel);
  assert(document.activeElement===dialog().querySelector('[data-insert]'),'Action buttons must support arrow navigation');
  key('ArrowLeft',document.activeElement);key('Enter',document.activeElement);await settle();assert(!dialog().open&&writes.length===0,'Enter on Cancel must cancel');
  for(const [rows,columns] of [[1,1],[8,10]]){
    await load('\n');key('t');await settle();cell(rows,columns).click();await settle();table=markdown.editable.querySelector('table');
    assert(table?.rows.length===rows&&table.rows[0].cells.length===columns,'Grid bounds must create exact empty table dimensions');
  }
  await load();key('t');await settle();allow=false;cell(2,2).click();await settle();allow=true;
  assert(writes.length===0&&!markdown.editable.querySelector('table'),'Blocked save after picker opens must prevent insertion');
  key('t');await settle();markdown.load('其他文档\n',{session:'other',path:'other.md',reset:true});await settle();
  assert(!dialog().open&&writes.length===0&&markdown.currentSource()==='其他文档\n','Document switch must dismiss stale insertion');
  await load();key('t');await settle();markdown.setReadOnly(true);await settle();assert(!dialog().open&&writes.length===0,'Read-only transition must close picker');
  key('t');assert(!dialog().open,'Read-only shortcut must not open picker');
  await load();key('t',markdown.editable,{isComposing:true});key('t',markdown.editable,{repeat:true});assert(!dialog().open,'IME and repeat must not open picker');
  key('t',$('source-editor'),{metaKey:true});assert(!dialog().open,'Source editor must not open picker');
  await load('```\ncode\n```\n','pre code');key('t');assert(!dialog().open,'Code block must not open picker');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit table insertion checks'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
