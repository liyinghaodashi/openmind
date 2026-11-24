export function bindSidebarResize({sidebar, handle, onResize, onCommit}) {
  const min = 180;
  const max = 480;
  let drag = null;

  function clamp(value) {
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  function resize(value) {
    const width = clamp(value);
    onResize(width);
    handle.setAttribute('aria-valuenow', String(width));
    return width;
  }

  function stop() {
    if (!drag) return;
    if (handle.hasPointerCapture(drag.id)) handle.releasePointerCapture(drag.id);
    const width = drag.width;
    drag = null;
    handle.classList.remove('dragging');
    onCommit(width);
  }

  handle.addEventListener('pointerdown', event => {
    if (drag || event.button !== 0 || !event.isPrimary) return;
    drag = {id: event.pointerId, width: sidebar.getBoundingClientRect().width};
    handle.setPointerCapture(event.pointerId);
    handle.classList.add('dragging');
    event.preventDefault();
  });
  handle.addEventListener('pointermove', event => {
    if (event.pointerId !== drag?.id) return;
    drag.width = resize(event.clientX - sidebar.getBoundingClientRect().left);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    handle.addEventListener(type, event => {if (event.pointerId === drag?.id) stop()});
  }
  handle.addEventListener('keydown', event => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const width = resize(sidebar.getBoundingClientRect().width + (event.key === 'ArrowRight' ? 1 : -1));
    onCommit(width);
  });
  window.addEventListener('blur', stop);

  return () => {
    window.removeEventListener('blur', stop);
    stop();
  };
}
