try{
  const source='```\nconst value = 1;\n```\n';
  const options={session:'code-language',path:'代码语言.md',reset:true};
  applySnapshot({...options,version:1,source,root:{id:'r',label:'',children:[]}},{resetView:true});
  markdown.setReadOnly(false);
  markdown.onBeforeInput=()=>true;
  markdown.onInput=()=>{};
  const select=element=>{
    markdown.editable.focus();
    const range=document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  };
  const code=markdown.editable.querySelector('pre code');
  select(code);
  code.dispatchEvent(new MouseEvent('click',{bubbles:true}));
  await new Promise(resolve=>setTimeout(resolve,200));
  const info=markdown.editable.querySelector('[data-type="code-block-info"]');
  if(info.getBoundingClientRect().width<1)throw new Error('Empty language field is hidden');
  select(info);
  document.execCommand('insertText',false,'js');
  const saved=markdown.currentSource();
  if(saved.trimEnd()!==source.replace('```\n','```js\n').trimEnd())throw new Error(JSON.stringify(saved));
  markdown.load(saved,options);
  if(markdown.editable.querySelector('[data-type="code-block-info"]').textContent.trim().replaceAll('\u200b','')!=='js')throw new Error('Language lost on reload');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: edit and reload native code language'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:error.message})}
