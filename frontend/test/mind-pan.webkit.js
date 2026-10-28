try {
  let checks=0;
  const assert=(value,message)=>{checks++;if(!value)throw new Error(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,220));
  const node=(id,label,level,children=[])=>({id,label,level,kind:'heading',editable:true,children});
  window.__fileDragFixture.documents.get('源/子/想法.mind.md').root=node('root','node',1,[
    node('nvm','nvm',2,[node('install','nvm手动安装npm',3,[
      node('intro','常见于nvm安装的node14版本，安装之后没有npm，推荐手动下载',4),
      ...Array.from({length:4},(_,i)=>node('extra'+i,'安装说明 '+i,4)),
      node('target','下载步骤 npm install package 软件介绍',4),
      node('more','3. 然后将刚复制的文件夹名为npm',4)])]),
    node('npm','npm',2,[node('registry','npm config get registry',3)])
  ]);
  await openDocument('源/子/想法.mind.md');
  map.setNodeMark('main',true);map.setNodeMark('second',true);
  for(const style of ['processon','mindnode']) for(const scale of [1,.65,1.25]) {
    map.setStyle(style);map.scale=scale;map.x=30-Math.max(0,(scale-1)*700);map.y=40;map.render();await settle();
    const pixels=baseline=>{
      const r=map.elements.get('target').getBoundingClientRect();
      const canvas=map.canvas.getBoundingClientRect();
      assert(r.left>=canvas.left&&r.right<=canvas.right&&r.top>=canvas.top&&r.bottom<=canvas.bottom,'Sample must stay fully inside canvas');
      return window.__compactRequest({action:'pin-sample',baseline,x:Math.ceil(r.x)+3,y:Math.ceil(r.y)+3,width:Math.floor(r.width)-6,height:Math.floor(r.height)-6});
    };
    await pixels(true);
    for(const [dx,dy] of [[200.25,100.25],[-200.25,-100.25],[-40.25,-30.25],[40.25,30.25]]) {
      map.canvas.dispatchEvent(new WheelEvent('wheel',{deltaX:dx,deltaY:dy,bubbles:true,cancelable:true}));
      await settle();
      const changed=await pixels(false);
      assert(changed===0,style+' at '+scale+': panning '+dx+','+dy+' changes '+changed+' text pixel channels at unchanged scale');
    }
  }
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' mind pan pixel checks'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
