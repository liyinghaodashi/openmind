try{
  const fixture=window.__nodeModeFixture;
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const frames=async()=>{await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame)};
  const position=id=>map.layout.positions.find(p=>p.id===id);
  const screen=p=>({x:map.x+p.x*map.scale,y:map.y+(p.y+p.height/2)*map.scale});
  const node=(id,label,children=[])=>({id,label,editable:true,kind:'list',children});
  fixture.snapshot.root.children[0].children[0].children=[node('grandchild','后代节点')];
  for(const style of ['mindnode','processon']){
  map.setStyle(style);
  applySnapshot(structuredClone(fixture.snapshot),{resetView:true});await frames();
  for(const depth of [0,1,2]){
    const target=()=>depth===0?state.snapshot.root:depth===1?state.snapshot.root.children[0]:state.snapshot.root.children[0].children[0];
    for(const scale of [1,.65,1.6]){
      map.scale=scale;map.x=24;map.y=80;map.render();
      const beforeEditing=map.layout.positions.map(p=>({id:p.id,height:p.height,...screen(p)}));
      await editNode(target().id);await frames();
      for(const before of beforeEditing){
        const p=position(before.id),current=screen(p);
        assert(p.height===before.height,'Entering edit mode must preserve node height ('+map.style+', depth '+depth+', '+before.id+'): '+before.height+' -> '+p.height);
        assert(Math.abs(current.x-before.x)<.5&&Math.abs(current.y-before.y)<.5,'Showing the caret must not move surrounding nodes');
      }
      const editor=state.editor,label=editor.value,writes=fixture.writes.length,anchor=screen(position(map.editing));
      const checkLayout=message=>{
        const p=position(map.editing),bounds=editor.getBoundingClientRect(),canvas=map.canvas.getBoundingClientRect(),current=screen(p);
        if(editor.value===label)assert(p.height===beforeEditing.find(before=>before.id===p.id).height,message+' must restore the original height');
        assert(Math.abs(current.x-anchor.x)<.5&&Math.abs(current.y-anchor.y)<.5,message+' must keep the editing anchor stable');
        assert(Math.abs(bounds.width-p.width*scale)<.5&&Math.abs(bounds.height-p.height*scale)<.5,message+' must use the actual editor dimensions in layout');
        const element=map.elements.get(p.id).getBoundingClientRect();
        assert(Math.abs(element.width-bounds.width)<.5&&Math.abs(element.height-bounds.height)<.5,message+' must align the selection border with the editor');
        assert(editor.scrollHeight<=editor.clientHeight+1&&editor.scrollWidth<=editor.clientWidth+1,message+' must fit the live text');
        assert(document.activeElement===editor&&state.editor===editor,message+' must retain editor focus and identity');
        assert(editor.selectionStart===editor.value.length&&editor.selectionEnd===editor.value.length,message+' must retain the caret');
        for(const child of target().children){
          assert(position(child.id).x*scale+map.x>=bounds.right-canvas.left+(depth===0?64:30)*scale-.5,message+' must move children beyond the live editor');
        }
        const positions=map.layout.positions;
        for(let i=0;i<positions.length;i++)for(let j=i+1;j<positions.length;j++){
          const a=positions[i],b=positions[j];
          assert(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,message+' must prevent overlap between '+a.id+' and '+b.id);
        }
        for(const edge of map.layout.edges){
          const path=map.edgeElements.get(edge.id);if(!path)continue;
          const start=path.getPointAtLength(0),end=path.getPointAtLength(path.getTotalLength());
          assert(Math.abs(start.x-edge.from.x-edge.from.width)<.01&&Math.abs(end.x-edge.to.x)<.01,message+' must update connectors with node positions');
        }
      };
      editor.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
      const originalChildX=position(target().children[0].id).x;
      for(const suffix of ['','','',"biao'zhu".repeat(4),"biao'zhu".repeat(30),'b','']){
        editor.value=label+suffix;editor.setSelectionRange(editor.value.length,editor.value.length);
        editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertCompositionText',isComposing:true}));await frames();
        checkLayout(map.style+' depth '+depth+' scale '+scale+' composition length '+suffix.length);
        assert(fixture.writes.length===writes&&target().label===label,'Composition must only change the visual layout');
        if(suffix.length>20)assert(position(target().children[0].id).x>originalChildX,'Growing labels must move the complete child branch right');
        if(!suffix)assert(Math.abs(position(target().children[0].id).x-originalChildX)<.01,'Cancelling composition must restore branch spacing');
      }
      editor.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
      assert(fixture.writes.length===writes,'Cancelling composition must not save');
      fixture.delay=200;
      const draft=label+'设备故障标注'.repeat(12);
      editor.value=draft;editor.setSelectionRange(draft.length,draft.length);
      editor.dispatchEvent(new InputEvent('input',{bubbles:true}));await frames();
      assert(target().label===label&&state.queue.pending===1,'The layout check must run while saving is still pending');
      checkLayout('Pending save');
      editor.value=label;editor.setSelectionRange(label.length,label.length);
      editor.dispatchEvent(new InputEvent('input',{bubbles:true}));await frames();checkLayout('Shrink before save');
      await new Promise(resolve=>setTimeout(resolve,200));await frames();
      assert(target().label===draft&&state.queue.pending===1,'The first reply must arrive while the newer edit is pending');
      checkLayout('Older save reply must retain the latest editor layout');
      await state.queue.drain();fixture.delay=0;await frames();checkLayout('After saving');
      assert(target().label===label&&fixture.writes.length===writes+2,'Each confirmed edit must save once in order');
      const beforeFinishing=map.layout.positions.map(p=>({height:p.height,...screen(p)}));
      await finishNode();await frames();
      assert(!state.editor&&map.editing===null,'Finishing must return to normal node layout');
      map.layout.positions.forEach((p,index)=>{
        const before=beforeFinishing[index],current=screen(p);
        assert(p.height===before.height&&Math.abs(current.x-before.x)<.5&&Math.abs(current.y-before.y)<.5,'Hiding the caret must preserve node heights and surrounding positions');
      });
    }
  }
  assert($('error-banner').hidden,'Layout edits must not produce save errors');
  }
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit live layout checks (both styles, stable edit entry, IME growth/shrink, descendants, connectors, wrapping, caret, zoom, delayed and older save replies)'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message+'\n'+error.stack})}
