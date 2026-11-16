import {nodePath,nodeAtPath} from './tree-navigation.js';

export function createMindSelection({state,map,preview,operations,finishNode,sourceEditor,onError}) {
  async function moveSelection(direction){
    if(state.fileDragging||state.nodeDragging||operations.busy||state.checking||state.blocked||state.closing||state.composing||state.navigating||!state.snapshot||!map.selected)return;
    const path=nodePath(state.snapshot.root,map.selected);
    if(!path)return;
    let targetPath;
    if(direction==='ArrowLeft'){if(!path.length||map.selected===map.focusedId||state.snapshot.root.kind==='file'&&path.length===1)return;targetPath=path.slice(0,-1)}
    else if(direction==='ArrowRight'){
      const node=nodeAtPath(state.snapshot.root,path);
      if(!node.children.length)return;
      targetPath=[...path,node.children.length-1];
    }else{
      if(!path.length)return;
      const peers=map.layout.positions.filter(node=>(node.pathDepth??node.depth)===path.length);
      const index=peers.findIndex(node=>node.id===map.selected)+(direction==='ArrowUp'?-1:1);
      if(index<0||index>=peers.length)return;
      targetPath=nodePath(state.snapshot.root,peers[index].id);
    }
    operations.begin();
    const folded=[...map.collapsed].map(id=>nodePath(state.snapshot.root,id)).filter(Boolean);
    if(state.editor)state.editor.readOnly=true;
    sourceEditor.readOnly=true;
    try{
      if(!await finishNode()||!await state.queue.drain())return;
      const target=nodeAtPath(state.snapshot.root,targetPath);
      if(!target)return;
      map.collapsed=new Set(folded.map(path=>nodeAtPath(state.snapshot.root,path)?.id).filter(Boolean));
      if(direction==='ArrowRight')map.collapsed.delete(nodeAtPath(state.snapshot.root,path)?.id);
      map.selected=target.id;map.setRoot(state.snapshot.root);map.reveal(target.id);map.render();
      map.elements.get(target.id)?.focus({preventScroll:true});
    }catch(error){onError(error)}finally{
      operations.end();
      if(state.editor)state.editor.readOnly=state.blocked||state.closing;
      sourceEditor.readOnly=preview||state.blocked||!!state.editor;
    }
  }
  return moveSelection;
}
