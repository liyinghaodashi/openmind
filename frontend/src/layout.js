export function layoutTree(root, collapsed, measure) {
  const positions = [], edges = [];
  const descendants=node=>node.children.reduce((sum,child)=>sum+1+descendants(child),0);
  function prepare(node, depth = 0, branch = 0, pathDepth = 0) {
    const size = measure(node.label || '空节点', depth, node);
    const children = collapsed.has(node.id) ? [] : node.children.map((child, i) => prepare(child, depth + 1, depth === 0 ? i : branch, pathDepth + 1));
    const height = Math.max(size.height, children.reduce((sum, child) => sum + child.span, 0) + Math.max(0, children.length - 1) * 15);
    return {node, depth, branch, pathDepth, size, children, span:height,hiddenCount:collapsed.has(node.id)?descendants(node):0};
  }
  function place(item, x, top, inheritedColor = '') {
    const {node, depth, branch, size, children, span} = item;
    const lineColor = node.color || inheritedColor;
    const p = {id:node.id,node,effectiveColor:lineColor,depth,pathDepth:item.pathDepth,branch,x,y:top+(span-size.height)/2,width:size.width,height:size.height,hiddenCount:item.hiddenCount};
    positions.push(p);
    let cy = top + (span - (children.reduce((sum,c)=>sum+c.span,0)+Math.max(0,children.length-1)*15))/2;
    for(const child of children) {
      const c = place(child,x+size.width+(depth===0?64:30),cy,lineColor);
      edges.push({id:child.node.id,from:p,to:c,color:child.node.color||lineColor});cy+=child.span+15;
    }
    return p;
  }
  if(root.kind==='file'){
    let top=0;
    for(const node of root.children){const item=prepare(node,0,0,1);place(item,0,top);top+=item.span+40}
  }else place(prepare(root),0,0);
  return {positions,edges,width:positions.reduce((max,p)=>Math.max(max,p.x+p.width+(p.hiddenCount?10+Math.max(22,12+String(p.hiddenCount).length*7):0)),0),height:positions.reduce((max,p)=>Math.max(max,p.y+p.height),0)};
}
