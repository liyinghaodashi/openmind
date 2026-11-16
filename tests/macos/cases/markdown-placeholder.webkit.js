try{
  let checks=0;
  const assert=(passed,message)=>{checks++;if(!passed)throw new Error(message)};
  const settle=()=>new Promise(resolve=>setTimeout(resolve,180));
  const writes=[];
  markdown.onInput=value=>writes.push(value);markdown.onBeforeInput=()=>true;markdown.onOutline=()=>{};
  document.querySelector('#markdown-page').hidden=false;document.querySelector('#canvas').hidden=true;
  const editable=markdown.editable,caret=document.querySelector('.global-caret');
  const position=label=>{
    assert(!caret.hidden&&editable.hasAttribute('data-global-caret'),label+': must position the custom caret '+JSON.stringify({dom:editable.innerHTML,active:document.activeElement?.outerHTML.slice(0,200),anchor:window.getSelection().anchorNode?.nodeName,offset:window.getSelection().anchorOffset,collapsed:window.getSelection().isCollapsed}));
    return caret.getBoundingClientRect();
  };
  const aligned=(actual,expected,label)=>assert(
    Math.abs(actual.x-expected.x)<=1&&Math.abs(actual.y-expected.y)<=1&&Math.abs(actual.height-expected.height)<=1,
    label+': '+JSON.stringify({actual:actual.toJSON(),expected:expected.toJSON()}));
  for(const compact of [false,true]){
    document.body.classList.toggle('compact-window',compact);
    for(const source of ['', '\n', '\uFEFF']){
      markdown.load('已有正文\n',{session:'placeholder',path:'已有.md',reset:true});
      markdown.load(source,{session:'placeholder',path:'空白.md',reset:true});markdown.setReadOnly(false);
      writes.length=0;markdown.focus();await settle();
      const label=(compact?'compact':'main')+' '+JSON.stringify(source);
      assert(getComputedStyle(editable,'::before').content.includes('从这里开始写作'),label+': placeholder must be visible');
      const empty=position(label);
      markdown.flush();
      assert(writes.length===0&&markdown.currentSource()===source,label+': focusing must preserve the original empty source');
      document.execCommand('insertText',false,'从');await settle();
      const range=document.createRange();range.selectNodeContents(editable.querySelector('p')||editable);
      aligned(empty,range.getBoundingClientRect(),label+': empty caret must align with the first typed character');
      assert(markdown.currentSource().replace(/^\uFEFF/,'')==='从\n',label+': first character must be preserved');
      document.execCommand('selectAll');document.execCommand('delete');await settle();
      aligned(position(label+' after deleting all text'),empty,label+': clearing the document must restore caret alignment');
      assert(markdown.currentSource().replace(/^\uFEFF/,'').trim()==='',label+': clearing must leave the document empty');
    }
  }
  document.body.classList.remove('compact-window');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: '+checks+' native WebKit empty Markdown caret checks'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+error.message})}
