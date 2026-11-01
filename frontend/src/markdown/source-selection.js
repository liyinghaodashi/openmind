import {textareaMatchRect} from '../document/document-search.js';

// Build a text index of the editable DOM. List prefixes and block breaks have
// source width even when WebKit represents them only as element boundaries.
function indexBody(root,selection){
  let text='',anchor=0,focus=0;
  const runs=[];
  function boundary(node,offset){
    if(node===selection?.anchorNode&&offset===selection.anchorOffset)anchor=text.length;
    if(node===selection?.focusNode&&offset===selection.focusOffset)focus=text.length;
  }
  function visit(node,marker=false){
    if(node.nodeType===Node.TEXT_NODE){
      if(node===selection?.anchorNode)anchor=text.length+selection.anchorOffset;
      if(node===selection?.focusNode)focus=text.length+selection.focusOffset;
      if(!marker)runs.push({node,start:text.length,end:text.length+node.length});
      text+=node.data;
      return;
    }
    if(node.nodeType!==Node.ELEMENT_NODE||node.matches('.vditor-ir__preview,script,style'))return;
    const block=node.hasAttribute('data-block')||node.matches('li,tr,pre');
    if(block&&text&&!text.endsWith('\n'))text+='\n';
    if(node.matches('li'))text+=(node.getAttribute('data-marker')||'-')+' ';
    if(node.matches('th,td'))text+='| ';
    const contentStart=text.length,first=runs.length;
    let offset=0;
    boundary(node,offset);
    for(const child of node.childNodes){
      visit(child,marker||node.classList.contains('vditor-ir__marker'));
      boundary(node,++offset);
    }
    if(!marker&&first===runs.length&&node.matches('p,li,h1,h2,h3,h4,h5,h6,th,td'))
      runs.push({node,start:contentStart,end:contentStart});
    if(node.matches('br')||(block&&!text.endsWith('\n')))text+='\n';
    if(node.parentElement===root&&!text.endsWith('\n\n'))text+='\n';
  }
  visit(root);
  return {text,runs,anchor,focus};
}

export function sourceSelection(editor){
  const selection=window.getSelection();
  if(!editor.editable.contains(selection.anchorNode)||!editor.editable.contains(selection.focusNode))return null;
  const body=indexBody(editor.editable,selection);
  const dmp=editor.editor.vditor.undo.dmp;
  // Align against the original spelling and the textarea’s normalized newlines.
  const diffs=dmp.diff_main(body.text,editor.currentSource().replace(/\r\n?/g,'\n'));
  return {anchor:dmp.diff_xIndex(diffs,body.anchor),focus:dmp.diff_xIndex(diffs,body.focus)};
}

export function restoreBodySelection(editor,source,selectionStart,selectionEnd,selectionDirection){
  const body=indexBody(editor.editable);
  const dmp=editor.editor.vditor.undo.dmp;
  const diffs=dmp.diff_main(source,body.text);
  function point(offset){
    const position=dmp.diff_xIndex(diffs,offset);
    let previous;
    for(const run of body.runs){
      if(position<run.start){
        if(previous&&position-previous.end<run.start-position)break;
        return [run.node,0];
      }
      if(position<=run.end)return [run.node,position-run.start];
      previous=run;
    }
    return previous?[previous.node,previous.end-previous.start]:[editor.editable,0];
  }
  const start=point(selectionStart),end=selectionEnd===selectionStart?start:point(selectionEnd);
  const backwards=selectionDirection==='backward';
  editor.editable.focus({preventScroll:true});
  const focus=backwards?start:end;
  window.getSelection().setBaseAndExtent(...(backwards?end:start),...focus);
  const caret=document.createRange();
  caret.setStart(...focus);caret.collapse(true);
  const rect=caret.getClientRects()[0]||(focus[0].nodeType===Node.ELEMENT_NODE?focus[0]:focus[0].parentElement).getBoundingClientRect();
  revealCaret(editor.editable,rect);
}

function revealCaret(element,rect){
  if(!rect)return;
  const view=element.getBoundingClientRect();
  if(rect.top<view.top)element.scrollTop+=Math.floor(rect.top-view.top);
  else if(rect.bottom>view.bottom)element.scrollTop+=Math.ceil(rect.bottom-view.bottom);
}

export function restoreSourceSelection(source,{anchor,focus}){
  source.setSelectionRange(Math.min(anchor,focus),Math.max(anchor,focus),anchor>focus?'backward':'forward');
  if(source.scrollHeight<=source.clientHeight)return;
  if(focus===source.value.length){source.scrollTop=source.scrollHeight;return}
  const mirror=document.createElement('div');
  mirror.className='document-search-mirror';
  document.body.append(mirror);
  try{
    revealCaret(source,textareaMatchRect(source,{start:focus,end:focus+1},mirror)[0]);
  }finally{mirror.remove()}
}
