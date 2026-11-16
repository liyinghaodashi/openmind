export class TableDialog {
  constructor() {
    this.element=document.createElement('dialog');
    this.element.id='insert-table-dialog';
    this.element.setAttribute('aria-labelledby','insert-table-title');
    this.element.innerHTML='<h2 id="insert-table-title">插入表格</h2><p id="table-size-label" aria-live="polite"></p><div class="table-size-grid" role="grid" aria-label="选择表格大小" aria-describedby="table-size-label"></div><p class="table-size-hint">移动鼠标选择 · 方向键调整 · Enter 插入</p><div class="dialog-actions"><button type="button" data-cancel>取消</button><button type="button" data-insert>插入</button></div>';
    document.body.append(this.element);
    this.grid=this.element.querySelector('.table-size-grid');
    for(let row=1;row<=8;row++){
      const line=document.createElement('div');line.setAttribute('role','row');
      for(let column=1;column<=10;column++){
        const cell=document.createElement('button');
        cell.type='button';cell.setAttribute('role','gridcell');
        cell.dataset.rows=row;cell.dataset.columns=column;
        cell.setAttribute('aria-label',column+' 列，'+row+' 行（含表头）');
        cell.addEventListener('pointerenter',()=>this.select(row,column));
        cell.addEventListener('focus',()=>{if(!this.settingFocus)this.select(row,column)});
        cell.addEventListener('click',()=>{this.select(row,column);if(!this.requiresConfirmation?.(row,column))this.confirm()});
        line.append(cell);
      }
      this.grid.append(line);
    }
    this.element.querySelector('[data-cancel]').addEventListener('click',()=>this.finish(null));
    this.element.querySelector('[data-insert]').addEventListener('click',()=>this.confirm());
    this.element.addEventListener('cancel',event=>{event.preventDefault();this.finish(null)});
    this.element.addEventListener('keydown',event=>{
      if(event.isComposing||event.keyCode===229||event.metaKey||event.ctrlKey||event.altKey||event.shiftKey)return;
      if(this.grid.contains(event.target)&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();
        this.select(Math.max(1,Math.min(Math.max(8,this.initialRows),this.rows+(event.key==='ArrowDown'?1:event.key==='ArrowUp'?-1:0))),Math.max(1,Math.min(Math.max(10,this.initialColumns),this.columns+(event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0))));
        this.focusCell();
      }else if(event.key==='Enter'){
        event.preventDefault();if(!event.repeat){if(event.target.matches('[data-cancel]'))this.finish(null);else this.confirm()}
      }else if(['ArrowLeft','ArrowRight'].includes(event.key)){
        const buttons=[...this.element.querySelectorAll('.dialog-actions button')],index=buttons.indexOf(document.activeElement);
        if(index>=0){event.preventDefault();buttons[(index+1)%buttons.length].focus()}
      }
    });
  }
  select(rows,columns) {
    this.rows=rows;this.columns=columns;
    this.element.querySelector('#table-size-label').textContent=columns+' 列 × '+rows+' 行（含表头）';
    for(const cell of this.grid.querySelectorAll('button')){
      const selected=Number(cell.dataset.rows)<=rows&&Number(cell.dataset.columns)<=columns;
      cell.setAttribute('aria-selected',String(selected));
      cell.tabIndex=Number(cell.dataset.rows)===Math.min(rows,8)&&Number(cell.dataset.columns)===Math.min(columns,10)?0:-1;
    }
  }
  confirm(){this.finish({rows:this.rows,columns:this.columns})}
  focusCell(){this.settingFocus=true;this.grid.querySelector('[tabindex="0"]').focus();this.settingFocus=false}
  open({rows=3,columns=3,title='插入表格',action='插入',requiresConfirmation=null}={}) {
    if(this.resolve)return Promise.resolve(null);
    this.requiresConfirmation=requiresConfirmation;
    this.initialRows=rows;this.initialColumns=columns;
    this.element.querySelector('h2').textContent=title;
    this.element.querySelector('[data-insert]').textContent=action;
    this.element.querySelector('.table-size-hint').textContent='移动鼠标选择 · 方向键调整 · Enter '+action;
    return new Promise(resolve=>{
      this.resolve=resolve;this.element.showModal();this.select(rows,columns);
      this.focusCell();
    });
  }
  finish(value=null) {
    const resolve=this.resolve;this.resolve=null;
    if(this.element.open)this.element.close();
    resolve?.(value);
  }
}
