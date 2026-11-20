try {
  const snapshot = await call('OpenDocument', '颜色.mind.md');
  const node = (id, label, level, children = []) => ({
    id, label, level, kind: 'heading', color: '#D5AA45', children
  });
  snapshot.root.children = [node('root-card', '7.PDA', 1, [
    node('branch', 'DataWedge', 2, [
      node('single', '需求', 3),
      node('multi', '第一行\nDataWedge 扫描状态', 3),
      {...node('folded', '方案', 3, [node('hidden', '隐藏', 4)]), isFoldKid: true}
    ])
  ])];
  map.setNodeMark('main', true);
  map.setNodeMark('second', true);
  applySnapshot(snapshot, {resetView: true});
  const image = new Image();
  image.src = await map.createPng();
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(image, 0, 0);
  const scale = image.width / Math.ceil(map.layout.width + 64);
  const offsets = {};
  function checkText(id, x, y, width, height) {
    const left = Math.ceil((32 + x) * scale), top = Math.ceil((32 + y) * scale);
    const w = Math.floor(width * scale), h = Math.floor(height * scale);
    const {data} = ctx.getImageData(left, top, w, h);
    let first = h, last = -1;
    for (let i = 0; i < w * h; i++) {
      if (data[4 * i] > 145) continue;
      const row = Math.floor(i / w);
      first = Math.min(first, row);
      last = Math.max(last, row);
    }
    if (last < first) throw new Error('Missing text in ' + id);
    offsets[id] = (top + (first + last + 1) / 2) / scale - (32 + y + height / 2);
  }
  for (const p of map.layout.positions) {
    checkText(p.id, p.x + 3, p.y, p.width - 6, p.height);
    if (p.hiddenCount) checkText('badge', p.x + p.width + 14, p.y + p.height / 2 - 8, 14, 16);
  }
  if (!('badge' in offsets) || Object.values(offsets).some(value => Math.abs(value) > 1.5))
    throw new Error('Text offsets in layout pixels: ' + JSON.stringify(offsets));
  window.webkit.messageHandlers.result.postMessage({passed: true, message: 'PASS: ' + JSON.stringify(offsets)});
} catch (error) {
  window.webkit.messageHandlers.result.postMessage({passed: false, message: 'FAIL: ' + error.message});
}
