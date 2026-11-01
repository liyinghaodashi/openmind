try {
  let checks=0;
  const assert=(value,message)=>{checks++;if(!value)throw new Error(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,200));
  const node=(id,label,level,children=[])=>({id,label,level,kind:'heading',editable:true,children});
  window.__fileDragFixture.documents.get('源/子/想法.mind.md').root=node('root','数据迁移',1,[
    node('a','IoTDB',2,[node('b','介绍',3,[node('c','软件介绍',4),node('d','数据模型\nTable 和 Tree',4)])]),
    node('e','管道同步',2,[node('f','CREATE PIPE prod_to_test...',3)])
  ]);
  await openDocument('源/子/想法.mind.md');
  map.setNodeMark('main',true);map.setNodeMark('second',true);
  const sample=()=>{
    const rect=map.canvas.getBoundingClientRect();
    return JSON.stringify({width:innerWidth,height:innerHeight,canvas:[rect.x,rect.y,rect.width,rect.height],view:[map.x,map.y,map.scale],nodes:[...map.elements.values()].map(element=>{const r=element.getBoundingClientRect();return [r.x,r.y,r.width,r.height]})});
  };
  for(const style of ['processon','mindnode'])for(const scale of [1,.65,1.6]){
    map.setStyle(style);map.scale=scale;map.x=110.25;map.y=140.25;map.render();
    await settle();
    const bounds=map.canvas.getBoundingClientRect();
    const pixels=baseline=>window.__compactRequest({action:'pin-sample',baseline,x:bounds.x+30,y:bounds.y,width:bounds.width-30,height:bounds.height-70});
    await pixels(true);
    const before=sample();
    let running=true,moved=false;
    const observe=()=>{if(sample()!==before)moved=true;if(running)requestAnimationFrame(observe)};
    requestAnimationFrame(observe);
    for(let index=0;index<4;index++){
      const enabled=!alwaysOnTop;
      if(index<2)$('toggle-always-on-top').click();
      else document.dispatchEvent(new KeyboardEvent('keydown',{key:'t',code:'KeyT',metaKey:true,altKey:true,bubbles:true,cancelable:true}));
      await window.__pinTask;
      for(let frame=0;frame<10;frame++){
        const changed=await pixels(false);
        assert(!changed,style+' at '+scale+': pin changes '+changed+' canvas pixel channels (toggle '+index+', frame '+frame+')');
      }
      await window.__compactRequest({action:'check-pin',enabled});
      assert(alwaysOnTop===enabled&&$('toggle-always-on-top').getAttribute('aria-pressed')===String(enabled),'Pin state must match the native level');
      await settle();
      assert(await pixels(false)===0,'Settled canvas must match the original pixels');
    }
    running=false;
    assert(!moved,'Pin must preserve viewport and node geometry on every animation frame');
  }
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' pin checks; both mind styles, 3 zoom levels, mouse and shortcut toggles, native level, frame geometry and composited canvas pixels'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
