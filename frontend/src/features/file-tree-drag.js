export function movedTreePath(path,source,target) {
  return path===source||path.startsWith(source+'/')?target+path.slice(source.length):path;
}

export function canDropEntry(entry,directory) {
  if(!entry?.path||directory===null)return false;
  const parent=entry.path.includes('/')?entry.path.slice(0,entry.path.lastIndexOf('/')):'';
  return directory!==parent&&(!entry.directory||directory!==entry.path&&!directory.startsWith(entry.path+'/'));
}

export function mountFileTreeDrag({tree,rootTarget,rootLabel,canDrag,beforeDrag,move,onState,onError}) {
  let drag=null,ghost=null,highlight=null,frame=null,suppressClick=false;
  const label=rootLabel.textContent;

  function targetAt(x,y) {
    const hit=document.elementFromPoint(x,y);
    if(!hit)return null;
    if(rootTarget.contains(hit))return {directory:'',element:rootTarget};
    if(!tree.contains(hit))return null;
    const row=hit.closest('.tree-row');
    if(row)return row.dataset.directory==='true'?{directory:row.dataset.path,element:row}:null;
    return {directory:'',element:rootTarget};
  }

  function updateTarget() {
    if(!drag?.active)return;
    const candidate=targetAt(drag.x,drag.y);
    const valid=!!candidate&&canDropEntry(drag.entry,candidate.directory);
    drag.target=valid?candidate.directory:null;
    const next=valid?candidate.element:null;
    if(highlight!==next){highlight?.classList.remove('file-drop-target');highlight=next;highlight?.classList.add('file-drop-target')}
    ghost.classList.toggle('file-drop-invalid',!valid);
    ghost.style.transform=`translate(${drag.x+14}px,${drag.y+12}px)`;
  }

  function tick() {
    if(!drag?.active)return;
    const bounds=tree.getBoundingClientRect();
    if(drag.x>=bounds.left&&drag.x<=bounds.right&&drag.y>=bounds.top&&drag.y<=bounds.bottom){
      const top=drag.y-bounds.top,bottom=bounds.bottom-drag.y;
      const speed=top<32?-Math.ceil((32-top)/3):bottom<32?Math.ceil((32-bottom)/3):0;
      if(speed){tree.scrollTop+=speed;updateTarget()}
    }
    frame=requestAnimationFrame(tick);
  }

  function stop(commit=false,event) {
    if(!drag||event&&event.pointerId!==drag.pointer)return;
    if(commit&&drag.active){drag.x=event.clientX;drag.y=event.clientY;updateTarget()}
    const completed=drag;drag=null;
    cancelAnimationFrame(frame);frame=null;
    highlight?.classList.remove('file-drop-target');highlight=null;
    ghost?.remove();ghost=null;
    tree.classList.remove('file-dragging');rootTarget.classList.remove('file-root-target');rootLabel.textContent=label;
    tree.querySelectorAll('.file-drag-source').forEach(row=>row.classList.remove('file-drag-source'));
    if(tree.hasPointerCapture(completed.pointer))tree.releasePointerCapture(completed.pointer);
    if(completed.active){
      onState(false);
      if(commit&&completed.target!==null)void Promise.resolve(move(completed.entry,completed.target)).catch(onError);
    }
  }

  tree.addEventListener('pointerdown',event=>{
    if(drag||event.button!==0||!event.isPrimary||!canDrag())return;
    const row=event.target.closest('.tree-row');if(!row||!tree.contains(row))return;
    drag={pointer:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,active:false,target:null,
      entry:{path:row.dataset.path,name:row.dataset.name,directory:row.dataset.directory==='true'},row};
  });
  document.addEventListener('pointermove',event=>{
    if(!drag||event.pointerId!==drag.pointer)return;
    drag.x=event.clientX;drag.y=event.clientY;
    if(!drag.active){
      if(Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<6)return;
      if(!canDrag()){stop();return}
      drag.active=true;suppressClick=true;beforeDrag();
      ghost=drag.row.cloneNode(true);ghost.className='tree-row file-drag-ghost';ghost.removeAttribute('id');ghost.setAttribute('aria-hidden','true');
      ghost.style.paddingLeft='10px';ghost.style.width=Math.min(tree.clientWidth,260)+'px';document.body.append(ghost);
      drag.row.classList.add('file-drag-source');tree.classList.add('file-dragging');
      rootTarget.classList.add('file-root-target');rootLabel.textContent='移到根目录';
      tree.setPointerCapture(event.pointerId);onState(true);tick();
    }
    event.preventDefault();updateTarget();
  },{capture:true,passive:false});
  document.addEventListener('pointerup',event=>stop(true,event),true);
  document.addEventListener('pointercancel',event=>stop(false,event),true);
  tree.addEventListener('lostpointercapture',event=>stop(false,event));
  tree.addEventListener('dragstart',event=>event.preventDefault());
  document.addEventListener('click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();event.stopImmediatePropagation()}},true);
  document.addEventListener('pointerdown',()=>{suppressClick=false},true);
  document.addEventListener('keydown',event=>{if(drag&&event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();stop()}},true);
  window.addEventListener('blur',()=>stop());
  return {cancel:()=>stop(),get source(){return drag?.active?drag.entry.path:null}};
}
