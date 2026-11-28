const theme = '--pele-surface:rgba(255,255,255,.78);--pele-surface-alt:#e0ecee;--pele-border:#94aaaF;--pele-line:#516975;--pele-fg:#213540;--pele-radius:9px;';

export function createMermaidPreview(render, source) {
  try {
    const {svg, height} = render(source, {links:false, images:false, fontFamily:'system-ui, sans-serif'});
    const themed = svg.replace('style="', 'style="' + theme);
    const url = URL.createObjectURL(new Blob([themed], {type:'image/svg+xml'}));
    return {source, url, height};
  } catch (error) {
    return {source, error:error.message || '请检查 Mermaid 语法'};
  }
}
