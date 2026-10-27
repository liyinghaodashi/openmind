import {documentAssetBase} from './document-mode.js';
import {TableDialog} from './features/table-dialog.js';
import {bindImageImport} from './features/image-import.js';

export class MarkdownEditor {
  constructor({container,onInput,onComposition,onBeforeInput,onOutline,images}) {
    Object.assign(this,{container,onInput,onComposition,onBeforeInput,onOutline});
    this.loaded=false;this.composing=false;this.readOnly=true;this.source='';this.normalized='';
    this.imageGeneration=0;
    if(images)bindImageImport(this,images);
    container.addEventListener('compositionstart',()=>{this.headingContinuation=null;this.composing=true;this.onComposition(true)},true);
    container.addEventListener('compositionend',()=>{this.composing=false;this.onComposition(false);this.flush()});
    container.addEventListener('beforeinput',event=>{
      if(this.readOnly||!this.onBeforeInput(this.source,event)){event.preventDefault();return}
      this.handleHeadingContinuation(event);
    },true);
    container.addEventListener('input',event=>{if(event.inputType==='insertParagraph'&&this.headingContinuation)this.headingContinuation.source=this.editor.getValue();if(!event.isComposing)this.flush()});
    container.addEventListener('click',event=>{
      if(event.target.tagName!=='IMG'||!this.editable?.contains(event.target))return;
      const node=event.target.closest('.vditor-ir__node[data-type="img"]');
      if(!node)return;
      event.preventDefault();event.stopImmediatePropagation();
      this.editable.focus();
      const range=document.createRange();range.setStartAfter(node);range.collapse(true);
      const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    },true);
    container.addEventListener('click',event=>{if(event.target.matches('input[type=checkbox]')&&(this.readOnly||!this.onBeforeInput(this.source,event))){event.preventDefault();event.stopImmediatePropagation()}},true);
    container.addEventListener('click',event=>{
      if(this.readOnly||event.defaultPrevented||!event.target.matches('input[type=checkbox]')||!this.editable?.contains(event.target))return;
      const selection=window.getSelection();
      if(selection&&this.editable.contains(selection.anchorNode))selection.removeAllRanges();
    });
    container.addEventListener('paste',event=>{this.headingContinuation=null;const text=event.clipboardData?.getData('text')||'';if(this.readOnly||!this.onBeforeInput(this.source,{data:text})){event.preventDefault();event.stopImmediatePropagation()}},true);
    container.addEventListener('pointerdown',()=>{this.headingContinuation=null},true);
    container.addEventListener('keydown',event=>{this.headingContinuation=null;this.handleShortcut(event)},true);
    this.ready=new Promise(resolve=>{
      this.editor=new window.Vditor(container,{
        cdn:'/src/vendor/vditor',mode:'ir',lang:'zh_CN',height:'100%',
        cache:{enable:false},placeholder:'从这里开始写作…',undoDelay:0,
        toolbar:['headings','bold','italic','strike',{name:'link',hotkey:''},{name:'list',hotkey:'⌘]'},{name:'ordered-list',hotkey:'⌘['},'check','quote',{name:'code',hotkey:'⌘K'},'inline-code',{name:'table',hotkey:''},'undo','redo'],
        toolbarConfig:{hide:true},counter:{enable:false},outline:{enable:false},
        hint:{emoji:{},emojiTail:'',parse:false},
        preview:{maxWidth:800,hljs:{enable:false,langs:[]},markdown:{codeBlockPreview:false,mathBlockPreview:false,autoSpace:false,fixTermTypo:false,listStyle:true,sanitize:true},render:{media:{enable:false}}},
        link:{isOpen:false},image:{isPreview:false},
        input:()=>this.flush(),
        after:()=>{this.editor.vditor.lute.SetInlineMath(false);this.editable=container.querySelector('.vditor-ir [contenteditable]');this.editable.setAttribute('aria-label','Markdown 正文编辑器');this.editable.setAttribute('role','textbox');this.editable.setAttribute('aria-multiline','true');this.editable.setAttribute('aria-readonly','true');this.editor.disabled();resolve()}
      });
    });
  }
  handleHeadingContinuation(event) {
    const pending=this.headingContinuation;this.headingContinuation=null;
    if(this.composing||event.isComposing||!this.loaded)return;
    const selection=window.getSelection();
    if(!selection?.rangeCount||!selection.isCollapsed||!this.editable?.contains(selection.anchorNode))return;
    const range=selection.getRangeAt(0),start=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement;
    const paragraph=start.closest('p');
    if(pending&&event.inputType==='insertText'&&event.data?.trimEnd()===pending.marker&&this.editor.getValue()===pending.source&&paragraph?.parentElement===this.editable&&paragraph.previousElementSibling?.matches('h1,h2,h3,h4,h5,h6')&&!paragraph.textContent.replace(/\u200B/g,'').trim()){
      event.preventDefault();return;
    }
    if(event.inputType!=='insertParagraph')return;
    const heading=start.closest('h1,h2,h3,h4,h5,h6');
    if(heading?.parentElement!==this.editable)return;
    const tail=range.cloneRange();tail.setEnd(heading,heading.childNodes.length);
    if(tail.toString().replace(/\u200B/g,''))return;
    const label=heading.cloneNode(true);label.querySelectorAll('.vditor-ir__marker').forEach(marker=>marker.remove());
    const number=/^\s*([0-9]+)([.)])/.exec(label.textContent);
    if(number)this.headingContinuation={marker:String(BigInt(number[1])+1n)+number[2],source:this.editor.getValue()};
  }
  handleShortcut(event) {
    if(!event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!this.editable?.contains(event.target))return;
    const key=event.key.toLowerCase(),heading=/^[1-5]$/.test(key);
    const command=heading?'headings':({'[':'ordered-list',']':'list',k:'code',t:'table'})[key];
    if(!command)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(!this.loaded||this.readOnly||this.composing||event.isComposing||event.keyCode===229||event.repeat)return;
    const selection=window.getSelection();
    if(!selection?.rangeCount||!this.editable.contains(selection.anchorNode)||!this.editable.contains(selection.focusNode))return;
    const range=selection.getRangeAt(0);
    for(const node of [range.startContainer,range.endContainer]){
      const element=node.nodeType===Node.ELEMENT_NODE?node:node.parentElement;
      const block=element.closest('pre,code,table');
      if(block&&block!==this.editable&&this.editable.contains(block))return;
    }
    if(!this.onBeforeInput(this.currentSource(),event))return;
    if(command==='table'){void this.insertTable(range.cloneRange());return}
    const start=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement;
    const item=command==='code'?start.closest('li'):null;
    if(item&&item.contains(range.endContainer)){this.insertListCode(range,item);return}
    const toolbar=this.editor.vditor.toolbar.elements[command];
    if(toolbar.firstElementChild.classList.contains('vditor-menu--disabled'))return;
    const currentHeading=heading?start.closest('h'+key):null;
    const toggleOff=currentHeading&&currentHeading.contains(range.endContainer);
    const button=heading&&!toggleOff?toolbar.querySelector('[data-tag="h'+key+'"]'):toolbar.firstElementChild;
    if(toggleOff)button.classList.add('vditor-menu--current');
    button.click();
    this.flush();
  }
  insertListCode(range,item) {
    const block=document.createElement('div');
    block.innerHTML=this.editor.vditor.lute.Md2VditorIRDOM('```\n\n```\n');
    const code=block.querySelector('pre code');
    const text=range.toString();code.textContent=text;code.append(document.createElement('wbr'));
    if(!text)code.append('\n');
    if(range.collapsed&&!item.textContent.replace(/\u200B/g,'').trim()&&!item.querySelector('img,input,pre,ul,ol,table,hr')&&item.previousElementSibling?.matches('li')){
      range.selectNodeContents(item.previousElementSibling);range.collapse(false);item.remove();
    }else range.deleteContents();
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    this.editor.insertValue(block.innerHTML);this.flush();
  }
  async insertTable(range) {
    if(this.tableDialog?.element.open)return;
    const source=this.currentSource(),session=this.session,path=this.path;
    this.tableDialog??=new TableDialog();
    const size=await this.tableDialog.open();
    if(!this.loaded||this.readOnly||this.session!==session||this.path!==path||this.currentSource()!==source||!this.editable.contains(range.startContainer)||!this.editable.contains(range.endContainer))return;
    this.editable.focus({preventScroll:true});
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    if(!size)return;
    const {rows,columns}=size;
    const row='|'+Array(columns).fill('   ').join('|')+'|\n';
    const text='\n\n'+row+'|'+Array(columns).fill(' --- ').join('|')+'|\n'+row.repeat(rows-1)+'\n';
    if(!this.onBeforeInput(source,{data:text}))return;
    range.collapse(false);
    const existing=new Set(this.editable.querySelectorAll('table'));
    this.tableActions?.rememberLayouts();
    this.editor.insertMD(text);
    const table=[...this.editable.querySelectorAll('table')].find(table=>!existing.has(table));
    const cell=table?.querySelector('th,td');
    if(table)this.tableActions?.inserted(table);
    if(cell){range.selectNodeContents(cell);range.collapse(true);selection.removeAllRanges();selection.addRange(range);cell.scrollIntoView({block:'nearest'})}
    this.flush();
  }
  replaceTable(table,html) {
    if(!this.loaded||this.readOnly||this.composing||!this.editable.contains(table)||!this.onBeforeInput(this.currentSource(),{data:html}))return false;
    const index=this.tableActions?.tableIndex(table);
    this.tableActions?.rememberLayouts();
    this.editable.focus({preventScroll:true});
    const range=document.createRange();range.selectNode(table);
    const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
    this.editor.updateValue(html);this.flush();
    if(!html.includes('<table'))this.tableActions?.removed(index);
    else{
      this.tableActions?.rememberLayouts();
      const replacement=this.editable.querySelectorAll('table')[index],cell=replacement?.querySelector('th,td');
      if(cell){range.selectNodeContents(cell);range.collapse(true);selection.removeAllRanges();selection.addRange(range)}
    }
    return true;
  }
  async resizeTable(table) {
    if(!this.loaded||this.readOnly||this.composing||!this.editable.contains(table)||this.tableDialog?.element.open)return;
    const source=this.currentSource(),session=this.session,path=this.path;
    const selection=window.getSelection(),origin=selection.rangeCount?selection.getRangeAt(0).cloneRange():null;
    const rows=table.rows.length,columns=table.rows[0].cells.length;
    const requiresConfirmation=(rowCount,columnCount)=>[...table.rows].some((row,rowIndex)=>[...row.cells].some((cell,columnIndex)=>(rowIndex>=rowCount||columnIndex>=columnCount)&&(cell.textContent.replace(/\u200b/g,'').trim()||cell.querySelector('img'))));
    this.tableDialog??=new TableDialog();
    const size=await this.tableDialog.open({rows,columns,title:'调整表格',action:'应用',requiresConfirmation});
    if(!this.loaded||this.readOnly||this.session!==session||this.path!==path||this.currentSource()!==source||!this.editable.contains(table))return;
    this.editable.focus({preventScroll:true});
    if(!size){if(origin&&this.editable.contains(origin.startContainer)){selection.removeAllRanges();selection.addRange(origin)}return}
    if(size.rows===rows&&size.columns===columns)return;
    const clone=table.cloneNode(true);
    while(clone.rows.length>size.rows)clone.deleteRow(-1);
    while(clone.rows.length<size.rows){
      const body=clone.tBodies[0]||clone.createTBody(),row=body.insertRow();
      for(let column=0;column<columns;column++){
        const cell=row.insertCell();
        const align=clone.rows[0].cells[column].getAttribute('align');if(align)cell.setAttribute('align',align);
      }
    }
    for(const row of clone.rows){
      while(row.cells.length>size.columns)row.deleteCell(-1);
      while(row.cells.length<size.columns){const cell=document.createElement(row.parentElement.tagName==='THEAD'?'th':'td');row.append(cell)}
    }
    this.replaceTable(table,clone.outerHTML);
  }
  load(source,{session,path,reset=false}={}) {
    this.headingContinuation=null;
    if(!reset&&this.loaded&&this.source===source&&this.session===session&&this.path===path){this.onOutline?.();return}
    this.tableDialog?.finish();this.tableActions?.reset();this.loaded=false;
    this.imageGeneration++;
    clearTimeout(this.editor.vditor.ir.processTimeoutId);
    this.editor.vditor.lute.SetLinkBase(documentAssetBase(session,path));
    this.source=source;this.session=session;this.path=path;this.bom=source.startsWith('\uFEFF');
    this.editor.setValue(this.bom?source.slice(1):source,true);
    this.ensureEmptyHeadingLines();
    this.normalized=this.editor.getValue();this.loaded=true;
    if(reset)this.scrollElement.scrollTop=0;
    this.onOutline?.();
  }
  flush() {
    if(!this.loaded||this.composing||this.readOnly)return;
    this.ensureEmptyHeadingLines();
    const value=this.editor.getValue();
    if(value===this.normalized)return;
    this.normalized=value;this.source=(this.bom?'\uFEFF':'')+value;
    this.onInput(this.source);this.onOutline?.();
  }
  ensureEmptyHeadingLines() {
    for(const heading of this.editable.querySelectorAll('h1,h2,h3,h4,h5,h6')){
      const content=[...heading.childNodes].filter(node=>!(node.nodeType===Node.ELEMENT_NODE&&node.matches('.vditor-ir__marker--heading')));
      if(content.some(node=>node.nodeType!==Node.TEXT_NODE||node.textContent.replace(/\u200B/g,'').trim()))continue;
      const selection=window.getSelection(),range=selection?.rangeCount?selection.getRangeAt(0):null;
      const restore=range?.collapsed&&heading.contains(range.startContainer);
      const placeholder=document.createElement('br');heading.append(placeholder);
      if(restore){range.setStartBefore(placeholder);range.collapse(true);selection.removeAllRanges();selection.addRange(range)}
    }
  }
  currentSource(){const value=this.editor.getValue();return value===this.normalized?this.source:(this.bom?'\uFEFF':'')+value}
  setReadOnly(value) {
    value=!!value;
    if(value)this.tableDialog?.finish();
    if(this.readOnly===value)return;
    this.headingContinuation=null;
    this.readOnly=value;value?this.editor.disabled():this.editor.enable();
    this.editable.setAttribute('aria-readonly',String(value));
  }
  get scrollElement(){return this.editable}
  headings() {
    return [...this.editable.querySelectorAll('h1,h2,h3,h4,h5,h6')].map((element,index)=>{
      const label=element.cloneNode(true);
      label.querySelectorAll('.vditor-ir__marker').forEach(marker=>marker.remove());
      return {id:'markdown-heading-'+index,level:Number(element.tagName.slice(1)),label:label.textContent.replace(/\u200B/g,'').trim(),element};
    });
  }
  focusHeading(id) {
    const heading=this.headings().find(heading=>heading.id===id);
    heading?.element.scrollIntoView({block:'start'});
    return !!heading;
  }
  focusAnchor(hash){
    if(!hash)return false;
    const id=decodeURIComponent(hash.replace(/^#/,''));
    const heading=this.headings().find(heading=>heading.element.id===id||heading.element.id.startsWith('ir-'+id+'_')||heading.label===id);
    heading?.element.scrollIntoView({block:'start'});return !!heading;
  }
  focus(){this.editor.focus()}
  clear(){this.imageGeneration++;this.tableDialog?.finish();this.tableActions?.reset();this.loaded=false;clearTimeout(this.editor.vditor.ir.processTimeoutId);this.editor.setValue('',true);this.source='';this.normalized=this.editor.getValue()}
}
