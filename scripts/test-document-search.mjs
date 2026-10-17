import http from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../frontend/',import.meta.url));
const style=process.env.OPENMIND_MIND_STYLE||'processon';
if(!['processon','mindnode'].includes(style))throw new Error('Invalid mind style');
const probeDirectory=await mkdtemp(path.join(tmpdir(),'openmind-search-'));
const tests=await readFile(new URL('../frontend/test/document-search.webkit.js',import.meta.url),'utf8');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
    const file=path.resolve(root,relative);
    if(!file.startsWith(root)){res.writeHead(403);res.end();return}
    let body=await readFile(file);
    if(relative==='src/main.js')body=Buffer.from(body.toString()+'\nmap.setStyle('+JSON.stringify(style)+');\n'+tests);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found')}
});
try{
  const executable=path.join(probeDirectory,'search-probe');
  const compilation=spawnSync('clang',['-framework','Cocoa','-framework','WebKit',fileURLToPath(new URL('./test-document-search.m',import.meta.url)),'-o',executable],{stdio:'inherit'});
  if(compilation.status!==0)throw new Error('Cannot compile native WebKit search probe');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(executable,['http://127.0.0.1:'+server.address().port],{stdio:'inherit'});
    child.on('error',reject);child.on('exit',resolve);
  });
  process.exitCode=code??1;
}finally{
  await new Promise(resolve=>server.close(resolve));await rm(probeDirectory,{recursive:true,force:true});
}
