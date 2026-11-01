export function mountFileTreeHover(tree) {
  let enabled = false;
  let overlay = null;
  const hide = () => {overlay?.remove(); overlay = null;};
  tree.addEventListener('pointerover', event => {
    const row = event.target.closest('.tree-row');
    if (!enabled || !row || !tree.contains(row) || event.buttons) return;
    if (row.contains(event.relatedTarget)) return;
    hide();
    const name = row.querySelector('.tree-name');
    if (!name || name.scrollWidth <= name.clientWidth) return;
    const bounds = row.getBoundingClientRect();
    overlay = row.cloneNode(true);
    overlay.classList.add('file-name-expanded');
    overlay.removeAttribute('id');
    overlay.tabIndex = -1;
    overlay.setAttribute('aria-hidden', 'true');
    Object.assign(overlay.style, {
      left: bounds.left + 'px', top: bounds.top + 'px',
      width: Math.min(bounds.width + name.scrollWidth - name.clientWidth + 1, window.innerWidth - bounds.left) + 'px',
      height: bounds.height + 'px'
    });
    document.body.append(overlay);
  });
  tree.addEventListener('pointerout', event => {
    const row = event.target.closest('.tree-row');
    if (row && !row.contains(event.relatedTarget)) hide();
  });
  document.addEventListener('pointerdown', hide, true);
  document.addEventListener('keydown', hide, true);
  document.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
  window.addEventListener('blur', hide);
  return {hide, setEnabled(value) {enabled = value; hide();}};
}
