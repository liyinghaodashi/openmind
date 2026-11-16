try{
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,120));
  const writes=[];
  markdown.onInput=value=>writes.push(value);markdown.onBeforeInput=()=>true;markdown.onOutline=()=>{};
  document.querySelector('#welcome').hidden=true;
  document.querySelector('#markdown-page').hidden=false;
  document.querySelector('#canvas').hidden=true;
  const style=document.createElement('style');style.textContent='#markdown-editor img{width:120px;height:120px}';document.head.append(style);
  const pointer=element=>new Promise(resolve=>{
    window.__nodePointerDone=resolve;
    const rect=element.getBoundingClientRect();
    window.webkit.messageHandlers.pointer.postMessage({x:rect.x+rect.width/2,y:rect.y+rect.height/2,count:1});
  });
  const data='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=';
  for(const target of [data,'.assets/图片.png']){
    const source='# 说明\n\n前文 ![image.png]('+target+') 后文\n';
    markdown.load(source,{session:'image-click',path:'笔记.md',reset:true});markdown.setReadOnly(false);await settle();
    const image=markdown.editable.querySelector('img');
    assert(!!image,'Markdown image must render');
    assert(image.complete&&image.naturalWidth===1,'Image data and relative paths must load');
    await pointer(image);await settle();
    const node=image.closest('[data-type="img"]');
    assert(!!node,'Image must have an IR node');
    assert([...node.querySelectorAll('.vditor-ir__marker')].every(marker=>!marker.getClientRects().length),'Click must not reveal image path or base64');
    assert(image.getBoundingClientRect().width>0&&getComputedStyle(image).display!=='none','Click must keep the image visible');
    const selection=window.getSelection();
    assert(selection.isCollapsed&&!node.contains(selection.anchorNode),'Click must place the caret outside hidden image source');
    markdown.flush();assert(markdown.currentSource()===source&&writes.length===0,'Image click must not change or save Markdown');
    const range=document.createRange();range.selectNodeContents(node);range.collapse(false);
    window.getSelection().removeAllRanges();window.getSelection().addRange(range);
    markdown.editable.dispatchEvent(new KeyboardEvent('keyup',{key:'ArrowLeft',bubbles:true}));await settle();
    assert([...node.querySelectorAll('.vditor-ir__marker')].every(marker=>!marker.getClientRects().length),'Keyboard selection must not reveal image source');
    assert(image.getBoundingClientRect().width>0,'Keyboard selection must keep image visible');
  }
  const reference='![图片](.assets/%E7%AC%94/a.png)';
  markdown.load('1. 连接数据库，'+reference+'\n2. 创建管道\n',{session:'list',path:'笔记.md',reset:true});
  markdown.setReadOnly(false);await settle();
  const image=markdown.editable.querySelector('img');
  const caret=document.createRange();caret.setStartBefore(image.parentElement);caret.collapse(true);
  markdown.editable.focus();window.getSelection().removeAllRanges();window.getSelection().addRange(caret);
  await new Promise(resolve=>{window.__composeDone=resolve;window.webkit.messageHandlers.compose.postMessage({})});await settle();
  assert(markdown.currentSource().includes('密码'+reference)&&markdown.editable.querySelector('img')?.naturalWidth===1,'Typing after a list image must preserve its source and preview: '+markdown.currentSource());
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit image click and source visibility checks'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
