export function isMindMapPath(path='') {
  return /\.mind\.md$/i.test(path.split('/').pop());
}

export function documentTitle(path='') {
  return path.split('/').pop().replace(/\.mind\.md$/i,'').replace(/\.(md|markdown)$/i,'');
}

export function documentAssetBase(session,path) {
  const directory=path.includes('/')?path.slice(0,path.lastIndexOf('/')+1):'';
  return '/document-assets/'+encodeURIComponent(session)+'/'+directory.split('/').map(encodeURIComponent).join('/');
}

export function markdownLinkTarget(href,base) {
  const url=new URL(href,new URL(base,location.href));
  const prefix='/document-assets/'+base.split('/')[2]+'/';
  if(url.origin!==location.origin||!url.pathname.startsWith(prefix))return null;
  const path=decodeURIComponent(url.pathname.slice(prefix.length));
  return /\.(md|markdown)$/i.test(path)?path:null;
}

export function newDocumentName(name,mindMap) {
  if(!mindMap||isMindMapPath(name))return name;
  return name.replace(/\.(md|markdown)$/i,'')+'.mind.md';
}
