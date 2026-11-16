export function createWorkspaceMenu({$,preview,call,getWorkspace,isNavigating,onWorkspaceRefresh,chooseWorkspace,closeFileMenu,toast,errorText}) {
  let recentWorkspaces=[];
  let recentWorkspaceTarget=null;
  function closeWorkspaceContextMenu(restoreFocus=false){
    $('workspace-context-menu').hidden=true;
    const target=recentWorkspaceTarget;recentWorkspaceTarget=null;
    if(restoreFocus&&target?.row.isConnected)(target.row.querySelector('button:not(:disabled)')||target.row).focus({preventScroll:true});
  }
  function showWorkspaceContextMenu(event,info,row){
    event.preventDefault();event.stopPropagation();
    closeWorkspaceContextMenu();closeFileMenu();
    recentWorkspaceTarget={key:info.id||info.root,row};
    const menu=$('workspace-context-menu');menu.hidden=false;menu.style.left='0px';menu.style.top='0px';
    const bounds=menu.getBoundingClientRect(),rowBounds=row.getBoundingClientRect();
    const keyboard=event.type==='keydown'||event.clientX===0&&event.clientY===0;
    menu.style.left=Math.max(8,Math.min(keyboard?rowBounds.left+24:event.clientX,window.innerWidth-bounds.width-8))+'px';
    menu.style.top=Math.max(8,Math.min(keyboard?rowBounds.bottom:event.clientY,window.innerHeight-bounds.height-8))+'px';
    $('remove-recent-workspace').focus({preventScroll:true});
  }
  $('remove-recent-workspace').onclick=async()=>{
    const target=recentWorkspaceTarget;if(!target)return;
    closeWorkspaceContextMenu(true);
    try{await call('RemoveRecentWorkspace',target.key);await refreshRecentWorkspaces()}
    catch(error){toast('移除快捷文件夹失败：'+errorText(error))}
  };
  $('workspace-context-menu').addEventListener('keydown',event=>{
    if(event.key==='Escape'||event.key==='Tab'){
      if(event.key==='Escape')event.preventDefault();
      event.stopPropagation();closeWorkspaceContextMenu(true);
    }else if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      event.preventDefault();event.stopPropagation();
    }
  });
  document.addEventListener('pointerdown',event=>{if(!$('workspace-context-menu').contains(event.target))closeWorkspaceContextMenu()});
  document.addEventListener('focusin',event=>{if(!$('workspace-context-menu').contains(event.target))closeWorkspaceContextMenu()});
  window.addEventListener('resize',()=>closeWorkspaceContextMenu());
  document.addEventListener('scroll',()=>closeWorkspaceContextMenu(),true);
  function closeWorkspaceMenu(restoreFocus=false){
    closeWorkspaceContextMenu();
    $('workspace-menu').hidden=true;$('choose-workspace').setAttribute('aria-expanded','false');
    if(restoreFocus)$('choose-workspace').focus();
  }
  function renderRecentWorkspaces(){
    const items=document.createDocumentFragment();
    const nameOrder=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
    const sortedWorkspaces=[...recentWorkspaces].sort((a,b)=>nameOrder.compare(a.name,b.name)||nameOrder.compare(a.root,b.root));
    for(const info of sortedWorkspaces){
      const row=document.createElement('div');row.className='recent-workspace-row';
      row.tabIndex=-1;row.dataset.workspaceKey=info.id||info.root;row.setAttribute('aria-haspopup','menu');
      row.oncontextmenu=event=>showWorkspaceContextMenu(event,info,row);
      const button=document.createElement('button');button.className='recent-workspace';button.title=info.root;
      button.dataset.workspaceKey=info.id||info.root;
      button.disabled=!!info.unavailable;
      if(info.unavailable)button.title=info.root+'（文件夹不可用，请重新添加）';
      const current=info.root===getWorkspace()?.root||!!info.id&&info.id===getWorkspace()?.id;
      if(current){button.setAttribute('aria-current','true');row.classList.add('current')}
      const name=document.createElement('strong');name.textContent=info.name+(current?' ✓':'');
      const path=document.createElement('small');path.textContent=info.unavailable?'文件夹不可用，请重新添加':info.root;
      button.append(name,path);button.onclick=()=>void chooseWorkspace(info.root,info.id);
      const finder=document.createElement('button');finder.className='recent-workspace-finder';finder.type='button';
      finder.dataset.workspaceKey=info.id||info.root;
      finder.disabled=!!info.unavailable;
      finder.title='在访达中打开';finder.setAttribute('aria-label','在访达中打开“'+info.name+'”');
      finder.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v3"/><path d="M3 7v12a1 1 0 0 0 1 1h15l3-10H7L4 20"/></svg>';
      finder.onclick=()=>void call('OpenRecentWorkspaceInFinder',info.id||info.root).catch(error=>toast(errorText(error)));
      row.onkeydown=event=>{
        if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){showWorkspaceContextMenu(event,info,row);return}
        if(event.isComposing||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
        event.preventDefault();(event.target===button?finder:button).focus();
      };
      row.append(button,finder);items.append(row);
    }
    if(!recentWorkspaces.length){const empty=document.createElement('p');empty.className='workspace-menu-empty';empty.textContent='还没有添加文件夹';items.append(empty)}
    $('recent-workspaces').replaceChildren(items);
  }
  async function refreshRecentWorkspaces(){
    const next=preview?(getWorkspace()?[getWorkspace()]:[]):await call('RecentWorkspaces');
    const unchanged=JSON.stringify(next)===JSON.stringify(recentWorkspaces);
    recentWorkspaces=next;
    const current=recentWorkspaces.find(info=>!info.unavailable&&info.id&&info.id===getWorkspace()?.id);
    if(current){
      onWorkspaceRefresh(current);
    }
    if(unchanged&&$('recent-workspaces').childNodes.length)return;
    closeWorkspaceContextMenu(true);
    const focused=document.activeElement,focusKey=focused?.dataset.workspaceKey,focusClass=focused?.className;
    renderRecentWorkspaces();
    if(focusKey&&!$('workspace-menu').hidden){
      const replacement=[...$('workspace-menu').querySelectorAll('button:not(:disabled)')].find(button=>button.dataset.workspaceKey===focusKey&&button.className===focusClass);
      (replacement||$('workspace-menu').querySelector('button:not(:disabled)'))?.focus();
    }
  }
  function refreshVisibleWorkspaceMenu(){
    if(!$('workspace-menu').hidden&&!isNavigating())void refreshRecentWorkspaces().catch(error=>toast('更新快捷文件夹失败：'+errorText(error)));
  }
  async function toggleWorkspaceMenu(){
    if(isNavigating())return;
    const open=$('workspace-menu').hidden;
    $('workspace-menu').hidden=!open;$('choose-workspace').setAttribute('aria-expanded',String(open));
    if(open){
      try{await refreshRecentWorkspaces()}catch(error){toast('更新快捷文件夹失败：'+errorText(error))}
      if(!$('workspace-menu').hidden)$('workspace-menu').querySelector('button:not(:disabled)')?.focus();
    }
  }
  $('add-workspace').onclick=()=>void chooseWorkspace();
  document.addEventListener('pointerdown',event=>{if(!$('workspace-picker').contains(event.target))closeWorkspaceMenu()});
  document.addEventListener('focusin',event=>{if(!$('workspace-picker').contains(event.target))closeWorkspaceMenu()});
  $('workspace-picker').addEventListener('keydown',event=>{
    if(event.key==='Escape'){event.preventDefault();closeWorkspaceMenu(true);return}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();
    if($('workspace-menu').hidden){toggleWorkspaceMenu();return}
    const buttons=[...$('workspace-menu').querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
    buttons[next].focus();
  });
  return {close:closeWorkspaceMenu,refresh:refreshRecentWorkspaces,refreshVisible:refreshVisibleWorkspaceMenu,toggle:toggleWorkspaceMenu};
}
