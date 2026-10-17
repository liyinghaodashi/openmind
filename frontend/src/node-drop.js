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
  if(!nearest)return null;
  const ratio=(y-nearest.y)/nearest.height;
  const placement=nearest.id===root.id?'child':ratio<.25?'before':ratio>.75?'after':'child';
  return {targetId:nearest.id,placement};
}
