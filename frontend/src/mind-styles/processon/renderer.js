function intersects(p, view) {
  return p.x + p.width >= view.x && p.x <= view.x + view.width && p.y + p.height >= view.y && p.y <= view.y + view.height;
}

function colorTint(color) {
  if (!/^#[\da-f]{6}$/i.test(color || '')) return '';
  const channels = [1, 3, 5].map(offset => Math.round(parseInt(color.slice(offset, offset + 2), 16) * .20 + 255 * .80));
  return `rgb(${channels.join(', ')})`;
}

export class ProcessonRenderer {
  constructor({canvas, scene, nodes, edges, onActivate, onEdit}) {
    Object.assign(this, {canvas, scene, nodes, edges, onActivate, onEdit});
    this.document = canvas.ownerDocument;
    this.context = this.document.createElement('canvas').getContext('2d');
    this.elements = new Map();
    this.edgeElements = new Map();
    this.measurements = new Map();
    canvas.dataset.mindStyle = 'processon';
  }

  measure(label, depth) {
    const compact = depth === 0 ? !this.canvas.classList.contains('mind-main-node-mark') : depth === 1 ? !this.canvas.classList.contains('mind-second-node-mark') : true;
    const key = compact + ':' + depth + ':' + label;
    if (this.measurements.has(key)) return this.measurements.get(key);
    const font = depth === 0 ? 22 : depth === 1 ? 15 : 14;
    const line = depth === 0 ? 29 : 22, pad = compact ? 12 : depth === 0 ? 44 : 34;
    this.context.font = `${depth === 0 ? 600 : depth === 1 ? 550 : 400} ${font}px LocalUI, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
    const max = depth === 0 ? 255 : 280;
    let row = 0, lines = 1, widest = 0;
    for (const char of label) {
      const width = this.context.measureText(char).width;
      if (char === '\n' || row + width > max) {widest = Math.max(widest, row); row = char === '\n' ? 0 : width; lines++;}
      else row += width;
    }
    const size = {width: Math.max(compact ? 24 : depth === 0 ? 145 : 83, Math.min(max, Math.max(widest, row)) + pad + 8), height: line * lines + (compact ? 10 : depth === 0 ? 36 : 26)};
    if (this.measurements.size > 5000) this.measurements.clear();
    this.measurements.set(key, size);
    return size;
  }

  createEditor(position) {
    const editor = this.document.createElement('textarea');
    editor.className = 'node-editor ' + (position.depth === 0 ? 'root' : position.depth === 1 ? 'branch' : 'leaf');
    editor.value = position.node.label;
    editor.spellcheck = false;
    editor.setAttribute('aria-label', '编辑节点名称');
    return editor;
  }

  measureEditor(editor, depth) {
    const size = this.measure(editor.value || '空节点', depth);
    Object.assign(editor.style, {width: size.width + 'px', height: size.height + 'px'});
    const borderHeight = editor.offsetHeight - editor.clientHeight;
    return {width: size.width, height: Math.max(size.height, editor.scrollHeight + borderHeight)};
  }

  createDragGhost(element, scale) {
    const ghost = element.cloneNode(true);
    ghost.className = element.className + ' node-drag-ghost';
    ghost.removeAttribute('tabindex');
    ghost.setAttribute('aria-hidden', 'true');
    Object.assign(ghost.style, {position: 'absolute', left: '0', top: '0', width: element.offsetWidth * scale + 'px', minHeight: '0', fontSize: parseFloat(getComputedStyle(element).fontSize) * scale + 'px'});
    return ghost;
  }

  render({layout, x, y, scale, selected, editing, editor, collapsed, drag}) {
    this.scene.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    const view = {x: (-x - 150) / scale, y: (-y - 100) / scale, width: (this.canvas.clientWidth + 300) / scale, height: (this.canvas.clientHeight + 200) / scale};
    const keep = new Set();
    for (const p of layout.positions) {
      if (!intersects(p, view) && p.id !== selected) continue;
      keep.add(p.id);
      let element = this.elements.get(p.id);
      if (!element) {
        element = this.document.createElement('div');
        element.tabIndex = 0;
        element.setAttribute('role', 'button');
        element.dataset.id = p.id;
        const text = this.document.createElement('span');
        text.className = 'node-label';
        element.append(text);
        element.addEventListener('click', () => this.onActivate(element.dataset.id));
        element.addEventListener('dblclick', () => this.onEdit(element.dataset.id));
        this.nodes.append(element);
        this.elements.set(p.id, element);
      }
      element.className = `mind-node ${p.depth === 0 ? 'root' : p.depth === 1 ? 'branch' : 'leaf'}${p.id === selected ? ' selected' : ''}${editing === p.id ? ' editing' : ''}${drag?.active && drag.id === p.id ? ' dragging-source' : ''}${drag?.target?.targetId === p.id ? ' drop-' + drag.target.placement : ''}`;
      const tint = p.depth <= 1 ? colorTint(p.effectiveColor) : '';
      if (tint) {element.classList.add('colored'); element.style.setProperty('--node-color-background', tint);}
      else element.style.removeProperty('--node-color-background');
      const text = element.firstChild;
      const label = editing === p.id && editor ? editor.value : p.node.label;
      if (text.textContent !== (label || '空节点')) text.textContent = label || '空节点';
      Object.assign(element.style, {left: p.x + 'px', top: p.y + 'px', width: p.width + 'px', minHeight: p.height + 'px'});
      element.setAttribute('aria-label', p.node.label + (p.node.editable ? '，单击选中，再次单击或双击编辑' : '，只读节点'));
      if (p.node.children.length) element.setAttribute('aria-expanded', String(!collapsed.has(p.id)));
      else element.removeAttribute('aria-expanded');
      let badge = element.querySelector('.node-fold-count');
      if (p.hiddenCount) {
        if (!badge) {badge = this.document.createElement('span'); badge.className = 'node-fold-count'; badge.setAttribute('aria-hidden', 'true'); element.append(badge);}
        badge.textContent = String(p.hiddenCount);
        element.setAttribute('aria-label', element.getAttribute('aria-label') + `，已折叠，隐藏 ${p.hiddenCount} 个后代节点`);
      } else badge?.remove();
    }
    for (const [id, element] of this.elements) if (!keep.has(id)) {element.remove(); this.elements.delete(id);}
    const keepEdges = new Set();
    for (const edge of layout.edges) {
      const a = edge.from, b = edge.to, startX = a.x + a.width, startY = a.y + a.height / 2, endY = b.y + b.height / 2;
      if (!intersects({x: startX, y: Math.min(startY, endY), width: b.x - startX, height: Math.abs(endY - startY)}, view)) continue;
      keepEdges.add(edge.id);
      let path = this.edgeElements.get(edge.id);
      if (!path) {path = this.document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('fill', 'none'); this.edges.append(path); this.edgeElements.set(edge.id, path);}
      const mid = startX + (b.x - startX) * .4, radius = Math.min(7, Math.abs(endY - startY), (b.x - mid) / 2), direction = Math.sign(endY - startY);
      path.setAttribute('d', direction === 0 ? `M ${startX} ${startY} H ${b.x}` : `M ${startX} ${startY} H ${mid} V ${endY - direction * radius} Q ${mid} ${endY} ${mid + radius} ${endY} H ${b.x}`);
      path.setAttribute('stroke-width', '1.85');
      path.setAttribute('stroke-linecap', 'butt');
      path.setAttribute('stroke', edge.color || '#7c808d');
    }
    for (const [id, path] of this.edgeElements) if (!keepEdges.has(id)) {path.remove(); this.edgeElements.delete(id);}
    if (editor) {
      const p = layout.positions.find(position => position.id === editing);
      if (p) {
        editor.className = 'node-editor ' + (p.depth === 0 ? 'root' : p.depth === 1 ? 'branch' : 'leaf');
        editor.style.color = p.depth <= 1 && colorTint(p.effectiveColor) ? '#303030' : '';
        Object.assign(editor.style, {left: p.x + 'px', top: p.y + 'px', width: p.width + 'px', height: p.height + 'px'});
      }
    }
  }

  clear() {
    for (const element of this.elements.values()) element.remove();
    for (const path of this.edgeElements.values()) path.remove();
    this.elements.clear();
    this.edgeElements.clear();
  }
}
