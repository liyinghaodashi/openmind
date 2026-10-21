try {
  let checks = 0;
  const assert = (passed, message) => {checks++; if (!passed) throw new Error(message);};
  const frames = async () => {await new Promise(requestAnimationFrame); await new Promise(requestAnimationFrame);};
  applySnapshot(await call('OpenDocument', '颜色.mind.md'), {resetView: true});
  const input = $('setting-mindNodeMaxWidth');
  const label = '2. 如果模型的id不存在，写入模型训练表 one_laser_training_task，如果id存在，更新模型训练表';
  const node = (id, children = []) => ({id, label, editable: true, children});
  const root = node('root', [node('branch', [node('leaf')]), node('sibling')]);
  root.label = '激光切割机';
  root.children[0].label = '搜索';
  root.children[1].label = '查看详情';
  const change = async value => {input.value = value; input.dispatchEvent(new Event('change', {bubbles: true})); await settings.flush(); await frames();};
  for (const style of ['processon', 'mindnode']) {
    map.setStyle(style);
    map.setRoot(root, {resetView: true});
    await toggleSettings(true);
    await change('280');
    const narrow = map.layout.positions.map(p => ({...p}));
    await change('600');
    await toggleSettings(false);
    map.scale = 1; map.x = 24; map.y = 20; map.render();
    for (const p of map.layout.positions) {
      const before = narrow.find(n => n.id === p.id);
      if (p.id === 'leaf') assert(p.width > before.width && p.height < before.height, style + ' must widen long nodes and reduce wrapping');
      else assert(p.width === before.width, 'Short nodes must retain their content width');
      const element = map.elements.get(p.id);
      if (element) {
        const rect = element.getBoundingClientRect();
        assert(Math.abs(rect.width - p.width) < 1 && Math.abs(rect.height - p.height) < 1, style + ' ' + p.id + ' rendered bounds must match layout: ' + [rect.width, rect.height, p.width, p.height].join(','));
        const range = document.createRange();
        range.selectNodeContents(element.firstChild);
        assert(range.getBoundingClientRect().width <= rect.width, 'Text must fit node width');
      }
      const editor = map.createEditor(p);
      map.nodes.append(editor);
      const size = map.renderer.measureEditor(editor, p.depth);
      assert(size.width === p.width && size.height === p.height, 'Editor must use configured width and match node height');
      editor.remove();
    }
    for (const edge of map.layout.edges) {
      assert(edge.to.x >= edge.from.x + edge.from.width + 29, 'Descendants must move beyond wider parents');
      const path = map.edgeElements.get(edge.id);
      if (path) assert(Math.abs(path.getPointAtLength(0).x - edge.from.x - edge.from.width) < .01, 'Connectors must track wider nodes');
    }
    await toggleSettings(true);
    window.__mindRules.saveError = 'disk full';
    await change('800');
    assert(map.nodeMaxWidth === 600 && input.value === '600', 'Failed saves must preserve previous width');
    window.__mindRules.saveError = null;
    for (const value of ['159', '1601', '', '600.5']) {
      await change(value);
      assert(map.nodeMaxWidth === 600 && input.value === '600', 'Invalid input must retain previous width');
    }
    input.focus();
    input.select();
    document.execCommand('insertText', false, '720');
    assert(input.value === '720', 'Native number input must accept typed width');
    await toggleSettings(false);
    assert(window.__mindRules.settings.mindNodeMaxWidth === 720 && map.nodeMaxWidth === 720, 'F12 must commit before returning to canvas');
  }
  map.setStyle('processon');
  assert(map.renderer.getNodeMaxWidth() === 720, 'Style changes must retain the configured width');
  window.webkit.messageHandlers.result.postMessage({passed: true, message: 'PASS: ' + checks + ' native WebKit node width checks'});
} catch (error) {
  window.webkit.messageHandlers.result.postMessage({passed: false, message: 'FAIL: ' + error.message + '\n' + error.stack});
}
