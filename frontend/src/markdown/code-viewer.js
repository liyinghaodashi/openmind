import {bindSplitDivider} from '../workspace/split-view.js';
import {createMermaidPreview} from './mermaid-preview.js';

const blockSelector='[data-type="code-block"]';

function iconButton(label,path){
  const button=document.createElement('button');
  button.type='button';
  button.className='markdown-code-button';
  button.setAttribute('aria-label',label);
  button.innerHTML='<svg aria-hidden="true" viewBox="0 0 16 16"><path d="'+path+'"/></svg>';
  return button;
}

export function bindCodeViewer(container,editable){
  const controls=document.createElement('div');
  controls.className='markdown-code-controls';
  const viewer=document.createElement('section');
  viewer.className='markdown-code-viewer';
  viewer.setAttribute('aria-label','放大的代码块');
  viewer.hidden=true;
  const close=iconButton('收起代码块（Esc）','M1 5h4V1m10 10h-4v4');
  close.title=close.getAttribute('aria-label');
  const content=document.createElement('div');
  viewer.append(content);
  container.append(controls,viewer);

  const panes=document.createElement('div');
  panes.className='markdown-mermaid-panes';
  const image=document.createElement('img');
  image.className='markdown-mermaid-expanded';
  image.alt='Mermaid 图表';
  image.id='markdown-mermaid-diagram';
  const divider=document.createElement('div');
  divider.className='markdown-mermaid-divider';
  divider.tabIndex=0;
  divider.setAttribute('role','separator');
  divider.setAttribute('aria-label','图表宽度');
  divider.setAttribute('aria-orientation','vertical');
  divider.setAttribute('aria-controls',image.id);
  divider.setAttribute('aria-valuemin','15');
  divider.setAttribute('aria-valuemax','85');
  divider.setAttribute('aria-valuenow','75');
  const canvas=document.createElement('div');
  canvas.className='markdown-mermaid-canvas';
  const error=document.createElement('p');
  error.className='markdown-mermaid-error';
  error.setAttribute('role','status');
  canvas.append(image,error,close);
  panes.append(canvas,divider);
  const stopResize=bindSplitDivider(divider,canvas);

  const buttons=new Map();
  const previews=new Map();
  let active,sourceEditor,frame,renderer,loading;
  function clearPreview(block){
    const preview=previews.get(block);
    if(preview?.url)URL.revokeObjectURL(preview.url);
    previews.delete(block);
    block.removeAttribute('data-mermaid-preview');
    block.style.removeProperty('--mermaid-image');
    block.style.removeProperty('--mermaid-height');
  }
  function updatePreview(block){
    if(!renderer){
      loading??=import('../vendor/pele/pele.js').then(module=>{renderer=module.render;schedule()});
      return;
    }
    const source=block.querySelector('pre code')?.textContent.replaceAll('\u200b','')||'';
    if(previews.get(block)?.source===source)return;
    clearPreview(block);
    const preview=createMermaidPreview(renderer,source);
    previews.set(block,preview);
    if(preview.url){
      block.style.setProperty('--mermaid-image','url("'+preview.url+'")');
      block.style.setProperty('--mermaid-height',Math.min(360,preview.height+24)+'px');
    }
    block.dataset.mermaidPreview=preview.url?'ready':'error';
    if(block===active)showDiagram(preview);
  }
  function showDiagram(preview){
    if(preview.url)image.src=preview.url;
    else image.removeAttribute('src');
    image.hidden=!preview.url;
    error.hidden=!!preview.url;
    error.textContent=preview.error?'Mermaid 语法错误：'+preview.error:'';
  }
  function dismiss(restoreFocus=false){
    if(!active)return;
    const button=buttons.get(active);
    stopResize();
    sourceEditor.remove();
    sourceEditor=null;
    image.removeAttribute('src');
    active=null;
    viewer.hidden=true;
    editable.inert=false;
    controls.hidden=false;
    content.replaceChildren();
    if(restoreFocus)button?.focus({preventScroll:true});
  }
  function open(block){
    const body=block.querySelector('pre code');
    if(!body)return;
    active=block;
    sourceEditor=document.createElement('textarea');
    sourceEditor.className='markdown-mermaid-source';
    sourceEditor.setAttribute('aria-label','Mermaid 源码');
    sourceEditor.wrap='off';
    sourceEditor.spellcheck=false;
    sourceEditor.readOnly=editable.getAttribute('aria-readonly')==='true';
    sourceEditor.value=body.textContent.replaceAll('\u200b','').replace(/\n$/,'');
    sourceEditor.addEventListener('input',()=>{
      if(active===block&&editable.contains(block)&&editable.getAttribute('aria-readonly')!=='true'){
        body.textContent=sourceEditor.value+'\n';
      }
    });
    panes.append(sourceEditor);
    content.replaceChildren(panes);
    showDiagram(previews.get(block));
    viewer.hidden=false;
    controls.hidden=true;
    editable.inert=true;
    close.focus({preventScroll:true});
  }
  function layout(){
    frame=0;
    if(active&&(!editable.contains(active)||container.clientHeight===0))dismiss();
    if(active)sourceEditor.readOnly=editable.getAttribute('aria-readonly')==='true';
    const bounds=container.getBoundingClientRect();
    for(const [block,button] of buttons){
      if(!editable.contains(block)){clearPreview(block);button.remove();buttons.delete(block)}
    }
    for(const block of editable.querySelectorAll(blockSelector)){
      const field=block.querySelector('[data-type="code-block-info"]');
      if(field?.textContent.replaceAll('\u200b','').trim().toLowerCase()!=='mermaid'){
        if(previews.has(block)||block.hasAttribute('data-mermaid-preview'))clearPreview(block);
        buttons.get(block)?.remove();
        buttons.delete(block);
        continue;
      }
      updatePreview(block);
      if(!renderer)continue;
      const rect=field.getBoundingClientRect();
      let button=buttons.get(block);
      if(!button){
        button=iconButton('放大代码块','M6 2H2v4m0-4 4 4m4 8h4v-4m0 4-4-4');
        button.addEventListener('click',()=>open(block));
        controls.append(button);buttons.set(block,button);
      }
      button.hidden=!rect.height||rect.bottom<=bounds.top||rect.top>=bounds.bottom;
      button.style.left=(rect.left-bounds.left-30)+'px';
      button.style.top=(rect.top-bounds.top)+'px';
    }
  }
  function schedule(){if(!frame)frame=requestAnimationFrame(layout)}
  close.addEventListener('click',()=>dismiss(true));
  viewer.addEventListener('keydown',event=>{
    if(event.key==='Escape'&&!event.isComposing&&event.keyCode!==229){event.preventDefault();event.stopPropagation();dismiss(true)}
  });
  editable.addEventListener('scroll',schedule,true);
  editable.addEventListener('load',schedule,true);
  new MutationObserver(schedule).observe(editable,{subtree:true,childList:true,characterData:true,attributes:true});
  new ResizeObserver(schedule).observe(container);
  schedule();
  return dismiss;
}
