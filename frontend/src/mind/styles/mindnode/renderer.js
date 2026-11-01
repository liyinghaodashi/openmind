function styleDepth(node, depth) {
  return node?.kind === 'heading' ? node.level - 1 : node?.kind === 'list' ? Math.max(2, depth) : depth;
}

function intersects(p, view) {
  return p.x + p.width >= view.x && p.x <= view.x + view.width && p.y + p.height >= view.y && p.y <= view.y + view.height;
}

function rootTint(color) {
  if (!/^#[\da-f]{6}$/i.test(color || '')) return '';
  const channels = [1, 3, 5].map(offset => Math.round(parseInt(color.slice(offset, offset + 2), 16) * .20 + 255 * .80));
  return `rgb(${channels.join(', ')})`;
}

export class MindNodeRenderer {
  constructor({canvas, scene, nodes, edges, onActivate, onEdit, getNodeMaxWidth = () => 340}) {
    Object.assign(this, {canvas, scene, nodes, edges, onActivate, onEdit, getNodeMaxWidth});
    this.document = canvas.ownerDocument;
    this.context = this.document.createElement('canvas').getContext('2d');
    this.elements = new Map();
    this.edgeElements = new Map();
    this.measurements = new Map();
    canvas.dataset.mindStyle = 'mindnode';
  }

  measure(label, depth, node) {
    depth = styleDepth(node, depth);
    const compact = depth !== 0 || !this.canvas.classList.contains('mind-main-node-mark');
    const max = this.getNodeMaxWidth();
    const key = max + ':' + compact + ':' + depth + ':' + label;
    if (this.measurements.has(key)) return this.measurements.get(key);
    const root = depth === 0, font = root ? 22 : 14, line = root ? 29 : 22, pad = compact ? 12 : 44;
    this.context.font = `${root ? 600 : 400} ${font}px LocalUI, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
    let row = 0, lines = 1, widest = 0;
    for (const char of label) {
      const width = this.context.measureText(char).width;
      if (char === '\n' || row + width > max) {widest = Math.max(widest, row); row = char === '\n' ? 0 : width; lines++;}
      else row += width;
    }
    const size = {lines, lineHeight: line, width: Math.max(compact ? 24 : 145, Math.min(max, Math.max(widest, row)) + pad + 8), height: line * lines + (compact ? 10 : 36)};
    if (this.measurements.size > 5000) this.measurements.clear();
    this.measurements.set(key, size);
    return size;
  }

  lineWidth(depth) {return depth === 1 ? 3.35 : depth === 2 ? 2.35 : 1.85;}

  createEditor(position) {
    const editor = this.document.createElement('textarea');
    const depth = styleDepth(position.node, position.depth);
    editor.className = 'node-editor ' + (depth === 0 ? 'root' : depth === 1 ? 'branch' : 'leaf');
    editor.value = position.node.label;
    editor.spellcheck = false;
    editor.setAttribute('aria-label', '编辑节点名称');
    return editor;
  }

  measureEditor(editor, depth, node) {
    const size = this.measure(editor.value || '空节点', depth, node);
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
    const pixelRatio = this.document.defaultView?.devicePixelRatio || 1;
    x = Math.round(x * pixelRatio) / pixelRatio;
    y = Math.round(y * pixelRatio) / pixelRatio;
    this.scene.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    const view = {x: (-x - 150) / scale, y: (-y - 100) / scale, width: (this.canvas.clientWidth + 300) / scale, height: (this.canvas.clientHeight + 200) / scale};
    const keep = new Set();
    for (const p of layout.positions) {
      if (!intersects(p, view) && p.id !== selected) continue;
      keep.add(p.id);
      const depth = styleDepth(p.node, p.depth);
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
      element.className = `mind-node ${depth === 0 ? 'root' : depth === 1 ? 'branch' : 'leaf'}${p.id === selected ? ' selected' : ''}${editing === p.id ? ' editing' : ''}${drag?.active && drag.id === p.id ? ' dragging-source' : ''}${drag?.target?.targetId === p.id ? ' drop-' + drag.target.placement : ''}`;
      const tint = depth === 0 ? rootTint(p.effectiveColor) : '';
      if (tint) {element.classList.add('colored'); element.style.setProperty('--node-color-background', tint);}
      else element.style.removeProperty('--node-color-background');
      element.style.setProperty('--node-line-color', p.effectiveColor || '#b8b8b8');
      element.style.setProperty('--node-line-width', this.lineWidth(depth) + 'px');
      const text = element.firstChild;
      const label = editing === p.id && editor ? editor.value : (p.displayLabel ?? p.node.label);
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
      const a = edge.from, b = edge.to, startX = a.x + a.width;
      const startY = styleDepth(a.node, a.depth) > 0 ? a.y + a.height - this.lineWidth(styleDepth(a.node, a.depth)) / 2 : a.y + a.height / 2;
      const endY = b.y + b.height - this.lineWidth(styleDepth(b.node, b.depth)) / 2;
      if (!intersects({x: startX, y: Math.min(startY, endY), width: b.x - startX, height: Math.abs(endY - startY)}, view)) continue;
      keepEdges.add(edge.id);
      let path = this.edgeElements.get(edge.id);
      if (!path) {path = this.document.createElementNS('http://www.w3.org/2000/svg', 'path'); path.setAttribute('fill', 'none'); this.edges.append(path); this.edgeElements.set(edge.id, path);}
      const mid = startX + (b.x - startX) * .4;
      path.setAttribute('d', `M ${startX} ${startY} C ${mid} ${startY} ${mid} ${endY} ${b.x} ${endY}`);
      path.setAttribute('stroke-width', String(this.lineWidth(styleDepth(b.node, b.depth))));
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('stroke', edge.color || '#b8b8b8');
    }
    for (const [id, path] of this.edgeElements) if (!keepEdges.has(id)) {path.remove(); this.edgeElements.delete(id);}
    if (editor) {
      const p = layout.positions.find(position => position.id === editing);
      if (p) {
        const depth = styleDepth(p.node, p.depth);
        editor.className = 'node-editor ' + (depth === 0 ? 'root' : depth === 1 ? 'branch' : 'leaf');
        editor.style.color = depth === 0 && rootTint(p.effectiveColor) ? '#303030' : '';
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
