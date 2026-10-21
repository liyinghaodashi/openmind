import http from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project=fileURLToPath(new URL('../',import.meta.url));
const frontend=path.join(project,'frontend');
const directory=await mkdtemp(path.join(tmpdir(),'openmind-mind-rules-test-'));
const addressFile=path.join(directory,'address');
const tests=await readFile(new URL('../frontend/test/'+(process.argv[2]||'mind-rules')+'.webkit.js',import.meta.url),'utf8');
const mock=`
window.__mindRules={};
window.__mindRules.settings={mdCompactWindow:true,hideFileExtensions:false,expandFileNameOnHover:false,mindStyle:'processon',mindMainNodeMark:false,mindSecondNodeMark:false,sidebarCollapse:true,mindOutlineFocus:true,mindOutlineCollapse:true,mindDoubleClickCreateMain:true,sourceView:true,mindZoomControls:true,mindCopyTree:true};
window.__mindRules.request=async(method,...args)=>{
  const response=await fetch('/_mind',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,args})});
  const result=await response.json();if(!response.ok)throw new Error(result.error);return result.value;
};
window.go={main:{App:{
  GetSettings:async()=>({...window.__mindRules.settings}),SaveSettings:async value=>{await window.__mindRules.saveGate;if(window.__mindRules.saveError)throw new Error(window.__mindRules.saveError);window.__mindRules.settings={...value}},FrontendReady:async()=>{},TakePendingFileOpens:async()=>[],RestoreWorkspace:async()=>null,RecentWorkspaces:async()=>[],CheckDocument:async()=>null,
  ...Object.fromEntries(['OpenDocument','ApplyEdit','ReparseDocument','CopyNodeMarkdown','CopyNodeText'].map(method=>[method,(...args)=>window.__mindRules.request(method,...args)]))
}}};
window.runtime={EventsOn:()=>{},WindowShow:()=>{}};
`;
let bridge;
const backend=spawn('go',['test','./internal/document','-run','^TestMindWebKitBridge$','-count=1'],{cwd:project,env:{...process.env,OPENMIND_MIND_TEST_ADDRESS:addressFile},stdio:'inherit'});
const backendDone=new Promise((resolve,reject)=>{backend.on('error',reject);backend.on('exit',code=>resolve(code??1))});
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try{
    if(req.url==='/_mind'){
      const body=[];for await(const chunk of req)body.push(chunk);
      const response=await fetch(bridge,{method:'POST',headers:{'Content-Type':'application/json'},body:Buffer.concat(body)});
      res.writeHead(response.status,{'Content-Type':'application/json'});res.end(await response.text());return;
    }
    const relative=new URL(req.url,'http://localhost').pathname==='/'?'index.html':decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1);
    const file=path.resolve(frontend,relative);
    if(!file.startsWith(frontend+path.sep)){res.writeHead(403);res.end();return}
    let body=await readFile(file);
    if(relative==='index.html')body=Buffer.from(body.toString().replace('<script type="module"',`<script>${mock}</script><script type="module"`));
    if(relative==='src/main.js')body=Buffer.from(body.toString()+'\n'+tests);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch(error){res.writeHead(500);res.end(String(error))}
});
try{
  for(let attempt=0;attempt<200&&!bridge;attempt++){
    try{bridge=await readFile(addressFile,'utf8')}catch{await new Promise(resolve=>setTimeout(resolve,100))}
  }
  if(!bridge)throw new Error('Cannot start the isolated document service');
  const executable=path.join(directory,'mind-rules-probe');
  const compilation=spawnSync('clang',['-fobjc-arc','-framework','Cocoa','-framework','WebKit',fileURLToPath(new URL('./test-node-modes.m',import.meta.url)),'-o',executable],{stdio:'inherit'});
  if(compilation.status!==0)throw new Error('Cannot compile native WebKit mind regression probe');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  process.exitCode=await new Promise((resolve,reject)=>{
    const child=spawn(executable,['http://127.0.0.1:'+server.address().port],{stdio:'inherit'});
    child.on('error',reject);child.on('exit',code=>resolve(code??1));
  });
}finally{
  if(bridge)await fetch(bridge,{method:'POST',body:JSON.stringify({method:'Finish'})}).catch(()=>{});
  else backend.kill();
  if(await backendDone!==0)process.exitCode=1;
  await new Promise(resolve=>server.close(resolve));await rm(directory,{recursive:true,force:true});
}
