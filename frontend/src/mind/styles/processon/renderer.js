function styleDepth(node, depth) {
  return node?.kind === 'heading' ? node.level - 1 : node?.kind === 'list' ? Math.max(2, depth) : depth;
}

function intersects(p, view) {
  return p.x + p.width >= view.x && p.x <= view.x + view.width && p.y + p.height >= view.y && p.y <= view.y + view.height;
}

function colorTint(color) {
  if (!/^#[\da-f]{6}$/i.test(color || '')) return '';
  const channels = [1, 3, 5].map(offset => Math.round(parseInt(color.slice(offset, offset + 2), 16) * .20 + 255 * .80));
  return `rgb(${channels.join(', ')})`;
}

export class ProcessonRenderer {
  constructor({canvas, scene, nodes, edges, onActivate, onEdit, measureText, getNodeMaxWidth = () => 340}) {
    Object.assign(this, {canvas, scene, nodes, edges, onActivate, onEdit, measureText, getNodeMaxWidth});
    this.document = canvas.ownerDocument;
    this.elements = new Map();
    this.edgeElements = new Map();
    this.measurements = new Map();
  }

  measure(label, depth, node) {
    depth = styleDepth(node, depth);
    const compact = depth === 0 ? !this.canvas.classList.contains('mind-main-node-mark') : depth === 1 ? !this.canvas.classList.contains('mind-second-node-mark') : true;
    const max = this.getNodeMaxWidth();
    const key = max + ':' + compact + ':' + depth + ':' + label;
    if (this.measurements.has(key)) return this.measurements.get(key);
    const font = depth === 0 ? 22 : depth === 1 ? 15 : 14;
    const line = depth === 0 ? 29 : 22, pad = compact ? 12 : depth === 0 ? 44 : 34;
    const textFont = `${depth === 0 ? 600 : depth === 1 ? 550 : 400} ${font}px LocalUI, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
    const {width, lines} = this.measureText(label, textFont, max, line);
    const horizontalInset = pad + (lines === 1 ? 8 : 2);
    const size = {lines, lineHeight: line, width: Math.max(compact ? 24 : depth === 0 ? 145 : 83, width + horizontalInset), height: line * lines + (compact ? 10 : depth === 0 ? 36 : 26)};
    if (this.measurements.size > 5000) this.measurements.clear();
    this.measurements.set(key, size);
    return size;
  }

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

  render({layout, x, y, scale, selected, editing, editor, collapsed, drag, renderAll = false}) {
    const pixelRatio = this.document.defaultView?.devicePixelRatio || 1;
    x = Math.round(x * pixelRatio) / pixelRatio;
    y = Math.round(y * pixelRatio) / pixelRatio;
    this.scene.style.transform = `translate(${x}px,${y}px) scale(${scale})`;
    const view = {x: (-x - 150) / scale, y: (-y - 100) / scale, width: (this.canvas.clientWidth + 300) / scale, height: (this.canvas.clientHeight + 200) / scale};
    const keep = new Set();
    for (const p of layout.positions) {
      if (!renderAll && !intersects(p, view) && p.id !== selected) continue;
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
      const tint = depth <= 1 ? colorTint(p.effectiveColor) : '';
      if (tint) {element.classList.add('colored'); element.style.setProperty('--node-color-background', tint);}
      else element.style.removeProperty('--node-color-background');
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
      const a = edge.from, b = edge.to, startX = a.x + a.width, startY = a.y + a.height / 2, endY = b.y + b.height / 2;
      if (!renderAll && !intersects({x: startX, y: Math.min(startY, endY), width: b.x - startX, height: Math.abs(endY - startY)}, view)) continue;
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
        const depth = styleDepth(p.node, p.depth);
        editor.className = 'node-editor ' + (depth === 0 ? 'root' : depth === 1 ? 'branch' : 'leaf');
        editor.style.color = depth <= 1 && colorTint(p.effectiveColor) ? '#303030' : '';
        Object.assign(editor.style, {left: p.x + 'px', top: p.y + 'px', width: p.width + 'px', height: p.height + 'px'});
      }
    }
  }

  async createPng({layout, collapsed, x, y, scale, selected, editing, editor, drag}) {
    const padding = 32;
    const width = Math.max(1, Math.ceil(layout.width + padding * 2));
    const height = Math.max(1, Math.ceil(layout.height + padding * 2));
    const pixelRatio = Math.min(2, Math.max(1, this.document.defaultView?.devicePixelRatio || 1), Math.sqrt(24000000 / (width * height)));
    const current = {layout, x, y, scale, selected, editing, editor, collapsed, drag};
    this.render({layout, x: 0, y: 0, scale: 1, selected: null, editing: null, editor: null, collapsed, drag: null, renderAll: true});
    try {
      const svg = this.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
      svg.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
      svg.setAttribute('width', String(width));
      svg.setAttribute('height', String(height));
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
      const background = this.document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      background.setAttribute('width', String(width));
      background.setAttribute('height', String(height));
      background.setAttribute('fill', '#fff');
      svg.append(background);
      const edgeGroup = this.document.createElementNS('http://www.w3.org/2000/svg', 'g');
      edgeGroup.setAttribute('transform', `translate(${padding} ${padding})`);
      svg.append(edgeGroup);
      for (const edge of layout.edges) {
        const a = edge.from, b = edge.to, startX = a.x + a.width, startY = a.y + a.height / 2, endY = b.y + b.height / 2;
        const mid = startX + (b.x - startX) * .4, radius = Math.min(7, Math.abs(endY - startY), (b.x - mid) / 2), direction = Math.sign(endY - startY);
        const path = this.document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('fill', 'none');
        path.setAttribute('d', direction === 0 ? `M ${startX} ${startY} H ${b.x}` : `M ${startX} ${startY} H ${mid} V ${endY - direction * radius} Q ${mid} ${endY} ${mid + radius} ${endY} H ${b.x}`);
        path.setAttribute('stroke-width', '1.85');
        path.setAttribute('stroke-linecap', 'butt');
        path.setAttribute('stroke', edge.color || '#7c808d');
        edgeGroup.append(path);
      }
      const nodeGroup = this.document.createElementNS('http://www.w3.org/2000/svg', 'g');
      nodeGroup.setAttribute('transform', `translate(${padding} ${padding})`);
      svg.append(nodeGroup);
      for (const position of layout.positions) {
        const source = this.elements.get(position.id);
        if (!source) continue;
        const foreign = this.document.createElementNS('http://www.w3.org/2000/svg', 'foreignObject');
        const badgeWidth = position.hiddenCount ? 10 + Math.max(22, 12 + String(position.hiddenCount).length * 7) : 0;
        foreign.setAttribute('x', String(position.x));
        foreign.setAttribute('y', String(position.y));
        foreign.setAttribute('width', String(position.width + badgeWidth));
        foreign.setAttribute('height', String(position.height));
        const node = source.cloneNode(true);
        node.setAttribute('xmlns', 'http://www.w3.org/1999/xhtml');
        node.className = source.className.replace(/\b(selected|editing|dragging-source|drop-before|drop-after)\b/g, '').replace(/\s+/g, ' ').trim();
        const inlineStyles = (from, to) => {
          const computed = this.document.defaultView?.getComputedStyle(from);
          if (!computed) return;
          for (let i = 0; i < computed.length; i++) {
            const name = computed[i];
            to.style.setProperty(name, computed.getPropertyValue(name), computed.getPropertyPriority(name));
          }
          for (let i = 0; i < from.children.length; i++) inlineStyles(from.children[i], to.children[i]);
        };
        inlineStyles(source, node);
        Object.assign(node.style, {position: 'relative', left: '0px', top: '0px', width: position.width + 'px', height: position.height + 'px', minHeight: '0px', margin: '0', transform: 'none', outline: 'none', pointerEvents: 'none'});
        nodeGroup.append(foreign);
        foreign.append(node);
      }
      const serialized = new XMLSerializer().serializeToString(svg);
      const image = new Image();
      return await new Promise((resolve, reject) => {
        image.onload = () => {
          try {
            const canvas = this.document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(width * pixelRatio));
            canvas.height = Math.max(1, Math.round(height * pixelRatio));
            const context = canvas.getContext('2d');
            context.fillStyle = '#fff';
            context.fillRect(0, 0, canvas.width, canvas.height);
            context.drawImage(image, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/png'));
          } catch (error) {
            reject(error);
          }
        };
        image.onerror = () => reject(new Error('生成 PNG 失败。'));
        image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(serialized);
      });
    } finally {
      this.render(current);
    }
  }

  clear() {
    for (const element of this.elements.values()) element.remove();
    for (const path of this.edgeElements.values()) path.remove();
    this.elements.clear();
    this.edgeElements.clear();
  }
}
