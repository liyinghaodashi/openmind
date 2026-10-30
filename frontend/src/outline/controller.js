import {isMindMapPath} from '../document-mode.js';
import {nodePath,nodeAtPath} from '../mind/tree-navigation.js';

export function createOutline({state,map,markdown,preview,$,readyToNavigate,toggleSource,toggleFocusMode,updateDocumentView,banner,errorText}) {
  const actions={focus:true,collapse:true};
  function renderOutline(){
    if(map.menuFromOutline)map.closeNodeMenu();
    const outline=$('document-outline'),fragment=document.createDocumentFragment();
    if(state.snapshot&&!isMindMapPath(state.snapshot.path)){
      for(const heading of markdown.headings()){
        const row=document.createElement('button');row.className='outline-row level-'+heading.level;row.textContent=heading.label||'空标题';row.title=heading.label;row.dataset.id=heading.id;
        row.onclick=()=>void focusMarkdownOutline(heading.id);fragment.append(row);
      }
      if(!fragment.childNodes.length){const hint=document.createElement('p');hint.className='tree-placeholder';hint.textContent='当前文档没有标题。';fragment.append(hint)}
      outline.replaceChildren(fragment);return;
    }
    function add(node,depth=1){
      if(depth>2)return;
      const level=depth;
      if(node.kind!=='file'){
        const row=document.createElement('button');row.className='outline-row level-'+level;row.textContent=node.label||'空标题';row.title=node.label;row.dataset.id=node.id;
        const item=document.createElement('div');item.className='outline-item';
        const focus=document.createElement('button');focus.type='button';focus.className='outline-focus';focus.dataset.id=node.id;focus.setAttribute('aria-pressed',String(map.focusedId===node.id));focus.setAttribute('aria-label',(map.focusedId===node.id?'退出':'进入')+'“'+(node.label||'空标题')+'”聚焦模式');focus.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 10 7-7"/><path d="M20 10h-6V4"/><path d="m3 21 7-7"/><path d="M4 14h6v6"/></svg>';
        focus.onclick=()=>void toggleFocusMode(node.id,{fromOutline:true});
        focus.hidden=!actions.focus;
        const collapse=document.createElement('button');collapse.className='outline-collapse';collapse.dataset.id=node.id;collapse.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';collapse.setAttribute('aria-label','折叠或展开“'+(node.label||'空标题')+'”下一层节点的子节点');collapse.disabled=!node.children.some(child=>child.children.length);
        collapse.onclick=()=>void focusOutline(node.id,{collapseChildren:true});
        collapse.hidden=!actions.collapse;
        row.onclick=()=>void focusOutline(node.id);
        item.addEventListener('click',event=>event.target.closest('button:not(:disabled)')?.focus({preventScroll:true}));
        item.addEventListener('keydown',event=>{
          if(event.isComposing||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
          const buttons=[...item.querySelectorAll('button:not(:disabled):not([hidden])')],index=buttons.indexOf(event.target);
          if(index<0)return;
          event.preventDefault();event.stopPropagation();
          buttons[(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length].focus({preventScroll:true});
        });
        item.append(row,focus,collapse);fragment.append(item);
      }
      for(const child of node.children)add(child,depth+1);
    }
    if(state.snapshot)add(map.focusedId?map.viewRoot:state.snapshot.root,map.focusedId?1:0);
    if(!fragment.childNodes.length){const hint=document.createElement('p');hint.className='tree-placeholder';hint.textContent=state.snapshot?(map.focusedId?'当前分支没有节点。':'当前文档没有节点。'):'打开一份 Markdown 查看大纲。';fragment.append(hint)}
    outline.replaceChildren(fragment);updateOutlineCollapseButtons();
  }
  function updateOutlineCollapseButtons(){
    const nodes=new Map();
    function add(node){if(!node)return;nodes.set(node.id,node);for(const child of node.children)add(child)}
    add(map.root);
    for(const button of $('document-outline').querySelectorAll('.outline-collapse')){
      const node=nodes.get(button.dataset.id),children=node?.children.filter(child=>child.children.length)||[];
      if(!children.length){button.removeAttribute('aria-expanded');continue}
      button.setAttribute('aria-expanded',String(!children.every(child=>map.collapsed.has(child.id))));
    }
  }
  async function focusMarkdownOutline(id){
    if(state.navigating||!state.snapshot)return;
    if(state.sourceOpen&&!await toggleSource(false))return;
    if(!markdown.focusHeading(id))return;
    for(const row of $('document-outline').querySelectorAll('.outline-row')){const selected=row.dataset.id===id;row.classList.toggle('selected',selected);if(selected)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current')}
  }
  async function focusOutline(id,{collapseChildren=false}={}){
    if(state.navigating||!state.snapshot)return;
    const path=nodePath(state.snapshot.root,id);if(!path)return;
    state.navigating=true;
    try{
      if(!await readyToNavigate())return;
      const node=nodeAtPath(state.snapshot.root,path);if(!node)return;
      const before=collapseChildren?map.layout?.positions.find(p=>p.id===node.id):null;
      for(let depth=0;depth<path.length;depth++)map.collapsed.delete(nodeAtPath(state.snapshot.root,path.slice(0,depth))?.id);
      if(collapseChildren){
        const children=node.children.filter(child=>child.children.length);
        const expand=children.every(child=>map.collapsed.has(child.id));
        map.collapsed.delete(node.id);
        for(const child of children)if(expand)map.collapsed.delete(child.id);else map.collapsed.add(child.id);
      }
      map.selected=node.id;map.setRoot(state.snapshot.root);
      const position=map.layout.positions.find(p=>p.id===node.id);if(!position)return;
      if(collapseChildren){
        if(before){map.x+=(before.x-position.x)*map.scale;map.y+=(before.y-position.y)*map.scale;map.schedule()}
      }else map.focusBranch(node.id);
      for(const row of $('document-outline').querySelectorAll('.outline-row')){const selected=row.dataset.id===node.id;row.classList.toggle('selected',selected);if(selected)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current')}
    }catch(error){banner(errorText(error))}finally{state.navigating=false;updateDocumentView();$('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor}
  }
  return {actions,render:renderOutline,syncCollapse:updateOutlineCollapseButtons,focus:focusOutline};
}
