const theme = '--pele-surface:rgba(255,255,255,.78);--pele-surface-alt:#e0ecee;--pele-border:#94aaaF;--pele-line:#516975;--pele-fg:#213540;--pele-radius:9px;';

function widenEmptySwimlanes(svg) {
  if (!svg.includes('class="pele pele-swimlane"')) return svg;
  const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
  if (root.querySelector('.pele-node, .pele-edge')) return svg;
  const lanes = [...root.querySelectorAll('.pele-cluster')];
  if (!lanes.length || !lanes.every(lane => lane.matches('.pele-lane') && lane.querySelector('g[transform^="rotate(-90"]'))) return svg;

  const outlines = lanes.map(lane => lane.querySelector('rect'));
  const extraWidth = Math.max(0, 560 - Number(outlines[0].getAttribute('width')));
  if (!extraWidth) return svg;
  for (const outline of outlines) {
    outline.setAttribute('width', Number(outline.getAttribute('width')) + extraWidth);
  }
  const viewBox = root.getAttribute('viewBox').split(/\s+/).map(Number);
  viewBox[2] += extraWidth;
  root.setAttribute('viewBox', viewBox.join(' '));
  root.setAttribute('width', viewBox[2]);
  return new XMLSerializer().serializeToString(root);
}

export function createMermaidPreview(render, source) {
  try {
    const {svg, height} = render(source, {links:false, images:false, fontFamily:'system-ui, sans-serif'});
    const themed = widenEmptySwimlanes(svg).replace('style="', 'style="' + theme);
    const url = URL.createObjectURL(new Blob([themed], {type:'image/svg+xml'}));
    return {source, url, height};
  } catch (error) {
    return {source, error:error.message || '请检查 Mermaid 语法'};
  }
}
