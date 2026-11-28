try {
  const md = '源/笔记.md', mind = '源/子/想法.mind.md';
  const source = ['~~~sql', 'SELECT count(*) FROM notes WHERE id > 42;', '~~~', '', '~~~mermaid', 'graph TD', 'A --> B', '~~~'].join('\n');
  window.__fileDragFixture.documents.get(md).source = source;
  const settle = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const registered = () => [...CSS.highlights].filter(([key]) => key.startsWith('md-'))
    .reduce((sum, [, highlight]) => sum + highlight.size, 0);
  const other = new Highlight();
  CSS.highlights.set('independent-highlight', other);

  await openDocument(md);
  await settle();
  const originalCount = registered();
  if (!originalCount) throw new Error('正文未创建高亮');
  const expandSelector='button[aria-label="放大代码块"]';
  for(let i=0;i<60&&!document.querySelector(expandSelector);i++)await settle();
  document.querySelector(expandSelector).click();
  await settle();
  const viewer = document.querySelector('.markdown-code-viewer');
  if (viewer.hidden || !viewer.querySelector('textarea')?.value.includes('A --> B'))
    throw new Error('Mermaid 代码块未放大');

  await openDocument(mind);
  await settle();
  if (registered()) throw new Error('切换后残留 ' + registered() + ' 个 MD 高亮范围');
  if (CSS.highlights.get('independent-highlight') !== other) throw new Error('其他高亮受到影响');

  await openDocument(md);
  await settle();
  if (registered() !== originalCount || markdown.currentSource() !== source)
    throw new Error('返回 MD 后高亮数量或正文错误');
  await toggleSource(true);
  await settle();
  if (registered()) throw new Error('原文模式残留正文高亮');
  await toggleSource(false);
  await settle();
  if (registered() !== originalCount) throw new Error('从原文返回时未恢复高亮');
  window.webkit.messageHandlers.result.postMessage({passed: true, message: 'PASS: MD / mind / 原文高亮生命周期'});
} catch (error) {
  window.webkit.messageHandlers.result.postMessage({passed: false, message: error.message});
}
