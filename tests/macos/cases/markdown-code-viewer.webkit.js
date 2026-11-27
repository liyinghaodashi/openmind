try{
  const source=['正文','','~~~js','const first = 1;','~~~','','~~~MeRmAiD','graph TD','A --> B','~~~'].join('\n');
  const options={session:'viewer',path:'代码.md',reset:true};
  applySnapshot({...options,source,version:1,root:{id:'r',label:'',children:[]}},{resetView:true});
  const wait=()=>new Promise(resolve=>setTimeout(resolve,150));
  const assert=(value,message)=>{if(!value)throw new Error(message)};
  await wait();
  const page=document.querySelector('#markdown-page'),side=document.querySelector('#sidebar');
  const buttons=()=>page.querySelectorAll('button[aria-label="放大代码块"]');
  const original=markdown.currentSource(),scroll=markdown.editable.scrollTop;
  const sidebarBounds=side.getBoundingClientRect(),bounds=page.getBoundingClientRect();
  assert(buttons().length===1,'Only the mixed-case Mermaid block should have a button');
  assert(!buttons()[0].closest('[title]'),'Expand button must have no hover tooltip');
  const buttonBounds=buttons()[0].getBoundingClientRect();
  const language=markdown.editable.querySelectorAll('[data-type="code-block-info"]')[1].getBoundingClientRect();
  assert(buttonBounds.right<=language.left&&Math.abs(buttonBounds.top-language.top)<2,'Button placement');
  buttons()[0].click();await wait();
  const viewer=page.querySelector('.markdown-code-viewer'),box=viewer.getBoundingClientRect();
  assert(box.width>0&&Math.abs(box.width-bounds.width)<2&&Math.abs(box.height-bounds.height)<2&&box.left>=sidebarBounds.right-1,'Viewer must fill only the canvas');
  assert(side.getBoundingClientRect().width===sidebarBounds.width,'Sidebar resized');
  assert(viewer.querySelector('code').textContent.includes('A --> B')&&!viewer.textContent.includes('const first'),'Wrong block');
  viewer.querySelector('button').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
  assert(viewer.hidden&&!markdown.editable.inert&&markdown.currentSource()===original&&markdown.editable.scrollTop===scroll,'Esc must restore document');
  buttons()[0].click();viewer.querySelector('button').click();
  assert(viewer.hidden,'Collapse button failed');
  const field=markdown.editable.querySelectorAll('[data-type="code-block-info"]')[1];
  for(const [language,count] of [['mermaidx',0],['MERMAID',1],['',0],['mermaid',1]]){
    field.textContent=language;await wait();
    assert(buttons().length===count,'Unexpected button count for '+language);
  }
  buttons()[0].click();markdown.load('另一篇文档', {...options,path:'另一篇.md'});
  assert(viewer.hidden&&!markdown.editable.inert,'Viewer survived document switch');
  window.webkit.messageHandlers.result.postMessage({passed:true,message:'PASS: code viewer placement, sidebar, language changes, dismissal and document switch'});
}catch(error){window.webkit.messageHandlers.result.postMessage({passed:false,message:error.message})}
