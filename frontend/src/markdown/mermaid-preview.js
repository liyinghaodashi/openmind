const theme = '--pele-surface:rgba(255,255,255,.78);--pele-surface-alt:#e0ecee;--pele-border:#94aaaF;--pele-line:#516975;--pele-fg:#213540;--pele-radius:9px;';

function widenEmptySwimlanes(root) {
  if (root.querySelector('.pele-node, .pele-edge')) return;
  const lanes = [...root.querySelectorAll('.pele-cluster')];
  if (!lanes.length || !lanes.every(lane => lane.matches('.pele-lane') && lane.querySelector('g[transform^="rotate(-90"]'))) return;

  const outlines = lanes.map(lane => lane.querySelector('rect'));
  const extraWidth = Math.max(0, 560 - Number(outlines[0].getAttribute('width')));
  if (!extraWidth) return;
  for (const outline of outlines) {
    outline.setAttribute('width', Number(outline.getAttribute('width')) + extraWidth);
  }
  const viewBox = root.getAttribute('viewBox').split(/\s+/).map(Number);
  viewBox[2] += extraWidth;
  root.setAttribute('viewBox', viewBox.join(' '));
  root.setAttribute('width', viewBox[2]);
}

export function createMermaidPreview(render, source) {
  try {
    const {svg, height} = render(source, {links:false, images:false, fontFamily:'system-ui, sans-serif'});
    let diagram = svg;
    let geometry;
    if (svg.includes('class="pele pele-swimlane"')) {
      const root = new DOMParser().parseFromString(svg, 'image/svg+xml').documentElement;
      widenEmptySwimlanes(root);
      const headers = [...root.querySelectorAll('.pele-cluster.pele-lane')].map(lane => {
        const header = lane.querySelector('rect:nth-of-type(2)');
        const id = lane.getAttribute('data-id');
        return {id, label:lane.textContent.trim() || id, x:header.getAttribute('x'), y:header.getAttribute('y'),
          width:header.getAttribute('width'), height:header.getAttribute('height')};
      });
      geometry = {viewBox:root.getAttribute('viewBox'), headers};
      diagram = new XMLSerializer().serializeToString(root);
    }
    const themed = diagram.replace('style="', 'style="' + theme);
    const url = URL.createObjectURL(new Blob([themed], {type:'image/svg+xml'}));
    return {source, url, height, geometry};
  } catch (error) {
    return {source, error:error.message || '请检查 Mermaid 语法'};
  }
}
