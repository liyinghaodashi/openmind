const kinds=[
  {value:'swimlane',label:'泳道图',path:'M3 3h14v14H3z M3 9.5h14 M7 3v14'},
  {value:'flowchart',label:'流程图',path:'M7 2h6v4H7z M10 6v4 M4.5 13v-3h11v3 M2 13h5v4H2z M13 13h5v4h-5z'}
];

function icon(path){
  return '<svg aria-hidden="true" viewBox="0 0 20 20"><path d="'+path+'"/></svg>';
}

export function createMermaidTypePicker(onChoose){
  const element=document.createElement('div');
  element.className='markdown-mermaid-type';
  const trigger=document.createElement('button');
  trigger.type='button';
  trigger.setAttribute('aria-haspopup','listbox');
  trigger.setAttribute('aria-expanded','false');
  const menu=document.createElement('div');
  menu.id='mermaid-type-options';
  menu.setAttribute('role','listbox');
  menu.setAttribute('aria-label','图类型');
  menu.hidden=true;
  trigger.setAttribute('aria-controls',menu.id);
  element.append(trigger,menu);
  const options=kinds.map(kind=>{
    const option=document.createElement('button');
    option.type='button';
    option.tabIndex=-1;
    option.value=kind.value;
    option.setAttribute('role','option');
    option.innerHTML=icon(kind.path)+'<span>'+kind.label+'</span>';
    option.addEventListener('click',()=>{
      close(true);
      if(!trigger.disabled)onChoose(kind.value);
    });
    menu.append(option);
    return option;
  });
  function setValue(value){
    const kind=kinds.find(kind=>kind.value===value);
    const label=kind?.label||'图类型';
    trigger.innerHTML=(kind?icon(kind.path):'')+'<span>'+label+'</span>'+icon('m6 8 4 4 4-4');
    trigger.setAttribute('aria-label',kind?'图类型：'+label:label);
    for(const option of options)option.setAttribute('aria-selected',String(option.value===value));
  }
  function open(){
    menu.hidden=false;
    trigger.setAttribute('aria-expanded','true');
    (options.find(option=>option.getAttribute('aria-selected')==='true')||options[0]).focus();
  }
  function close(restoreFocus=false){
    menu.hidden=true;
    trigger.setAttribute('aria-expanded','false');
    if(restoreFocus)trigger.focus();
  }
  trigger.addEventListener('click',()=>menu.hidden?open():close());
  element.addEventListener('keydown',event=>{
    if(event.isComposing||event.altKey||event.ctrlKey||event.metaKey)return;
    if(event.key==='Escape'&&!menu.hidden){
      event.preventDefault();event.stopPropagation();close(true);
      return;
    }
    const step={ArrowDown:1,ArrowRight:1,ArrowUp:-1,ArrowLeft:-1}[event.key];
    if(!step)return;
    event.preventDefault();event.stopPropagation();
    if(menu.hidden){open();return}
    const index=options.indexOf(document.activeElement);
    options[(index+step+options.length)%options.length].focus();
  });
  element.addEventListener('focusout',event=>{if(!element.contains(event.relatedTarget))close()});
  document.addEventListener('pointerdown',event=>{if(!menu.hidden&&!element.contains(event.target))close()});
  return {element,trigger,setValue,close};
}
