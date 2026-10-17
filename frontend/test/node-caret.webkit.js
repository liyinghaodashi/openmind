(async()=>{
  const frames=async()=>{for(let i=0;i<3;i++){window.dispatchEvent(new Event('focus'));await new Promise(requestAnimationFrame)}};
  const assert=(passed,message)=>{if(!passed)throw new Error(message)};
  document.body.style.display='block';
  mountGlobalCaret();
  await document.fonts.ready;
  const scene=document.createElement('div');scene.className='scene';document.body.append(scene);
  const editor=document.createElement('textarea');editor.spellcheck=false;
  Object.assign(editor.style,{width:'240px',height:'80px'});scene.append(editor);
  const label=document.createElement('span');
  Object.assign(label.style,{position:'absolute',width:'400px',whiteSpace:'pre-wrap'});scene.append(label);
  const mirror=document.createElement('div');mirror.className='global-caret-mirror';document.body.append(mirror);
  const cache={};
  let checks=0;
  for(const depth of ['branch','root','leaf']){
    editor.className='node-editor '+depth;
    const style=getComputedStyle(editor);
    for(const property of ['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','wordSpacing','textAlign'])label.style[property]=style[property];
    label.style.width=editor.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)+'px';
    label.style.left=parseFloat(style.borderLeftWidth)+parseFloat(style.paddingLeft)+'px';
    label.style.top='100px';
    for(const scale of [1,.5,1.75]){
      scene.style.transform=`translate(120px,120px) scale(${scale})`;
      for(const value of ['设计思路s','s','OpenMind','AV fi','中文']){
        editor.value=value;label.textContent=value;
        for(const position of [value.length,Math.max(0,value.length-1),0]){
          editor.focus();editor.setSelectionRange(position,position);editor.dispatchEvent(new Event('input',{bubbles:true}));
          const caret=controlRect(editor,mirror,cache);
          const range=document.createRange();range.setStart(label.firstChild,position);range.collapse(true);
          const expected=range.getBoundingClientRect().left;
          const delta=caret?.left-expected;
          assert(caret&&Math.abs(delta)<1,`${depth}, scale ${scale}, ${JSON.stringify(value)}, position ${position}: caret offset ${delta}px (expected <1px)`);
          checks++;
        }
      }
    }
  }
  scene.style.transform='translate(120px,120px)';
  editor.className='node-editor leaf';
  let emptyLineTop;
  for(const value of ['', 'line\n', 'line\n\n']){
    editor.value=value;editor.focus();editor.setSelectionRange(value.length,value.length);editor.dispatchEvent(new Event('input',{bubbles:true}));
    const caret=controlRect(editor,mirror,cache),bounds=editor.getBoundingClientRect();
    const style=getComputedStyle(editor),contentLeft=bounds.left+parseFloat(style.borderLeftWidth)+parseFloat(style.paddingLeft);
    assert(caret&&Math.abs(caret.left-contentLeft)<1,`Empty line caret missing or displaced: ${JSON.stringify(value)}, ${JSON.stringify(caret)}, editor left ${bounds.left}`);
    if(value==='')emptyLineTop=caret.top;
    const lineHeight=parseFloat(getComputedStyle(editor).lineHeight);
    assert(Math.abs(caret.top-(emptyLineTop+lineHeight*(value.split('\n').length-1)))<1,`Empty line caret on wrong line: ${JSON.stringify(value)}`);
    checks++;
  }
  editor.value='abc';editor.setSelectionRange(0,2);editor.dispatchEvent(new Event('select',{bubbles:true}));await frames();
  assert(controlRect(editor,mirror,cache)===null,'Selection must hide the custom caret');checks++;
  editor.setSelectionRange(3,3);editor.dispatchEvent(new Event('select',{bubbles:true}));await frames();
  editor.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));await frames();
  assert(document.querySelector('.global-caret').hidden&&!editor.hasAttribute('data-global-caret'),'Composition must restore the native caret');checks++;
  editor.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));await frames();
  assert(!document.querySelector('.global-caret').hidden,'Caret must return after composition');checks++;
  const node=document.createElement('div');node.className='mind-node leaf';
  const nodeLabel=document.createElement('span');nodeLabel.className='node-label';nodeLabel.textContent='拖动节点';node.append(nodeLabel);scene.append(node);
  for(const element of [node,nodeLabel]){
    assert(getComputedStyle(element).webkitUserSelect==='none','Mind node labels must disable native WebKit text selection and its drag insertion caret');checks++;
  }
  assert(getComputedStyle(editor).webkitUserSelect==='text','Node editors must retain native text selection');checks++;
  window.webkit.messageHandlers.result.postMessage({passed:true,message:`PASS: ${checks} native WebKit caret checks (node levels, zoom, mixed text, selection, composition and node drag selection)`});
})().catch(error=>window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message}));
