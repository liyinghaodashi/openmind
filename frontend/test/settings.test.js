import test from 'node:test';
import assert from 'node:assert/strict';
import {mountSettings} from '../src/settings.js';
import {createSidebarCollapse} from '../src/features/sidebar-collapse.js';

class Element extends EventTarget {
  children = [];
  attributes = new Map();
  classes = new Set();
  hidden = false;
  disabled = false;
  checked = false;
  textContent = '';
  ownerDocument = {createElement: () => new Element()};
  classList = {toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name)};
  setAttribute(name, value) {this.attributes.set(name, value);}
  append(...children) {this.children.push(...children);}
  replaceChildren(...children) {this.children = children;}
}

function setup(storage) {
  const sidebar = new Element(), button = new Element(), root = new Element(), container = new Element();
  const feature = createSidebarCollapse({sidebar, button, root, beforeChange: () => {}});
  const settings = mountSettings({container, features: [feature], storage});
  const [fields, status] = container.children;
  const input = fields.children[0].children[1].children[0];
  const change = checked => {input.checked = checked; input.dispatchEvent(new Event('change'));};
  const click = () => button.dispatchEvent(new Event('click'));
  return {sidebar, button, root, feature, settings, fields, status, input, change, click};
}

function styleSetup(storage) {
  const container = new Element(), applied = [];
  const feature = {id: 'mindStyle', label: '渲染风格', description: '',
    options: [{value: 'processon', label: 'processon'}, {value: 'mindnode', label: 'MindNode'}],
    select: value => applied.push(value)};
  const settings = mountSettings({container, features: [feature], storage});
  const [fields, status] = container.children;
  const radios = fields.children[0].children[1].children.map(label => label.children[0]);
  const choose = value => {
    for (const radio of radios) radio.checked = radio.value === value;
    radios.find(radio => radio.checked).dispatchEvent(new Event('change'));
  };
  return {settings, fields, status, radios, applied, choose};
}

test('风格保存成功后生效，失败回退且保留其他设置', async () => {
  let fail = true;
  const written = [];
  const ui = styleSetup({load: async () => ({mindStyle: 'processon', sourceView: false}), save: async value => {
    written.push(value);
    if (fail) throw new Error('disk full');
  }});
  await ui.settings.ready;
  ui.choose('mindnode');
  await ui.settings.flush();
  assert.deepEqual(ui.applied, ['processon']);
  assert.deepEqual(ui.radios.map(input => input.checked), [true, false]);
  assert.match(ui.status.textContent, /disk full/);
  fail = false;
  ui.choose('mindnode');
  await ui.settings.flush();
  assert.deepEqual(written.at(-1), {mindStyle: 'mindnode', sourceView: false});
  assert.deepEqual(ui.applied, ['processon', 'mindnode']);
  assert.deepEqual(ui.radios.map(input => input.checked), [false, true]);
});

test('快速切换风格串行保存，旧结果不覆盖最后的选择', async () => {
  let release;
  const gate = new Promise(resolve => {release = resolve;});
  const written = [];
  const ui = styleSetup({load: async () => ({mindStyle: 'processon'}), save: async value => {written.push(value); await gate;}});
  await ui.settings.ready;
  ui.choose('mindnode');
  await Promise.resolve();
  ui.choose('processon');
  release();
  await ui.settings.flush();
  assert.deepEqual(written, [{mindStyle: 'mindnode'}, {mindStyle: 'processon'}]);
  assert.deepEqual(ui.applied, ['processon', 'mindnode', 'processon']);
  assert.deepEqual(ui.radios.map(input => input.checked), [true, false]);
});

test('无效风格阻止设置表单修改', async () => {
  const ui = styleSetup({load: async () => ({mindStyle: 'other'}), save: async () => {throw new Error('unexpected save');}});
  await ui.settings.ready;
  assert.equal(ui.fields.disabled, true);
  assert.match(ui.status.textContent, /无效的设置/);
  assert.deepEqual(ui.applied, []);
});

test('读取持久化的关闭状态，保存完成后才启用功能，退出等待保存', async () => {
  let release, written;
  const gate = new Promise(resolve => {release = resolve;});
  const ui = setup({load: async () => ({sidebarCollapse: false}), save: async value => {written = value; await gate;}});
  await ui.settings.ready;
  assert.equal(ui.input.checked, false);
  assert.equal(ui.button.hidden, true);
  assert.equal(ui.sidebar.hidden, false);
  ui.change(true);
  await Promise.resolve();
  assert.deepEqual(written, {sidebarCollapse: true});
  assert.equal(ui.fields.disabled, false);
  assert.equal(ui.button.hidden, true);
  let finished = false;
  const closing = ui.settings.flush().then(() => {finished = true;});
  await Promise.resolve();
  assert.equal(finished, false);
  release();
  await closing;
  assert.equal(ui.button.hidden, false);
  assert.equal(ui.fields.disabled, false);
  ui.click();
  assert.equal(ui.sidebar.hidden, true);
});

test('离开设置等待期间新增的切换也必须保存完成', async () => {
  let releaseFirst, releaseSecond, secondStarted;
  const firstGate = new Promise(resolve => {releaseFirst = resolve;});
  const secondGate = new Promise(resolve => {releaseSecond = resolve;});
  const secondWrite = new Promise(resolve => {secondStarted = resolve;});
  const writes = [];
  const ui = setup({load: async () => ({sidebarCollapse: false}), save: async value => {
    writes.push({...value});
    if (writes.length === 1) await firstGate;
    else {secondStarted(); await secondGate;}
  }});
  await ui.settings.ready;
  ui.change(true);
  let finished = false;
  const leaving = ui.settings.flush().then(() => {finished = true;});
  await Promise.resolve();
  ui.change(false);
  releaseFirst();
  await secondWrite;
  await Promise.resolve();
  assert.equal(finished, false);
  releaseSecond();
  await leaving;
  assert.deepEqual(writes, [{sidebarCollapse: true}, {sidebarCollapse: false}]);
  assert.equal(ui.button.hidden, true);
  assert.equal(finished, true);
});

test('关闭功能会展开侧栏并移除折叠行为，反复启用不会重复绑定', async () => {
  const ui = setup({load: async () => ({sidebarCollapse: true}), save: async () => {}});
  await ui.settings.ready;
  ui.feature.enable();
  ui.click();
  assert.equal(ui.sidebar.hidden, true);
  ui.change(false);
  await ui.settings.flush();
  assert.equal(ui.sidebar.hidden, false);
  assert.equal(ui.root.classes.has('sidebar-collapsed'), false);
  assert.equal(ui.button.hidden, true);
  ui.click();
  assert.equal(ui.sidebar.hidden, false);
  for (let i = 0; i < 3; i++) {
    ui.change(true);
    await ui.settings.flush();
    ui.click();
    assert.equal(ui.sidebar.hidden, true);
    ui.feature.expand();
    assert.equal(ui.sidebar.hidden, false);
    ui.change(false);
    await ui.settings.flush();
  }
});

test('保存失败回退勾选，保留原功能和折叠状态，之后可以重试', async () => {
  let fail = true;
  const ui = setup({load: async () => ({sidebarCollapse: true}), save: async () => {if (fail) throw new Error('disk full');}});
  await ui.settings.ready;
  ui.click();
  ui.change(false);
  await ui.settings.flush();
  assert.equal(ui.input.checked, true);
  assert.equal(ui.sidebar.hidden, true);
  assert.equal(ui.button.hidden, false);
  assert.equal(ui.fields.disabled, false);
  assert.match(ui.status.textContent, /disk full/);
  fail = false;
  ui.change(false);
  await ui.settings.flush();
  assert.equal(ui.sidebar.hidden, false);
  assert.equal(ui.button.hidden, true);
  assert.equal(ui.status.textContent, '');
});

test('读取失败禁止修改，避免用默认值覆盖无法读取的设置', async () => {
  let writes = 0;
  const ui = setup({load: async () => {throw new Error('invalid config');}, save: async () => {writes++;}});
  await ui.settings.ready;
  assert.equal(ui.fields.disabled, true);
  assert.match(ui.status.textContent, /invalid config/);
  ui.change(true);
  await ui.settings.flush();
  assert.equal(writes, 0);
  assert.equal(ui.button.hidden, true);
  assert.equal(ui.sidebar.hidden, false);
});

test('保存期间连续切换按顺序保存，旧结果不覆盖最新勾选', async () => {
  let release;
  const gate = new Promise(resolve => {release = resolve;});
  const writes = [];
  const ui = setup({load: async () => ({sidebarCollapse: false}), save: async value => {writes.push({...value}); if (writes.length === 1) await gate;}});
  await ui.settings.ready;
  ui.change(true);
  ui.change(false);
  await Promise.resolve();
  assert.equal(ui.fields.disabled, false);
  assert.equal(ui.input.checked, false);
  assert.equal(writes.length, 1);
  release();
  await ui.settings.flush();
  assert.deepEqual(writes, [{sidebarCollapse: true}, {sidebarCollapse: false}]);
  assert.equal(ui.input.checked, false);
  assert.equal(ui.button.hidden, true);
});

test('一个设置保存失败后，其他设置不会把失败值重新写入', async () => {
  const container = new Element(), active = {focus: true, collapse: true}, writes = [];
  const settings = mountSettings({container, features: Object.keys(active).map(id => ({id, label: id, description: '', enable: () => {active[id] = true;}, disable: () => {active[id] = false;}})), storage: {
    load: async () => ({...active}),
    save: async value => {writes.push({...value}); if (writes.length === 1) throw new Error('disk full');},
  }});
  await settings.ready;
  const inputs = container.children[0].children.map(row => row.children[0]);
  for (const input of inputs) {input.checked = false; input.dispatchEvent(new Event('change'));}
  await settings.flush();
  assert.deepEqual(writes, [{focus: false, collapse: true}, {focus: true, collapse: false}]);
  assert.deepEqual(active, {focus: true, collapse: false});
  assert.equal(inputs[0].checked, true);
  assert.equal(inputs[1].checked, false);
});
