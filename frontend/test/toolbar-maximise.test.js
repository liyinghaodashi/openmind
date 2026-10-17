import test from 'node:test';
import assert from 'node:assert/strict';
import {bindToolbarMaximise} from '../src/features/toolbar-maximise.js';

function setup(runtimeEnabled=true) {
  const toolbar=new EventTarget();let maximised=false,calls=0;
  bindToolbarMaximise(toolbar,runtimeEnabled?()=>{maximised=!maximised;calls++;}:undefined);
  const doubleClick=(interactive=false)=>{
    const event=new Event('dblclick',{cancelable:true});
    Object.defineProperty(event,'target',{value:{closest:()=>interactive?{}:null}});
    toolbar.dispatchEvent(event);
  };
  return {doubleClick,get maximised(){return maximised},get calls(){return calls}};
}

test('双击顶部空白处最大化，再双击恢复',()=>{
  const ui=setup();ui.doubleClick();assert.equal(ui.maximised,true);
  ui.doubleClick();assert.equal(ui.maximised,false);assert.equal(ui.calls,2);
});
test('双击顶部按钮或文档标题不会改变窗口大小',()=>{
  const ui=setup();ui.doubleClick(true);assert.equal(ui.calls,0);
});
test('只读预览没有原生窗口接口时双击不会报错',()=>{
  assert.doesNotThrow(()=>setup(false).doubleClick());
});
