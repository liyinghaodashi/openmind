const textInputTypes = new Set(['text', 'search', 'url', 'tel', 'password']);
const mirrorProperties = ['fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch', 'fontFeatureSettings', 'fontKerning', 'lineHeight', 'letterSpacing', 'wordSpacing', 'textAlign', 'textIndent', 'textTransform', 'direction', 'tabSize', 'whiteSpace', 'overflowWrap', 'wordBreak', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth'];

function isTextControl(element) {
  return element?.tagName === 'TEXTAREA' || element?.tagName === 'INPUT' && textInputTypes.has(element.type);
}

function editableTarget(element) {
  if (!element || element.disabled || element.readOnly) return null;
  return isTextControl(element) || element.isContentEditable ? element : null;
}

function selectionRect(target, mirror, cache) {
  const selection = window.getSelection();
  if (!selection?.isCollapsed || !selection.rangeCount || !target.contains(selection.anchorNode)) return null;
  const range = selection.getRangeAt(0);
  const rect = [...range.getClientRects()].find(rect => rect.height > 0);
  if (rect) return rect;
  const node = range.startContainer;
  const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
  const child = element.childNodes[range.startOffset];
  const br = child?.nodeName === 'BR' ? child : element.querySelector(':scope > br:only-child');
  if (br) {
    const probe = document.createRange();
    probe.selectNode(br);
    return [...probe.getClientRects()].find(rect => rect.height > 0) || null;
  }
  if (element.tagName === 'LI' && !element.hasChildNodes()) {
    const style = getComputedStyle(element), bounds = element.getBoundingClientRect();
    if (!element.offsetWidth || !element.offsetHeight) return null;
    for (const property of mirrorProperties) mirror.style[property] = style[property];
    mirror.style.width = element.offsetWidth + 'px';
    mirror.replaceChildren(document.createTextNode('\u200b'));
    cache.signature = null; cache.value = null;
    const probe = document.createRange();
    probe.selectNodeContents(mirror.firstChild);
    const text = probe.getBoundingClientRect(), origin = mirror.getBoundingClientRect();
    const scaleX = bounds.width / element.offsetWidth, scaleY = bounds.height / element.offsetHeight;
    return text.height ? {
      left: bounds.left + (text.left - origin.left) * scaleX,
      top: bounds.top + (text.top - origin.top) * scaleY,
      height: text.height * scaleY
    } : null;
  }
  return null;
}

function controlRect(target, mirror, cache) {
  if (target.selectionStart === null || target.selectionStart !== target.selectionEnd) return null;
  const style = getComputedStyle(target);
  const width = target.clientWidth + parseFloat(style.borderLeftWidth) + parseFloat(style.borderRightWidth) + 'px';
  const whiteSpace = target.tagName === 'INPUT' || target.wrap === 'off' ? 'pre' : style.whiteSpace;
  const signature = [...mirrorProperties.map(property => style[property]), width, whiteSpace, target.tagName].join('|');
  if (cache.signature !== signature) {
    for (const property of mirrorProperties) mirror.style[property] = style[property];
    mirror.style.width = width;
    mirror.style.whiteSpace = whiteSpace;
    mirror.style.overflowWrap = target.tagName === 'INPUT' ? 'normal' : style.overflowWrap;
    cache.signature = signature;
  }
  const value = target.type === 'password' ? '•'.repeat(target.value.length) : target.value;
  if (cache.value !== value) {
    mirror.replaceChildren(document.createTextNode(value), document.createTextNode('\u200b'));
    cache.value = value;
  }
  const text = mirror.firstChild;
  const range = document.createRange();
  range.setStart(text, target.selectionStart);
  range.collapse(true);
  let rect = [...range.getClientRects()].find(rect => rect.height > 0);
  if (!rect || target.selectionStart === value.length && value.endsWith('\n')) {
    if (target.selectionStart === value.length) {
      range.selectNodeContents(mirror.lastChild);
    } else {
      range.setEnd(text, target.selectionStart + 1);
    }
    rect = range.getBoundingClientRect();
  }
  if (!rect.height) return null;
  const bounds = target.getBoundingClientRect(), origin = mirror.getBoundingClientRect();
  const scaleX = bounds.width / target.offsetWidth, scaleY = bounds.height / target.offsetHeight;
  const inputCenter = target.tagName === 'INPUT'
    ? (target.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom) - (mirror.offsetHeight - parseFloat(style.borderTopWidth) - parseFloat(style.borderBottomWidth) - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom))) / 2
    : 0;
  return {
    left: bounds.left + (rect.left - origin.left - target.scrollLeft) * scaleX,
    top: bounds.top + (rect.top - origin.top - target.scrollTop + inputCenter) * scaleY,
    height: rect.height * scaleY
  };
}

function clipRect(target, rect, offset) {
  let left = 0, top = 0, right = window.innerWidth, bottom = window.innerHeight;
  for (let element = target; element && element !== document.body; element = element.parentElement) {
    const style = getComputedStyle(element), bounds = element.getBoundingClientRect();
    const scaleX = element.offsetWidth ? bounds.width / element.offsetWidth : 1;
    const scaleY = element.offsetHeight ? bounds.height / element.offsetHeight : 1;
    if (isTextControl(element) || style.overflowX !== 'visible') {
      left = Math.max(left, bounds.left + element.clientLeft * scaleX);
      right = Math.min(right, bounds.left + (element.clientLeft + element.clientWidth) * scaleX);
    }
    if (isTextControl(element) || style.overflowY !== 'visible') {
      top = Math.max(top, bounds.top + element.clientTop * scaleY);
      bottom = Math.min(bottom, bounds.top + (element.clientTop + element.clientHeight) * scaleY);
    }
  }
  const y = Math.max(top, rect.top + offset);
  const height = Math.min(bottom, rect.top + offset + rect.height) - y;
  return rect.left >= left - 1 && rect.left <= right + 1 && height > 0
    ? {left: Math.max(left, Math.min(rect.left, right - 2)), top: y, height}
    : null;
}

export function mountGlobalCaret({offset = 2} = {}) {
  const caret = document.createElement('div'), mirror = document.createElement('div');
  const mirrorCache = {};
  caret.className = 'global-caret';
  mirror.className = 'global-caret-mirror';
  caret.setAttribute('aria-hidden', 'true');
  mirror.setAttribute('aria-hidden', 'true');
  caret.hidden = true;
  document.body.append(caret, mirror);
  let active = null, composing = false, frame = 0, focused = document.hasFocus(), lastPosition = '';
  const listeners = [];
  function restore() {
    active?.removeAttribute('data-global-caret');
    active = null;
    caret.hidden = true;
    lastPosition = '';
  }
  function update() {
    frame = 0;
    const target = editableTarget(document.activeElement);
    if (!target || composing || !focused || document.hidden || !target.getClientRects().length) { restore(); return; }
    if (active !== target) { restore(); active = target; }
    const parent = target.closest('dialog[open]') || document.body;
    if (caret.parentElement !== parent) parent.append(caret);
    if (mirror.parentElement !== parent) parent.append(mirror);
    const selection = window.getSelection();
    const node = selection?.anchorNode;
    const anchor = isTextControl(target) ? target : (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement) || target;
    const style = getComputedStyle(anchor);
    const caretOffset = anchor.closest('h1,h2,h3,h4,h5,h6') && parseFloat(style.fontSize) >= 21 ? offset : 0;
    const rect = isTextControl(target) ? controlRect(target, mirror, mirrorCache) : selectionRect(target, mirror, mirrorCache);
    const clipped = rect && clipRect(target, rect, caretOffset);
    if (!clipped) { restore(); return; }
    const color = style.color;
    const position = [clipped.left, clipped.top, clipped.height, color].join(':');
    if (position !== lastPosition) {
      caret.style.left = clipped.left + 'px';
      caret.style.top = clipped.top + 'px';
      caret.style.height = clipped.height + 'px';
      caret.style.backgroundColor = color;
      caret.getAnimations().forEach(animation => { animation.currentTime = 0; });
      lastPosition = position;
    }
    caret.hidden = false;
    if (!target.hasAttribute('data-global-caret')) target.setAttribute('data-global-caret', '');
  }
  function schedule() { if (!frame) frame = requestAnimationFrame(update); }
  function listen(target, type, listener) {
    target.addEventListener(type, listener, true);
    listeners.push(() => target.removeEventListener(type, listener, true));
  }
  for (const event of ['focusin', 'focusout', 'selectionchange', 'select', 'input', 'keyup', 'pointerup', 'scroll']) listen(document, event, schedule);
  listen(document, 'keydown', () => { caret.getAnimations().forEach(animation => { animation.currentTime = 0; }); schedule(); });
  listen(document, 'compositionstart', () => { composing = true; restore(); });
  listen(document, 'compositionend', () => { composing = false; schedule(); });
  listen(window, 'blur', () => { focused = false; composing = false; restore(); });
  listen(window, 'focus', () => { focused = true; schedule(); });
  listen(window, 'resize', schedule);
  listen(document, 'visibilitychange', schedule);
  const observer = new MutationObserver(records => {
    if (!editableTarget(document.activeElement) && !active) return;
    if (records.some(record => record.target !== caret && !mirror.contains(record.target) &&
      !(record.type === 'childList' && [...record.addedNodes, ...record.removedNodes].every(node => node === caret || node === mirror)))) schedule();
  });
  observer.observe(document.body, {subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['style', 'class', 'hidden', 'readonly', 'disabled', 'contenteditable', 'open']});
  schedule();
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    listeners.forEach(remove => remove());
    restore(); caret.remove(); mirror.remove();
  };
}
