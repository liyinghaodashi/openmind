export function mountDocumentKind(field,dialog){
  const input=field.querySelector('input');
  const toggle=field.querySelector('[aria-haspopup]');
  const menu=field.querySelector('[role=listbox]');
  const options=[...menu.querySelectorAll('[role=option]')];
  function close(restoreFocus=false){
    menu.hidden=true;
    toggle.setAttribute('aria-expanded','false');
    if(restoreFocus)toggle.focus();
  }
  function select(value){
    input.value=value;
    for(const option of options)option.setAttribute('aria-selected',String(option.dataset.kind===value));
    const selected=options.find(option=>option.dataset.kind===value);
    toggle.querySelector('[data-kind-label]').textContent=selected.querySelector('small').textContent;
    toggle.setAttribute('aria-label','文档类型：'+selected.querySelector('span').textContent);
  }
  function open(){
    menu.hidden=false;
    toggle.setAttribute('aria-expanded','true');
    options.find(option=>option.dataset.kind===input.value).focus();
  }
  toggle.addEventListener('click',()=>menu.hidden?open():close());
  for(const option of options)option.addEventListener('click',()=>{select(option.dataset.kind);close(true)});
  field.addEventListener('keydown',event=>{
    if(event.isComposing||event.keyCode===229||event.metaKey||event.ctrlKey||event.altKey)return;
    if(event.key==='Escape'&&!menu.hidden){event.preventDefault();event.stopPropagation();close(true);return}
    if(event.shiftKey)return;
    const direction={ArrowLeft:-1,ArrowUp:-1,ArrowRight:1,ArrowDown:1}[event.key];
    if(!direction&&event.key!=='Home'&&event.key!=='End')return;
    event.preventDefault();event.stopPropagation();
    if(menu.hidden){open();return}
    const index=options.indexOf(document.activeElement);
    options[event.key==='Home'?0:event.key==='End'?options.length-1:(index+direction+options.length)%options.length].focus();
  });
  field.addEventListener('focusout',event=>{if(!field.contains(event.relatedTarget))close()});
  document.addEventListener('pointerdown',event=>{if(!field.contains(event.target))close()});
  dialog.addEventListener('cancel',event=>{if(!menu.hidden){event.preventDefault();close(true)}});
  dialog.addEventListener('close',()=>close());
  return {reset(){select('markdown');close()}};
}
