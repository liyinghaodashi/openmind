import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ProcessonRenderer} from '../src/mind/styles/processon/renderer.js';
import {layoutTree} from '../src/mind/layout.js';

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
}

function setup() {
  const document = {createElement: () => new Element(document), createElementNS: () => new Element(document)};
  const canvas = new Element(document), scene = new Element(document), nodes = new Element(document), edges = new Element(document);
  canvas.className = 'mind-main-node-mark mind-second-node-mark';
  const calls = [];
  const measureText = (text, font, maxWidth) => ({width: Math.min(text.length * 10, maxWidth), lines: Math.max(1, Math.ceil(text.length * 10 / maxWidth))});
  const options = {measureText, canvas, scene, nodes, edges, onActivate: id => calls.push(['select', id]), onEdit: id => calls.push(['edit', id])};
  const renderer = new ProcessonRenderer(options);
  const root = {id: 'root', label: '根', children: [{id: 'branch', label: '分支', children: [{id: 'leaf', label: '内容', children: []}]}]};
  const state = {layout: layoutTree(root, new Set(), (...args) => renderer.measure(...args)), x: 24, y: 80, scale: 1, selected: 'branch', collapsed: new Set()};
  return {renderer, root, state, calls, options};
}

test('processon 渲染器创建、渲染及清理', () => {
  const ui = setup(), {renderer, state, options} = ui;
  renderer.render(state);
  assert.equal(renderer.measure('分支', 1).height, 48);
  assert.equal(renderer.elements.size, 3);
  assert.equal(renderer.edgeElements.size, 2);
  renderer.clear();
  assert.equal(options.nodes.children.length, 0);
  assert.equal(options.edges.children.length, 0);
});

test('processon 渲染器保留选择、折叠数量、继承颜色和缓存清理', () => {
  const ui = setup(), {renderer, root, state} = ui;
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
  assert.equal(renderer.edgeElements.get('branch').getAttribute('stroke'), '#7c808d');
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

test('processon 渲染器只依赖自身目录，共用控制层没有节点或连线绘制', () => {
  const source = readFileSync(new URL('../src/mind/styles/processon/renderer.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\bimport\b|\bextends\b/);
  const css = readFileSync(new URL('../src/mind/styles/processon/style.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /@import|data-mind-style/);
  const controller = readFileSync(new URL('../src/mind/mindmap.js', import.meta.url), 'utf8');
  assert.doesNotMatch(controller, /measureText|createElementNS|stroke-width|colorTint|className='node-editor|setStyle/);
});

for (const depth of [0, 1, 2, 3]) {
  test(`processon 配置宽度覆盖层级 ${depth}`, () => {
    const {renderer} = setup();
    let width = 280;
    renderer.getNodeMaxWidth = () => width;
    const short = renderer.measure('短节点', depth);
    const narrow = renderer.measure('长文本'.repeat(40), depth);
    for (const configured of [600, 1600, 160]) {
      width = configured;
      const size = renderer.measure('长文本'.repeat(40), depth);
      assert.equal(size.width > narrow.width, configured > 280);
      assert.equal(size.height < narrow.height, configured > 280);
      assert.deepEqual(renderer.measure('短节点', depth), short);
    }
  });
}

test('processon 缺失父级时仍按原文级别设置节点和编辑器样式', () => {
  const {renderer, state} = setup();
  const third = {id: 'third', kind: 'heading', level: 3, label: '数据采集', children: []};
  const second = {id: 'second', kind: 'heading', level: 2, label: '设备采集', color: '#5EAA80', children: [third]};
  state.layout = layoutTree({kind: 'file', children: [second]}, new Set(), (...args) => renderer.measure(...args));
  renderer.render(state);
  assert.match(renderer.elements.get('third').className, /\bleaf\b/);
  assert.equal(renderer.elements.get('third').style['--node-color-background'], undefined);
  assert.equal(renderer.createEditor(state.layout.positions[1]).className, 'node-editor leaf');
  assert.deepEqual(renderer.measure(third.label, 1, third), renderer.measure(third.label, 2, third));
  assert.match(renderer.elements.get('second').className, /\bbranch\b/);
});

test('processon 平移按当前屏幕物理像素对齐，保留缩放和内部坐标精度', () => {
  const {renderer, state, options} = setup();
  for (const pixelRatio of [1, 2]) for (const scale of [.65, 1, 1.25]) {
    options.canvas.ownerDocument.defaultView = {devicePixelRatio: pixelRatio};
    Object.assign(state, {x: -170.25, y: -60.25, scale});
    const before = JSON.stringify(state);
    renderer.render(state);
    assert.equal(options.scene.style.transform, `translate(-170px,-60px) scale(${scale})`);
    assert.equal(JSON.stringify(state), before);
    state.x = -170.6; state.y = 60.6;
    renderer.render(state);
    assert.equal(options.scene.style.transform, (pixelRatio === 1 ? 'translate(-171px,61px)' : 'translate(-170.5px,60.5px)') + ` scale(${scale})`);
  }
});
