import http from 'node:http';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {spawn,spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=fileURLToPath(new URL('../frontend/',import.meta.url));
const probeDirectory=await mkdtemp(path.join(tmpdir(),'openmind-shortcuts-'));
const tests=await readFile(new URL('../frontend/test/'+(process.argv[2]||'markdown-shortcuts')+'.webkit.js',import.meta.url),'utf8');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(['markdown-images','markdown-image-click'].includes(process.argv[2])&&url.pathname.startsWith('/document-assets/')){
      res.writeHead(200,{'Content-Type':'image/png','Cache-Control':'no-store'});
      res.end(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jC1sAAAAASUVORK5CYII=','base64'));return;
    }
    const relative=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname).slice(1);
    const file=path.resolve(root,relative);
    if(!file.startsWith(root)){res.writeHead(403);res.end();return}
    let body=await readFile(file);
    if(relative==='src/main.js')body=Buffer.from(body.toString()+'\n'+tests);
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch{res.writeHead(404);res.end('Not found')}
});
try{
  const executable=path.join(probeDirectory,'shortcuts-probe');
  const probeSource=['markdown-image-click','markdown-inline','markdown-checkbox'].includes(process.argv[2])?'./test-node-modes.m':'./test-document-search.m';
  const compilation=spawnSync('clang',['-fobjc-arc','-framework','Cocoa','-framework','WebKit',fileURLToPath(new URL(probeSource,import.meta.url)),'-o',executable],{stdio:'inherit'});
  if(compilation.status!==0)throw new Error('Cannot compile native WebKit shortcuts probe');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const code=await new Promise((resolve,reject)=>{
    const child=spawn(executable,['http://127.0.0.1:'+server.address().port],{stdio:'inherit'});
    child.on('error',reject);child.on('exit',resolve);
  });
  process.exitCode=code??1;
}finally{
  await new Promise(resolve=>server.close(resolve));await rm(probeDirectory,{recursive:true,force:true});
}
