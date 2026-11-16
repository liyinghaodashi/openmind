try{
  const assert=(value,message)=>{if(!value)throw new Error(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,200));
  applySnapshot(structuredClone(window.__nodeModeFixture.snapshot),{resetView:true});map.render();await settle();
  await editNode(state.snapshot.root.children[0].id);await settle();
  const editor=state.editor,id=map.editing;
  editor.value='alpha beta gamma';editor.dispatchEvent(new InputEvent('input',{bubbles:true}));await state.queue.drain();await settle();
  editor.setSelectionRange(1,1);
  const rect=editor.getBoundingClientRect();
  await new Promise(resolve=>{window.__nodePointerDone=resolve;window.webkit.messageHandlers.pointer.postMessage({x:rect.left+40,y:rect.top+12,count:1,right:true})});
  await settle();
  assert(!map.nodeMenu.hidden&&map.menuNodeId===id,'Editing right-click must open the node menu');
  assert(state.editor===editor&&editor.selectionStart===1&&editor.selectionEnd===1,'Right-click must preserve the editor and caret without selecting a word: '+JSON.stringify([state.editor===editor,editor.selectionStart,editor.selectionEnd]));
  const copyRect=map.copyTreeButton.getBoundingClientRect();
  await new Promise(resolve=>{window.__nodePointerDone=resolve;window.webkit.messageHandlers.pointer.postMessage({x:copyRect.left+20,y:copyRect.top+10,count:1})});await settle();
  assert(window.__nodeModeFixture.copies.at(-1)?.label==='alpha beta gamma','Copy tree must use the current draft');
  assert(map.nodeMenu.hidden&&state.editor===editor,'Copy tree must close the menu and preserve editing');
  editor.setSelectionRange(6,10,'backward');
  await new Promise(resolve=>{window.__nodePointerDone=resolve;window.webkit.messageHandlers.pointer.postMessage({x:rect.left+40,y:rect.top+12,count:1,right:true})});await settle();
  assert(!map.nodeMenu.hidden&&editor.selectionStart===6&&editor.selectionEnd===10&&editor.selectionDirection==='backward','Right-click must preserve an existing selection');
  editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));await settle();
  assert(map.nodeMenu.hidden&&state.editor===editor&&document.activeElement===editor,'Escape must dismiss the menu without ending editing');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: editing context menu, native right-click selection and draft copy'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:String(error)+'\n'+error.stack})}
