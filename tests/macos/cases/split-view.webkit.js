if(!paneHost){
  try {
    const fixture=window.__fileDragFixture;
    const assert=(value,message)=>{if(!value)throw new Error(message)};
    const until=async check=>{
      for(let i=0;i<300;i++){if(check())return;await new Promise(resolve=>setTimeout(resolve,20))}
      throw new Error('等待双栏状态超时：'+check);
    };
    native.OpenRightDocument=async path=>structuredClone(fixture.documents.get(path));
    native.CheckRightDocument=async()=>null;
    native.CloseRightDocument=async()=>{};
    native.ApplyEdit=async edit=>{
      await new Promise(resolve=>setTimeout(resolve,80));
      const snapshot=fixture.documents.get(edit.session);
      assert(snapshot&&edit.version===snapshot.version,'文档会话或版本错误');
      snapshot.source=edit.text;snapshot.version++;
      return structuredClone(snapshot);
    };
    await openDocument('根.md');
    const rightPath='源/笔记.md';
    state.expanded.add('源');await refreshTree();
    document.querySelector('[data-path="源/笔记.md"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));
    const item=document.querySelector('[data-action="open-right"]');
    assert(!item.hidden&&!$('file-context-menu').hidden,'文件菜单应显示添加到右侧');
    item.click();
    await until(()=>split.path===rightPath&&!state.navigating);
    const frame=document.querySelector('.right-document'),right=frame.contentDocument;
    assert(Math.abs(frame.clientWidth-$('workspace-page').clientWidth)<3,'两栏应等宽');
    assert(!right.getElementById('sidebar').getClientRects().length,'应共用一个侧栏');
    const insert=(doc,text)=>{
      const editor=doc.querySelector('.vditor-ir [contenteditable="true"]');
      assert(editor,'正文编辑器应可编辑');
      editor.focus();const range=doc.createRange();range.selectNodeContents(editor);range.collapse(false);
      const selection=doc.defaultView.getSelection();selection.removeAllRanges();selection.addRange(range);
      doc.execCommand('insertText',false,text);
    };
    insert(document,'左栏保存');insert(right,'右栏保存');
    await split.open('源/子/想法.mind.md');
    assert(fixture.documents.get(rightPath).source.includes('右栏保存'),'替换前应保存右栏');
    assert(fixture.documents.get('根.md').source.includes('左栏保存'),'左栏应独立保存');
    assert(right.getElementById('canvas').getClientRects().length>0,'右栏应渲染导图');
    right.getElementById('toggle-source').click();
    const source=right.getElementById('source-editor');
    await until(()=>source.getClientRects().length&&!source.readOnly);
    source.value='# 导图编辑';source.dispatchEvent(new Event('input',{bubbles:true}));
    right.getElementById('close-right').click();
    await until(()=>!document.querySelector('.right-document'));
    assert(fixture.documents.get('源/子/想法.mind.md').source==='# 导图编辑','关闭前应保存导图');
    assert(state.snapshot.path==='根.md','关闭右栏应保留左栏');
    window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: 双栏菜单、正文与导图渲染、独立编辑保存、替换和关闭'});
  } catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:String(error)+' '+error.stack+' '+document.querySelector('.right-document')?.contentDocument.getElementById('error-text').textContent})}
}
