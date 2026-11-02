export function createTextMeasurer(document) {
  const context = document.createElement('canvas').getContext('2d');
  const box = document.createElement('div');
  const text = document.createElement('span');
  box.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;contain:layout style paint;white-space:pre-wrap;overflow-wrap:anywhere;text-align:left';
  box.append(text);

  return (label, font, maxWidth, lineHeight) => {
    if (!/[\r\n\t]/.test(label)) {
      context.font = font;
      const width = context.measureText(label).width;
      if (width <= maxWidth) return {width, lines: 1};
    }

    Object.assign(box.style, {font, lineHeight: lineHeight + 'px', width: maxWidth + 'px'});
    text.textContent = label.endsWith('\n') ? label + '\u200b' : label;
    document.body.append(box);
    const width = Math.min(maxWidth, Math.ceil(text.getBoundingClientRect().width));
    const lines = Math.max(1, Math.round(box.offsetHeight / lineHeight));
    box.remove();
    return {width, lines};
  };
}
