const modifiers = [['Ctrl', 'Control'], ['Alt', 'Option'], ['Shift', 'Shift'], ['Meta', 'Command']];
const keys = [
  ...Array.from({length: 20}, (_, i) => ['F' + (i + 1), 'F' + (i + 1)]),
  ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ', key => ['Key' + key, key]),
  ...Array.from('0123456789', key => ['Digit' + key, key]),
  ['Space', '空格'],
];

export function shortcutValue(selected, key) {
  if (!keys.some(([code]) => code === key)) throw new Error('请选择快捷键主键。');
  if (!['Ctrl', 'Alt', 'Meta'].some(modifier => selected.has(modifier))) throw new Error('请至少选择 Control、Option 或 Command 中的一个。');
  return [...modifiers.filter(([code]) => selected.has(code)).map(([code]) => code), key].join('+');
}

export function validShortcut(value) {
  if (value === '') return true;
  if (typeof value !== 'string') return false;
  const parts = value.split('+');
  try {return shortcutValue(new Set(parts.slice(0, -1)), parts.at(-1)) === value;} catch {return false;}
}

export function mountShortcutControl({document, id, labelID, descriptionID, save}) {
  const element = document.createElement('div');
  element.className = 'setting-shortcut-control';
  const current = document.createElement('p');
  current.className = 'setting-shortcut-current';
  const choices = document.createElement('div');
  choices.className = 'setting-shortcut-choices';
  choices.setAttribute('role', 'group');
  choices.setAttribute('aria-label', '快捷键修饰键');
  const selected = new Set();
  const buttons = modifiers.map(([code, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', () => {
      if (selected.has(code)) selected.delete(code); else selected.add(code);
      syncButtons();
    });
    choices.append(button);
    return button;
  });
  function syncButtons() {
    buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(selected.has(modifiers[i][0]))));
  }
  function arrowNavigation(items) {
    items.forEach((button, index) => button.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      event.preventDefault();
      items[(index + (event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length].focus({preventScroll: true});
    }));
  }
  arrowNavigation(buttons);
  const key = document.createElement('select');
  key.id = id;
  key.setAttribute('aria-labelledby', labelID);
  key.setAttribute('aria-describedby', descriptionID);
  for (const [code, label] of keys) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = label;
    key.append(option);
  }
  choices.append(key);
  const actions = document.createElement('div');
  actions.className = 'setting-shortcut-actions';
  const apply = document.createElement('button');
  apply.type = 'button';
  apply.textContent = '保存快捷键';
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = '清除';
  const status = document.createElement('p');
  status.className = 'setting-shortcut-status';
  status.setAttribute('role', 'status');
  apply.addEventListener('click', () => {
    try {save(shortcutValue(selected, key.value));} catch (error) {status.textContent = error.message;}
  });
  clear.addEventListener('click', () => save(''));
  arrowNavigation([apply, clear]);
  actions.append(apply, clear);
  element.append(current, choices, actions, status);
  return {
    element,
    setValue(value) {
      const parts = value ? value.split('+') : ['Ctrl', 'F1'];
      selected.clear();
      parts.slice(0, -1).forEach(code => selected.add(code));
      key.value = parts.at(-1);
      syncButtons();
      current.textContent = value ? '当前：' + value.replace('Alt', 'Option').replace('Meta', 'Command').replace(/Key|Digit/g, '').replace('Space', '空格').replaceAll('+', ' + ') : '当前：未设置';
    },
    setStatus(message) {status.textContent = message;},
    setBusy(busy) {for (const control of [...buttons, key, apply, clear]) control.disabled = busy;},
  };
}
