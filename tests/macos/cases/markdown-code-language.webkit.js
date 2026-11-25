try{
  const source='```\npublic boolean pushAccessRefreshData(AccessRefreshDataDTO dto) {\n    String url = dto.getUrl();\n}\n```\n';
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
  document.execCommand('insertText',false,'java');
  const saved=markdown.currentSource();
  if(saved.trimEnd()!==source.replace('```\n','```java\n').trimEnd())throw new Error(JSON.stringify(saved));
  await new Promise(resolve=>setTimeout(resolve,180));
  if(![...(CSS.highlights.get('md-function')||[])].some(range=>range.toString()==='pushAccessRefreshData'))throw new Error('Typing the language must immediately color the code');
  markdown.load(saved,options);
  if(markdown.editable.querySelector('[data-type="code-block-info"]').textContent.trim().replaceAll('\u200b','')!=='java')throw new Error('Language lost on reload');
  await new Promise(resolve=>setTimeout(resolve,180));
  const block=markdown.editable.querySelector('[data-type="code-block"]');
  const field=block.querySelector('[data-type="code-block-info"]').getBoundingClientRect();
  const body=block.querySelector('pre').getBoundingClientRect();
  if(field.top<body.bottom||Math.abs(body.right-field.right)>1)throw new Error('Language field must sit below the code on the right');
  for(const side of ['::before','::after'])if(getComputedStyle(block,side).content!=='none')throw new Error('Fence marker visible');
  for(const [style,word] of [['keyword','public'],['type','boolean'],['type','String'],['function','pushAccessRefreshData']]){
    const ranges=CSS.highlights.get('md-'+style);
    if(!ranges||![...ranges].some(range=>range.toString()===word))throw new Error('Missing '+style+' color on '+word);
  }
  const language=block.querySelector('[data-type="code-block-info"]');
  select(language);
  document.execCommand('insertText',false,'unknown');
  await new Promise(resolve=>setTimeout(resolve,180));
  if(CSS.highlights.get('md-function').size)throw new Error('Unknown language must clear previous colors');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: edit and reload native code language'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:error.message})}
