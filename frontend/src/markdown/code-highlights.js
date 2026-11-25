const styles=new Map(Object.entries({
  keyword:'keyword',atrule:'keyword',tag:'keyword',
  'class-name':'type',builtin:'type',boolean:'type',
  function:'function','function-definition':'function',
  operator:'operator',property:'function','attr-name':'type',
  string:'literal','attr-value':'literal',number:'literal',regex:'literal',char:'literal',
  comment:'comment',prolog:'comment',doctype:'comment'
}));

function tokenRanges(code,grammar,language){
  const walker=document.createTreeWalker(code,NodeFilter.SHOW_TEXT);
  const ranges=[];
  let node=walker.nextNode(),offset=0;
  function visit(token,style){
    if(Array.isArray(token)){for(const child of token)visit(child,style);return}
    if(typeof token!=='string'){
      const primitive=language==='java'&&token.type==='keyword'&&/^(boolean|byte|short|int|long|char|float|double|void)$/.test(token.content);
      visit(token.content,primitive?'type':styles.get(token.type)||style);
      return;
    }
    let length=token.length;
    while(node&&length){
      const count=Math.min(length,node.length-offset);
      if(style&&count){
        const range=document.createRange();
        range.setStart(node,offset);range.setEnd(node,offset+count);
        ranges.push([style,range]);
      }
      length-=count;offset+=count;
      if(offset===node.length){node=walker.nextNode();offset=0}
    }
  }
  visit(Prism.tokenize(code.textContent,grammar));
  return ranges;
}

export function bindCodeHighlights(editable){
  if(!window.CSS?.highlights||!window.Highlight)return;
  const selector='[data-type="code-block"]';
  const painted=new Map(),dirty=new Set();
  let frame;
  function refresh(){
    frame=0;
    for(const block of painted.keys())if(!editable.contains(block))dirty.add(block);
    for(const block of dirty){
      for(const [style,range] of painted.get(block)||[])CSS.highlights.get('md-'+style)?.delete(range);
      painted.delete(block);
      if(!editable.contains(block))continue;
      const language=block.querySelector('[data-type="code-block-info"]')?.textContent.replaceAll('\u200b','').trim().toLowerCase();
      const grammar=Object.hasOwn(Prism.languages,language)&&Prism.languages[language];
      const code=block.querySelector('pre code');
      if(!code||!grammar||typeof grammar!=='object')continue;
      const ranges=tokenRanges(code,grammar,language);
      for(const [style,range] of ranges){
        const name='md-'+style;
        if(!CSS.highlights.has(name))CSS.highlights.set(name,new Highlight());
        CSS.highlights.get(name).add(range);
      }
      painted.set(block,ranges);
    }
    dirty.clear();
  }
  new MutationObserver(records=>{
    for(const record of records){
      const element=record.target.nodeType===1?record.target:record.target.parentElement;
      const block=element?.closest(selector);
      if(block)dirty.add(block);
      for(const child of record.addedNodes){
        if(child.nodeType!==1)continue;
        if(child.matches(selector))dirty.add(child);
        for(const nested of child.querySelectorAll(selector))dirty.add(nested);
      }
    }
    if(!frame)frame=requestAnimationFrame(refresh);
  }).observe(editable,{subtree:true,childList:true,characterData:true});
}
