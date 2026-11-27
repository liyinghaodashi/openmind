try {
  const node = (id, level, children = []) => ({id, label: id, level, kind: 'heading', editable: true, children});
  const branches = Array.from({length: 8}, (_, i) => node('branch' + i, 2,
    Array.from({length: 100}, (_, j) => node('leaf' + i + '-' + j, 3))));
  const path = '源/子/想法.mind.md';
  window.__fileDragFixture.documents.get(path).root = node('root', 1, branches);
  await openDocument(path);
  for (const branch of branches) map.collapsed.add(branch.id);
  map.setRoot(map.root);
  map.x = 20;
  map.y = 20;
  map.render();
  const frame = () => new Promise(requestAnimationFrame);
  await frame();
  const badge = map.elements.get('branch0')?.querySelector('.node-fold-count');
  if (badge?.textContent !== '100') throw new Error('缺少折叠计数');
  const observer = new MutationObserver(records => {writes += records.length;});
  let writes = 0;
  observer.observe(map.renderer.nodes, {attributes: true, childList: true, subtree: true});
  observer.observe(map.renderer.edges, {attributes: true, childList: true, subtree: true});
  const start = map.renderer.scene.style.transform;
  for (let i = 0; i < 31; i++) {
    map.canvas.dispatchEvent(new WheelEvent('wheel', {deltaX: i % 2 ? -1 : 1, cancelable: true}));
    await frame();
  }
  writes += observer.takeRecords().length;
  observer.disconnect();
  if (start === map.renderer.scene.style.transform) throw new Error('画布未移动');
  if (writes) throw new Error('31 帧平移重复修改节点或连线 DOM ' + writes + ' 次');
  const originalX = map.x;
  map.x = -map.layout.width - 400;
  map.render();
  if (map.elements.has('branch0') || map.edgeElements.has('branch0')) throw new Error('移出视口后仍保留分支');
  map.x = originalX;
  map.render();
  if (map.elements.get('branch0')?.querySelector('.node-fold-count')?.textContent !== '100' ||
      !map.edgeElements.get('branch0')?.getAttribute('d')) throw new Error('移回视口后分支未完整恢复');
  window.webkit.messageHandlers.result.postMessage({passed: true, message: 'PASS: 31 帧平移，节点和连线 DOM 零修改'});
} catch (error) {
  window.webkit.messageHandlers.result.postMessage({passed: false, message: 'FAIL: ' + error.message});
}
