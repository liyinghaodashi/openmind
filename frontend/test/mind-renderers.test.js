import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ProcessonRenderer} from '../src/mind-styles/processon/renderer.js';
import {MindNodeRenderer} from '../src/mind-styles/mindnode/renderer.js';
import {createMindRenderer} from '../src/mind-styles/index.js';
import {layoutTree} from '../src/layout.js';

class Element extends EventTarget {
  constructor(document) {
    super();
    this.ownerDocument = document;
    this.children = []; this.dataset = {}; this.attributes = new Map(); this.className = ''; this.textContent = '';
    this.style = {setProperty(name, value) {this[name] = value;}, removeProperty(name) {delete this[name];}};
    this.classList = {contains: name => this.className.split(' ').includes(name), add: name => {this.className += ' ' + name;}};
    this.clientWidth = 900; this.clientHeight = 600;
  }
  append(element) {this.children.push(element); element.parent = this;}
  get firstChild() {return this.children[0];}
  setAttribute(name, value) {this.attributes.set(name, value);}
  getAttribute(name) {return this.attributes.get(name);}
  removeAttribute(name) {this.attributes.delete(name);}
  querySelector(selector) {return this.children.find(child => child.className.split(' ').includes(selector.slice(1)));}
  remove() {if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this);}
  getContext() {return {measureText: text => ({width: text.length * 10})};}
}

function setup(Renderer) {
  const document = {createElement: () => new Element(document), createElementNS: () => new Element(document)};
  const canvas = new Element(document), scene = new Element(document), nodes = new Element(document), edges = new Element(document);
  canvas.className = 'mind-main-node-mark mind-second-node-mark';
  const calls = [];
  const options = {canvas, scene, nodes, edges, onActivate: id => calls.push(['select', id]), onEdit: id => calls.push(['edit', id])};
  const renderer = new Renderer(options);
  const root = {id: 'root', label: '根', children: [{id: 'branch', label: '分支', children: [{id: 'leaf', label: '内容', children: []}]}]};
  const state = {layout: layoutTree(root, new Set(), (...args) => renderer.measure(...args)), x: 24, y: 80, scale: 1, selected: 'branch', collapsed: new Set()};
  return {renderer, root, state, calls, options};
}

test('两个渲染器可分别使用，尺寸缓存、节点及连线互相独立', () => {
  const processon = setup(ProcessonRenderer), mindnode = setup(MindNodeRenderer);
  processon.renderer.render(processon.state);
  mindnode.renderer.render(mindnode.state);
  assert.equal(processon.renderer.measure('分支', 1).height, 48);
  assert.equal(mindnode.renderer.measure('分支', 1).height, 32);
  assert.notEqual(processon.renderer.render, mindnode.renderer.render);
  assert.notEqual(processon.renderer.measurements, mindnode.renderer.measurements);
  processon.renderer.clear();
  processon.renderer.measurements.clear();
  assert.equal(mindnode.renderer.elements.size, 3);
  assert.equal(mindnode.renderer.edgeElements.size, 2);
  assert.equal(mindnode.renderer.measurements.size, 3);
  assert.equal(processon.options.canvas.dataset.mindStyle, 'processon');
  assert.equal(mindnode.options.canvas.dataset.mindStyle, 'mindnode');
  assert.throws(() => createMindRenderer('other', processon.options), /无效/);
  assert.equal(processon.options.canvas.dataset.mindStyle, 'processon');
});

for (const Renderer of [ProcessonRenderer, MindNodeRenderer]) {
  test(Renderer.name + ' 保留选择、折叠数量、继承颜色和渲染缓存清理', () => {
    const ui = setup(Renderer), {renderer, root, state} = ui;
    root.color = '#3B82F6';
    state.collapsed.add('branch');
    state.layout = layoutTree(root, state.collapsed, (...args) => renderer.measure(...args));
    renderer.render(state);
    const branch = renderer.elements.get('branch');
    assert.equal(branch.getAttribute('aria-expanded'), 'false');
    assert.equal(branch.querySelector('.node-fold-count').textContent, '1');
    assert.match(branch.className, /selected/);
    assert.equal(renderer.edgeElements.get('branch').getAttribute('stroke'), '#3B82F6');
    branch.dispatchEvent(new Event('click'));
    branch.dispatchEvent(new Event('dblclick'));
    assert.deepEqual(ui.calls, [['select', 'branch'], ['edit', 'branch']]);
    assert.equal(renderer.elements.get('root').style['--node-color-background'], 'rgb(216, 230, 253)');
    const editor = renderer.createEditor(state.layout.positions[1]);
    assert.equal(editor.className, 'node-editor branch');
    assert.equal(editor.value, '分支');
    root.color = '';
    state.collapsed.clear();
    state.layout = layoutTree(root, state.collapsed, (...args) => renderer.measure(...args));
    renderer.render(state);
    assert.equal(renderer.edgeElements.get('branch').getAttribute('stroke'), Renderer === ProcessonRenderer ? '#7c808d' : '#b8b8b8');
    assert.equal(branch.querySelector('.node-fold-count'), undefined);
    assert.equal(renderer.elements.get('root').style['--node-color-background'], undefined);
    state.x = -5000; state.selected = 'leaf';
    renderer.render(state);
    assert.deepEqual([...renderer.elements.keys()], ['leaf']);
    assert.equal(renderer.edgeElements.size, 0);
    renderer.clear();
    assert.equal(ui.options.nodes.children.length, 0);
    assert.equal(ui.options.edges.children.length, 0);
  });

  test(Renderer.name + ' 只依赖自身目录，共用控制层没有节点或连线绘制', () => {
    const directory = Renderer === ProcessonRenderer ? 'processon' : 'mindnode';
    const source = readFileSync(new URL(`../src/mind-styles/${directory}/renderer.js`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\bimport\b|\bextends\b/);
    const css = readFileSync(new URL(`../src/mind-styles/${directory}/style.css`, import.meta.url), 'utf8');
    assert.doesNotMatch(css, /@import/);
    assert.doesNotMatch(css, new RegExp(directory === 'processon' ? 'mindnode' : 'processon'));
    const controller = readFileSync(new URL('../src/mindmap.js', import.meta.url), 'utf8');
    assert.doesNotMatch(controller, /measureText|createElementNS|stroke-width|colorTint|className='node-editor/);
    const commonCSS = readFileSync(new URL('../styles/app.css', import.meta.url), 'utf8');
    assert.doesNotMatch(commonCSS, /\.mind-node|\.node-editor|\.node-fold-count|\.node-drag-ghost|data-mind-style/);
  });
}

for (const Renderer of [ProcessonRenderer, MindNodeRenderer]) {
  test(Renderer.name + ' 配置宽度覆盖所有层级，重新测量长文本并保持短节点收缩', () => {
    const {renderer} = setup(Renderer);
    let width = 280;
    renderer.getNodeMaxWidth = () => width;
    for (const depth of [0, 1, 2, 3]) {
      width = 280;
      const short = renderer.measure('短节点', depth);
      const narrow = renderer.measure('长文本'.repeat(40), depth);
      for (const configured of [600, 1600, 160]) {
        width = configured;
        const size = renderer.measure('长文本'.repeat(40), depth);
        assert.equal(size.width > narrow.width, configured > 280);
        assert.equal(size.height < narrow.height, configured > 280);
        assert.deepEqual(renderer.measure('短节点', depth), short);
      }
    }
  });
}

for (const Renderer of [ProcessonRenderer, MindNodeRenderer]) {
  test(Renderer.name + ' 缺失父级时仍按原文级别设置节点和编辑器样式', () => {
    const {renderer,state}=setup(Renderer);
    const third={id:'third',kind:'heading',level:3,label:'数据采集',children:[]};
    const second={id:'second',kind:'heading',level:2,label:'设备采集',color:'#5EAA80',children:[third]};
    state.layout=layoutTree({kind:'file',children:[second]},new Set(),(...args)=>renderer.measure(...args));
    renderer.render(state);
    assert.match(renderer.elements.get('third').className,/\bleaf\b/);
    assert.equal(renderer.elements.get('third').style['--node-color-background'],undefined);
    assert.equal(renderer.createEditor(state.layout.positions[1]).className,'node-editor leaf');
    assert.deepEqual(renderer.measure(third.label,1,third),renderer.measure(third.label,2,third));
    assert.match(renderer.elements.get('second').className,/\bbranch\b/);
  });
}
