try{
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,120));
  const writes=[],imports=[],discards=[];
  let release=null,delay=false;
  markdown.onInput=value=>writes.push(value);markdown.onBeforeInput=()=>true;
  markdown.onOutline=()=>{};
  // The binding resolves these native methods when each import starts.
  const {MarkdownEditor:ImageEditor}=await import('./markdown-editor.js');
  const testContainer=document.createElement('div');testContainer.style.cssText='position:fixed;inset:60px 0 0 270px;background:white;z-index:100';document.body.append(testContainer);
  const editor=new ImageEditor({container:testContainer,onInput:value=>writes.push(value),onComposition:()=>{},onBeforeInput:()=>true,images:{
    importImage:async(session,data)=>{imports.push({session,data});if(delay)await new Promise(resolve=>release=resolve);return '.assets/%E7%AC%94%E8%AE%B0/'+imports.length+'.png'},
    discardImages:async(session,paths)=>discards.push({session,paths}),onError:error=>imports.push({error:error.message})
  }});
  await editor.ready;
  const load=async(source='正文\n',session='images')=>{
    editor.load(source,{session,path:'目录/笔记.md',reset:true});editor.setReadOnly(false);editor.editable.focus();
    const range=document.createRange();range.selectNodeContents(editor.editable.querySelector('p')||editor.editable);range.collapse(false);
    window.getSelection().removeAllRanges();window.getSelection().addRange(range);await settle();writes.length=0;
  };
  const file=()=>new File([Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII='),c=>c.charCodeAt(0))],'截图.png',{type:'image/png'});
  const paste=(files,type='paste')=>{
    const transfer=new DataTransfer();for(const item of files)transfer.items.add(item);
    const event=type==='paste'?new ClipboardEvent(type,{clipboardData:transfer,bubbles:true,cancelable:true}):new Event(type,{bubbles:true,cancelable:true});
    if(type==='drop')Object.defineProperty(event,'dataTransfer',{value:transfer});
    editor.editable.dispatchEvent(event);return event;
  };
  await load();assert(paste([file()]).defaultPrevented,'Image paste must consume Vditor default');await editor.imageTask;await settle();
  assert(imports.length===1&&imports[0].data.startsWith('iVBOR'),'Clipboard file must be sent as PNG bytes');
  assert(editor.currentSource().includes('正文')&&editor.currentSource().includes('![图片](.assets/%E7%AC%94%E8%AE%B0/1.png)'),'Paste must preserve body and relative reference: '+editor.currentSource());
  let image=editor.editable.querySelector('img');assert(image?.getAttribute('src')?.includes('/document-assets/images/%E7%9B%AE%E5%BD%95/.assets/'),'Preview must resolve relative to document directory: '+image?.outerHTML);
  assert(image.complete&&image.naturalWidth===1,'Image must render through asset HTTP route');
  assert(writes.length===1,'One image insertion must produce one source edit: '+writes.length);
  const key=value=>editor.editable.dispatchEvent(new KeyboardEvent('keydown',{key:value,metaKey:true,bubbles:true,cancelable:true}));
  key('z');await settle();assert(!editor.editable.querySelector('img')&&editor.currentSource()==='正文\n','Undo must remove imported image');
  key('y');await settle();assert(editor.editable.querySelector('img'),'Redo must restore image');
  await load();paste([file(),file()],'drop');await editor.imageTask;await settle();assert(editor.editable.querySelectorAll('img').length===2,'Drop must import multiple images');
  await load();const count=imports.length;editor.setReadOnly(true);paste([file()]);await settle();assert(imports.length===count,'Readonly must not import');
  await load();delay=true;paste([file()]);while(!release)await settle();editor.load('其他文档\n',{session:'other',path:'other.md',reset:true});editor.setReadOnly(false);release();await editor.imageTask;await settle();delay=false;release=null;
  assert(editor.currentSource()==='其他文档\n'&&!editor.editable.querySelector('img'),'Stale import must not modify new document');
  assert(discards.length===1&&discards[0].session==='images','Stale import must clean up old document copy');
  await load();delay=true;paste([file()]);while(!release)await settle();editor.editor.setValue('输入期间修改\n',true);editor.flush();release();await editor.imageTask;await settle();delay=false;release=null;
  assert(editor.currentSource()==='输入期间修改\n'&&!editor.editable.querySelector('img'),'Concurrent editing must cancel stale insertion');
  assert(discards.length===2,'Concurrent editing cancellation must discard imported copy');
  await load();const imageCount=imports.length;const textTransfer=new DataTransfer();textTransfer.setData('text/plain','文字');const textEvent=new ClipboardEvent('paste',{clipboardData:textTransfer,bubbles:true,cancelable:true});editor.editable.dispatchEvent(textEvent);await settle();
  assert(imports.length===imageCount&&editor.currentSource().includes('文字'),'Text paste must retain normal editor handling: '+editor.currentSource());
  await load();const before=imports.length;paste([new File(['text'],'文档.txt',{type:'text/plain'})]);await settle();assert(imports.length===before+1&&imports.at(-1).error,'Non-image file must be rejected');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit image import, rendering and undo checks'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
