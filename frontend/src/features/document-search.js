export function findTextMatches(text,query) {
  if(!query)return [];
  const pattern=new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu');
  return [...text.matchAll(pattern)].map(match=>({start:match.index,end:match.index+match[0].length}));
}

export function findNodeMatches(root,query) {
  const matches=[];
  function visit(node){
    if(!node)return;
    if(node.kind!=='file')for(const match of findTextMatches(node.label||'',query))matches.push({...match,id:node.id});
    for(const child of node.children||[])visit(child);
  }
  visit(root);return matches;
}

export function indexDocumentText(element) {
  const segments=[];let text='';
  const blocks=new Set(['H1','H2','H3','H4','H5','H6','P','DIV','LI','PRE','BLOCKQUOTE','TD','TH']);
  function visit(node){
    if(node.nodeType===3){
      const value=node.textContent;
      let start=0;
      for(let i=0;i<=value.length;i++){
        if(i!==value.length&&value[i]!=='\u200b')continue;
        if(i>start){segments.push({node,start:text.length,end:text.length+i-start,offset:start});text+=value.slice(start,i)}
        start=i+1;
      }
      return;
    }
    if(node.nodeType!==1)return;
    if(node!==element){
      if(node.matches('.vditor-ir__marker,.vditor-ir__preview,script,style,[hidden],[aria-hidden="true"]'))return;
      const style=getComputedStyle(node);
      if(style.display==='none'||style.visibility==='hidden')return;
    }
    const boundary=blocks.has(node.tagName)||node.tagName==='BR';
    if(boundary&&text&&!text.endsWith('\n'))text+='\n';
    for(const child of node.childNodes)visit(child);
    if(boundary&&text&&!text.endsWith('\n'))text+='\n';
  }
  visit(element);return {text,segments};
}

export function documentMatchRange(index,match) {
  const start=index.segments.find(segment=>segment.end>match.start&&segment.start<=match.start);
  const end=index.segments.find(segment=>segment.end>=match.end&&segment.start<match.end);
  if(!start||!end||!start.node.isConnected||!end.node.isConnected)return null;
  const range=document.createRange();
  range.setStart(start.node,start.offset+match.start-start.start);
  range.setEnd(end.node,end.offset+match.end-end.start);return range;
}

function documentMatchRects(index,match) {
  const rects=[];
  for(const segment of index.segments){
    if(segment.end<=match.start)continue;
    if(segment.start>=match.end)break;
    if(!segment.node.isConnected)continue;
    const range=document.createRange();
    range.setStart(segment.node,segment.offset+Math.max(match.start,segment.start)-segment.start);
    range.setEnd(segment.node,segment.offset+Math.min(match.end,segment.end)-segment.start);
    rects.push(...range.getClientRects());
  }
  return rects;
}

const mirrorProperties=['fontFamily','fontSize','fontWeight','fontStyle','fontVariant','fontStretch','fontFeatureSettings','fontKerning','lineHeight','letterSpacing','wordSpacing','textAlign','textIndent','textTransform','direction','tabSize','whiteSpace','overflowWrap','wordBreak','paddingTop','paddingRight','paddingBottom','paddingLeft','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth'];

export function textareaMatchRect(element,match,mirror) {
  const style=getComputedStyle(element);
  for(const property of mirrorProperties)mirror.style[property]=style[property];
  mirror.style.width=element.clientWidth+parseFloat(style.borderLeftWidth)+parseFloat(style.borderRightWidth)+'px';
  if(mirror.firstChild?.textContent!==element.value)mirror.replaceChildren(document.createTextNode(element.value));
  const range=document.createRange();range.setStart(mirror.firstChild,match.start);range.setEnd(mirror.firstChild,match.end);
  const origin=mirror.getBoundingClientRect(),bounds=element.getBoundingClientRect();
  return [...range.getClientRects()].map(rect=>({
    left:bounds.left+rect.left-origin.left-element.scrollLeft,
    top:bounds.top+rect.top-origin.top-element.scrollTop,
    right:bounds.left+rect.right-origin.left-element.scrollLeft,
    bottom:bounds.top+rect.bottom-origin.top-element.scrollTop
  }));
}

export function mountDocumentSearch({bar,input,count,previous,next,closeButton,getTarget,canOpen,beforeOpen,onError}) {
  const overlay=document.createElement('div'),mirror=document.createElement('div');
  overlay.className='document-search-highlight';mirror.className='document-search-mirror';
  overlay.setAttribute('aria-hidden','true');mirror.setAttribute('aria-hidden','true');
  document.body.append(overlay,mirror);
  let target=null,index=null,matches=[],current=-1,range=null,version=0,frame=0,refreshTimer=0,previousFocus=null,opening=false;
  let observer=null;
  function updateCount(){
    count.textContent=!input.value?'':matches.length?(current+1)+' / '+matches.length:'无匹配';
    previous.disabled=next.disabled=!matches.length;
  }
  function paint(){
    frame=0;overlay.replaceChildren();
    if(bar.hidden||!target||current<0||!canOpen())return;
    const clip=target.element.getBoundingClientRect();
    const rects=target.type==='textarea'?textareaMatchRect(target.element,matches[current],mirror):target.type==='markdown'?documentMatchRects(index,matches[current]):range&&range.startContainer.isConnected?[...range.getClientRects()]:[];
    const fragment=document.createDocumentFragment();
    for(const rect of rects){
      const left=Math.max(rect.left,clip.left+target.element.clientLeft),top=Math.max(rect.top,clip.top+target.element.clientTop);
      const right=Math.min(rect.right,clip.left+target.element.clientLeft+target.element.clientWidth),bottom=Math.min(rect.bottom,clip.top+target.element.clientTop+target.element.clientHeight);
      if(right<=left||bottom<=top)continue;
      const mark=document.createElement('div');mark.className='document-search-mark';
      Object.assign(mark.style,{left:left+'px',top:top+'px',width:right-left+'px',height:bottom-top+'px'});fragment.append(mark);
    }
    overlay.append(fragment);
  }
  function schedulePaint(){if(!frame)frame=requestAnimationFrame(paint)}
  async function reveal(){
    const request=++version,match=matches[current];range=null;overlay.replaceChildren();updateCount();
    if(!match)return;
    try{
      if(target.type==='mindmap'){
        const found=await target.reveal(match);
        if(request!==version||bar.hidden)return;
        range=found;
      }else if(target.type==='textarea'){
        const rect=textareaMatchRect(target.element,match,mirror)[0];
        if(rect){
          const bounds=target.element.getBoundingClientRect();
          target.element.scrollTop+=rect.top-bounds.top-target.element.clientHeight/2;
          if(rect.left<bounds.left||rect.right>bounds.right)target.element.scrollLeft+=rect.left-bounds.left-target.element.clientWidth/2;
        }
        target.element.setSelectionRange(match.start,match.end);
      }else{
        range=documentMatchRange(index,match);
        const rect=range?.getBoundingClientRect();
        if(rect){
          const bounds=target.element.getBoundingClientRect();target.element.scrollTop+=rect.top-bounds.top-target.element.clientHeight/2;
          const anchor=range.startContainer.parentElement;
          const horizontal=anchor.closest('pre,table');
          if(horizontal){const bounds=horizontal.getBoundingClientRect();if(rect.left<bounds.left||rect.right>bounds.right)horizontal.scrollLeft+=rect.left-bounds.left-horizontal.clientWidth/2}
        }
      }
      schedulePaint();
    }catch(error){if(request===version)onError(error)}
  }
  function observe(){
    observer?.disconnect();
    if(target.type==='textarea')return;
    observer=new MutationObserver(records=>{
      if(target.type==='mindmap'){schedulePaint();return}
      if(records.some(record=>record.type==='childList'||record.type==='characterData')){
        clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>refresh(),80);
      }else schedulePaint();
    });
    observer.observe(target.element,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden']});
  }
  function refresh({reset=false,jump=false,preserveView=false}={}){
    if(bar.hidden)return;
    if(!canOpen()){close(false);return}
    const nextTarget=getTarget();
    if(!nextTarget){close(false);return}
    if(target?.key!==nextTarget.key){reset=true;target=nextTarget;observe()}
    else target=nextTarget;
    const old=reset?null:matches[current];
    if(!input.value){index=null;matches=[]}
    else if(target.type==='mindmap'){index=null;matches=findNodeMatches(target.root,input.value)}
    else{
      index=target.type==='textarea'?null:indexDocumentText(target.element);
      matches=findTextMatches(index?.text??target.element.value,input.value);
    }
    current=matches.length?0:-1;
    if(old){const found=matches.findIndex(match=>match.start>=old.start&&(target.type!=='mindmap'||match.id===old.id));if(found>=0)current=found}
    ++version;range=null;updateCount();overlay.replaceChildren();
    if((reset||jump)&&!preserveView)void reveal();
    else if(target.type==='mindmap')range=target.range?.(matches[current]);
    else if(target.type!=='textarea'&&current>=0)range=documentMatchRange(index,matches[current]);
    schedulePaint();
  }
  async function open(){
    if(!canOpen()||opening)return;
    opening=true;
    try{
      if(bar.hidden){
        previousFocus=document.activeElement;
        if(beforeOpen&&!await beforeOpen()||!canOpen())return;
        bar.hidden=false;refresh({reset:true});
      }
      input.focus({preventScroll:true});input.select();
    }catch(error){onError(error)}finally{opening=false}
  }
  function close(restoreFocus=true){
    ++version;clearTimeout(refreshTimer);observer?.disconnect();observer=null;
    bar.hidden=true;target=null;range=null;matches=[];current=-1;overlay.replaceChildren();
    if(restoreFocus){
      const element=previousFocus?.isConnected&&previousFocus.getClientRects().length?previousFocus:getTarget()?.element;
      element?.focus({preventScroll:true});
    }
    previousFocus=null;
  }
  function move(direction){
    if(!matches.length)return;
    current=(current+direction+matches.length)%matches.length;void reveal();
  }
  input.addEventListener('input',event=>{if(!event.isComposing)refresh({reset:true})});
  input.addEventListener('compositionend',()=>refresh({reset:true}));
  previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));closeButton.addEventListener('click',()=>close());
  document.addEventListener('keydown',event=>{
    if(event.isComposing||event.keyCode===229)return;
    if(event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='f'){
      if(!canOpen())return;
      event.preventDefault();event.stopImmediatePropagation();void open();return;
    }
    if(bar.hidden||document.querySelector('dialog[open]'))return;
    if(event.key==='Escape'&&!event.metaKey&&!event.ctrlKey&&!event.altKey){event.preventDefault();event.stopImmediatePropagation();close()}
    else if(bar.contains(event.target)&&event.key==='Enter'&&!event.metaKey&&!event.ctrlKey&&!event.altKey){event.preventDefault();event.stopImmediatePropagation();move(event.shiftKey?-1:1)}
    else if(event.metaKey&&!event.ctrlKey&&!event.altKey&&event.key.toLowerCase()==='g'){event.preventDefault();event.stopImmediatePropagation();move(event.shiftKey?-1:1)}
  },true);
  document.addEventListener('scroll',schedulePaint,true);window.addEventListener('resize',schedulePaint);
  document.addEventListener('input',event=>{if(!bar.hidden&&target?.type==='textarea'&&event.target===target.element&&!event.isComposing)refresh()});
  document.addEventListener('compositionend',event=>{if(!bar.hidden&&target?.type==='textarea'&&event.target===target.element)refresh()});
  return {open,close,refresh};
}
