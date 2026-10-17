import test from 'node:test';
import assert from 'node:assert/strict';
import {mountFileActions} from '../src/features/file-actions.js';

class Element extends EventTarget {
  constructor(){super();this.hidden=true;this.isConnected=true;this.disabled=false;this.value='';this.textContent='';this.style={};this.dataset={};this.attributes=new Map();this.queries=new Map();this.classes=new Set();this.classList={add:value=>this.classes.add(value),remove:value=>this.classes.delete(value)}}
  querySelector(selector){return this.queries.get(selector)}
  querySelectorAll(selector){return this.queries.get(selector)||[]}
  setAttribute(name,value){this.attributes.set(name,value)}
  getBoundingClientRect(){return {left:20,bottom:80,width:160,height:80}}
  contains(target){return target===this||this.querySelectorAll('button').includes(target)}
  focus(){document.activeElement=this}
  select(){}
  showModal(){this.open=true}
  close(){this.open=false;this.dispatchEvent(new Event('close'))}
}

function setup(t,overrides={},entry={path:'后端/想法.mind.md',name:'想法.mind.md',directory:false}) {
  const previousDocument=globalThis.document,previousWindow=globalThis.window;
  globalThis.document=new EventTarget();globalThis.window=new EventTarget();
  window.innerWidth=400;window.innerHeight=300;
  t.after(()=>{globalThis.document=previousDocument;globalThis.window=previousWindow});
  const menu=new Element(),newFileButton=new Element(),newFolderButton=new Element(),renameButton=new Element(),deleteButton=new Element();
  newFileButton.dataset.action='new-file';newFolderButton.dataset.action='new-folder';
  renameButton.dataset.action='rename';deleteButton.dataset.action='delete';menu.queries.set('button',[newFileButton,newFolderButton,renameButton,deleteButton]);
  const createDialog=()=>{
    const dialog=new Element(),form=new Element(),cancel=new Element(),confirm=new Element(),error=new Element();
    dialog.queries.set('h2',new Element());dialog.queries.set('[data-description]',new Element());dialog.queries.set('form',form);dialog.queries.set('[data-cancel]',cancel);dialog.queries.set('[role="alert"]',error);dialog.queries.set('button,input',[cancel,confirm]);
    return {dialog,form,cancel,confirm,error};
  };
  const rename=createDialog(),deletion=createDialog(),input=new Element();
  rename.dialog.queries.set('input',input);rename.dialog.queries.set('[data-path]',new Element());rename.dialog.queries.set('button,input',[input,rename.cancel,rename.confirm]);
  const calls=[];
  const controller=mountFileActions({menu,renameDialog:rename.dialog,deleteDialog:deletion.dialog,begin:async()=>{calls.push('begin');return true},finish:()=>calls.push('finish'),create:async(directory,parent)=>calls.push(['create',directory,parent]),rename:async(entry,name)=>calls.push(['rename',entry.path,name]),remove:async entry=>calls.push(['delete',entry.path]),onError:error=>{throw error},...overrides});
  const row=new Element();
  controller.bindRow(row,entry);
  const show=()=>{const event=new Event('contextmenu',{cancelable:true});Object.assign(event,{clientX:390,clientY:290});row.dispatchEvent(event);assert.equal(event.defaultPrevented,true)};
  const settle=()=>new Promise(resolve=>setImmediate(resolve));
  return {controller,menu,row,entry,show,newFileButton,newFolderButton,renameButton,deleteButton,rename,deletion,input,calls,settle};
}

test('右键菜单限制在窗口内，Escape 关闭并返回原文件',t=>{
  const ui=setup(t);ui.show();
  assert.equal(ui.menu.hidden,false);assert.equal(ui.menu.style.left,'232px');assert.equal(ui.menu.style.top,'212px');
  assert.equal(document.activeElement,ui.newFileButton);
  const escape=new Event('keydown',{cancelable:true});escape.key='Escape';ui.menu.dispatchEvent(escape);
  assert.equal(ui.menu.hidden,true);assert.equal(document.activeElement,ui.row);assert.equal(ui.row.classes.has('context-target'),false);
  assert.deepEqual(ui.calls,[]);
});

test('删除先确认；取消不删除；确认只调用一次且阻止操作中取消',async t=>{
  let release;
  const removed=[];
  const ui=setup(t,{remove:async entry=>{removed.push(entry.path);await new Promise(resolve=>release=resolve)}});
  ui.show();ui.deleteButton.dispatchEvent(new Event('click'));await ui.settle();
  assert.equal(ui.deletion.dialog.open,true);assert.equal(document.activeElement,ui.deletion.cancel);assert.deepEqual(removed,[]);
  ui.deletion.cancel.dispatchEvent(new Event('click'));
  assert.equal(ui.controller.active,false);assert.deepEqual(removed,[]);
  ui.show();ui.deleteButton.dispatchEvent(new Event('click'));await ui.settle();
  ui.deletion.form.dispatchEvent(new Event('submit',{cancelable:true}));ui.deletion.form.dispatchEvent(new Event('submit',{cancelable:true}));
  assert.deepEqual(removed,[ui.entry.path]);assert.equal(ui.deletion.cancel.disabled,true);
  const escape=new Event('cancel',{cancelable:true});ui.deletion.dialog.dispatchEvent(escape);assert.equal(escape.defaultPrevented,true);
  release();await ui.settle();assert.equal(ui.deletion.dialog.open,false);assert.equal(ui.controller.active,false);
});

test('重命名编辑完整文件名；接口失败保留输入，允许修改后重试',async t=>{
  let attempts=0;
  const ui=setup(t,{rename:async(entry,name)=>{attempts++;if(name==='existing.md')throw new Error('同名文件已存在')}});
  ui.show();ui.renameButton.dispatchEvent(new Event('click'));await ui.settle();
  assert.equal(ui.input.value,'想法.mind.md');
  ui.input.value='existing.md';ui.rename.form.dispatchEvent(new Event('submit',{cancelable:true}));await ui.settle();
  assert.equal(ui.rename.dialog.open,true);assert.equal(ui.rename.error.textContent,'同名文件已存在');assert.equal(ui.input.value,'existing.md');assert.equal(ui.input.disabled,false);
  ui.input.value='新名称.markdown';ui.rename.form.dispatchEvent(new Event('submit',{cancelable:true}));await ui.settle();
  assert.equal(attempts,2);assert.equal(ui.rename.dialog.open,false);assert.equal(ui.controller.active,false);
});

test('保存队列未就绪时不展示对话框',async t=>{
  const ui=setup(t,{begin:async()=>false});
  ui.show();ui.deleteButton.dispatchEvent(new Event('click'));await ui.settle();
  assert.equal(ui.deletion.dialog.open,undefined);assert.equal(ui.controller.active,false);
});

test('完整文件名不会拆分或自动添加后缀',async t=>{
  const ui=setup(t,{}, {path:'笔记.md.mind.md',name:'笔记.md.mind.md',directory:false});
  ui.show();ui.renameButton.dispatchEvent(new Event('click'));await ui.settle();
  assert.equal(ui.input.value,'笔记.md.mind.md');
  ui.input.value='新名称.md';ui.rename.form.dispatchEvent(new Event('submit',{cancelable:true}));await ui.settle();
  assert.deepEqual(ui.calls.find(call=>Array.isArray(call)&&call[0]==='rename'),['rename','笔记.md.mind.md','新名称.md']);
});


test('文件夹右键支持重命名和删除，删除提示包含全部内容',async t=>{
  const ui=setup(t,{}, {path:'后端',name:'后端',directory:true});
  ui.show();ui.renameButton.dispatchEvent(new Event('click'));await ui.settle();
  assert.equal(ui.rename.dialog.querySelector('h2').textContent,'重命名文件夹');
  assert.equal(ui.input.value,'后端');
  ui.input.value='服务端';ui.rename.form.dispatchEvent(new Event('submit',{cancelable:true}));await ui.settle();
  assert.deepEqual(ui.calls.find(call=>Array.isArray(call)),['rename','后端','服务端']);
  ui.show();ui.deleteButton.dispatchEvent(new Event('click'));await ui.settle();
  assert.equal(ui.deletion.dialog.querySelector('h2').textContent,'删除文件夹？');
  assert.match(ui.deletion.dialog.querySelector('[data-description]').textContent,/后端.*全部内容.*废纸篓/);
  ui.deletion.form.dispatchEvent(new Event('submit',{cancelable:true}));await ui.settle();
  assert.deepEqual(ui.calls.at(-2),['delete','后端']);
});

for(const entry of [{path:'后端/笔记',name:'笔记',directory:true},{path:'后端/想法.md',name:'想法.md',directory:false},{path:'想法.md',name:'想法.md',directory:false}]) {
  test(`右键 ${entry.path} 按目标目录新建文件与文件夹`,async t=>{
    const ui=setup(t,{},entry);
    const parent=entry.directory?entry.path:entry.path.includes('/')?'后端':'';
    ui.show();ui.newFileButton.dispatchEvent(new Event('click'));await ui.settle();
    assert.equal(ui.menu.hidden,true);assert.equal(ui.controller.active,false);
    ui.show();ui.newFolderButton.dispatchEvent(new Event('click'));await ui.settle();
    assert.deepEqual(ui.calls,[['create',false,parent],['create',true,parent]]);
    assert.equal(ui.rename.dialog.open,undefined);assert.equal(ui.deletion.dialog.open,undefined);
  });
}

test('文件树空白处新建在根目录，键盘跳过重命名和删除',async t=>{
  const ui=setup(t),tree=new Element();tree.closest=()=>null;
  ui.controller.bindBackground(tree);
  const show=()=>{const event=new Event('contextmenu',{cancelable:true});Object.assign(event,{clientX:100,clientY:100});tree.dispatchEvent(event)};
  show();assert.equal(ui.renameButton.hidden,true);assert.equal(ui.deleteButton.hidden,true);
  assert.equal(document.activeElement,ui.newFileButton);
  const end=new Event('keydown',{cancelable:true});end.key='End';ui.menu.dispatchEvent(end);
  assert.equal(document.activeElement,ui.newFolderButton);
  ui.newFolderButton.dispatchEvent(new Event('click'));await ui.settle();
  show();ui.newFileButton.dispatchEvent(new Event('click'));await ui.settle();
  assert.deepEqual(ui.calls,[['create',true,''],['create',false,'']]);
  ui.show();assert.equal(ui.renameButton.hidden,false);assert.equal(ui.deleteButton.hidden,false);
});
