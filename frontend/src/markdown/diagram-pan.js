export function bindDiagramPan(viewport, layer) {
  let x=0, y=0, drag, moved=false;

  function stop() {
    if(!drag)return;
    const {target,id}=drag;
    drag=null;
    if(target.hasPointerCapture(id))target.releasePointerCapture(id);
    viewport.classList.remove('panning');
  }

  viewport.addEventListener('pointerdown',event=>{
    if(drag||event.button!==0||!event.isPrimary)return;
    moved=false;
    drag={id:event.pointerId,target:event.target,startX:event.clientX,startY:event.clientY,x,y};
    event.target.setPointerCapture(event.pointerId);
  });
  viewport.addEventListener('pointermove',event=>{
    if(event.pointerId!==drag?.id)return;
    const dx=event.clientX-drag.startX, dy=event.clientY-drag.startY;
    if(!moved&&Math.hypot(dx,dy)<4)return;
    moved=true;
    viewport.classList.add('panning');
    x=drag.x+dx;
    y=drag.y+dy;
    layer.style.transform='translate('+x+'px,'+y+'px)';
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture']){
    viewport.addEventListener(type,event=>{if(event.pointerId===drag?.id)stop()});
  }
  viewport.addEventListener('click',event=>{
    if(moved&&event.detail){event.stopPropagation();event.preventDefault()}
  },true);
  window.addEventListener('blur',stop);
  return ()=>{
    stop();
    moved=false;
    x=y=0;
    layer.style.removeProperty('transform');
  };
}
