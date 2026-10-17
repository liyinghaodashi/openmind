import http from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../frontend/',import.meta.url));
const directory=await mkdtemp(path.join(tmpdir(),'openmind-node-modes-'));
const tests=await readFile(new URL('../frontend/test/'+(process.argv[2]||'node-modes')+'.webkit.js',import.meta.url),'utf8');
const mock=`
window.__nodeModeFixture={writes:[],copies:[],delay:0,generation:0};
const fixture=window.__nodeModeFixture;
const node=(id,label,children=[])=>({id,label,editable:true,kind:'heading',level:1,children});
fixture.snapshot={session:'node-modes',version:1,path:'交互验证.mind.md',source:'# 导图\\n',root:node('root','导图',[node('a','节点 A',[node('child','子节点')]),node('b','节点 B')])};
const find=(root,id)=>root.id===id?root:root.children.map(child=>find(child,id)).find(Boolean);
const copy=()=>structuredClone(fixture.snapshot);
window.go={main:{App:{
  GetSettings:async()=>({mdCompactWindow:true,mindStyle:'${process.env.OPENMIND_MIND_STYLE||'processon'}',sidebarCollapse:true,mindOutlineFocus:true,mindOutlineCollapse:true,mindDoubleClickCreateMain:true,sourceView:true,mindZoomControls:true,mindCopyTree:true}),FrontendReady:async()=>{},RestoreWorkspace:async()=>null,RecentWorkspaces:async()=>[],CheckDocument:async()=>null,
  CopyNodeText:async(session,nodeId,label)=>{fixture.copies.push({session,nodeId,label,tree:false})},
  CopyNodeMarkdown:async(session,nodeId,label)=>{fixture.copies.push({session,nodeId,label,tree:true})},
  ApplyEdit:async edit=>{
    fixture.writes.push(edit);if(fixture.delay)await new Promise(resolve=>setTimeout(resolve,fixture.delay));
    const target=find(fixture.snapshot.root,edit.nodeId);if(!target)throw new Error('Invalid node: '+edit.nodeId);
    let created;
    if(edit.kind==='label')target.label=edit.text;
    else if(edit.kind==='insert-child'||edit.kind==='insert-sibling'){
      created=node('created-'+fixture.writes.length,'');
      if(edit.kind==='insert-child')target.children.push(created);
      else {const parent=(function parent(root){return root.children.includes(target)?root:root.children.map(parent).find(Boolean)})(fixture.snapshot.root);if(!parent)throw new Error('Root has no siblings');parent.children.splice(parent.children.indexOf(target)+1,0,created)}
    }else throw new Error('Unexpected write: '+edit.kind);
    fixture.snapshot.version++;const reply=copy();if(created)reply.createdNodeId=created.id;return reply;
  },
  ReparseDocument:async()=>{
    if(fixture.delay)await new Promise(resolve=>setTimeout(resolve,fixture.delay));
    fixture.snapshot.session='reparse-'+(++fixture.generation);
    let index=0;const reidentify=root=>{root.id='n'+fixture.generation+'-'+index++;root.children.forEach(reidentify)};reidentify(fixture.snapshot.root);return copy();
  }
}}};
window.runtime={EventsOn:()=>{}};
`;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
    const file=path.resolve(root,relative);
    if(!file.startsWith(root)){res.writeHead(403);res.end();return}
    let body=await readFile(file);
    if(relative==='index.html')body=Buffer.from(body.toString().replace('<script type="module"',`<script>${mock}</script><script type="module"`));
    if(relative==='src/main.js')body=Buffer.from(body.toString()+'\n'+tests);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found')}
});
try{
  const executable=path.join(directory,'node-modes-probe');
  const compilation=spawnSync('clang',['-fobjc-arc','-framework','Cocoa','-framework','WebKit',fileURLToPath(new URL('./test-node-modes.m',import.meta.url)),'-o',executable],{stdio:'inherit'});
  if(compilation.status!==0)throw new Error('Cannot compile native WebKit node mode probe');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  process.exitCode=await new Promise((resolve,reject)=>{
    const child=spawn(executable,['http://127.0.0.1:'+server.address().port],{stdio:'inherit'});
    child.on('error',reject);child.on('exit',code=>resolve(code??1));
  });
}finally{
  await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});
}
