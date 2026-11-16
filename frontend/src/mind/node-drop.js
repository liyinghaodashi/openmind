export function nodeDropTarget(root,positions,sourceID,x,y) {
  const excluded=new Set();
  const mark=node=>{excluded.add(node.id);node.children.forEach(mark)};
  const find=node=>{if(node.id===sourceID)mark(node);else node.children.forEach(find)};
  find(root);
  let nearest=null,distance=Infinity;
  for(const p of positions){
    if(excluded.has(p.id)||x<p.x-20||x>p.x+p.width+36||y<p.y-12||y>p.y+p.height+12)continue;
    const d=Math.max(p.x-x,0,x-p.x-p.width)**2+Math.max(p.y-y,0,y-p.y-p.height)**2;
    if(d<distance){nearest=p;distance=d}
  }
  if(!nearest){
    if(positions.some(p=>excluded.has(p.id)&&x>=p.x&&x<=p.x+p.width&&y>=p.y&&y<=p.y+p.height))return null;
    const visible=new Map(positions.map(p=>[p.id,p]));
    let gapTarget=null;
    const visit=node=>{
      if(excluded.has(node.id))return;
      const siblings=node.children.map(child=>visible.get(child.id)).filter(Boolean);
      for(let i=1;i<siblings.length;i++){
        const above=siblings[i-1],below=siblings[i];
        if(y<=above.y+above.height||y>=below.y||x<Math.max(above.x,below.x)-20||x>Math.min(above.x+above.width,below.x+below.width)+36)continue;
        const target=!excluded.has(below.id)?below:!excluded.has(above.id)?above:null;
        if(!target)continue;
        const d=Math.max(target.x-x,0,x-target.x-target.width)**2+Math.max(target.y-y,0,y-target.y-target.height)**2;
        if(d<distance){gapTarget={targetId:target.id,placement:target===below?'before':'after'};distance=d}
      }
      node.children.forEach(visit);
    };
    visit(root);
    return gapTarget;
  }
  const ratio=(y-nearest.y)/nearest.height;
  const placement=nearest.id===root.id?'child':ratio<.25?'before':ratio>.75?'after':'child';
  return {targetId:nearest.id,placement};
}
