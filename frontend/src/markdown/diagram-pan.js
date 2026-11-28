export function bindDiagramPan(viewport, layer, zoomOut, zoomIn, resetButton) {
  const scales=[0.25,0.5,0.75,1,1.25,1.5,2,3,4];
  const initial=scales.indexOf(1);
  let level=initial, x=0, y=0, drag, moved=false;

  function apply(){
    layer.style.transform='translate('+x+'px,'+y+'px) scale('+scales[level]+')';
    zoomOut.disabled=level===0;
    zoomIn.disabled=level===scales.length-1;
  }
  function zoom(step){
    stop();
    const previous=scales[level];
    level=Math.max(0,Math.min(scales.length-1,level+step));
    const ratio=scales[level]/previous;
    x*=ratio;
    y*=ratio;
    apply();
  }
  zoomOut.addEventListener('click',()=>zoom(-1));
  zoomIn.addEventListener('click',()=>zoom(1));
  resetButton.addEventListener('click',reset);

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
    apply();
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture']){
    viewport.addEventListener(type,event=>{if(event.pointerId===drag?.id)stop()});
  }
  viewport.addEventListener('click',event=>{
    if(moved&&event.detail){event.stopPropagation();event.preventDefault()}
  },true);
  window.addEventListener('blur',stop);
  function reset(){
    stop();
    moved=false;
    x=y=0;
    level=initial;
    apply();
  }
  return reset;
}
