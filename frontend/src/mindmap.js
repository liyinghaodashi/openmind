import {layoutTree} from './layout.js';
import {createMindRenderer} from './mind-styles/index.js';
import {nodeDropTarget} from './node-drop.js';
import {nodeColors} from './node-colors.js';

export class MindMap {
  constructor({canvas, scene, nodes, edges, onEdit, onSelect, onCreateMain, onFocus, onColor, onCopyTree, onZoom, onLayout, canDrag, onMove, onDragState}) {
    Object.assign(this,{canvas,scene,nodes,edges,onEdit,onSelect,onCreateMain,onFocus,onColor,onCopyTree,onZoom,onLayout,canDrag,onMove,onDragState});
    this.scale=1;this.x=0;this.y=0;this.collapsed=new Set();this.frame=0;this.selected=null;this.focusedId=null;
    this.doubleClickCreateMain=true;
    this.copyTreeEnabled=true;
    this.style='processon';
    this.nodeMaxWidth=340;
    this.rendererOptions={canvas,scene,nodes,edges,getNodeMaxWidth:()=>this.nodeMaxWidth,onActivate:id=>this.activateNode(id),onEdit:id=>void this.onEdit(id)};
    this.renderer=createMindRenderer(this.style,this.rendererOptions);
    this.elements=this.renderer.elements;this.edgeElements=this.renderer.edgeElements;
    this.nodeMenu=document.createElement('div');this.nodeMenu.className='file-context-menu node-context-menu';this.nodeMenu.setAttribute('role','menu');this.nodeMenu.setAttribute('aria-label','节点操作');this.nodeMenu.hidden=true;
    const foldButton=document.createElement('button');foldButton.type='button';foldButton.setAttribute('role','menuitem');this.nodeMenu.append(foldButton);document.body.append(this.nodeMenu);
    const focusButton=document.createElement('button');focusButton.type='button';focusButton.setAttribute('role','menuitemcheckbox');focusButton.setAttribute('aria-checked','false');focusButton.textContent='聚焦模式';this.nodeMenu.append(focusButton);
    this.colorRow=document.createElement('div');this.colorRow.className='node-color-row';
    const colorLabel=document.createElement('span');colorLabel.textContent='颜色';this.colorRow.append(colorLabel);
    this.colorOptions=document.createElement('div');this.colorOptions.className='node-color-options';this.colorOptions.setAttribute('role','group');this.colorOptions.setAttribute('aria-label','节点颜色');this.colorRow.append(this.colorOptions);
    for(const color of nodeColors){
      const button=document.createElement('button');button.type='button';button.dataset.color=color.hex;button.setAttribute('role','menuitemradio');button.setAttribute('aria-checked','false');button.setAttribute('aria-label',color.name+'色');button.title=color.name+'色 · 再次选择恢复默认';
      const dot=document.createElement('span');dot.style.backgroundColor=color.hex;dot.setAttribute('aria-hidden','true');button.append(dot);this.colorOptions.append(button);
      button.addEventListener('click',()=>{const id=this.menuNodeId,node=this.layout?.positions.find(p=>p.id===id)?.node,value=node?.color?.toUpperCase()===color.hex?'':color.hex;this.closeNodeMenu();void this.onColor?.(id,value)});
    }
    this.nodeMenu.insertBefore(this.colorRow,focusButton);
    this.copyTreeButton=document.createElement('button');this.copyTreeButton.type='button';this.copyTreeButton.setAttribute('role','menuitem');this.copyTreeButton.textContent='复制树';this.nodeMenu.insertBefore(this.copyTreeButton,focusButton);
    this.copyTreeButton.addEventListener('click',()=>{const id=this.menuNodeId;if(this.copyTreeEnabled)void this.onCopyTree?.(id);this.closeNodeMenu(true)});
    foldButton.addEventListener('click',()=>{const id=this.menuNodeId;this.closeNodeMenu(true);this.toggleSelected(id)});
    focusButton.addEventListener('click',()=>{const id=this.menuNodeId,fromOutline=this.menuFromOutline;this.closeNodeMenu();void this.onFocus?.(id,{fromOutline})});
    this.nodeMenu.addEventListener('keydown',event=>{
      if(event.isComposing||event.metaKey||event.ctrlKey||event.altKey)return;
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();this.closeNodeMenu(true);return}
      if(event.key==='Enter'&&this.colorOptions.contains(document.activeElement)){event.preventDefault();event.stopPropagation();if(!event.repeat)document.activeElement.click();return}
      if(['ArrowLeft','ArrowRight'].includes(event.key)&&this.colorOptions.contains(document.activeElement)){
        event.preventDefault();event.stopPropagation();const buttons=[...this.colorOptions.children],index=buttons.indexOf(document.activeElement);buttons[(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length].focus({preventScroll:true});return;
      }
      if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      const buttons=[...this.nodeMenu.querySelectorAll('button')].filter(button=>!button.hidden&&!button.closest('[hidden]')),index=buttons.indexOf(document.activeElement);
      buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus({preventScroll:true});
    });
    this.nodeMenu.addEventListener('mousedown',event=>{if(document.activeElement===this.editor)event.preventDefault()});
    canvas.addEventListener('contextmenu',event=>this.showNodeMenu(event));
    document.addEventListener('pointerdown',event=>{if(!this.nodeMenu.contains(event.target))this.closeNodeMenu()});
    document.addEventListener('focusin',event=>{if(!this.nodeMenu.contains(event.target))this.closeNodeMenu()});
    document.addEventListener('scroll',()=>this.closeNodeMenu(),true);
    window.addEventListener('resize',()=>this.closeNodeMenu());
    canvas.addEventListener('wheel',()=>this.closeNodeMenu(),{passive:true});
    canvas.addEventListener('wheel',e=>{e.preventDefault();if(e.metaKey||e.ctrlKey){const r=canvas.getBoundingClientRect();this.zoom(Math.exp(-e.deltaY*.004),e.clientX-r.left,e.clientY-r.top);}else{this.x-=e.deltaX;this.y-=e.deltaY;this.schedule();}},{passive:false});
    let drag=null,blankPointer=true;
    canvas.addEventListener('pointerdown',e=>{blankPointer=!e.target.closest('.mind-node,.zoom-controls,button,textarea');if(e.target.closest('.zoom-controls,button,textarea')||(e.button!==0&&e.button!==1)||(e.button===0&&e.target.closest('.mind-node')))return;if(e.button===1)e.preventDefault();drag={x:e.clientX,y:e.clientY};canvas.setPointerCapture(e.pointerId);canvas.style.cursor='grabbing';});
    canvas.addEventListener('pointermove',e=>{if(!drag)return;this.x+=e.clientX-drag.x;this.y+=e.clientY-drag.y;drag={x:e.clientX,y:e.clientY};this.schedule();});
    const stop=()=>{drag=null;canvas.style.cursor=''};canvas.addEventListener('pointerup',stop);canvas.addEventListener('pointercancel',stop);canvas.addEventListener('lostpointercapture',stop);
    canvas.addEventListener('pointerdown',e=>this.startNodeDrag(e));
    canvas.addEventListener('pointermove',e=>this.moveNodeDrag(e));
    canvas.addEventListener('pointerup',e=>this.stopNodeDrag(e,true));
    canvas.addEventListener('pointercancel',e=>this.stopNodeDrag(e,false));
    canvas.addEventListener('lostpointercapture',e=>this.stopNodeDrag(e,false));
    canvas.addEventListener('click',e=>{if(this.suppressClick&&e.detail!==0){e.preventDefault();e.stopImmediatePropagation();this.suppressClick=false}},true);
    canvas.addEventListener('click',e=>{if(!e.target.closest('.mind-node,button,textarea'))void this.onSelect?.(null)});
    canvas.addEventListener('dblclick',e=>{if(this.doubleClickCreateMain&&e.button===0&&blankPointer&&this.root&&!e.target.closest('.mind-node,.zoom-controls,button,textarea')){e.preventDefault();void this.onCreateMain?.()}});
    canvas.addEventListener('keydown',e=>{if(this.nodeDrag&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();this.stopNodeDrag(null,false)}},true);
    canvas.addEventListener('keydown',event=>{if(event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey&&(event.key==='/'||event.code==='Slash')&&!event.isComposing){event.preventDefault();if(!event.repeat)this.toggleSelected()}});
    new ResizeObserver(()=>this.schedule()).observe(canvas);
  }
  startNodeDrag(event){
    if(event.button!==0||event.target.closest('button,textarea')||this.nodeDrag||!this.root)return;
    const el=event.target.closest('.mind-node');
    if(!el||el.dataset.id===this.root.id||el.dataset.id===this.focusedId||!this.onMove||this.canDrag&&!this.canDrag())return;
    event.preventDefault();this.suppressClick=false;
    this.nodeDrag={id:el.dataset.id,pointer:event.pointerId,startX:event.clientX,startY:event.clientY,x:event.clientX,y:event.clientY,active:false,target:null};
    this.canvas.setPointerCapture(event.pointerId);
  }
  moveNodeDrag(event){
    const drag=this.nodeDrag;if(!drag||drag.pointer!==event.pointerId)return;
    drag.x=event.clientX;drag.y=event.clientY;
    if(!drag.active&&Math.hypot(drag.x-drag.startX,drag.y-drag.startY)<6)return;
    if(!drag.active){
      drag.active=true;this.selected=drag.id;this.suppressClick=true;this.onDragState?.(true);
      const el=this.elements.get(drag.id);
      this.dragGhost=this.renderer.createDragGhost(el,this.scale);
      this.canvas.append(this.dragGhost);this.canvas.classList.add('node-dragging');this.canvas.focus({preventScroll:true});
    }
    this.updateNodeDrop();this.schedule();
  }
  updateNodeDrop(){
    const drag=this.nodeDrag;if(!drag?.active)return;
    const rect=this.canvas.getBoundingClientRect();
    const x=drag.x-rect.left,y=drag.y-rect.top;
    drag.target=nodeDropTarget(this.viewRoot,this.layout.positions,drag.id,(x-this.x)/this.scale,(y-this.y)/this.scale);
    if(this.dragGhost)this.dragGhost.style.transform=`translate(${x+14}px,${y+14}px)`;
  }
  stopNodeDrag(event,commit){
    const drag=this.nodeDrag;if(!drag||event&&event.pointerId!==drag.pointer)return;
    if(commit&&drag.active){drag.x=event.clientX;drag.y=event.clientY;this.updateNodeDrop()}
    this.nodeDrag=null;this.dragGhost?.remove();this.dragGhost=null;
    this.canvas.classList.remove('node-dragging');
    if(this.canvas.hasPointerCapture(drag.pointer))this.canvas.releasePointerCapture(drag.pointer);
    if(drag.active)this.onDragState?.(false);
    this.schedule();
    if(commit&&drag.active&&drag.target)void this.onMove(drag.id,drag.target.targetId,drag.target.placement);
    else if(commit&&!drag.active)this.activateNode(drag.id);
    this.suppressClick=true;
    clearTimeout(this.clickReset);this.clickReset=setTimeout(()=>{this.suppressClick=false},0);
  }
  activateNode(id){
    if(this.selected===id)void this.onEdit(id);
    else void this.onSelect?.(id);
  }
  measure(label,depth,node){return this.editor&&node?.id===this.editing?this.renderer.measureEditor(this.editor,depth,node):this.renderer.measure(label,depth,node);}
  createEditor(position){return this.renderer.createEditor(position);}
  setNodeMark(level, enabled){
    this.canvas.classList.toggle(level === 'main' ? 'mind-main-node-mark' : 'mind-second-node-mark', enabled);
    if(this.root)this.setRoot(this.root);
  }
  setNodeMaxWidth(width){
    if(this.nodeMaxWidth===width)return;
    this.nodeMaxWidth=width;
    this.renderer.measurements.clear();
    if(this.root)this.setRoot(this.root);
  }
  setStyle(style){
    if(this.style===style)return;
    const anchor=this.layout?.positions.find(p=>p.id===(this.focusedId||this.selected))||this.layout?.positions[0];
    const renderer=createMindRenderer(style,this.rendererOptions);
    this.closeNodeMenu();if(this.nodeDrag)this.stopNodeDrag(null,false);
    this.renderer.clear();this.renderer=renderer;this.style=style;
    this.elements=renderer.elements;this.edgeElements=renderer.edgeElements;
    if(this.root){
      this.setRoot(this.root);
      const next=this.layout.positions.find(p=>p.id===anchor?.id);
      if(next){this.x+=(anchor.x-next.x)*this.scale;this.y+=(anchor.y+anchor.height/2-next.y-next.height/2)*this.scale;}
    }
    this.schedule();
  }
  closeNodeMenu(restoreFocus=false){
    if(this.nodeMenu)this.nodeMenu.hidden=true;
    const origin=this.menuOrigin;this.menuNodeId=null;this.menuOrigin=null;this.menuFromOutline=false;
    if(restoreFocus&&origin?.isConnected)origin.focus({preventScroll:true});
  }
  showNodeMenu(event,{id,fromOutline=false}={}){
    const editor=!fromOutline&&event.target===this.editor?this.editor:null;
    const el=editor?this.elements.get(this.editing):event.target.closest(fromOutline?'.outline-item':'.mind-node');
    const fromCanvas=!fromOutline&&!el&&this.focusedId&&!event.target.closest('.zoom-controls,button');
    if(!el&&!fromCanvas)return;
    event.preventDefault();this.closeNodeMenu();
    const find=node=>node?.id===id?node:node?.children.map(find).find(Boolean);
    const node=fromCanvas?this.viewRoot:fromOutline?find(this.viewRoot):this.layout?.positions.find(p=>p.id===el.dataset.id)?.node;
    if(this.nodeDrag||!node)return;
    this.menuNodeId=node.id;this.menuFromOutline=fromOutline;this.menuOrigin=editor||(fromCanvas?this.canvas:fromOutline?el.querySelector('.outline-row'):el);
    this.nodeMenu.setAttribute('aria-label',fromCanvas?'画布操作':'节点操作');
    const button=this.nodeMenu.firstChild;button.hidden=fromCanvas||fromOutline||!node.children.length;button.textContent=this.collapsed.has(node.id)?'展开':'折叠';
    const focusButton=this.nodeMenu.lastChild;focusButton.textContent=fromCanvas?'退出聚焦模式':'聚焦模式';focusButton.setAttribute('aria-checked',String(this.focusedId===node.id));
    this.colorRow.hidden=fromCanvas||fromOutline||!node.editable;
    this.copyTreeButton.hidden=fromCanvas||fromOutline||!this.copyTreeEnabled;
    const selectedColor=(this.layout?.positions.find(p=>p.id===node.id)?.effectiveColor||'').toUpperCase();
    for(const button of this.colorOptions.children)button.setAttribute('aria-checked',String(button.dataset.color===selectedColor));
    this.nodeMenu.hidden=false;this.nodeMenu.style.left='0px';this.nodeMenu.style.top='0px';
    const bounds=this.nodeMenu.getBoundingClientRect(),origin=(el||this.canvas).getBoundingClientRect();
    const keyboard=event.clientX===0&&event.clientY===0;
    this.nodeMenu.style.left=Math.max(8,Math.min(keyboard?origin.left+24:event.clientX,window.innerWidth-bounds.width-8))+'px';
    this.nodeMenu.style.top=Math.max(8,Math.min(keyboard?origin.bottom:event.clientY,window.innerHeight-bounds.height-8))+'px';
    if(!editor)(button.hidden?(this.copyTreeButton.hidden?focusButton:this.copyTreeButton):button).focus({preventScroll:true});
  }
  setRoot(root,{resetView=false}={}){
    const anchor=!resetView&&this.editor?this.layout?.positions.find(p=>p.id===this.editing):null;
    this.closeNodeMenu();if(this.nodeDrag)this.stopNodeDrag(null,false);this.root=root;
    if(resetView)this.focusedId=null;
    const find=node=>node.id===this.focusedId?node:node.children.map(find).find(Boolean);
    const focused=this.focusedId?find(root):null;
    if(!focused)this.focusedId=null;
    this.viewRoot=focused||root;
    this.layout=layoutTree(root,this.collapsed,(...args)=>this.measure(...args),{rootGap:this.canvas.classList.contains('mind-main-node-mark')?64:30});
    if(focused){
      const ids=new Set();
      const add=node=>{ids.add(node.id);node.children.forEach(add)};add(focused);
      this.layout.positions=this.layout.positions.filter(p=>ids.has(p.id));
      this.layout.edges=this.layout.edges.filter(edge=>ids.has(edge.from.id)&&ids.has(edge.to.id));
    }
    const next=anchor&&this.layout.positions.find(p=>p.id===anchor.id);
    if(next){this.x+=(anchor.x-next.x)*this.scale;this.y+=(anchor.y+anchor.height/2-next.y-next.height/2)*this.scale;}
    if(resetView)this.resetView();else this.schedule();this.onLayout?.();
  }
  toggleFocus(id){
    if(this.nodeDrag||!this.layout?.positions.some(p=>p.id===id))return;
    this.focusedId=this.focusedId===id?null:id;
    this.selected=id;this.setRoot(this.root);
  }
  toggleSelected(id=this.selected){
    if(this.nodeDrag)return;
    const p=this.layout?.positions.find(p=>p.id===id);
    if(!p?.node.children.length)return;
    this.collapsed.has(p.id)?this.collapsed.delete(p.id):this.collapsed.add(p.id);
    this.setRoot(this.root);
  }
  reveal(id){
    const p=this.layout?.positions.find(p=>p.id===id);if(!p)return;
    const left=p.x*this.scale+this.x,right=(p.x+p.width)*this.scale+this.x;
    const top=p.y*this.scale+this.y,bottom=(p.y+p.height)*this.scale+this.y;
    if(right>this.canvas.clientWidth-24)this.x-=right-this.canvas.clientWidth+24;
    if(left<24)this.x+=24-left;
    if(bottom>this.canvas.clientHeight-24)this.y-=bottom-this.canvas.clientHeight+24;
    if(top<24)this.y+=24-top;
    this.schedule();
  }
  resetView(){
    const root=this.layout?.positions.find(p=>p.id===(this.viewRoot||this.root).id)||this.layout?.positions[0];
    this.scale=1;this.x=Math.max(24,(this.canvas.clientWidth-(this.layout?.width||0))/2);this.y=root?this.canvas.clientHeight/2-root.y-root.height/2:24;this.schedule();
  }
  fit(){if(!this.layout)return;const {width,height}=this.layout;if(!width||!height){this.resetView();return}const w=this.canvas.clientWidth,h=this.canvas.clientHeight;this.scale=Math.max(.18,Math.min(1,(w-145)/width,(h-150)/height));this.x=(w-width*this.scale)/2;this.y=(h-height*this.scale)/2;this.schedule();}
  focusBranch(id){
    const target=this.layout?.positions.find(p=>p.id===id);if(!target)return;
    const ids=new Set();
    const add=node=>{ids.add(node.id);if(!this.collapsed.has(node.id))for(const child of node.children)add(child)};
    add(target.node);
    const positions=this.layout.positions.filter(p=>ids.has(p.id));
    let left=Infinity,right=-Infinity;
    for(const p of positions){
      const badge=p.hiddenCount?10+Math.max(22,12+String(p.hiddenCount).length*7):0;
      left=Math.min(left,p.x);right=Math.max(right,p.x+p.width+badge);
    }
    const width=right-left,w=this.canvas.clientWidth,h=this.canvas.clientHeight;
    if(!width||!w||!h)return;
    this.x=Math.max(24,(w-width*this.scale)/2)-left*this.scale;
    this.y=h/2-(target.y+target.height/2)*this.scale;this.schedule();
  }
  zoom(factor,cx=this.canvas.clientWidth/2,cy=this.canvas.clientHeight/2){const next=Math.max(.15,Math.min(2.5,this.scale*factor));this.x=cx-(cx-this.x)*next/this.scale;this.y=cy-(cy-this.y)*next/this.scale;this.scale=next;this.schedule();}
  schedule(){if(!this.frame)this.frame=requestAnimationFrame(()=>{this.frame=0;this.render()});}
  render(){
    if(!this.layout)return;
    if(this.nodeDrag?.active){
      const rect=this.canvas.getBoundingClientRect(),x=this.nodeDrag.x-rect.left,y=this.nodeDrag.y-rect.top;
      const speed=(pos,size)=>pos<36?(36-pos)/3:pos>size-36?(size-36-pos)/3:0;
      if(x>=0&&y>=0&&x<=rect.width&&y<=rect.height){const dx=speed(x,rect.width),dy=speed(y,rect.height);if(dx||dy){this.x+=dx;this.y+=dy;this.schedule()}}
      this.updateNodeDrop();
    }
    this.renderer.render({layout:this.layout,x:this.x,y:this.y,scale:this.scale,selected:this.selected,editing:this.editing,editor:this.editor,collapsed:this.collapsed,drag:this.nodeDrag});
    this.onZoom?.(this.scale);
  }
  clear(){this.closeNodeMenu();this.stopNodeDrag(null,false);this.root=null;this.viewRoot=null;this.focusedId=null;this.layout=null;this.renderer.clear();this.editor?.remove();this.collapsed.clear();this.editor=null;this.editing=null;}
}
