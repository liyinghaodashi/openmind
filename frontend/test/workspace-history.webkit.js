try {
  const assert=(condition,message)=>{if(!condition)throw new Error(message)};
  let records=[
    {root:'/renamed-current',name:'Z 笔记',id:'current'},
    {root:'/missing',name:'B 笔记',id:'missing',unavailable:true},
    {root:'/other',name:'A 笔记',id:'other'}
  ];
  const calls=[];
  native.RecentWorkspaces=async()=>structuredClone(records);
  native.OpenRecentWorkspace=async id=>{
    calls.push(id);
    const info=records.find(info=>info.id===id);
    if(!info)throw new Error('未知记录');
    return structuredClone(info);
  };
  state.workspace={root:'/old-current',name:'旧名称',id:'current'};
  await toggleWorkspaceMenu();
  assert($('workspace-name').textContent==='Z 笔记','当前笔记名称未同步');
  assert($('workspace-detail').textContent==='/renamed-current','当前笔记路径未同步');
  const buttons=[...document.querySelectorAll('.recent-workspace')];
  assert(buttons.map(button=>button.querySelector('strong').textContent).join('|')==='A 笔记|B 笔记|Z 笔记 ✓','名称排序或当前标记错误');
  assert(buttons[1].disabled&&buttons[1].querySelector('small').textContent.includes('重新添加'),'失效目录未提示重新添加');
  assert(document.activeElement===buttons[0],'未聚焦首个可用目录');
  buttons[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
  assert(document.activeElement.classList.contains('recent-workspace-finder'),'键盘导航错误');
  document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
  assert(document.activeElement===buttons[2],'键盘未跳过失效目录');
  records=records.map(info=>info.id==='current'?{...info,root:'/current-renamed-again',name:'Z 新名称'}:info);
  window.__fileDragFixture.listeners.get('workspace:changed')();
  for(let i=0;i<30&&$('workspace-name').textContent!=='Z 新名称';i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert($('workspace-name').textContent==='Z 新名称','目录变更事件未更新菜单');
  assert(document.activeElement.dataset.workspaceKey==='current','菜单刷新丢失键盘焦点');
  records=records.map(info=>info.id==='other'?{...info,root:'/renamed-again',name:'A 新名称'}:info);
  $('toggle-outline').click();
  assert(outlineMode&&$('file-tree').hidden,'切换前未进入大纲模式');
  document.querySelector('.recent-workspace[data-workspace-key="other"]').click();
  for(let i=0;i<30&&state.navigating;i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert(calls[0]==='other','切换仍使用旧路径');
  assert(state.workspace.root==='/renamed-again'&&$('workspace-name').textContent==='A 新名称','菜单打开后再次改名导致切换失败');
  assert($('workspace-menu').hidden,'切换后菜单未关闭');
  assert(!outlineMode&&!$('file-tree').hidden&&$('document-outline').hidden&&!$('file-actions').hidden,'切换文件夹后未显示文件树');
  assert($('sidebar-title').textContent==='文件'&&$('toggle-outline').getAttribute('aria-pressed')==='false'&&$('toggle-outline').getAttribute('aria-label')==='切换到大纲','切换后侧栏标题或按钮状态错误');
  $('toggle-outline').click();
  native.SelectWorkspace=async()=>null;
  await chooseWorkspace();
  assert(outlineMode&&$('file-tree').hidden,'取消选择文件夹改变了大纲模式');
  native.SelectWorkspace=async()=>{throw new Error('选择失败')};
  await chooseWorkspace();
  assert(outlineMode&&$('file-tree').hidden,'选择文件夹失败改变了大纲模式');
  $('toggle-outline').click();
  const removed=[];
  native.RemoveRecentWorkspace=async key=>{removed.push(key);records=records.filter(info=>info.id!==key)};
  const showRemoval=key=>{
    const row=document.querySelector('.recent-workspace-row[data-workspace-key="'+key+'"]');
    row.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:100,clientY:100}));
    assert(!$('workspace-context-menu').hidden&&!$('workspace-menu').hidden,'右键菜单未打开或最近列表被关闭');
    assert(document.activeElement===$('remove-recent-workspace'),'移除按钮未获得焦点');
  };
  await toggleWorkspaceMenu();
  showRemoval('missing');
  $('remove-recent-workspace').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
  assert($('workspace-context-menu').hidden&&!$('workspace-menu').hidden&&removed.length===0,'Escape 未仅关闭右键菜单');
  showRemoval('missing');
  $('remove-recent-workspace').click();
  for(let i=0;i<30&&document.querySelector('.recent-workspace[data-workspace-key="missing"]');i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert(removed[0]==='missing'&&!document.querySelector('.recent-workspace[data-workspace-key="missing"]'),'失效目录未移除');
  assert(!document.querySelector('dialog[open]'),'移除弹出了确认窗口');
  showRemoval('other');
  $('remove-recent-workspace').click();
  for(let i=0;i<30&&document.querySelector('.recent-workspace[data-workspace-key="other"]');i++)await new Promise(resolve=>setTimeout(resolve,10));
  assert(state.workspace.id==='other'&&!document.querySelector('.recent-workspace[data-workspace-key="other"]'),'移除当前记录影响了工作区或未更新列表');
  await refreshRecentWorkspaces();
  assert(!document.querySelector('.recent-workspace[data-workspace-key="other"]'),'刷新后已移除记录再次出现');
  native.RemoveRecentWorkspace=async()=>{throw new Error('写入失败')};
  showRemoval('current');$('remove-recent-workspace').click();
  await new Promise(resolve=>setTimeout(resolve,20));
  assert(document.querySelector('.recent-workspace[data-workspace-key="current"]')&&$('toast').textContent.includes('写入失败'),'移除失败未保留记录或未提示');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: menu rename refresh, sorting, unavailable entries, keyboard navigation and stable-ID switching'});
} catch(error) {
  window.webkit.messageHandlers.result.postMessage({passed:false,message:String(error.stack||error)});
}
