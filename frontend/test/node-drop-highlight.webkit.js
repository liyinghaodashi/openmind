try {
  let checks = 0;
  const assert = (passed, message) => {checks++; if (!passed) throw new Error(message);};
  const node = (id, level, children = []) => ({id, label: id, kind: 'heading', level, editable: true, children});
  const root = node('root', 1, [node('target', 2, [node('leaf', 3)]), node('source', 2, [node('descendant', 3)])]);
  applySnapshot({...structuredClone(window.__nodeModeFixture.snapshot), root}, {resetView: true});
  const moves = [];
  map.onMove = (...args) => moves.push(args);
  map.onDragState = () => {};
  const point = (id, ratio = .5) => {
    const rect = map.elements.get(id).getBoundingClientRect();
    return {pointerId: 1, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height * ratio};
  };
  const hover = (id, ratio = .5) => {map.moveNodeDrag(point(id, ratio)); map.render();};
  const highlighted = id => getComputedStyle(map.elements.get(id), '::after').opacity === '1';
  const begin = () => {
    map.selected = 'source';
    map.nodeDrag = {id: 'source', pointer: 1, active: true, target: null};
  };
  for (const style of ['processon', 'mindnode']) {
    map.setStyle(style);
    for (const marked of [true, false]) {
      map.setNodeMark('main', marked); map.setNodeMark('second', marked);
      for (const color of ['', '#4877E0']) {
        root.color = color;
        map.setRoot(root, {resetView: true});
        map.scale = .8; map.x = 80; map.y = 220; map.render();
        begin();
        for (const id of ['root', 'target', 'leaf']) {
          hover(id);
          assert(map.nodeDrag.target?.targetId === id && map.nodeDrag.target.placement === 'child', style + ': center must accept a child');
          assert(highlighted(id), style + ': drop target must show the selection border: ' + id);
          assert(map.selected === 'source' && !map.elements.get(id).classList.contains('selected'), 'Hover must not change actual selection');
          for (const other of ['root', 'target', 'leaf'].filter(other => other !== id)) assert(!highlighted(other), 'Previous hover border must clear');
        }
        for (const [ratio, placement] of [[.1, 'before'], [.9, 'after']]) {
          hover('target', ratio);
          assert(map.nodeDrag.target?.placement === placement, 'Edge must retain insertion placement');
          assert(!highlighted('target') && getComputedStyle(map.elements.get('target'), '::before').height === '3px', 'Edge must show insertion line');
        }
        for (const id of ['source', 'descendant']) {
          hover(id);
          assert(map.nodeDrag.target === null && !highlighted('leaf'), 'Invalid target must clear hover');
        }
        hover('leaf');
        map.moveNodeDrag({pointerId: 1, clientX: -100, clientY: -100}); map.render();
        assert(map.nodeDrag.target === null && !highlighted('leaf'), 'Blank space must clear hover');
        hover('leaf'); map.stopNodeDrag(null, false); map.render();
        assert(!highlighted('leaf') && moves.length === 0, 'Cancel must clear hover without moving');
      }
    }
  }
  begin(); hover('leaf'); map.stopNodeDrag(point('leaf'), true); map.render();
  assert(!highlighted('leaf') && moves.length === 1 && moves[0].join(',') === 'source,leaf,child', 'Drop must clear hover and commit once');
  const gapRoot = node('root', 1, [
    node('upper', 2, [node('u1', 3), node('u2', 3), node('u3', 3)]),
    node('lower', 2, [node('l1', 3), node('l2', 3), node('l3', 3)]),
    node('source', 2)
  ]);
  for (const style of ['processon', 'mindnode']) {
    map.setStyle(style); map.setRoot(gapRoot, {resetView: true});
    for (const scale of [.5, 1, 1.5]) {
      map.scale = scale; map.x = 80; map.y = 100; map.render();
      const upper = map.elements.get('upper').getBoundingClientRect();
      const lower = map.elements.get('lower').getBoundingClientRect();
      const event = {pointerId: 1, clientX: upper.left + upper.width / 2, clientY: (upper.bottom + lower.top) / 2};
      begin(); map.moveNodeDrag(event); map.render();
      assert(map.nodeDrag.target?.targetId === 'lower' && map.nodeDrag.target.placement === 'before', style + ': sibling gap must accept insertion at scale ' + scale);
      assert(getComputedStyle(map.elements.get('lower'), '::before').height === '3px' && !highlighted('lower'), 'Gap must show insertion line instead of child highlight');
      const count = moves.length;
      map.stopNodeDrag(event, true); map.render();
      assert(moves.length === count + 1 && moves.at(-1).join(',') === 'source,lower,before', 'Releasing in gap must commit one sibling move');
      assert(!map.elements.get('lower').classList.contains('drop-before'), 'Drop must clear insertion state');
    }
  }
  window.webkit.messageHandlers.result.postMessage({passed: true, message: 'PASS: ' + checks + ' native WebKit drop highlight checks'});
} catch (error) {
  window.webkit.messageHandlers.result.postMessage({passed: false, message: 'FAIL: ' + error.message + '\n' + error.stack});
}
