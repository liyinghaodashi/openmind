try{
  const failures=[];let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)failures.push(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,180));
  const pointer=element=>new Promise(resolve=>{
    window.__nodePointerDone=resolve;
    const rect=element.getBoundingClientRect();
    window.webkit.messageHandlers.pointer.postMessage({x:rect.x+rect.width/2,y:rect.y+rect.height/2,count:1});
  });
  const writes=[];
  markdown.onInput=value=>writes.push(value);markdown.onBeforeInput=()=>true;markdown.onOutline=()=>{};
  document.querySelector('#markdown-page').hidden=false;document.querySelector('#canvas').hidden=true;
  const source='**粗体** · *斜体* · ~~删除线~~ · `行内代码` · [链接示例](https://example.com)\n';
  markdown.load(source,{session:'inline',path:'样式.md',reset:true});markdown.setReadOnly(false);await settle();
  const original=markdown.editor.getValue();
  for(const selector of ['strong','em','s','code','[data-type="a"]']){
    const element=markdown.editable.querySelector(selector);
    assert(!!element,'Must render '+selector);if(!element)continue;
    await pointer(element);await settle();
    const node=element.closest('.vditor-ir__node')||element;
    assert([...node.querySelectorAll('.vditor-ir__marker')].every(marker=>!marker.getClientRects().length),'Focus must hide markers: '+selector);
    if(selector==='em'){
      const style=getComputedStyle(element);
      assert(style.fontStyle==='italic','Emphasis must be italic');
      assert(style.fontSynthesis.includes('style'),'Chinese emphasis must allow synthetic italics');
    }
    if(selector==='[data-type="a"]'){
      const style=getComputedStyle(element.querySelector('.vditor-ir__link'));
      assert(style.color===getComputedStyle(markdown.editable).color,'Link must match body text color');
      assert(style.fontStyle==='normal'&&style.textDecorationLine.includes('underline'),'Link must be upright and underlined');
    }
    markdown.flush();assert(markdown.editor.getValue()===original&&writes.length===0,'Focus must preserve Markdown: '+selector);
  }
  for(const [selector,label] of [['strong','粗体'],['em','斜体'],['s','删除线'],['code','行内代码'],['.vditor-ir__link','链接示例']]){
    markdown.load(source,{session:'inline',path:'样式.md',reset:true});await settle();
    const element=markdown.editable.querySelector(selector),range=document.createRange();
    range.setStart(element.firstChild,1);range.collapse(true);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    markdown.editable.focus();document.execCommand('insertText',false,'X');await settle();markdown.flush();
    assert(markdown.editor.getValue()===original.replace(label,label[0]+'X'+label.slice(1)),'Editing must preserve formatting and link destination: '+selector);
  }
  if(failures.length)throw new Error(failures.join('\n')+'\nDOM: '+markdown.editable.innerHTML);
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit inline formatting checks'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message})}
