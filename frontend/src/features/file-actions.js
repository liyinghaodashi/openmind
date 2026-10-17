export function mountFileActions({menu,renameDialog,deleteDialog,begin,finish,create,rename,remove,onError}) {
  const name=renameDialog.querySelector('input');
  const renameError=renameDialog.querySelector('[role="alert"]');
  const deleteError=deleteDialog.querySelector('[role="alert"]');
  const buttons=[...menu.querySelectorAll('button')];
  let target=null,origin=null,activeEntry=null,saving=false;

  function closeMenu(restoreFocus=false) {
    menu.hidden=true;origin?.classList.remove('context-target');
    origin?.setAttribute('aria-expanded','false');
    if(restoreFocus&&origin?.isConnected)origin.focus({preventScroll:true});
    target=null;origin=null;
  }

  function showMenu(event,entry,row) {
    event.preventDefault();
    if(activeEntry)return;
    closeMenu();target=entry;origin=row;
    row.classList.add('context-target');row.setAttribute('aria-expanded','true');
    menu.setAttribute('aria-label',entry?entry.name+'的文件操作':'工作区文件操作');
    for(const button of buttons)button.hidden=!entry&&['rename','delete'].includes(button.dataset.action);
    menu.hidden=false;menu.style.left='0px';menu.style.top='0px';
    const bounds=menu.getBoundingClientRect();
    const keyboard=event.type==='keydown'||event.clientX===0&&event.clientY===0;
    const rowBounds=row.getBoundingClientRect();
    const x=keyboard?rowBounds.left+24:event.clientX;
    const y=keyboard?rowBounds.bottom:event.clientY;
    menu.style.left=Math.max(8,Math.min(x,window.innerWidth-bounds.width-8))+'px';
    menu.style.top=Math.max(8,Math.min(y,window.innerHeight-bounds.height-8))+'px';
    buttons.find(button=>!button.hidden)?.focus({preventScroll:true});
  }

  async function openDialog(action) {
    const entry=target;
    closeMenu(true);
    if(action==='new-file'||action==='new-folder') {
      if(activeEntry)return;
      activeEntry=entry||{};
      const parent=entry?.directory?entry.path:entry?.path.includes('/')?entry.path.slice(0,entry.path.lastIndexOf('/')):'';
      try{await create(action==='new-folder',parent)}
      catch(error){onError(error)}
      finally{activeEntry=null}
      return;
    }
    if(!entry||activeEntry)return;
    activeEntry=entry;
    try {
      if(!await begin(entry)){activeEntry=null;return}
      const kind=entry.directory?'文件夹':'文件';
      if(action==='rename') {
        renameDialog.querySelector('h2').textContent='重命名'+kind;
        name.value=entry.name;renameError.textContent='';
        renameDialog.querySelector('[data-path]').textContent=entry.path;
        renameDialog.showModal();name.focus();name.select();
      } else {
        deleteDialog.querySelector('h2').textContent='删除'+kind+'？';
        deleteDialog.querySelector('[data-description]').textContent=entry.directory?`将“${entry.name}”及其中全部内容移到废纸篓。`:`将“${entry.name}”移到废纸篓。`;
        deleteError.textContent='';
        deleteDialog.showModal();deleteDialog.querySelector('[data-cancel]').focus();
      }
    } catch(error) {
      activeEntry=null;finish();onError(error);
    }
  }

  async function submit(event,dialog,action,errorElement) {
    event.preventDefault();
    if(saving||!activeEntry)return;
    saving=true;errorElement.textContent='';
    const controls=[...dialog.querySelectorAll('button,input')];
    controls.forEach(control=>control.disabled=true);
    try {
      await action(activeEntry);
      saving=false;dialog.close();
    } catch(error) {
      errorElement.textContent=error?.message||String(error);
    } finally {
      saving=false;controls.forEach(control=>control.disabled=false);
    }
  }

  for(const button of buttons)button.addEventListener('click',()=>void openDialog(button.dataset.action));
  for(const dialog of [renameDialog,deleteDialog]) {
    dialog.querySelector('[data-cancel]').addEventListener('click',()=>{if(!saving)dialog.close()});
    dialog.addEventListener('cancel',event=>{if(saving)event.preventDefault()});
    dialog.addEventListener('close',()=>{activeEntry=null;finish()});
  }
  renameDialog.querySelector('form').addEventListener('submit',event=>void submit(event,renameDialog,entry=>rename(entry,name.value),renameError));
  deleteDialog.querySelector('form').addEventListener('submit',event=>void submit(event,deleteDialog,remove,deleteError));
  deleteDialog.addEventListener('keydown',event=>{
    if(event.isComposing||event.metaKey||event.ctrlKey||event.altKey)return;
    if(!['ArrowLeft','ArrowRight','Enter'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();
    if(saving||event.repeat)return;
    const actions=[...deleteDialog.querySelectorAll('button')];
    const index=actions.indexOf(document.activeElement);
    if(event.key==='Enter'){actions[index]?.click();return}
    const next=index<0?0:(index+(event.key==='ArrowRight'?1:-1)+actions.length)%actions.length;
    actions[next]?.focus();
  });
  menu.addEventListener('keydown',event=>{
    if(event.key==='Escape'||event.key==='Tab'){if(event.key==='Escape')event.preventDefault();closeMenu(true);return}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();
    const visible=buttons.filter(button=>!button.hidden);
    const index=visible.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?visible.length-1:(index+(event.key==='ArrowDown'?1:-1)+visible.length)%visible.length;
    visible[next]?.focus();
  });
  document.addEventListener('pointerdown',event=>{if(!menu.contains(event.target))closeMenu()});
  document.addEventListener('focusin',event=>{if(!menu.contains(event.target)&&event.target!==origin)closeMenu()});
  document.addEventListener('scroll',()=>closeMenu(),true);
  window.addEventListener('resize',()=>closeMenu());

  return {
    get active(){return !!activeEntry},
    closeMenu,
    bindBackground(tree) {
      tree.addEventListener('contextmenu',event=>{if(!event.target.closest('.tree-row'))showMenu(event,null,tree)});
    },
    bindRow(row,entry) {
      row.setAttribute('aria-haspopup','menu');row.setAttribute('aria-expanded','false');
      row.addEventListener('contextmenu',event=>showMenu(event,entry,row));
      row.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')showMenu(event,entry,row)});
    }
  };
}
