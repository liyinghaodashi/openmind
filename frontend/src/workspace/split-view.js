export function workspacePath(root,path) {
  return root&&path ? root.replace(/\/$/,'')+'/'+path : null;
}

function bindSplitDivider(divider, container) {
  const min=Number(divider.getAttribute('aria-valuemin'));
  const max=Number(divider.getAttribute('aria-valuemax'));
  let share=Number(divider.getAttribute('aria-valuenow'));
  let drag=null;

  function resize(value) {
    share=Math.max(min,Math.min(max,value));
    container.parentElement.style.setProperty('--left-pane-share',String(share));
    divider.setAttribute('aria-valuenow',String(Math.round(share)));
  }
  function stop() {
    if(!drag)return;
    if(divider.hasPointerCapture(drag.id))divider.releasePointerCapture(drag.id);
    drag=null;
    divider.classList.remove('dragging');
  }
  divider.addEventListener('pointerdown',event=>{
    if(drag||event.button!==0||!event.isPrimary)return;
    const left=container.getBoundingClientRect().width;
    const width=left+divider.nextElementSibling.getBoundingClientRect().width;
    divider.setPointerCapture(event.pointerId);
    drag={id:event.pointerId,x:event.clientX,left,width};
    divider.classList.add('dragging');
    event.preventDefault();
  });
  divider.addEventListener('pointermove',event=>{
    if(event.pointerId===drag?.id)resize(100*(drag.left+event.clientX-drag.x)/drag.width);
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture']){
    divider.addEventListener(type,event=>{if(event.pointerId===drag?.id)stop()});
  }
  divider.addEventListener('keydown',event=>{
    if(event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||event.isComposing)return;
    if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
    event.preventDefault();event.stopPropagation();
    resize(Math.round(share)+(event.key==='ArrowRight'?1:-1));
  });
  window.addEventListener('blur',stop);
  return stop;
}

export function createSplitView({container, divider, closeSession, closeRequested, focusOther, toggleSettings, handleSidebarShortcut, sharedView}) {
  let frame=null, editor=null, busy=false;
  const stopResize=bindSplitDivider(divider,container);
  function remove() {
    stopResize();
    frame?.remove();
    frame=null;editor=null;
    document.body.classList.remove('split-open');
  }
  async function mount() {
    frame=document.createElement('iframe');
    frame.title='右侧文档';
    frame.className='right-document';
    Object.assign(frame,{closeRequested,focusOther,toggleSettings,handleSidebarShortcut,sharedView});
    const ready=new Promise((resolve,reject)=>{
      frame.attachPane=resolve;
      frame.failPane=reject;
      frame.onerror=()=>reject(new Error('右侧编辑器加载失败'));
    });
    frame.src='/src/workspace/right-pane.html';
    divider.after(frame);
    document.body.classList.add('split-open');
    const timeout=setTimeout(()=>frame?.failPane(new Error('右侧编辑器未完成加载，请重试。')),15000);
    try { editor=await ready } finally { clearTimeout(timeout) }
  }
  async function withSaved(action) {
    if(busy)throw new Error('正在处理右侧文档，请稍后重试。');
    busy=true;
    const pane=editor;
    try {
      if(pane&&!await pane.lock())throw new Error('请先完成右侧的编辑或处理保存提示。');
      return await action();
    } finally {
      busy=false;
      if(pane===editor)pane?.unlock();
    }
  }
  async function close() {
    if(!frame)return;
    await closeSession();
    remove();
  }
  return {
    withSaved,close,
    get sharedView(){return editor?.sharedView},
    get path(){return editor?.path},
    get fullPath(){return editor?.fullPath},
    focus(){editor?.focus()},
    check(){if(!busy)void editor?.check()},
    refreshSettings(){return editor?.refreshSettings()},
    async open(path) {
      await withSaved(async()=>{
        try {
          if(!editor)await mount();
          await editor.load(path);
          editor.focus();
        } catch(error) {
          if(!editor?.path)await close();
          throw error;
        }
      });
    },
    async relocated(root,previous,next) {
      if(!editor?.path)return;
      const path=editor.fullPath;
      previous=workspacePath(root,previous);
      if(!path||!previous)return;
      if(path!==previous&&!path.startsWith(previous+'/'))return;
      const target=next&&next+path.slice(previous.length);
      if(!target||!/[.](md|markdown)$/i.test(target)){await close();return}
      try { await editor.load(target) } catch(error) { await close();throw error }
    }
  };
}
