export function nodePath(node,id,path=[]){if(node.id===id)return path;for(let i=0;i<node.children.length;i++){const found=nodePath(node.children[i],id,[...path,i]);if(found)return found}return null}
export function nodeAtPath(root,path){return path?.reduce((node,index)=>node?.children[index],root)}
