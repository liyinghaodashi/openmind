export class TableActions {
  constructor(markdown) {
    this.markdown=markdown;this.host=markdown.container;this.table=null;this.layouts=new Map();this.layoutHistory=new Map();this.layoutSource='';
    this.widthStyle=document.createElement('style');document.head.append(this.widthStyle);
    this.handles=document.createElement('div');this.handles.className='markdown-table-columns';this.host.append(this.handles);
    this.element=document.createElement('div');this.element.className='markdown-table-actions';
    this.element.setAttribute('role','toolbar');this.element.setAttribute('aria-label','表格操作');this.element.hidden=true;
    this.element.innerHTML='<button type="button" data-resize title="调整表格" aria-label="调整表格"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="3" y="3" width="14" height="14" rx="1"/><path d="M3 8h14M3 12h14M8 3v14M12 3v14"/></svg></button><button type="button" data-delete title="删除表格" aria-label="删除表格"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 5h12M8 3h4M6 5l1 12h6l1-12M9 8v6M11 8v6"/></svg></button>';
    this.host.append(this.element);
    this.element.addEventListener('pointerdown',event=>event.preventDefault());
    this.element.querySelector('[data-resize]').addEventListener('click',()=>{if(this.table)void markdown.resizeTable(this.table)});
    this.element.querySelector('[data-delete]').addEventListener('click',()=>{if(this.table)markdown.replaceTable(this.table,'<p data-block="0"><br></p>')});
    this.element.addEventListener('keydown',event=>{
      if(event.isComposing||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
      const buttons=[...this.element.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);
      event.preventDefault();buttons[(index+1)%buttons.length].focus();
    });
    markdown.editable.addEventListener('pointermove',event=>{
      const table=event.target.closest('table');
      if(table&&markdown.editable.contains(table)){this.table=table;this.position()}
    });
    this.host.addEventListener('pointerleave',()=>this.update());
    document.addEventListener('selectionchange',()=>this.update());
    document.addEventListener('focusin',()=>this.update());
    markdown.editable.addEventListener('scroll',()=>this.position());
    window.addEventListener('resize',()=>this.position());
    new ResizeObserver(()=>this.position()).observe(this.host);
    new MutationObserver(()=>{this.restoreLayouts();this.applyWidths();this.update()}).observe(markdown.editable,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['contenteditable']});
  }
  reset(){this.layouts.clear();this.layoutHistory.clear();this.layoutSource='';this.widthStyle.textContent='';this.table=null;this.drag=null;this.position()}
  rememberLayouts(source=this.markdown.editor.getValue()) {
    this.layoutHistory.delete(source);this.layoutHistory.set(source,new Map([...this.layouts].map(([key,widths])=>[key,[...widths]])));this.layoutSource=source;
    if(this.layoutHistory.size>8)this.layoutHistory.delete(this.layoutHistory.keys().next().value);
  }
  restoreLayouts() {
    const source=this.markdown.editor.getValue();if(source===this.layoutSource)return;
    const layouts=this.layoutHistory.get(source);
    if(layouts)this.layouts=new Map([...layouts].map(([key,widths])=>[key,[...widths]]));
    this.layoutSource=source;
  }
  tableIndex(table){return [...this.markdown.editable.querySelectorAll('table')].indexOf(table)}
  inserted(table){
    const index=this.tableIndex(table);
    this.layouts=new Map([...this.layouts].map(([key,widths])=>[key>=index?key+1:key,widths]));this.rememberLayouts();this.applyWidths();
  }
  removed(index){
    this.layouts=new Map([...this.layouts].filter(([key])=>key!==index).map(([key,widths])=>[key>index?key-1:key,widths]));this.rememberLayouts();this.applyWidths();
  }
  applyWidths() {
    const rules=[];
    [...this.markdown.editable.querySelectorAll('table')].forEach((table,index)=>{
      const widths=this.layouts.get(index);
      if(!widths||widths.length!==table.rows[0]?.cells.length)return;
      if(table.dataset.tableLayout!==String(index))table.dataset.tableLayout=index;
      widths.forEach((width,column)=>rules.push('#markdown-editor .vditor-reset table[data-table-layout="'+index+'"] tr:first-child>th:nth-child('+(column+1)+'){width:'+width+'%}'));
    });
    const css=rules.join('\n');if(this.widthStyle.textContent!==css)this.widthStyle.textContent=css;
  }
  widths(table) {
    const values=[...table.rows[0].cells].map(cell=>cell.getBoundingClientRect().width),total=values.reduce((sum,width)=>sum+width,0);
    return values.map(width=>width/total*100);
  }
  adjustColumns(table,column,widths,delta) {
    if(this.markdown.readOnly||this.markdown.composing||!this.markdown.editable.contains(table))return;
    const minimum=Math.min(5,50/widths.length),pair=widths[column]+widths[column+1];
    const next=[...widths];next[column]=Math.max(minimum,Math.min(pair-minimum,widths[column]+delta));next[column+1]=pair-next[column];
    this.layouts.set(this.tableIndex(table),next);this.rememberLayouts(this.layoutSource||this.markdown.editor.getValue());this.applyWidths();this.position();
  }
  renderHandles(table,bounds,host,clip) {
    const cells=[...table.rows[0].cells];
    if(this.handlesTable!==table||this.handles.children.length!==cells.length-1){
      this.handlesTable=table;this.handles.replaceChildren();
      for(let column=0;column<cells.length-1;column++){
        const handle=document.createElement('div');handle.className='markdown-table-column';handle.tabIndex=0;
        handle.setAttribute('role','slider');handle.setAttribute('aria-label','调整第 '+(column+1)+' 列宽度');handle.setAttribute('aria-orientation','horizontal');
        handle.addEventListener('pointerdown',event=>{
          if(event.button!==0||this.markdown.readOnly||this.markdown.composing)return;
          event.preventDefault();event.stopPropagation();
          this.drag={table,column,start:event.clientX,width:table.getBoundingClientRect().width,widths:this.widths(table),pointer:event.pointerId};
          handle.setPointerCapture(event.pointerId);
        });
        handle.addEventListener('pointermove',event=>{
          if(this.drag?.pointer!==event.pointerId)return;
          const {table,column,start,width,widths}=this.drag;this.adjustColumns(table,column,widths,(event.clientX-start)/width*100);
        });
        for(const type of ['pointerup','pointercancel','lostpointercapture'])handle.addEventListener(type,()=>this.drag=null);
        handle.addEventListener('keydown',event=>{
          if(event.metaKey||event.ctrlKey||event.altKey||event.shiftKey||!['ArrowLeft','ArrowRight'].includes(event.key))return;
          event.preventDefault();this.adjustColumns(table,column,this.widths(table),event.key==='ArrowRight'?1:-1);
        });
        this.handles.append(handle);
      }
    }
    const top=Math.max(bounds.top,clip.top),bottom=Math.min(bounds.bottom,clip.bottom);
    [...this.handles.children].forEach((handle,column)=>{
      const cell=cells[column].getBoundingClientRect(),widths=this.widths(table),minimum=Math.min(5,50/cells.length);
      handle.style.left=cell.right-host.left-4+'px';handle.style.top=top-host.top+'px';handle.style.height=Math.max(0,bottom-top)+'px';
      handle.setAttribute('aria-valuemin',String(minimum));handle.setAttribute('aria-valuemax',String(widths[column]+widths[column+1]-minimum));handle.setAttribute('aria-valuenow',String(Math.round(widths[column])));
    });
  }
  update() {
    if(!this.element.contains(document.activeElement)&&!this.handles.contains(document.activeElement)&&!this.drag){
      const selection=window.getSelection(),node=selection?.anchorNode;
      const anchor=node?.nodeType===Node.ELEMENT_NODE?node:node?.parentElement;
      this.table=document.activeElement===this.markdown.editable?anchor?.closest('table'):null;
    }
    this.position();
  }
  position() {
    const {markdown,table}=this;
    if(markdown.readOnly||!markdown.loaded||!table?.isConnected||!markdown.editable.contains(table)||!this.host.getClientRects().length){this.element.hidden=true;this.handles.hidden=true;return}
    const bounds=table.getBoundingClientRect(),host=this.host.getBoundingClientRect(),clip=markdown.editable.getBoundingClientRect();
    this.handles.hidden=bounds.bottom<clip.top||bounds.top>clip.bottom;
    if(!this.handles.hidden)this.renderHandles(table,bounds,host,clip);
    this.element.hidden=bounds.top<clip.top+28||bounds.top>clip.bottom;
    this.element.style.left=bounds.left-host.left+'px';this.element.style.top=bounds.top-host.top-30+'px';this.element.style.width=bounds.width+'px';
  }
}
