import {EditQueue} from './queue.js';
import {MindMap} from './mindmap.js';
import {createSidebarCollapse} from './features/sidebar-collapse.js';
import {mountSettings} from './settings.js';
import {bindToolbarMaximise} from './features/toolbar-maximise.js';
import {mountFileActions} from './features/file-actions.js';
import {MarkdownEditor} from './markdown-editor.js';
import {isMindMapPath,documentTitle,documentAssetBase,markdownLinkTarget,newDocumentName} from './document-mode.js';
import {mountGlobalCaret} from './features/global-caret.js';
import {mountDocumentSearch} from './features/document-search.js';
import {mountFileTreeDrag,movedTreePath} from './features/file-tree-drag.js';
import {TableActions} from './features/table-actions.js';
import {mountFileTreeHover} from './features/file-tree-hover.js';
import {MindHistory} from './features/mind-history.js';

mountGlobalCaret();

const $=id=>document.getElementById(id);
const fileTreeHover=mountFileTreeHover($('file-tree'));
const native=window.go?.main?.App;
const preview=!native;
let sourceViewEnabled=true;
let hideFileExtensions=false;
let mindZoomControlsEnabled=true;
let alwaysOnTop=false;
let compactWindow=false;
let mdCompactWindowEnabled=false;
let switchingCompactWindow=false;
let compactSourceOpen=false;
let mainWindowAlwaysOnTop=false;
function updatePinButton(){
  $('toggle-always-on-top').setAttribute('aria-pressed',String(alwaysOnTop));
  const label=alwaysOnTop?'取消置顶':'始终置顶';
  $('toggle-always-on-top').title=label+'（⌥⌘T）';
  $('toggle-always-on-top').setAttribute('aria-label',label);
}
$('toggle-always-on-top').disabled=preview;
$('toggle-always-on-top').onclick=()=>{
  if(switchingCompactWindow)return;
  try{
    window.runtime.WindowSetAlwaysOnTop(!alwaysOnTop);
    alwaysOnTop=!alwaysOnTop;
    updatePinButton();
  }catch(error){toast(errorText(error))}
};
document.addEventListener('keydown',event=>{
  if(event.isComposing||event.keyCode===229||!event.metaKey||!event.altKey||event.ctrlKey||event.shiftKey||event.code!=='KeyT'||$('toggle-always-on-top').disabled)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(!event.repeat)$('toggle-always-on-top').click();
},true);
document.querySelector('.toolbar-actions').addEventListener('keydown',event=>{
  if(event.isComposing||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
  const buttons=[...event.currentTarget.querySelectorAll('button:not(:disabled)')].filter(button=>button.getClientRects().length);
  const index=buttons.indexOf(event.target.closest('button'));
  if(index<0)return;
  event.preventDefault();
  buttons[(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length].focus();
});
bindToolbarMaximise(document.querySelector('.toolbar'),native?()=>{if(!compactWindow&&!switchingCompactWindow)void native.ToggleWindowMaximise().catch(error=>toast(errorText(error)))}:undefined);
const state={workspace:null,snapshot:null,expanded:new Set(['']),directories:new Map(),selectedDir:'',queue:null,blocked:false,sourceOpen:false,editor:null,composing:false,lastInput:null,checking:false,closing:false,treeGeneration:0,opSeq:0,clientID:crypto.randomUUID(),draft:null};
const mindHistory=new MindHistory();
let restoringMindHistory=false;
const call=async(name,...args)=>{
  if(!native)throw new Error('这是只读界面预览，请启动 macOS 应用使用文件读写。');
  const before=name==='ApplyEdit'&&!restoringMindHistory&&state.snapshot&&isMindMapPath(state.snapshot.path)?captureMindHistory():null;
  const reply=await native[name](...args);
  if(before)mindHistory.record(before,reply.source,args[0].kind==='label'?args[0].session+':'+args[0].nodeId:null);
  return reply;
};
$('enter-compact-window').onclick=()=>void setCompactWindow(true);
$('return-main-window').onclick=()=>void setCompactWindow(false);

async function setCompactWindow(enabled){
  if(compactWindow===enabled||switchingCompactWindow||state.navigating||state.closing||state.checking||document.querySelector('dialog[open]'))return false;
  if(enabled&&(!mdCompactWindowEnabled||!state.snapshot||isMindMapPath(state.snapshot.path)||document.body.classList.contains('settings-open')))return false;
  switchingCompactWindow=true;state.navigating=true;
  try{
    if((enabled||!state.blocked)&&!await readyToNavigate())return false;
    await call('SetCompactWindow',enabled);
    if(enabled){
      mainWindowAlwaysOnTop=alwaysOnTop;alwaysOnTop=true;
      compactSourceOpen=state.sourceOpen;
      if(state.sourceOpen)markdown.load(state.snapshot.source,{session:state.snapshot.session,path:state.snapshot.path});
      state.sourceOpen=false;
      fileActions.closeMenu();closeWorkspaceMenu();documentSearch.close(false);
    }else{
      alwaysOnTop=mainWindowAlwaysOnTop;
      state.sourceOpen=compactSourceOpen&&sourceViewEnabled&&!state.blocked;
    }
    compactWindow=enabled;
    document.body.classList.toggle('compact-window',enabled);
    updatePinButton();
    return true;
  }catch(error){toast(errorText(error));return false}
  finally{
    switchingCompactWindow=false;state.navigating=false;updateDocumentView();
    $('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor;
  }
}
let toastTimer;
function toast(message){$('toast').textContent=String(message);$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,4200)}
function errorText(error){return error?.message||String(error)}
const fileActions=mountFileActions({
  menu:$('file-context-menu'),renameDialog:$('rename-file-dialog'),deleteDialog:$('delete-file-dialog'),
  create:(directory,parent)=>beginCreate(directory,parent),
  begin:async()=>{
    if(preview){toast('请在 macOS 应用中重命名或删除文件。');return false}
    if(state.navigating||state.checking||state.closing)return false;
    state.navigating=true;
    try{if(await readyToNavigate()){setEditorsReadOnly();return true}}
    catch(error){toast(errorText(error))}
    state.navigating=false;updateDocumentView();$('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor;
    return false;
  },
  finish:()=>{state.navigating=false;updateDocumentView();$('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor},
  rename:async(entry,name)=>{
    const result=await call('RenameDocument',entry.path,name);
    const closed=state.snapshot?.path===entry.path&&!result.snapshot;
    if(entry.directory){
      state.expanded=new Set([...state.expanded].map(path=>movedTreePath(path,entry.path,result.path)));
      state.selectedDir=movedTreePath(state.selectedDir,entry.path,result.path);
      state.directories.clear();state.treeExpansionChanged=true;
    }
    if(result.snapshot){
      const sourceOpen=state.sourceOpen,modeChanged=isMindMapPath(state.snapshot.path)!==isMindMapPath(result.snapshot.path);
      if(modeChanged){map.clear();map.selected=null}
      applySnapshot(result.snapshot,{resetView:modeChanged});state.sourceOpen=sourceOpen;updateDocumentView();resetSourceInput();
    }else if(closed)clearCurrentDocument();
    await refreshTree();renderTree();
  },
  remove:async entry=>{
    await call('DeleteDocument',entry.path);
    const within=path=>path===entry.path||entry.directory&&path.startsWith(entry.path+'/');
    if(state.snapshot&&within(state.snapshot.path))clearCurrentDocument();
    if(entry.directory){
      state.expanded=new Set([...state.expanded].filter(path=>!within(path)));
      if(within(state.selectedDir))state.selectedDir=entry.path.includes('/')?entry.path.slice(0,entry.path.lastIndexOf('/')):'';
      state.directories.clear();state.treeExpansionChanged=true;
    }
    await refreshTree();renderTree();
  },
  onError:error=>toast(errorText(error))
});
fileActions.bindBackground($('file-tree'));
document.addEventListener('keydown',event=>{
  if(event.key!=='F6'||!event.shiftKey||event.metaKey||event.ctrlKey||event.altKey||event.isComposing||event.keyCode===229)return;
  event.preventDefault();event.stopImmediatePropagation();
  if(event.repeat||preview||!state.snapshot||state.navigating||state.checking||state.closing||state.composing||switchingSettings||switchingCompactWindow||fileActions.active||document.querySelector('dialog[open]')||document.body.classList.contains('settings-open'))return;
  const path=state.snapshot.path;
  closeWorkspaceMenu();documentSearch.close(false);
  void fileActions.renameEntry({path,name:path.split('/').pop(),directory:false});
},true);
const fileTreeDrag=mountFileTreeDrag({
  tree:$('file-tree'),rootTarget:$('sidebar-title').parentElement,rootLabel:$('sidebar-title'),
  canDrag:()=>!!state.workspace&&!preview&&!state.navigating&&!state.checking&&!state.closing&&!state.blocked&&!state.composing&&!state.fileMoving&&!state.nodeDragging&&!addingChild&&!deletingNode&&!movingNode&&!fileActions.active&&!document.querySelector('dialog[open]')&&!document.body.classList.contains('settings-open'),
  beforeDrag:()=>{fileActions.closeMenu();closeWorkspaceMenu();if(state.snapshot&&!isMindMapPath(state.snapshot.path)&&!state.sourceOpen)markdown.flush()},
  move:relocateEntry,
  onState:active=>{
    state.fileDragging=active;
    if(active){state.treeGeneration++;setEditorsReadOnly()}
    else {
      if(state.editor)state.editor.readOnly=state.blocked||state.closing;
      updateDocumentView();$('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor;
      queueMicrotask(()=>{if(!state.navigating)void refreshTree()});
    }
  },
  onError:error=>toast(errorText(error))
});
async function relocateEntry(entry,parent){
  if(state.navigating||state.closing)return;
  state.navigating=true;state.fileMoving=true;
  try{
    if(!await readyToNavigate())return;
    const result=await call('MoveEntry',entry.path,parent);
    state.expanded=new Set([...state.expanded].map(path=>movedTreePath(path,entry.path,result.path)));
    state.selectedDir=movedTreePath(state.selectedDir,entry.path,result.path);
    if(result.snapshot){
      const sourceOpen=state.sourceOpen,scroll=markdown.scrollElement.scrollTop;
      state.selectedDir=result.snapshot.path.includes('/')?result.snapshot.path.slice(0,result.snapshot.path.lastIndexOf('/')):'';
      applySnapshot(result.snapshot);state.sourceOpen=sourceOpen;updateDocumentView();resetSourceInput();
      markdown.scrollElement.scrollTop=scroll;
    }
    state.directories.clear();state.treeExpansionChanged=true;
  }catch(error){toast(errorText(error))}
  finally{
    try{await refreshTree({afterMove:true});renderTree()}
    finally{state.fileMoving=false;state.navigating=false;updateDocumentView();$('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor}
  }
}
function clearCurrentDocument(){
  mindHistory.clear();
  state.snapshot=null;state.queue.reset();state.draft=null;state.sourceOpen=false;map.clear();map.selected=null;markdown.clear();
  $('source-editor').value='';resetSourceInput();$('source-size').textContent='0 字节';
  $('document-title').textContent='选择一份 Markdown';$('welcome').hidden=false;$('error-banner').hidden=true;
  updateDocumentView();renderOutline();
}
function banner(message,reload=false){$('error-text').textContent=message;$('error-banner').hidden=false;$('reload-document').hidden=!reload}
const map=new MindMap({canvas:$('canvas'),scene:$('scene'),nodes:$('nodes'),edges:$('edges'),onEdit:editNode,onSelect:selectNode,onCreateMain:()=>addNode({main:true}),onFocus:toggleFocusMode,onColor:setNodeColor,onCopyTree:id=>copyNode(id,{tree:true}),onLayout:updateOutlineCollapseButtons,onZoom:scale=>$('zoom-value').textContent=Math.round(scale*100)+'%',canDrag:canDragNode,onMove:relocateNode,onDragState:active=>{state.nodeDragging=active;if(state.editor)state.editor.readOnly=active||state.blocked||state.closing;$('source-editor').readOnly=active||preview||state.blocked||state.closing||!!state.editor}});
const markdown=new MarkdownEditor({container:$('markdown-editor'),onInput:text=>enqueue('source',text),onComposition:composing=>state.composing=composing,onBeforeInput:canInputMarkdown,onOutline:()=>{if(state.snapshot&&!isMindMapPath(state.snapshot.path))renderOutline()},images:{importImage:(session,data)=>call('ImportImage',session,data),discardImages:(session,paths)=>call('DiscardImages',session,paths),onError:error=>toast(errorText(error))}});
const documentSearch=mountDocumentSearch({
  bar:$('document-search'),input:$('document-search-input'),count:$('document-search-count'),
  previous:$('document-search-previous'),next:$('document-search-next'),closeButton:$('document-search-close'),
  canOpen:()=>!!state.snapshot&&!compactWindow&&!switchingCompactWindow&&!state.closing&&!document.body.classList.contains('settings-open')&&!document.querySelector('dialog[open]'),
  beforeOpen:async()=>{
    if(state.fileDragging||state.composing||state.navigating||state.nodeDragging||addingChild||deletingNode||movingNode)return false;
    return state.editor?finishNode():true;
  },
  getTarget:()=>{
    if(!state.snapshot)return null;
    const mode=state.sourceOpen?'source':isMindMapPath(state.snapshot.path)?'mindmap':'markdown';
    const key=state.snapshot.session+':'+state.snapshot.path+':'+mode+':'+(mode==='mindmap'?map.focusedId||'':'');
    if(mode==='source')return {key,type:'textarea',element:$('source-editor')};
    if(mode==='markdown')return {key,type:'markdown',element:markdown.editable};
    const range=match=>{
      const text=match&&map.elements.get(match.id)?.querySelector('.node-label')?.firstChild;
      if(!text||match.end>text.length)return null;
      const found=document.createRange();found.setStart(text,match.start);found.setEnd(text,match.end);return found;
    };
    return {key,type:'mindmap',element:$('canvas'),root:map.viewRoot,range,reveal:async match=>{
      if(state.navigating||state.nodeDragging||state.composing||addingChild||deletingNode||movingNode)return null;
      const path=nodePath(state.snapshot.root,match.id);if(!path)return null;
      for(let depth=0;depth<path.length;depth++)map.collapsed.delete(nodeAtPath(state.snapshot.root,path.slice(0,depth)).id);
      map.selected=match.id;map.setRoot(state.snapshot.root);
      const position=map.layout.positions.find(position=>position.id===match.id);if(!position)return null;
      map.x=map.canvas.clientWidth/2-(position.x+position.width/2)*map.scale;
      map.y=map.canvas.clientHeight/2-(position.y+position.height/2)*map.scale;map.render();return range(match);
    }};
  },
  onError:error=>toast(errorText(error))
});
function canInputMarkdown(source,event){
  if(state.blocked||state.closing||state.navigating||state.fileDragging||!state.snapshot)return false;
  if(!state.composing&&!state.queue.canAccept(new TextEncoder().encode(source).length+new TextEncoder().encode(event.data||'').length+1024)){toast('文件正在写入，请稍候再输入。');return false}
  return true;
}
function updateDocumentView(){
  const opened=!!state.snapshot,mind=opened&&isMindMapPath(state.snapshot.path);
  $('enter-compact-window').hidden=!mdCompactWindowEnabled||!opened||mind||compactWindow;
  $('enter-compact-window').disabled=!mdCompactWindowEnabled||preview||!opened||mind||state.navigating||state.closing;
  $('return-main-window').hidden=!compactWindow;
  $('return-main-window').disabled=state.navigating||state.closing;
  document.body.classList.toggle('markdown-mode',opened&&!mind);
  document.body.classList.toggle('source-open',opened&&state.sourceOpen);
  $('canvas').hidden=opened&&!mind;
  $('markdown-page').hidden=!opened||mind||state.sourceOpen;
  $('source-panel').hidden=!opened||!state.sourceOpen;
  $('zoom-controls').hidden=!mind||!mindZoomControlsEnabled;
  $('toggle-source').hidden=!sourceViewEnabled;
  $('toggle-source').disabled=!opened||!sourceViewEnabled;
  $('toggle-source').setAttribute('aria-pressed',String(opened&&state.sourceOpen));
  $('source-toggle-label').textContent=opened&&!mind&&state.sourceOpen?'正文':'原文';
  $('toggle-source').title=opened&&!mind?(state.sourceOpen?'返回正文编辑':'切换到 Markdown 原文'):'显示 Markdown 原文';
  markdown.setReadOnly(preview||!opened||mind||state.blocked||state.closing||state.navigating||state.fileDragging||state.sourceOpen);
  if(!opened)documentSearch.close(false);
}

function applySnapshot(snapshot,{resetView=false,external=false}={}){
  if(snapshot.imageWarning)toast(snapshot.imageWarning);
  const pathChanged=state.snapshot?.path!==snapshot.path;
  if(resetView||pathChanged||external)mindHistory.clear();
  if(resetView||pathChanged||external)map.focusedId=null;
  else if(map.focusedId){
    const path=nodePath(state.snapshot.root,map.focusedId);
    map.focusedId=snapshot.nodeIdMap?snapshot.nodeIdMap[map.focusedId]||null:nodeAtPath(snapshot.root,path)?.id||null;
  }
  state.snapshot=snapshot;
  if(pathChanged)state.sourceOpen=false;
  $('welcome').hidden=true;
  updateDocumentView();
  $('document-title').textContent=documentTitle(snapshot.path);
  const source=$('source-editor');
  if(!state.composing&&(!state.queue?.pending||external)){const start=source.selectionStart,end=source.selectionEnd,scroll=source.scrollTop;source.value=snapshot.source;source.setSelectionRange(Math.min(start,source.value.length),Math.min(end,source.value.length));source.scrollTop=scroll;}
  source.readOnly=preview||state.blocked||state.closing||state.navigating||state.fileDragging||addingChild||deletingNode||movingNode||!!state.editor;
  $('source-size').textContent=new TextEncoder().encode(snapshot.source).length.toLocaleString()+' 字节';
  if(isMindMapPath(snapshot.path)){map.setRoot(snapshot.root,{resetView})}
  else if(resetView||pathChanged||external||state.sourceOpen&&!state.queue.pending&&!state.composing){markdown.load(snapshot.source,{session:snapshot.session,path:snapshot.path,reset:resetView||pathChanged})}
  renderOutline();if(pathChanged)renderTree();
  documentSearch.refresh({reset:pathChanged,jump:external});
}

state.queue=new EditQueue({
  write:edit=>call('ApplyEdit',{...edit,session:state.snapshot.session,version:state.snapshot.version}),
  onCommit:reply=>applySnapshot(reply),
  onError:async error=>{state.blocked=true;setEditorsReadOnly();let message=errorText(error);try{const path=await preserveDraft();message+='。本地内容已保留到恢复副本。';state.recoveryPath=path}catch(e){message+='；恢复副本失败：'+errorText(e)+'。请保留窗口并复制文字。'}banner(message,true)}
});

function setEditorsReadOnly(){if(state.editor)state.editor.readOnly=true;$('source-editor').readOnly=true;markdown.setReadOnly(true)}
function enqueue(kind,text,nodeId=''){
  if(preview||!state.snapshot||state.blocked)return;
  if(kind==='source'&&map.focusedId){map.focusedId=null;map.setRoot(state.snapshot.root);renderOutline();documentSearch.refresh({reset:true})}
  state.draft={kind,nodeId,text};
  try{state.queue.push({kind,text,nodeId,opId:state.clientID+':'+(++state.opSeq)})}
  catch(error){state.blocked=true;setEditorsReadOnly();banner(errorText(error),true);void preserveDraft().catch(e=>banner(errorText(error)+' 恢复副本失败：'+errorText(e),true));}
}
async function preserveDraft(){
  if(!state.snapshot)return '';
  let draft=state.draft;
  if(state.editor)draft={kind:'label',nodeId:map.editing,text:state.editor.value};
  else if(!isMindMapPath(state.snapshot.path))draft={kind:'source',nodeId:'',text:state.sourceOpen?$('source-editor').value:markdown.currentSource()};
  if(!draft)draft={kind:'source',nodeId:'',text:state.snapshot.source};
  return call('PreserveDraft',state.snapshot.session,draft.kind,draft.nodeId,draft.text);
}
function bindInput(element,kind,nodeId=''){
  let composing=false,last=element.value;
  const commit=()=>{if(element.value===last)return;last=element.value;enqueue(kind,element.value,nodeId)};
  element.addEventListener('compositionstart',()=>{composing=true;state.composing=true});
  element.addEventListener('compositionend',()=>{composing=false;state.composing=false;commit()});
  element.addEventListener('input',event=>{if(!composing&&!event.isComposing)commit()});
  element.addEventListener('beforeinput',event=>{if(state.blocked||state.closing||(!composing&&!state.queue.canAccept(new TextEncoder().encode(element.value).length+1024))){event.preventDefault();toast('文件正在写入，请稍候再输入。')}if(kind==='label'&&event.inputType==='insertLineBreak')event.preventDefault()});
  return ()=>{last=element.value};
}
const resetSourceInput=bindInput($('source-editor'),'source');

let editRequest=0;
let addingChild=false;
let deletingNode=false;
let movingNode=false;
function nodePath(node,id,path=[]){if(node.id===id)return path;for(let i=0;i<node.children.length;i++){const found=nodePath(node.children[i],id,[...path,i]);if(found)return found}return null}
function nodeAtPath(root,path){return path?.reduce((node,index)=>node?.children[index],root)}
function captureMindHistory(){
  const root=state.snapshot.root;
  return {source:state.snapshot.source,selected:nodePath(root,map.selected),focused:nodePath(root,map.focusedId),collapsed:[...map.collapsed].map(id=>nodePath(root,id)).filter(Boolean)};
}
async function restoreMindHistory(direction){
  if(preview||state.fileDragging||state.nodeDragging||addingChild||deletingNode||movingNode||state.checking||state.blocked||state.closing||state.composing||state.navigating||!state.snapshot||!isMindMapPath(state.snapshot.path))return;
  movingNode=true;++editRequest;setEditorsReadOnly();
  try{
    if(!await finishNode()||!await state.queue.drain())return;
    const target=mindHistory.target(direction);if(!target)return;
    const current=captureMindHistory();
    restoringMindHistory=true;
    const snapshot=await call('ApplyEdit',{kind:'restore-mind',text:target.source,session:state.snapshot.session,version:state.snapshot.version,opId:state.clientID+':'+(++state.opSeq)});
    mindHistory.commit(direction,current);
    map.focusedId=null;applySnapshot(snapshot);resetSourceInput();state.draft=null;
    map.selected=nodeAtPath(snapshot.root,target.selected)?.id||null;
    map.focusedId=nodeAtPath(snapshot.root,target.focused)?.id||null;
    map.collapsed=new Set(target.collapsed.map(path=>nodeAtPath(snapshot.root,path)?.id).filter(Boolean));
    map.setRoot(snapshot.root);map.reveal(map.selected);map.render();renderOutline();documentSearch.refresh({reset:true,preserveView:true});
    (map.elements.get(map.selected)||map.canvas).focus({preventScroll:true});
  }catch(error){banner(errorText(error),true)}finally{
    restoringMindHistory=false;movingNode=false;
    if(state.editor)state.editor.readOnly=state.blocked||state.closing;
    $('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor;
  }
}
document.addEventListener('keydown',event=>{
  if(event.defaultPrevented||event.isComposing||state.composing||event.keyCode===229||!event.metaKey||event.ctrlKey||event.altKey||event.key.toLowerCase()!=='z'||!state.snapshot||!isMindMapPath(state.snapshot.path)||document.body.classList.contains('settings-open')||document.querySelector('dialog[open]')||event.target.closest('input,textarea,[contenteditable="true"]'))return;
  event.preventDefault();event.stopImmediatePropagation();
  if(!event.repeat)void restoreMindHistory(event.shiftKey?'redo':'undo');
},true);
async function toggleFocusMode(id,{fromOutline=false}={}){
  if(state.fileDragging||state.nodeDragging||addingChild||deletingNode||movingNode||state.checking||state.blocked||state.closing||state.composing||state.navigating||!state.snapshot)return;
  const path=nodePath(state.snapshot.root,id);if(!path)return;
  movingNode=true;++editRequest;setEditorsReadOnly();
  try{
    if(!await finishNode()||!await state.queue.drain())return;
    const node=nodeAtPath(state.snapshot.root,path);if(!node)return;
    if(fromOutline&&map.focusedId!==node.id){
      for(let depth=0;depth<path.length;depth++)map.collapsed.delete(nodeAtPath(state.snapshot.root,path.slice(0,depth))?.id);
      map.setRoot(state.snapshot.root);
    }
    map.toggleFocus(node.id);
    if(fromOutline&&map.focusedId)map.focusBranch(node.id);
    map.render();renderOutline();documentSearch.refresh({reset:true,preserveView:true});
    map.elements.get(node.id)?.focus({preventScroll:true});
  }catch(error){banner(errorText(error))}finally{
    movingNode=false;
    if(state.editor)state.editor.readOnly=state.blocked||state.closing;
    $('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor;
  }
}
function canDragNode(){
  return !!state.snapshot&&isMindMapPath(state.snapshot.path)&&!state.fileDragging&&!addingChild&&!deletingNode&&!movingNode&&!state.checking&&!state.blocked&&!state.closing&&!state.composing&&!state.navigating&&!state.queue.pending&&!finishing&&!document.querySelector('dialog[open]')&&!document.body.classList.contains('settings-open');
}
async function setNodeColor(id,color){
  if(state.fileDragging||state.nodeDragging||addingChild||deletingNode||movingNode||state.checking||state.blocked||state.closing||state.composing||state.navigating||!state.snapshot||!isMindMapPath(state.snapshot.path))return;
  if(preview){toast('请在 macOS 应用中设置节点颜色。');return}
  const path=nodePath(state.snapshot.root,id);if(!path)return;
  movingNode=true;++editRequest;setEditorsReadOnly();
  try{
    if(!await finishNode()||!await state.queue.drain())return;
    const node=nodeAtPath(state.snapshot.root,path);if(!node)return;
    enqueue('node-color',color,node.id);
    if(!await state.queue.drain())return;
    state.draft=null;map.selected=node.id;map.render();map.elements.get(node.id)?.focus({preventScroll:true});
  }catch(error){banner(errorText(error),true)}finally{
    movingNode=false;
    if(state.editor)state.editor.readOnly=state.blocked||state.closing;
    $('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor;
  }
}
async function relocateNode(id,targetID,placement){
  if(!canDragNode())return;
  if(preview){toast('请在 macOS 应用中拖动节点。');return}
  const sourcePath=nodePath(state.snapshot.root,id),targetPath=nodePath(state.snapshot.root,targetID);
  if(!sourcePath?.length||!targetPath)return;
  const folded=[...map.collapsed].map(id=>nodePath(state.snapshot.root,id)).filter(Boolean);
  movingNode=true;++editRequest;setEditorsReadOnly();
  try{
    if(!await finishNode()||!await state.queue.drain())return;
    const node=nodeAtPath(state.snapshot.root,sourcePath),target=nodeAtPath(state.snapshot.root,targetPath);
    if(!node||!target)return;
    const collapsed=folded.map(path=>nodeAtPath(state.snapshot.root,path)?.id).filter(Boolean);
    const snapshot=await call('ApplyEdit',{kind:'move-node',nodeId:node.id,targetId:target.id,placement,text:'',session:state.snapshot.session,version:state.snapshot.version,opId:state.clientID+':'+(++state.opSeq)});
    map.collapsed=new Set(collapsed.map(id=>snapshot.nodeIdMap?.[id]).filter(Boolean));
    map.selected=snapshot.focusNodeId;
    const movedPath=nodePath(snapshot.root,map.selected);
    for(let i=0;i<(movedPath?.length||0);i++)map.collapsed.delete(nodeAtPath(snapshot.root,movedPath.slice(0,i)).id);
    applySnapshot(snapshot);resetSourceInput();state.draft=null;map.reveal(map.selected);map.render();map.elements.get(map.selected)?.focus({preventScroll:true});
  }catch(error){banner(errorText(error),true)}finally{
    movingNode=false;
    if(state.editor)state.editor.readOnly=state.blocked||state.closing;
    $('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor;
  }
}
async function moveSelection(direction){
  if(state.fileDragging||state.nodeDragging||addingChild||deletingNode||movingNode||state.checking||state.blocked||state.closing||state.composing||state.navigating||!state.snapshot||!map.selected)return;
  const path=nodePath(state.snapshot.root,map.selected);
  if(!path)return;
  let targetPath;
  if(direction==='ArrowLeft'){if(!path.length||map.selected===map.focusedId||state.snapshot.root.kind==='file'&&path.length===1)return;targetPath=path.slice(0,-1)}
  else if(direction==='ArrowRight'){
    const node=nodeAtPath(state.snapshot.root,path);
    if(!node.children.length)return;
    targetPath=[...path,node.children.length-1];
  }else{
    if(!path.length)return;
    const peers=map.layout.positions.filter(node=>(node.pathDepth??node.depth)===path.length);
    const index=peers.findIndex(node=>node.id===map.selected)+(direction==='ArrowUp'?-1:1);
    if(index<0||index>=peers.length)return;
    targetPath=nodePath(state.snapshot.root,peers[index].id);
  }
  movingNode=true;++editRequest;
  const folded=[...map.collapsed].map(id=>nodePath(state.snapshot.root,id)).filter(Boolean);
  if(state.editor)state.editor.readOnly=true;
  $('source-editor').readOnly=true;
  try{
    if(!await finishNode()||!await state.queue.drain())return;
    const target=nodeAtPath(state.snapshot.root,targetPath);
    if(!target)return;
    map.collapsed=new Set(folded.map(path=>nodeAtPath(state.snapshot.root,path)?.id).filter(Boolean));
    if(direction==='ArrowRight')map.collapsed.delete(nodeAtPath(state.snapshot.root,path)?.id);
    map.selected=target.id;map.setRoot(state.snapshot.root);map.reveal(target.id);map.render();
    map.elements.get(target.id)?.focus({preventScroll:true});
  }catch(error){banner(errorText(error))}finally{
    movingNode=false;
    if(state.editor)state.editor.readOnly=state.blocked||state.closing;
    $('source-editor').readOnly=preview||state.blocked||!!state.editor;
  }
}
function copyNodeText(event){
  if(!state.snapshot||!isMindMapPath(state.snapshot.path)||!map.selected||state.composing||event.isComposing)return;
  if(state.editor&&event.target===state.editor&&state.editor.selectionStart!==state.editor.selectionEnd)return;
  if(window.getSelection()?.isCollapsed===false)return;
  event.preventDefault();
  if(event.repeat)return;
  copyNode(map.selected);
}
function copyNode(id,{tree=false}={}){
  if(!state.snapshot||!isMindMapPath(state.snapshot.path)||!id||state.composing||state.navigating||state.closing||state.nodeDragging||state.fileDragging||addingChild||deletingNode||movingNode||finishing||tree&&!map.copyTreeEnabled)return;
  const label=state.editor&&map.editing===id?state.editor.value:null;
  void call(tree?'CopyNodeMarkdown':'CopyNodeText',state.snapshot.session,id,label).catch(error=>toast(errorText(error)));
}
$('canvas').addEventListener('copy',copyNodeText);
$('canvas').addEventListener('keydown',event=>{
  if(event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase()==='c')copyNodeText(event);
});
$('canvas').addEventListener('keydown',event=>{
  if(state.editor)return;
  if(event.ctrlKey||event.altKey||event.shiftKey||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key)||!map.selected)return;
  if(event.isComposing||state.composing||event.keyCode===229)return;
  event.preventDefault();
  void moveSelection(event.key);
});
function addChild(sibling=false){return addNode({sibling})}
async function addNode({sibling=false,main=false}={}){
  if(state.fileDragging||state.nodeDragging||addingChild||deletingNode||movingNode||state.checking||state.blocked||state.closing||state.composing||state.navigating||!state.snapshot||!isMindMapPath(state.snapshot.path)||(!main&&!map.selected))return;
  if(preview){toast('请在 macOS 应用中新增节点。');return}
  const path=main?[]:nodePath(state.snapshot.root,map.selected);
  if(!path)return;
  if(sibling&&!path.length){toast('根节点不能新增同级节点。');return}
  if(sibling&&map.selected===map.focusedId){toast('聚焦节点不能新增同级节点。');return}
  addingChild=true;++editRequest;
  if(state.editor)state.editor.readOnly=true;
  $('source-editor').readOnly=true;
  try{
    if(!await finishNode()||!await state.queue.drain())return;
    const parent=nodeAtPath(state.snapshot.root,path);
    if(!parent)return;
    const folded=[...map.collapsed].map(id=>nodePath(state.snapshot.root,id)).filter(Boolean);
    const snapshot=await call('ApplyEdit',{kind:sibling?'insert-sibling':'insert-child',nodeId:parent.id,text:'',session:state.snapshot.session,version:state.snapshot.version,opId:state.clientID+':'+(++state.opSeq)});
    map.collapsed=new Set(folded.map(foldedPath=>{
      const nextPath=[...foldedPath];
      if(sibling&&nextPath.length>=path.length&&path.slice(0,-1).every((value,index)=>nextPath[index]===value)&&nextPath[path.length-1]>path[path.length-1])nextPath[path.length-1]++;
      return nodeAtPath(snapshot.root,nextPath)?.id;
    }).filter(Boolean));
    map.collapsed.delete(nodeAtPath(snapshot.root,sibling?path.slice(0,-1):path)?.id);
    if(main)map.focusedId=null;
    map.selected=snapshot.createdNodeId;
    applySnapshot(snapshot);resetSourceInput();map.reveal(snapshot.createdNodeId);
    addingChild=false;
    await editNode(snapshot.createdNodeId);
  }catch(error){banner(errorText(error),true)}finally{
    addingChild=false;
    if(state.editor)state.editor.readOnly=state.blocked||state.closing;
    $('source-editor').readOnly=preview||state.blocked||!!state.editor;
  }
}
$('canvas').addEventListener('keydown',event=>{if(event.key==='Tab'&&!event.shiftKey&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&map.selected){if(event.isComposing||state.composing||event.keyCode===229)return;event.preventDefault();if(!event.repeat)void addChild()}});
$('canvas').addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.shiftKey&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&map.selected){if(event.isComposing||state.composing||event.keyCode===229)return;event.preventDefault();if(!event.repeat){if(state.editor||finishing)void finishNodeSelection();else void editNode(map.selected)}}});
$('delete-node-dialog').addEventListener('keydown',event=>{
  if(event.isComposing||event.metaKey||event.ctrlKey||event.altKey)return;
  if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight')return;
  event.preventDefault();
  const buttons=[...$('delete-node-dialog').querySelectorAll('.dialog-actions button')];
  const index=buttons.indexOf(document.activeElement);
  buttons[(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length].focus();
});
async function deleteNode(){
  if(state.fileDragging||state.nodeDragging||addingChild||deletingNode||movingNode||state.checking||state.blocked||state.closing||state.composing||state.navigating||!state.snapshot||!map.selected)return;
  if(preview){toast('请在 macOS 应用中删除节点。');return}
  const path=nodePath(state.snapshot.root,map.selected);
  if(!path?.length){toast('根节点不能删除。');return}
  deletingNode=true;++editRequest;
  let restoreID=null;
  if(state.editor)state.editor.readOnly=true;
  $('source-editor').readOnly=true;
  try{
    if(!await finishNode()||!await state.queue.drain())return;
    const target=nodeAtPath(state.snapshot.root,path);if(!target)return;
    restoreID=target.id;
    if(target.children.length){
      const count=node=>node.children.reduce((sum,child)=>sum+1+count(child),0);
      const dialog=$('delete-node-dialog');
      $('delete-node-description').textContent=`将删除“${target.label}”及其 ${count(target)} 个后代节点，对应的 Markdown 内容也会删除。`;
      dialog.returnValue='cancel';
      const confirmed=new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='delete'),{once:true}));
      dialog.showModal();dialog.querySelector('button[value="cancel"]').focus();if(!await confirmed)return;
    }
    const snapshot=await call('ApplyEdit',{kind:'delete-node',nodeId:target.id,text:'',session:state.snapshot.session,version:state.snapshot.version,opId:state.clientID+':'+(++state.opSeq)});
    map.collapsed=new Set([...map.collapsed].map(id=>snapshot.nodeIdMap?.[id]).filter(Boolean));
    map.selected=snapshot.focusNodeId;restoreID=null;
    applySnapshot(snapshot);resetSourceInput();map.reveal(map.selected);map.render();
    map.elements.get(map.selected)?.focus();
  }catch(error){banner(errorText(error),true)}finally{
    deletingNode=false;
    if(state.editor)state.editor.readOnly=state.blocked||state.closing;
    $('source-editor').readOnly=preview||state.blocked||!!state.editor;
    if(restoreID&&!state.blocked&&!state.closing)await editNode(restoreID);
  }
}
$('canvas').addEventListener('keydown',event=>{
  const del=event.key==='Delete'&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey;
  const commandBackspace=event.key==='Backspace'&&event.metaKey&&!event.ctrlKey&&!event.altKey&&!event.shiftKey;
  if((del||commandBackspace)&&map.selected){event.preventDefault();if(!event.repeat&&!event.isComposing)void deleteNode()}
});
async function selectNode(id){
  if(state.fileDragging||state.nodeDragging||addingChild||deletingNode||movingNode||state.checking||state.navigating||state.blocked||state.closing||state.composing||!state.snapshot)return;
  const path=id===null?null:nodePath(state.snapshot.root,id);
  if(id!==null&&!path)return;
  const request=++editRequest;
  if((state.editor||finishing)&&(!await finishNode()||request!==editRequest))return;
  map.selected=id===null?null:nodeAtPath(state.snapshot.root,path)?.id;
  map.render();
  (map.elements.get(map.selected)||map.canvas).focus({preventScroll:true});
}
async function finishNodeSelection(){
  const request=++editRequest;
  if(!await finishNode()||request!==editRequest)return;
  map.render();map.elements.get(map.selected)?.focus({preventScroll:true});
}
async function editNode(id){
  if(preview){toast('只读界面预览；在 macOS 应用中可以直接编辑。');return}
  if(state.fileDragging||state.nodeDragging||addingChild||deletingNode||movingNode||state.navigating||state.blocked||state.closing||!state.snapshot)return;
  const request=++editRequest;
  if(state.editor&&map.editing===id)return;
  const path=nodePath(state.snapshot.root,id);if(!path)return;
  if(!await finishNode()||request!==editRequest)return;
  if(!await state.queue.drain()||request!==editRequest||state.blocked||state.closing)return;
  id=nodeAtPath(state.snapshot.root,path)?.id;
  const p=map.layout.positions.find(p=>p.id===id);
  if(!p||!p.node.editable){toast('该节点包含复杂结构，请在 Markdown 原文中编辑。');return}
  const editor=map.createEditor(p);
  state.editor=editor;map.editor=editor;map.editing=id;map.selected=id;state.draft=null;$('source-editor').readOnly=true;
  map.nodes.append(editor);bindInput(editor,'label',id);editor.addEventListener('input',()=>map.setRoot(map.root));
  editor.addEventListener('mousedown',event=>{if(event.detail>1)event.preventDefault()});
  editor.addEventListener('keydown',event=>{if(event.isComposing||state.composing||event.keyCode===229)return;if(event.key==='Escape'){event.preventDefault();void finishNodeSelection()}});
  editor.addEventListener('blur',()=>{setTimeout(()=>{if(!state.nodeDragging&&!state.closing&&state.editor===editor)void finishNode()},0)});
  map.setRoot(map.root);map.render();editor.focus();editor.setSelectionRange(editor.value.length,editor.value.length);
}
let finishing=null;
async function finishNode(){
  if(finishing)return finishing;if(!state.editor)return !state.blocked;
  finishing=(async()=>{
    if(state.composing)return false;
    const editor=state.editor;
    editor.readOnly=true;
    if(!await state.queue.drain()||state.blocked){editor.readOnly=state.blocked||state.closing;return false}
    const selectedPath=nodePath(state.snapshot.root,map.selected);
    const folded=[...map.collapsed].map(id=>nodePath(state.snapshot.root,id)).filter(Boolean);
    editor.remove();state.editor=null;map.editor=null;map.editing=null;state.draft=null;
    try{
      const snapshot=await call('ReparseDocument',state.snapshot.session);
      map.selected=nodeAtPath(snapshot.root,selectedPath)?.id||null;
      map.collapsed=new Set(folded.map(path=>nodeAtPath(snapshot.root,path)?.id).filter(Boolean));
      applySnapshot(snapshot);resetSourceInput();return true;
    }catch(error){banner(errorText(error));return false}
  })();try{return await finishing}finally{finishing=null}
}

async function readyToNavigate(){
  if(state.fileDragging)return false;
  if(state.nodeDragging||addingChild||deletingNode||movingNode)return false;
  if(state.closing)return false;
  if(state.composing){toast('请先确认输入法中的文字。');return false}
  if(state.blocked){toast('请先处理写入提示，本地草稿仍保留在当前窗口。');return false}
  await markdown.imageTask;
  if(state.snapshot&&!isMindMapPath(state.snapshot.path)&&!state.sourceOpen)markdown.flush();
  if(state.navigating)setEditorsReadOnly();
  if(!await finishNode())return false;
  return state.queue.drain();
}
let recentWorkspaces=[];
let recentWorkspaceTarget=null;
function closeWorkspaceContextMenu(restoreFocus=false){
  $('workspace-context-menu').hidden=true;
  const target=recentWorkspaceTarget;recentWorkspaceTarget=null;
  if(restoreFocus&&target?.row.isConnected)(target.row.querySelector('button:not(:disabled)')||target.row).focus({preventScroll:true});
}
function showWorkspaceContextMenu(event,info,row){
  event.preventDefault();event.stopPropagation();
  closeWorkspaceContextMenu();fileActions.closeMenu();
  recentWorkspaceTarget={key:info.id||info.root,row};
  const menu=$('workspace-context-menu');menu.hidden=false;menu.style.left='0px';menu.style.top='0px';
  const bounds=menu.getBoundingClientRect(),rowBounds=row.getBoundingClientRect();
  const keyboard=event.type==='keydown'||event.clientX===0&&event.clientY===0;
  menu.style.left=Math.max(8,Math.min(keyboard?rowBounds.left+24:event.clientX,window.innerWidth-bounds.width-8))+'px';
  menu.style.top=Math.max(8,Math.min(keyboard?rowBounds.bottom:event.clientY,window.innerHeight-bounds.height-8))+'px';
  $('remove-recent-workspace').focus({preventScroll:true});
}
$('remove-recent-workspace').onclick=async()=>{
  const target=recentWorkspaceTarget;if(!target)return;
  closeWorkspaceContextMenu(true);
  try{await call('RemoveRecentWorkspace',target.key);await refreshRecentWorkspaces()}
  catch(error){toast('移除快捷文件夹失败：'+errorText(error))}
};
$('workspace-context-menu').addEventListener('keydown',event=>{
  if(event.key==='Escape'||event.key==='Tab'){
    if(event.key==='Escape')event.preventDefault();
    event.stopPropagation();closeWorkspaceContextMenu(true);
  }else if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
    event.preventDefault();event.stopPropagation();
  }
});
document.addEventListener('pointerdown',event=>{if(!$('workspace-context-menu').contains(event.target))closeWorkspaceContextMenu()});
document.addEventListener('focusin',event=>{if(!$('workspace-context-menu').contains(event.target))closeWorkspaceContextMenu()});
window.addEventListener('resize',()=>closeWorkspaceContextMenu());
document.addEventListener('scroll',()=>closeWorkspaceContextMenu(),true);
function closeWorkspaceMenu(restoreFocus=false){
  closeWorkspaceContextMenu();
  $('workspace-menu').hidden=true;$('choose-workspace').setAttribute('aria-expanded','false');
  if(restoreFocus)$('choose-workspace').focus();
}
function renderRecentWorkspaces(){
  const items=document.createDocumentFragment();
  const nameOrder=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
  const sortedWorkspaces=[...recentWorkspaces].sort((a,b)=>nameOrder.compare(a.name,b.name)||nameOrder.compare(a.root,b.root));
  for(const info of sortedWorkspaces){
    const row=document.createElement('div');row.className='recent-workspace-row';
    row.tabIndex=-1;row.dataset.workspaceKey=info.id||info.root;row.setAttribute('aria-haspopup','menu');
    row.oncontextmenu=event=>showWorkspaceContextMenu(event,info,row);
    const button=document.createElement('button');button.className='recent-workspace';button.title=info.root;
    button.dataset.workspaceKey=info.id||info.root;
    button.disabled=!!info.unavailable;
    if(info.unavailable)button.title=info.root+'（文件夹不可用，请重新添加）';
    const current=info.root===state.workspace?.root||!!info.id&&info.id===state.workspace?.id;
    if(current){button.setAttribute('aria-current','true');row.classList.add('current')}
    const name=document.createElement('strong');name.textContent=info.name+(current?' ✓':'');
    const path=document.createElement('small');path.textContent=info.unavailable?'文件夹不可用，请重新添加':info.root;
    button.append(name,path);button.onclick=()=>void chooseWorkspace(info.root,info.id);
    const finder=document.createElement('button');finder.className='recent-workspace-finder';finder.type='button';
    finder.dataset.workspaceKey=info.id||info.root;
    finder.disabled=!!info.unavailable;
    finder.title='在访达中打开';finder.setAttribute('aria-label','在访达中打开“'+info.name+'”');
    finder.innerHTML='<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7V5a1 1 0 0 1 1-1h5l2 3h9a1 1 0 0 1 1 1v3"/><path d="M3 7v12a1 1 0 0 0 1 1h15l3-10H7L4 20"/></svg>';
    finder.onclick=()=>void call('OpenRecentWorkspaceInFinder',info.id||info.root).catch(error=>toast(errorText(error)));
    row.onkeydown=event=>{
      if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10'){showWorkspaceContextMenu(event,info,row);return}
      if(event.isComposing||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
      event.preventDefault();(event.target===button?finder:button).focus();
    };
    row.append(button,finder);items.append(row);
  }
  if(!recentWorkspaces.length){const empty=document.createElement('p');empty.className='workspace-menu-empty';empty.textContent='还没有添加文件夹';items.append(empty)}
  $('recent-workspaces').replaceChildren(items);
}
async function refreshRecentWorkspaces(){
  const next=preview?(state.workspace?[state.workspace]:[]):await call('RecentWorkspaces');
  const unchanged=JSON.stringify(next)===JSON.stringify(recentWorkspaces);
  recentWorkspaces=next;
  const current=recentWorkspaces.find(info=>!info.unavailable&&info.id&&info.id===state.workspace?.id);
  if(current){
    state.workspace=current;
    $('workspace-name').textContent=current.name;$('workspace-detail').textContent=current.root;$('workspace-detail').title=current.root;
  }
  if(unchanged&&$('recent-workspaces').childNodes.length)return;
  closeWorkspaceContextMenu(true);
  const focused=document.activeElement,focusKey=focused?.dataset.workspaceKey,focusClass=focused?.className;
  renderRecentWorkspaces();
  if(focusKey&&!$('workspace-menu').hidden){
    const replacement=[...$('workspace-menu').querySelectorAll('button:not(:disabled)')].find(button=>button.dataset.workspaceKey===focusKey&&button.className===focusClass);
    (replacement||$('workspace-menu').querySelector('button:not(:disabled)'))?.focus();
  }
}
function refreshVisibleWorkspaceMenu(){
  if(!$('workspace-menu').hidden&&!state.navigating)void refreshRecentWorkspaces().catch(error=>toast('更新快捷文件夹失败：'+errorText(error)));
}
async function toggleWorkspaceMenu(){
  if(state.navigating)return;
  const open=$('workspace-menu').hidden;
  $('workspace-menu').hidden=!open;$('choose-workspace').setAttribute('aria-expanded',String(open));
  if(open){
    try{await refreshRecentWorkspaces()}catch(error){toast('更新快捷文件夹失败：'+errorText(error))}
    if(!$('workspace-menu').hidden)$('workspace-menu').querySelector('button:not(:disabled)')?.focus();
  }
}
async function chooseWorkspace(root,id){
  closeWorkspaceMenu(true);
  if(typeof root==='string'&&root===state.workspace?.root)return;
  if(preview){toast('请运行 OpenMind.app 选择本地工作区。');return}
  if(state.navigating)return;
  state.navigating=true;
  try{
    if(!await readyToNavigate())return;
    $('source-editor').readOnly=true;
    const workspace=await (typeof root==='string'?call('OpenRecentWorkspace',id||root):call('SelectWorkspace'));
    if(workspace){await setWorkspace(workspace);await refreshRecentWorkspaces()}
  }catch(e){banner(errorText(e))}finally{
    state.navigating=false;updateDocumentView();$('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor;
  }
}
$('add-workspace').onclick=()=>void chooseWorkspace();
document.addEventListener('pointerdown',event=>{if(!$('workspace-picker').contains(event.target))closeWorkspaceMenu()});
document.addEventListener('focusin',event=>{if(!$('workspace-picker').contains(event.target))closeWorkspaceMenu()});
$('workspace-picker').addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();closeWorkspaceMenu(true);return}
  if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
  event.preventDefault();
  if($('workspace-menu').hidden){toggleWorkspaceMenu();return}
  const buttons=[...$('workspace-menu').querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);
  const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;
  buttons[next].focus();
});
async function setWorkspace(workspace){
  mindHistory.clear();
  state.workspace=workspace;state.snapshot=null;state.selectedDir='';state.expanded=new Set(['']);state.directories.clear();state.queue.reset();state.draft=null;state.sourceOpen=false;map.clear();markdown.clear();updateDocumentView();
  $('workspace-name').textContent=workspace.name;$('workspace-detail').textContent=workspace.root;$('workspace-detail').title=workspace.root;
  $('welcome').hidden=false;$('zoom-controls').hidden=true;$('source-editor').value='';$('document-title').textContent='选择一份 Markdown';$('error-banner').hidden=true;
  setOutlineMode(false);renderOutline();await refreshTree();
}
async function refreshTree({duringDrag=false,afterMove=false}={}){
  if(!state.workspace||preview||state.fileDragging&&!duringDrag||state.fileMoving&&!afterMove)return;
  const generation=++state.treeGeneration;
  const dirs=[...state.expanded];
  const before=JSON.stringify([...state.directories]);
  await Promise.all(dirs.map(async dir=>{try{const entries=await call('ListDirectory',dir);if(generation===state.treeGeneration)state.directories.set(dir,entries)}catch(error){if(generation===state.treeGeneration){if(dir==='')banner('工作区暂时不可用：'+errorText(error));else {state.expanded.delete(dir);state.directories.delete(dir)}}}}));
  if(generation===state.treeGeneration&&(before!==JSON.stringify([...state.directories])||state.treeExpansionChanged)){state.treeExpansionChanged=false;renderTree();}
}
let outlineMode=false;
const mindOutlineActions={focus:true,collapse:true};
function renderOutline(){
  if(map.menuFromOutline)map.closeNodeMenu();
  const outline=$('document-outline'),fragment=document.createDocumentFragment();
  if(state.snapshot&&!isMindMapPath(state.snapshot.path)){
    for(const heading of markdown.headings()){
      const row=document.createElement('button');row.className='outline-row level-'+heading.level;row.textContent=heading.label||'空标题';row.title=heading.label;row.dataset.id=heading.id;
      row.onclick=()=>void focusMarkdownOutline(heading.id);fragment.append(row);
    }
    if(!fragment.childNodes.length){const hint=document.createElement('p');hint.className='tree-placeholder';hint.textContent='当前文档没有标题。';fragment.append(hint)}
    outline.replaceChildren(fragment);return;
  }
  function add(node,depth=1){
    if(map.focusedId&&depth>2)return;
    const level=map.focusedId?depth:node.level;
    if(map.focusedId||node.kind==='heading'&&(level===1||level===2)){
      const row=document.createElement('button');row.className='outline-row level-'+level;row.textContent=node.label||'空标题';row.title=node.label;row.dataset.id=node.id;
      const item=document.createElement('div');item.className='outline-item';
      const focus=document.createElement('button');focus.type='button';focus.className='outline-focus';focus.dataset.id=node.id;focus.setAttribute('aria-pressed',String(map.focusedId===node.id));focus.setAttribute('aria-label',(map.focusedId===node.id?'退出':'进入')+'“'+(node.label||'空标题')+'”聚焦模式');focus.innerHTML='<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14 10 7-7"/><path d="M20 10h-6V4"/><path d="m3 21 7-7"/><path d="M4 14h6v6"/></svg>';
      focus.onclick=()=>void toggleFocusMode(node.id,{fromOutline:true});
      focus.hidden=!mindOutlineActions.focus;
      const collapse=document.createElement('button');collapse.className='outline-collapse';collapse.dataset.id=node.id;collapse.innerHTML='<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';collapse.setAttribute('aria-label','折叠或展开“'+(node.label||'空标题')+'”下一层节点的子节点');collapse.disabled=!node.children.some(child=>child.children.length);
      collapse.onclick=()=>void focusOutline(node.id,{collapseChildren:true});
      collapse.hidden=!mindOutlineActions.collapse;
      row.onclick=()=>void focusOutline(node.id);
      item.addEventListener('click',event=>event.target.closest('button:not(:disabled)')?.focus({preventScroll:true}));
      item.addEventListener('keydown',event=>{
        if(event.isComposing||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
        const buttons=[...item.querySelectorAll('button:not(:disabled):not([hidden])')],index=buttons.indexOf(event.target);
        if(index<0)return;
        event.preventDefault();event.stopPropagation();
        buttons[(index+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length].focus({preventScroll:true});
      });
      item.append(row,focus,collapse);fragment.append(item);
    }
    for(const child of node.children)add(child,depth+1);
  }
  if(state.snapshot)add(map.focusedId?map.viewRoot:state.snapshot.root);
  if(!fragment.childNodes.length){const hint=document.createElement('p');hint.className='tree-placeholder';hint.textContent=state.snapshot?(map.focusedId?'当前分支没有一级或二级标题。':'当前文档没有一级或二级标题。'):'打开一份 Markdown 查看大纲。';fragment.append(hint)}
  outline.replaceChildren(fragment);updateOutlineCollapseButtons();
}
function updateOutlineCollapseButtons(){
  const nodes=new Map();
  function add(node){if(!node)return;nodes.set(node.id,node);for(const child of node.children)add(child)}
  add(map.root);
  for(const button of $('document-outline').querySelectorAll('.outline-collapse')){
    const node=nodes.get(button.dataset.id),children=node?.children.filter(child=>child.children.length)||[];
    if(!children.length){button.removeAttribute('aria-expanded');continue}
    button.setAttribute('aria-expanded',String(!children.every(child=>map.collapsed.has(child.id))));
  }
}
async function focusMarkdownOutline(id){
  if(state.navigating||!state.snapshot)return;
  if(state.sourceOpen&&!await toggleSource(false))return;
  if(!markdown.focusHeading(id))return;
  for(const row of $('document-outline').querySelectorAll('.outline-row')){const selected=row.dataset.id===id;row.classList.toggle('selected',selected);if(selected)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current')}
}
async function focusOutline(id,{collapseChildren=false}={}){
  if(state.navigating||!state.snapshot)return;
  const path=nodePath(state.snapshot.root,id);if(!path)return;
  state.navigating=true;
  try{
    if(!await readyToNavigate())return;
    const node=nodeAtPath(state.snapshot.root,path);if(!node)return;
    const before=collapseChildren?map.layout?.positions.find(p=>p.id===node.id):null;
    for(let depth=0;depth<path.length;depth++)map.collapsed.delete(nodeAtPath(state.snapshot.root,path.slice(0,depth))?.id);
    if(collapseChildren){
      const children=node.children.filter(child=>child.children.length);
      const expand=children.every(child=>map.collapsed.has(child.id));
      map.collapsed.delete(node.id);
      for(const child of children)if(expand)map.collapsed.delete(child.id);else map.collapsed.add(child.id);
    }
    map.selected=node.id;map.setRoot(state.snapshot.root);
    const position=map.layout.positions.find(p=>p.id===node.id);if(!position)return;
    if(collapseChildren){
      if(before){map.x+=(before.x-position.x)*map.scale;map.y+=(before.y-position.y)*map.scale;map.schedule()}
    }else map.focusBranch(node.id);
    for(const row of $('document-outline').querySelectorAll('.outline-row')){const selected=row.dataset.id===node.id;row.classList.toggle('selected',selected);if(selected)row.setAttribute('aria-current','true');else row.removeAttribute('aria-current')}
  }catch(error){banner(errorText(error))}finally{state.navigating=false;updateDocumentView();$('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor}
}
function renderTree(){
  fileTreeHover.hide();
  fileActions.closeMenu();
  const tree=$('file-tree');if(!state.workspace)return;const fragment=document.createDocumentFragment();
  function add(dir,depth){for(const entry of state.directories.get(dir)||[]){
    const row=document.createElement('button');row.className='tree-row'+(state.snapshot?.path===entry.path?' selected':'')+(entry.directory&&state.selectedDir===entry.path?' dir-selected':'');row.style.paddingLeft=(9+depth*16)+'px';
    row.dataset.path=entry.path;row.dataset.name=entry.name;row.dataset.directory=String(entry.directory);
    if(fileTreeDrag.source===entry.path)row.classList.add('file-drag-source');
    const arrow=document.createElement('span');arrow.className='tree-arrow';arrow.setAttribute('aria-hidden','true');
    if(entry.directory){arrow.classList.toggle('expanded',state.expanded.has(entry.path));arrow.innerHTML='<svg viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2 6 4.5 3 7"/></svg>';}
    const symbol=document.createElement('span');symbol.className='tree-symbol';symbol.textContent=entry.directory?'▱':isMindMapPath(entry.path)?'⋈':'≡';
    const name=document.createElement('span');name.className='tree-name';name.textContent=entry.directory?entry.name:hideFileExtensions?entry.name.replace(/\.(mind\.md|md|markdown)$/i,''):isMindMapPath(entry.path)?entry.name.replace(/\.md$/i,''):entry.name;
    row.append(arrow,symbol,name);fragment.append(row);
    fileActions.bindRow(row,entry);
    row.addEventListener('click',async()=>{fileActions.closeMenu();if(state.navigating||state.closing)return;if(entry.directory){state.selectedDir=entry.path;if(state.expanded.has(entry.path))state.expanded.delete(entry.path);else state.expanded.add(entry.path);state.treeExpansionChanged=true;await refreshTree();}else await openDocument(entry.path)});
    if(entry.directory&&state.expanded.has(entry.path))add(entry.path,depth+1);
  }}
  add('',0);if(!fragment.childNodes.length){const p=document.createElement('p');p.className='tree-placeholder';p.textContent='这里还没有 Markdown。点击 + 创建第一份。';fragment.append(p)}
  tree.replaceChildren(fragment);
}
async function openDocument(path){
  if(compactWindow&&isMindMapPath(path)){toast('请先通过右上角按钮返回主窗口，再打开思维导图。');return}
  if(preview){const {previewDocuments}=await import('./preview.js');const snapshot=previewDocuments.find(snapshot=>snapshot.path===path);if(snapshot){map.collapsed.clear();map.selected=null;applySnapshot(snapshot,{resetView:true});resetSourceInput()}return}
  if(state.navigating)return;state.navigating=true;
  try{if(!await readyToNavigate())return;const snapshot=await call('OpenDocument',path);state.queue.reset();state.draft=null;state.blocked=false;map.collapsed.clear();map.selected=null;$('error-banner').hidden=true;state.selectedDir=path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';applySnapshot(snapshot,{resetView:true});resetSourceInput()}catch(e){banner(errorText(e))}finally{state.navigating=false;updateDocumentView();$('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor}
}

const externalFiles=[];
let externalFilesReady=false,openingExternalFiles=null,externalFileRetry=null;
async function receiveExternalFiles(){
  try{
    externalFiles.push(...(await call('TakePendingFileOpens')||[]));
    if(externalFilesReady)await processExternalFiles();
  }catch(error){banner('无法接收系统打开请求：'+errorText(error))}
}
function processExternalFiles(){
  if(openingExternalFiles)return openingExternalFiles;
  clearTimeout(externalFileRetry);
  openingExternalFiles=(async()=>{
    while(externalFiles.length){
      if(state.navigating||state.checking||state.closing||state.blocked||state.composing||state.fileDragging||state.fileMoving||state.nodeDragging||addingChild||deletingNode||movingNode||switchingSettings||switchingCompactWindow||fileActions.active||document.querySelector('dialog[open]'))return;
      if(compactWindow&&!await setCompactWindow(false))return;
      if(!$('settings-page').hidden){
        await toggleSettings(false);
        if(!$('settings-page').hidden)return;
      }
      state.navigating=true;
      try{
        if(!await readyToNavigate())return;
        const path=externalFiles.shift();
        const result=await call('OpenExternalDocument',path);
        if(state.workspace?.root!==result.workspace.root)await setWorkspace(result.workspace);
        state.queue.reset();state.draft=null;state.blocked=false;
        map.collapsed.clear();map.selected=null;$('error-banner').hidden=true;
        state.selectedDir=result.snapshot.path.includes('/')?result.snapshot.path.slice(0,result.snapshot.path.lastIndexOf('/')):'';
        const parts=state.selectedDir.split('/').filter(Boolean);
        for(let i=1;i<=parts.length;i++)state.expanded.add(parts.slice(0,i).join('/'));
        applySnapshot(result.snapshot,{resetView:true});resetSourceInput();
        setOutlineMode(true);documentSearch.close(false);
        await refreshTree();await refreshRecentWorkspaces();
      }catch(error){banner('无法打开文件：'+errorText(error))}
      finally{state.navigating=false;updateDocumentView();$('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor}
    }
  })().catch(error=>banner('无法打开文件：'+errorText(error))).finally(()=>{
    openingExternalFiles=null;
    if(externalFiles.length)externalFileRetry=setTimeout(()=>void processExternalFiles(),250);
  });
  return openingExternalFiles;
}

async function checkExternal(){
  if(state.fileDragging||map.nodeDrag||preview||state.navigating||!state.snapshot||state.checking||addingChild||deletingNode||movingNode||state.queue.pending||state.blocked||state.composing||state.closing||finishing)return;
  state.checking=true;
  try{
    const snapshot=await call('CheckDocument');
    if(snapshot){
      if(state.composing){state.blocked=true;setEditorsReadOnly();banner('外部修改与输入法文字同时发生，请确认输入后保留草稿并重新读取。',true);return}
      if(state.queue.pending){state.blocked=true;setEditorsReadOnly();banner('外部修改与本地输入同时发生，请保留本地草稿后重新读取。',true);return}
      if(state.editor){state.editor.remove();state.editor=null;map.editor=null;map.editing=null;toast('外部文件已更新，导图已同步。')}
      state.draft=null;map.collapsed.clear();map.selected=null;applySnapshot(snapshot,{external:true});resetSourceInput();
    }
  }catch(error){banner('外部文件暂时不可读：'+errorText(error),true)}finally{state.checking=false}
}

async function toggleSource(open=!state.sourceOpen){
  if(compactWindow||switchingCompactWindow)return false;
  if(!state.snapshot||state.navigating||open&&!sourceViewEnabled)return false;
  state.navigating=true;
  try{
    if(!await readyToNavigate())return false;
    state.sourceOpen=open;updateDocumentView();
    if(!isMindMapPath(state.snapshot.path)&&!open)markdown.load(state.snapshot.source,{session:state.snapshot.session,path:state.snapshot.path});
    if(open){$('source-editor').value=state.snapshot.source;resetSourceInput();$('source-editor').focus()}
    else if(!isMindMapPath(state.snapshot.path))markdown.focus();
    return true;
  }finally{state.navigating=false;updateDocumentView();$('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor;map.schedule();documentSearch.refresh({jump:true})}
}
function setSourceViewEnabled(enabled){
  sourceViewEnabled=enabled;
  if(!enabled&&state.sourceOpen){
    if(state.snapshot&&!isMindMapPath(state.snapshot.path))markdown.load(state.snapshot.source,{session:state.snapshot.session,path:state.snapshot.path});
    state.sourceOpen=false;
  }
  updateDocumentView();
}
const sidebarCollapse=createSidebarCollapse({sidebar:$('sidebar'),button:$('toggle-sidebar'),root:document.body,beforeChange:()=>{fileTreeDrag.cancel();closeWorkspaceMenu()}});
const settings=mountSettings({
  container:$('settings-options'),
  features:[sidebarCollapse,{
    id:'hideFileExtensions',group:'通用设置',label:'隐藏文件后缀',description:'文件树隐藏 .md、.markdown 和 .mind.md 后缀。',
    enable:()=>{hideFileExtensions=true;renderTree()},disable:()=>{hideFileExtensions=false;renderTree()}
  },{
    id:'expandFileNameOnHover',group:'通用设置',label:'悬停展开文件名',description:'名称显示省略号时，悬停可让文字和背景向右展开，适用于文件和文件夹。',
    enable:()=>fileTreeHover.setEnabled(true),disable:()=>fileTreeHover.setEnabled(false)
  },{
    id:'sourceView',group:'通用设置',label:'启用原文功能',description:'在 mind 和 md 模式中显示「原文」按钮，关闭后返回导图或正文。',
    enable:()=>setSourceViewEnabled(true),disable:()=>setSourceViewEnabled(false)
  },{
    id:'mindStyle',group:'mind模式',label:'渲染风格',description:'选择导图外观。',
    options:[{value:'processon',label:'processon'},{value:'mindnode',label:'MindNode'}],
    select:value=>map.setStyle(value)
  },{
    id:'mindNodeMaxWidth',group:'mind模式',label:'节点最大宽度',description:'文本换行宽度，默认 340px；数值越大，每行可显示的文字越多。',
    type:'number',min:160,max:1600,default:340,select:value=>map.setNodeMaxWidth(value)
  },{
    id:'mindMainNodeMark',group:'mind模式',label:'主节点标记',description:'显示主节点背景，关闭后保留特殊字体。',
    enable:()=>map.setNodeMark('main',true),disable:()=>map.setNodeMark('main',false)
  },{
    id:'mindSecondNodeMark',group:'mind模式',label:'二级节点标记',description:'显示二级节点背景，关闭后保留特殊字体。',
    enable:()=>map.setNodeMark('second',true),disable:()=>map.setNodeMark('second',false)
  },{
    id:'mindZoomControls',group:'mind模式',label:'显示缩放控件',description:'在 mind 模式的右下角显示缩小、缩放比例、放大和适应窗口控件。',
    enable:()=>{mindZoomControlsEnabled=true;updateDocumentView()},disable:()=>{mindZoomControlsEnabled=false;updateDocumentView()}
  },{
    id:'mindCopyTree',group:'mind模式',label:'启用复制树',description:'在节点右键菜单中显示「复制树」，复制当前节点及全部子节点的 Markdown。⌘C 仅复制当前节点文本。',
    enable:()=>{map.copyTreeEnabled=true},disable:()=>{map.copyTreeEnabled=false;map.closeNodeMenu()}
  },{
    id:'mindOutlineFocus',group:'mind模式',label:'显示大纲聚焦按钮',description:'在 mind 模式的侧面大纲中显示聚焦按钮。',
    enable:()=>{mindOutlineActions.focus=true;renderOutline()},disable:()=>{mindOutlineActions.focus=false;renderOutline()}
  },{
    id:'mindOutlineCollapse',group:'mind模式',label:'显示大纲折叠按钮',description:'在 mind 模式的侧面大纲中显示折叠按钮。',
    enable:()=>{mindOutlineActions.collapse=true;renderOutline()},disable:()=>{mindOutlineActions.collapse=false;renderOutline()}
  },{
    id:'mindDoubleClickCreateMain',group:'mind模式',label:'双击新建一级节点',description:'在 mind 模式中双击画布空白处新建一级节点。',
    enable:()=>{map.doubleClickCreateMain=true},disable:()=>{map.doubleClickCreateMain=false}
  },{
    id:'mdCompactWindow',group:'md模式',label:'启用便签小窗',description:'在 md 模式中显示便签小窗入口，可在置顶小窗中编辑文档。',
    enable:()=>{mdCompactWindowEnabled=true;updateDocumentView()},disable:()=>{mdCompactWindowEnabled=false;updateDocumentView()}
  }],
  storage:preview
    ?{load:async()=>({mdCompactWindow:true,hideFileExtensions:false,mindStyle:'processon',mindNodeMaxWidth:340,mindMainNodeMark:true,mindSecondNodeMark:true,sidebarCollapse:true,mindOutlineFocus:true,mindOutlineCollapse:true,mindDoubleClickCreateMain:true,sourceView:true,mindZoomControls:true,mindCopyTree:true}),save:async()=>{}}
    :{load:()=>call('GetSettings'),save:value=>call('SaveSettings',value)}
});
$('choose-workspace').onclick=toggleWorkspaceMenu;
function setOutlineMode(enabled){
  fileTreeDrag.cancel();
  map.closeNodeMenu();
  closeWorkspaceMenu();outlineMode=enabled;
  $('file-tree').hidden=outlineMode;$('document-outline').hidden=!outlineMode;$('file-actions').hidden=outlineMode;$('sidebar-title').textContent=outlineMode?'大纲':'文件';
  const button=$('toggle-outline'),label=outlineMode?'切换到文件':'切换到大纲';button.setAttribute('aria-pressed',String(outlineMode));button.setAttribute('aria-label',label);button.title=label+'（⌥⌘L）';
  sidebarCollapse.expand();
}
$('toggle-outline').onclick=()=>{if(!compactWindow&&!switchingCompactWindow)setOutlineMode(!outlineMode)};
document.addEventListener('keydown',event=>{
  if(event.isComposing||event.keyCode===229||!event.metaKey||!event.altKey||event.ctrlKey||event.shiftKey||event.code!=='KeyL'||$('toggle-outline').disabled)return;
  event.preventDefault();
  event.stopImmediatePropagation();
  if(!event.repeat)$('toggle-outline').click();
},true);
$('toggle-source').onclick=()=>void toggleSource();
$('markdown-editor').addEventListener('click',event=>{
  const link=event.target.closest('a'),inline=event.target.closest('[data-type="a"]');
  if(!link&&(!inline||!event.metaKey&&!event.ctrlKey))return;
  event.preventDefault();event.stopPropagation();
  const href=link?link.getAttribute('href'):inline.querySelector('.vditor-ir__marker--link')?.textContent;if(!href||!state.snapshot)return;
  const base=documentAssetBase(state.snapshot.session,state.snapshot.path);
  try{
    const url=new URL(href,new URL(base,location.href));
    const target=markdownLinkTarget(href,base);
    if(target){void openDocument(target).then(()=>{if(state.snapshot?.path===target&&!isMindMapPath(target))markdown.focusAnchor(url.hash)});return}
    if(url.hash&&url.origin===location.origin){markdown.focusAnchor(url.hash);return}
    if(['http:','https:','mailto:'].includes(url.protocol)){if(native)window.runtime.BrowserOpenURL(url.href);else window.open(url.href,'_blank','noopener');return}
    toast('当前链接无法打开。');
  }catch{toast('当前链接无法打开。')}
},true);
$('zoom-in').onclick=()=>map.zoom(1.15);$('zoom-out').onclick=()=>map.zoom(1/1.15);$('fit-map').onclick=()=>map.fit();
$('dismiss-error').onclick=()=>{if(state.blocked)toast('写入已暂停，请先保留草稿并重新读取。');else $('error-banner').hidden=true};
$('document-title').ondblclick=()=>{if(state.snapshot&&!compactWindow)void call('RevealDocument',state.snapshot.path).catch(e=>toast(errorText(e)))};
$('reload-document').onclick=async()=>{
  if(!state.snapshot)return;
  try{
    await state.queue.drain();const recovery=await preserveDraft();const path=state.snapshot.path;
    const snapshot=await call('OpenDocument',path);
    state.editor?.remove();state.editor=null;map.editor=null;map.editing=null;state.blocked=false;state.queue.reset();state.draft=null;map.collapsed.clear();
    applySnapshot(snapshot,{external:true});resetSourceInput();$('error-banner').hidden=true;toast('已重新读取文件。本地草稿已保留到恢复目录。');state.recoveryPath=recovery;
  }catch(error){banner(errorText(error)+'；窗口中的本地内容仍被保留。',true)}
};

let createDirectory=false,createParent='';
async function beginCreate(directory,parent=state.selectedDir){if(state.navigating||state.checking||state.closing||document.querySelector('dialog[open]'))return;if(preview){toast('只读预览不能创建文件。');return}if(!state.workspace){await chooseWorkspace();if(!state.workspace)return;parent=''}if(!await readyToNavigate())return;createDirectory=directory;createParent=parent;$('create-title').textContent=directory?'新建文件夹':'新建 Markdown';$('document-kind-field').hidden=directory;$('create-form').elements.namedItem('document-kind').value='markdown';$('create-location').textContent='位置：'+state.workspace.name+'/'+createParent;$('entry-name').value='';$('entry-name').placeholder=directory?'文件夹名称':'文档名称';$('create-error').textContent='';$('create-dialog').showModal();$('entry-name').focus()}
$('new-file').onclick=()=>void beginCreate(false);$('new-folder').onclick=()=>void beginCreate(true);$('cancel-create').onclick=()=>$('create-dialog').close();
$('create-form').onsubmit=async event=>{event.preventDefault();const submit=event.submitter;submit.disabled=true;try{const name=createDirectory?$('entry-name').value:newDocumentName($('entry-name').value,$('create-form').elements.namedItem('document-kind').value==='mindmap');const path=await call('CreateEntry',createParent,name,createDirectory);$('create-dialog').close();state.expanded.add(createParent);await refreshTree();if(!createDirectory)await openDocument(path)}catch(error){$('create-error').textContent=errorText(error)}finally{submit.disabled=false}};

let switchingSettings=false;
let workspaceFocus=null;
async function toggleSettings(open=$('settings-page').hidden){
  if(compactWindow||switchingCompactWindow)return;
  if(switchingSettings||state.closing)return;
  const page=$('settings-page');
  if(!open){
    if(page.hidden)return;
    switchingSettings=true;
    try{
      if(page.contains(document.activeElement))document.activeElement.blur();
      await settings.flush();
      if(state.closing)return;
      page.hidden=true;document.body.classList.remove('settings-open');
      updateDocumentView();$('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor;
      map.render();
      const restoredFocus=workspaceFocus?.matches('.mind-node')&&!workspaceFocus.isConnected?map.elements.get(workspaceFocus.dataset.id):workspaceFocus;
      const target=restoredFocus?.isConnected&&restoredFocus.getClientRects().length?restoredFocus:state.snapshot&&!isMindMapPath(state.snapshot.path)?markdown.editable:$('canvas');
      target.focus({preventScroll:true});workspaceFocus=null;
    }finally{switchingSettings=false}
    return;
  }
  if(state.navigating||state.checking||document.querySelector('dialog[open]'))return;
  switchingSettings=true;state.navigating=true;++editRequest;
  const previousFocus=document.activeElement;
  try{
    if(!await readyToNavigate())return;
    workspaceFocus=previousFocus;
    closeWorkspaceMenu();
    document.body.classList.add('settings-open');page.hidden=false;page.focus({preventScroll:true});
    documentSearch.close(false);
  }catch(error){banner(errorText(error))}
  finally{switchingSettings=false;state.navigating=false;if(page.hidden){updateDocumentView();$('source-editor').readOnly=preview||state.blocked||state.closing||!!state.editor}}
}
$('back-from-settings').onclick=()=>void toggleSettings(false);
document.addEventListener('keydown',event=>{
  if(event.key!=='F12'||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
  event.preventDefault();event.stopPropagation();
  if(!event.repeat&&!event.isComposing)void toggleSettings();
},true);
document.addEventListener('keydown',event=>{if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s')event.preventDefault()});
async function closeApp(windowOnly=false){
  if(switchingCompactWindow){toast('正在切换窗口，请稍后再关闭。');return}
  if(state.fileDragging||state.fileMoving){toast('正在移动文件，请稍后再退出。');return}
  if(fileActions.active){toast('请先完成或取消文件操作，再退出。');return}
  if(state.nodeDragging||addingChild||deletingNode||movingNode){toast('正在处理节点，请稍后再退出。');return}
  if(state.closing)return;state.closing=true;
  await markdown.imageTask;
  try{document.activeElement?.blur();await new Promise(resolve=>setTimeout(resolve,0));if(state.composing){state.closing=false;toast('请先确认输入法中的文字再退出。');return}if(state.snapshot&&!isMindMapPath(state.snapshot.path)&&!state.sourceOpen)markdown.flush();setEditorsReadOnly();await settings.flush();await state.queue.drain();if(state.blocked||state.queue.failed)await preserveDraft();await call(windowOnly?'FinishWindowClose':'FinishClose');if(windowOnly){state.closing=false;updateDocumentView();$('source-editor').readOnly=preview||state.blocked||!!state.editor}}
  catch(error){state.closing=false;updateDocumentView();$('source-editor').readOnly=preview||state.blocked||!!state.editor;banner('暂时无法退出：'+errorText(error)+'。请保留窗口并处理错误。',state.blocked)}
}

await Promise.all([settings.ready,markdown.ready]);
const tableActions=markdown.tableActions=new TableActions(markdown);
if(native){
  window.runtime.EventsOn('workspace:changed',()=>{void refreshTree();void checkExternal();refreshVisibleWorkspaceMenu()});
  window.runtime.EventsOn('document:check',()=>{void checkExternal();refreshVisibleWorkspaceMenu()});
  window.runtime.EventsOn('app:closing',()=>void closeApp());
  window.runtime.EventsOn('window:closing',()=>void closeApp(true));
  window.runtime.EventsOn('document:open-requested',()=>void receiveExternalFiles());
  await receiveExternalFiles();
  window.addEventListener('focus',()=>{void refreshTree();void checkExternal();refreshVisibleWorkspaceMenu()});
  if(!externalFiles.length){
    try{const workspace=await call('RestoreWorkspace');if(workspace)await setWorkspace(workspace)}catch(error){banner('上次的工作区暂时不可用，请重新选择文件夹。'+errorText(error))}
  }
  externalFilesReady=true;
  await call('FrontendReady');
  await receiveExternalFiles();
  window.runtime.WindowShow();
}else{
  const {previewSnapshot,previewDocuments}=await import('./preview.js');
  state.workspace={root:'只读界面预览',name:'我的知识库'};
  state.directories.set('',previewDocuments.map(snapshot=>({path:snapshot.path,name:snapshot.path,directory:false})));
  $('workspace-name').textContent='我的知识库';$('workspace-detail').textContent='界面预览 · 不读写磁盘';
  applySnapshot(previewSnapshot,{resetView:true});resetSourceInput();
}

try{await refreshRecentWorkspaces()}catch(error){banner('读取快捷文件夹失败：'+errorText(error))}
