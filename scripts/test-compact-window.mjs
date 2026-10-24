import http from 'node:http';
import {readFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const project=fileURLToPath(new URL('../',import.meta.url));
const root=path.join(project,'frontend');
const output=path.join(project,'output/compact-window');
const temporary=await mkdtemp(path.join(tmpdir(),'openmind-compact-'));
const tests=await readFile(path.join(root,'test/'+(process.argv[2]||'compact-window')+'.webkit.js'),'utf8');
const fixture=await readFile(path.join(root,'test/file-tree-drag.fixture.js'),'utf8');
const bridge=`
window.__compactSettings={mdCompactWindow:false,hideFileExtensions:false,expandFileNameOnHover:false,mindStyle:'processon',mindMainNodeMark:false,mindSecondNodeMark:false,sidebarCollapse:true,mindOutlineFocus:true,mindOutlineCollapse:true,mindDoubleClickCreateMain:true,sourceView:true,mindZoomControls:true,mindCopyTree:true};
window.go.main.App.GetSettings=async()=>({...window.__compactSettings});
window.go.main.App.SaveSettings=async value=>{window.__compactSettings={...value}};
window.__compactRequest=data=>new Promise(resolve=>{
  window.__compactResolve=resolve;window.webkit.messageHandlers.result.postMessage(data);
});
window.go.main.App.SetCompactWindow=enabled=>window.__compactRequest({action:'compact',enabled});
window.runtime.WindowSetAlwaysOnTop=enabled=>window.__pinTask=window.__compactRequest({action:'pin',enabled});
`;
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try{
    const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).slice(1)||'index.html';
    const file=path.resolve(root,relative);
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
    let body=await readFile(file);
    if(relative==='index.html')body=Buffer.from(body.toString().replace('<head>','<head><script>'+fixture+bridge+'</script>'));
    if(relative==='src/main.js')body=Buffer.from(body.toString()+'\n'+tests);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream'});res.end(body);
  }catch{res.writeHead(404);res.end()}
});
try{
  await mkdir(output,{recursive:true});
  const executable=path.join(temporary,'probe');
  const build=spawnSync('clang',['-fobjc-arc','-framework','Cocoa','-framework','WebKit',...(process.argv[2]==='window-pin'?['-framework','ScreenCaptureKit']:[]),path.join(project,process.argv[2]==='window-pin'?'scripts/test-window-pin.m':'scripts/test-compact-window.m'),path.join(project,'internal/window/window_darwin.m'),'-o',executable],{stdio:'inherit'});
  if(build.status!==0)throw new Error('Cannot compile compact window probe');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  process.exitCode=await new Promise((resolve,reject)=>{
    const child=spawn(executable,['http://127.0.0.1:'+server.address().port,output],{stdio:'inherit'});
    child.on('error',reject);child.on('exit',code=>resolve(code??1));
  });
}finally{
  server.close();await rm(temporary,{recursive:true,force:true});
}
