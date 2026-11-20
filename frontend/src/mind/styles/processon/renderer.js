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

function wrapText(label, font, maxWidth, measureText) {
  const lines = [];
  for (const paragraph of String(label).split('\n')) {
    const characters = Array.from(paragraph);
    if (!characters.length) {
      lines.push('');
      continue;
    }
    let line = '';
    for (const character of characters) {
      const candidate = line + character;
      if (line && measureText(candidate, font, Number.MAX_SAFE_INTEGER, 1).width > maxWidth) {
        lines.push(line);
        line = character;
      } else {
        line = candidate;
      }
    }
    lines.push(line);
  }
  return lines;
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
      const metrics = this.document.createElement('canvas').getContext('2d');
      for (const position of layout.positions) {
        const depth = styleDepth(position.node, position.depth);
        const mainMarked = this.canvas.classList.contains('mind-main-node-mark');
        const secondMarked = this.canvas.classList.contains('mind-second-node-mark');
        const compact = depth === 0 ? !mainMarked : depth === 1 ? !secondMarked : true;
        const horizontalPadding = compact ? 6 : depth === 0 ? 22 : 17;
        const lineHeight = depth === 0 ? 29 : 22;
        const fontSize = depth === 0 ? 22 : depth === 1 ? 15 : 14;
        const fontWeight = depth === 0 ? 600 : depth === 1 ? 550 : 400;
        const font = `${fontWeight} ${fontSize}px LocalUI, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif`;
        const label = (position.displayLabel ?? position.node.label) || '空节点';
        const lines = wrapText(label, font, Math.max(1, position.width - horizontalPadding * 2 - 2), this.measureText);
        const tint = depth <= 1 ? colorTint(position.effectiveColor) : '';
        const rectangle = this.document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rectangle.setAttribute('x', String(position.x));
        rectangle.setAttribute('y', String(position.y));
        rectangle.setAttribute('width', String(position.width));
        rectangle.setAttribute('height', String(position.height));
        rectangle.setAttribute('rx', depth === 2 ? '0' : '9');
        rectangle.setAttribute('fill', tint || (depth === 0 ? (mainMarked ? '#202020' : 'none') : depth === 1 ? (secondMarked ? '#e4e4e7' : 'none') : 'none'));
        rectangle.setAttribute('stroke', tint || (depth === 0 && mainMarked ? '#202020' : 'none'));
        if (depth === 2) rectangle.setAttribute('stroke-width', '0');
        nodeGroup.append(rectangle);
        const text = this.document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(position.x + horizontalPadding + 1));
        metrics.font = font;
        const firstLine = metrics.measureText(lines[0] || '国');
        const lastLine = lines.length === 1 ? firstLine : metrics.measureText(lines.at(-1) || '国');
        const baseline = position.y + (position.height - (lines.length - 1) * lineHeight
          + firstLine.actualBoundingBoxAscent - lastLine.actualBoundingBoxDescent) / 2;
        text.setAttribute('fill', depth === 0 && mainMarked && !tint ? '#fff' : depth === 2 ? '#404040' : '#303030');
        text.setAttribute('font-family', 'LocalUI, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif');
        text.setAttribute('font-size', String(fontSize));
        text.setAttribute('font-weight', String(fontWeight));
        text.setAttribute('xml:space', 'preserve');
        lines.forEach((line, index) => {
          const tspan = this.document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
          tspan.setAttribute('x', String(position.x + horizontalPadding + 1));
          tspan.setAttribute('y', String(baseline + index * lineHeight));
          tspan.textContent = line;
          text.append(tspan);
        });
        nodeGroup.append(text);
        if (position.hiddenCount) {
          const badgeWidth = Math.max(22, 12 + String(position.hiddenCount).length * 7);
          const badge = this.document.createElementNS('http://www.w3.org/2000/svg', 'rect');
          badge.setAttribute('x', String(position.x + position.width + 10));
          badge.setAttribute('y', String(position.y + position.height / 2 - 11));
          badge.setAttribute('width', String(badgeWidth));
          badge.setAttribute('height', '22');
          badge.setAttribute('rx', '11');
          badge.setAttribute('fill', '#fff');
          badge.setAttribute('stroke', '#b8b8b8');
          nodeGroup.append(badge);
          const badgeText = this.document.createElementNS('http://www.w3.org/2000/svg', 'text');
          badgeText.setAttribute('x', String(position.x + position.width + 10 + badgeWidth / 2));
          badgeText.setAttribute('y', String(position.y + position.height / 2));
          badgeText.setAttribute('fill', '#777');
          badgeText.setAttribute('font-family', 'LocalUI, -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif');
          badgeText.setAttribute('font-size', '11');
          badgeText.setAttribute('text-anchor', 'middle');
          badgeText.setAttribute('dominant-baseline', 'middle');
          badgeText.textContent = String(position.hiddenCount);
          nodeGroup.append(badgeText);
        }
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
