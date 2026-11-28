try{
  const path='源/笔记.md',documentFile=window.__fileDragFixture.documents.get(path);
  documentFile.source='正文\n\n```mermaid\ngraph LR\nA --> B\n```\n\n结尾\n';
  const settle=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const assert=(value,message)=>{if(!value)throw new Error(message)};
  await openDocument(path);await settle();
  const open=async()=>{
    const selector='button[aria-label="放大代码块"]';
    for(let i=0;i<60&&!document.querySelector(selector);i++)await settle();
    document.querySelector(selector).click();
  };
  const viewer=document.querySelector('.markdown-code-viewer');
  await open();
  const original=documentFile.source;
  const checkPanel=()=>assert(viewer.querySelector('.markdown-mermaid-panel')?.childNodes.length===0,'工作台右栏应为空');
  checkPanel();
  viewer.querySelector('button').click();await open();checkPanel();
  await openDocument('根.md');await openDocument(path);await settle();await open();checkPanel();
  assert(markdown.currentSource()===original,'重开文档后 Mermaid 原文发生变化');
  const type=viewer.querySelector('[aria-haspopup=listbox]'),dialog=document.getElementById('mermaid-type-dialog');
  const menu=viewer.querySelector('[role=listbox]'),options=[...menu.querySelectorAll('[role=option]')];
  const selected=()=>options.find(option=>option.getAttribute('aria-selected')==='true')?.value;
  const choose=value=>{type.click();options.find(option=>option.value===value).click()};
  assert(selected()==='flowchart'&&options.map(item=>item.textContent).join(',')==='泳道图,流程图','图类型错误');
  type.click();
  assert(!menu.hidden&&document.activeElement.value==='flowchart','菜单未聚焦当前图类型');
  const press=key=>document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
  press('ArrowLeft');
  assert(document.activeElement.value==='swimlane'&&selected()==='flowchart','方向键应只移动焦点');
  press('Escape');
  assert(menu.hidden&&!viewer.hidden&&document.activeElement===type,'Esc 应只关闭菜单');
  type.click();
  viewer.querySelector('img').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
  assert(menu.hidden,'点击画布应关闭菜单');
  choose('swimlane');
  assert(dialog.open&&document.activeElement.value==='cancel','缺少清空确认');
  dialog.querySelector('[value="cancel"]').click();await settle();
  assert(selected()==='flowchart'&&markdown.currentSource()===original,'取消后应保留原图');
  choose('swimlane');dialog.querySelector('[value="switch"]').click();await settle();await state.queue.drain();
  const swimlane='swimlane-beta LR\n  subgraph lane1["泳道 1"]\n  end\n  subgraph lane2["泳道 2"]\n  end';
  const changed=original.replace('graph LR\nA --> B',swimlane);
  assert(documentFile.source===changed&&selected()==='swimlane'&&!viewer.querySelector('img').hidden,'泳道图未保存或预览失败');
  const svg=await (await fetch(viewer.querySelector('img').src)).text();
  const lanes=new DOMParser().parseFromString(svg,'image/svg+xml').querySelectorAll('.pele-lane');
  assert([...lanes].map(lane=>lane.textContent.trim()).sort().join(',')==='泳道 1,泳道 2','默认泳道未渲染');
  for(const lane of lanes){
    const outline=lane.querySelector('rect');
    assert(Number(outline.getAttribute('width'))>=7*Number(outline.getAttribute('height')),'默认泳道应为横向长条');
  }
  await openDocument('根.md');await openDocument(path);await settle();await open();
  assert(selected()==='swimlane'&&markdown.currentSource()===changed,'重新打开后图类型错误');
  choose('flowchart');await settle();await state.queue.drain();
  assert(!dialog.open&&documentFile.source===changed.replace(swimlane,'flowchart TD'),'空图切换失败');
  choose('swimlane');await settle();await state.queue.drain();
  const header=id=>viewer.querySelector('.markdown-swimlane-headers [data-id="'+id+'"]');
  const add=()=>viewer.querySelector('.markdown-mermaid-panel button');
  function clickHeader(id){
    const rect=header(id).getBoundingClientRect();
    const target=document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2);
    assert(target===header(id),'泳道头部无法点选');
    target.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  }
  const image=viewer.querySelector('img'),lane=header('lane1');
  assert(!image.draggable,'工作台图表应禁用原生图片拖动');
  const before=[image,lane,type].map(el=>el.getBoundingClientRect());
  lane.setPointerCapture=()=>{};
  const pointer=(kind,x,y)=>lane.dispatchEvent(new PointerEvent(kind,{bubbles:true,isPrimary:true,pointerId:1,clientX:x,clientY:y}));
  pointer('pointerdown',100,100);pointer('pointermove',126,114);pointer('pointerup',126,114);
  lane.dispatchEvent(new MouseEvent('click',{bubbles:true,detail:1}));
  checkPanel();
  for(const [i,el] of [image,lane,type].entries()){
    const box=el.getBoundingClientRect();
    assert(Math.abs(box.x-before[i].x-(i<2?26:0))<1&&Math.abs(box.y-before[i].y-(i<2?14:0))<1,'图表与泳道热区应同步平移，工具栏应固定');
  }
  const zoom=viewer.querySelector('.markdown-diagram-zoom');
  const action=name=>zoom.querySelector('[aria-label="'+name+'"]').click();
  const zoomBounds=zoom.getBoundingClientRect();
  action('放大');
  assert(image.getBoundingClientRect().width>before[0].width&&lane.getBoundingClientRect().width>before[1].width,'图表和泳道热区应同步放大');
  action('缩小');
  assert(Math.abs(image.getBoundingClientRect().width-before[0].width)<1,'缩小应回到上一级比例');
  action('缩小');action('复位');
  for(const [i,el] of [image,lane].entries()){
    const box=el.getBoundingClientRect();
    assert(Math.abs(box.width-before[i].width)<1&&Math.abs(box.x-before[i].x)<1&&Math.abs(box.y-before[i].y)<1,'复位应恢复比例和位置');
  }
  assert(zoom.getBoundingClientRect().x===zoomBounds.x&&zoom.getBoundingClientRect().y===zoomBounds.y,'缩放按钮应固定在画布上');
  pointer('pointerdown',126,114);pointer('pointerup',126,114);
  clickHeader('lane1');
  clickHeader('lane2');
  assert(header('lane2').getAttribute('aria-pressed')==='true'&&header('lane1').getAttribute('aria-pressed')==='false'&&add().textContent==='新建节点','选中泳道或操作按钮错误');
  assert(markdown.currentSource()===changed,'选择泳道不应修改原文');
  add().click();await settle();await state.queue.drain();
  const populatedSvg=await (await fetch(viewer.querySelector('img').src)).text();
  const populated=new DOMParser().parseFromString(populatedSvg,'image/svg+xml');
  const emptyWidth=Number(lanes[0].querySelector('rect').getAttribute('width'));
  for(const outline of populated.querySelectorAll('.pele-lane > rect:first-child')){
    assert(Number(outline.getAttribute('width'))>=emptyWidth,'新建节点后泳道变窄');
  }
  const withNode=changed.replace('lane2["泳道 2"]','lane2["泳道 2"]\n    node1["节点 1"]');
  assert(documentFile.source===withNode&&header('lane2').getAttribute('aria-pressed')==='true','创建节点后泳道或保存结果错误');
  clickHeader('lane1');
  add().click();await settle();await state.queue.drain();
  const withBoth=withNode.replace('lane1["泳道 1"]','lane1["泳道 1"]\n    node2["节点 2"]');
  assert(documentFile.source===withBoth,'第二个节点写入错误');
  add().click();await settle();
  add().click();await settle();await state.queue.drain();
  const chain=withBoth.replace('node2["节点 2"]','node2["节点 2"]\n    node3["节点 3"]\n    node2 ~~~ node3\n    node4["节点 4"]\n    node3 ~~~ node4');
  assert(documentFile.source===chain,'同泳道连续新建节点应逐个虚连');
  const chainedSvg=await (await fetch(viewer.querySelector('img').src)).text();
  const graph=new DOMParser().parseFromString(chainedSvg,'image/svg+xml');
  const positions=['node2','node3','node4'].map(id=>graph.querySelector('.pele-node[data-id="'+id+'"]').transform.baseVal.getItem(0).matrix);
  assert(positions.every((pos,i)=>pos.f===positions[0].f&&(!i||pos.e>positions[i-1].e))&&!graph.querySelector('.pele-edge'),'虚连节点应横向排列且隐藏连线');
  await openDocument('根.md');await openDocument(path);await settle();await open();checkPanel();
  assert(markdown.currentSource()===chain,'重开后泳道节点丢失');
  choose('flowchart');dialog.querySelector('[value="switch"]').click();await settle();await state.queue.drain();
  assert(!dialog.open&&selected()==='flowchart'&&documentFile.source===changed.replace(swimlane,'flowchart TD'),'切换流程图失败');
  viewer.querySelector('button').click();
  assert(markdown.editable.querySelector('[data-mermaid-preview="ready"] pre code').textContent.trim()==='flowchart TD','正文预览未同步');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: Mermaid type switch, confirmation, inline preview, save and reopen'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:error.message})}
