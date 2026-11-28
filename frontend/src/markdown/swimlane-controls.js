const svgNamespace='http://www.w3.org/2000/svg';

function insertNode(source,laneId,parse){
  const lines=source.split('\n');
  const declarations=lines.map(line=>/^([ \t]*)subgraph[ \t]+([^\s[;]+)(?:[ \t]*\[.*\])?[ \t]*(?:%%.*)?$/.exec(line));
  const index=declarations.findIndex(match=>match?.[2]===laneId);
  if(index<0||declarations.some((match,i)=>i!==index&&match?.[2]===laneId))return;
  let end=index+1,depth=1;
  for(;end<lines.length;end++){
    if(/^\s*subgraph\s/.test(lines[end]))depth++;
    if(/^\s*end\s*;?\s*(?:%%.*)?$/.test(lines[end])&&--depth===0)break;
  }
  if(end===lines.length)return;
  const diagram=parse(source);
  const members=diagram.subgraphLookup.get(laneId)?.nodes;
  if(!members)return;
  const laneNodes=new Set(members);
  const previous=[...diagram.nodes.keys()].filter(id=>laneNodes.has(id)).at(-1);
  let number=1;
  while(source.includes('node'+number))number++;
  const indent=declarations[index][1]+'  ';
  const id='node'+number;
  const additions=[indent+id+'["节点 '+number+'"]'];
  if(previous)additions.push(indent+previous+' ~~~ '+id);
  lines.splice(end,0,...additions);
  return lines.join('\n');
}

export function createSwimlaneControls(panel,onInsert){
  const overlay=document.createElementNS(svgNamespace,'svg');
  overlay.classList.add('markdown-swimlane-headers');
  const add=document.createElement('button');
  add.type='button';
  add.textContent='新建节点';
  let selected;
  function select(id){
    selected=id;
    for(const header of overlay.children){
      header.setAttribute('aria-pressed',String(header.dataset.id===id));
    }
    if(id)panel.replaceChildren(add);
    else panel.replaceChildren();
  }
  add.addEventListener('click',()=>{if(selected)onInsert((source,parse)=>insertNode(source,selected,parse))});
  function show(geometry){
    overlay.replaceChildren();
    if(geometry){
      overlay.setAttribute('viewBox',geometry.viewBox);
      for(const lane of geometry.headers){
        const rect=document.createElementNS(svgNamespace,'rect');
        for(const key of ['x','y','width','height'])rect.setAttribute(key,lane[key]);
        rect.dataset.id=lane.id;
        rect.setAttribute('role','button');
        rect.setAttribute('tabindex','0');
        rect.setAttribute('aria-label',lane.label);
        rect.addEventListener('click',()=>select(lane.id));
        rect.addEventListener('keydown',event=>{
          if(event.key==='Enter'||event.key===' '){
            event.preventDefault();
            select(lane.id);
          }
        });
        overlay.append(rect);
      }
    }
    select(geometry?.headers.some(lane=>lane.id===selected)?selected:undefined);
  }
  return {overlay,add,show};
}
