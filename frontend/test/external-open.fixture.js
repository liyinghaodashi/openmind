(()=>{
  const fixture=window.__fileDragFixture;
  const native=window.go.main.App;
  window.runtime.WindowShow=()=>fixture.calls.push(['show-window',document.querySelector('#markdown-page').hidden,document.querySelector('.vditor-ir').innerText]);
  fixture.pending=['/fixture-only/源/笔记.md'];
  native.RestoreWorkspace=async()=>{throw new Error('冷启动指定文件时不应恢复旧工作区')};
  native.TakePendingFileOpens=async()=>fixture.pending.splice(0);
  native.OpenExternalDocument=async full=>{
    const outside=full.startsWith('/other/');
    const path=full.replace(outside?'/other/':'/fixture-only/','');
    fixture.calls.push(['external-open',path]);
    if(!fixture.documents.has(path))throw new Error('文件不存在');
    return {workspace:{root:outside?'/other':'/fixture-only',name:outside?'其他目录':'拖动验证'},snapshot:await native.OpenDocument(path)};
  };
})();
