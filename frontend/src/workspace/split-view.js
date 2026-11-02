export function createSplitView({container, closeSession, closeRequested, focusOther, toggleSettings, sharedView}) {
  let frame=null, editor=null, busy=false;
  function remove() {
    frame?.remove();
    frame=null;editor=null;
    document.body.classList.remove('split-open');
  }
  async function mount() {
    frame=document.createElement('iframe');
    frame.title='右侧文档';
    frame.className='right-document';
    Object.assign(frame,{closeRequested,focusOther,toggleSettings,sharedView});
    const ready=new Promise((resolve,reject)=>{
      frame.attachPane=resolve;
      frame.failPane=reject;
      frame.onerror=()=>reject(new Error('右侧编辑器加载失败'));
    });
    frame.src='/src/workspace/right-pane.html';
    container.after(frame);
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
    async relocated(previous,next) {
      if(!editor?.path)return;
      const path=editor.path;
      if(path!==previous&&!path.startsWith(previous+'/'))return;
      const target=next&&next+path.slice(previous.length);
      if(!target||!/[.](md|markdown)$/i.test(target)){await close();return}
      try { await editor.load(target) } catch(error) { await close();throw error }
    }
  };
}
