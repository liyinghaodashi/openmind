export function mountSettings({container, features, storage}) {
  const document = container.ownerDocument;
  const fields = document.createElement('fieldset');
  fields.className = 'settings-fields';
  fields.setAttribute('aria-label', '功能设置');
  fields.disabled = true;
  const status = document.createElement('p');
  status.className = 'settings-status';
  status.setAttribute('role', 'status');
  status.textContent = '正在读取设置…';
  container.replaceChildren(fields, status);

  let saved = {};
  let pending = Promise.resolve();
  const inputs = new Map();
  const groups = new Map();
  const revisions = new Map();

  function apply(feature, value) {
    if (feature.options || feature.type === 'number') feature.select(value);
    else if (value) feature.enable();
    else feature.disable();
  }

  function sync(feature) {
    for (const input of inputs.get(feature.id)) {
      if (feature.type === 'number') {input.value = String(saved[feature.id]); continue;}
      input.checked = feature.options ? input.value === saved[feature.id] : saved[feature.id] === true;
      if (feature.options) input.tabIndex = input.checked ? 0 : -1;
    }
  }

  function save(feature, value) {
    if (fields.disabled) {sync(feature); return;}
    const revision = (revisions.get(feature.id) || 0) + 1;
    revisions.set(feature.id, revision);
    pending = pending.then(async () => {
      const next = {...saved, [feature.id]: value};
      try {
        await storage.save(next);
        saved = next;
        apply(feature, value);
        status.textContent = '';
      } catch (error) {
        status.textContent = '设置保存失败，已保留原设置：' + (error?.message || String(error));
      } finally {
        if (revisions.get(feature.id) === revision) sync(feature);
      }
    });
  }

  for (const feature of features) {
    const row = document.createElement(feature.options ? 'div' : 'label');
    row.className = 'setting-row';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = 'setting-' + feature.id;
    const text = document.createElement('span');
    const title = document.createElement('span');
    title.className = 'setting-label';
    title.textContent = feature.label;
    const description = document.createElement('span');
    description.className = 'setting-description';
    description.id = input.id + '-description';
    description.textContent = feature.description;
    input.setAttribute('aria-labelledby', title.id = input.id + '-label');
    input.setAttribute('aria-describedby', description.id);
    text.append(title, description);
    const controls = [];
    if (feature.options) {
      row.className += ' setting-choice-row';
      const choices = document.createElement('div');
      choices.className = 'setting-choices';
      choices.setAttribute('role', 'radiogroup');
      choices.setAttribute('aria-labelledby', title.id);
      choices.setAttribute('aria-describedby', description.id);
      for (const option of feature.options) {
        const label = document.createElement('label');
        label.className = 'setting-choice';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'setting-' + feature.id;
        radio.id = radio.name + '-' + option.value;
        radio.value = option.value;
        const caption = document.createElement('span');
        caption.textContent = option.label;
        label.append(radio, caption);
        choices.append(label);
        controls.push(radio);
        radio.addEventListener('change', () => {if (radio.checked) save(feature, radio.value);});
        radio.addEventListener('keydown', event => {
          if (event.isComposing || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
          if (event.key === 'Enter') {
            event.preventDefault();
            if (!event.repeat) radio.click();
          } else if (['ArrowLeft', 'ArrowRight'].includes(event.key)) {
            event.preventDefault();
            const index = controls.indexOf(radio);
            controls[(index + (event.key === 'ArrowRight' ? 1 : -1) + controls.length) % controls.length].focus({preventScroll: true});
          }
        });
      }
      row.append(text, choices);
    } else if (feature.type === 'number') {
      row.className += ' setting-number-row';
      input.type = 'number';
      input.min = feature.min;
      input.max = feature.max;
      input.step = 1;
      const control = document.createElement('span');
      control.className = 'setting-number-control';
      const unit = document.createElement('span');
      unit.textContent = 'px';
      control.append(input, unit);
      row.append(text, control);
      controls.push(input);
      input.addEventListener('input', () => revisions.set(feature.id, (revisions.get(feature.id) || 0) + 1));
      input.addEventListener('change', () => {
        const value = Number(input.value);
        if (!Number.isInteger(value) || value < feature.min || value > feature.max) {
          status.textContent = `${feature.label}请输入 ${feature.min}–${feature.max} 之间的整数。`;
          sync(feature);
          return;
        }
        save(feature, value);
      });
      input.addEventListener('keydown', event => {
        if (event.key === 'Enter' && !event.isComposing) {event.preventDefault(); input.blur();}
      });
    } else {
      row.append(input, text);
      controls.push(input);
      input.addEventListener('change', () => save(feature, input.checked));
    }
    let parent = fields;
    if (feature.group) {
      if (!groups.has(feature.group)) {
        const group = document.createElement('div');
        group.className = 'settings-group';
        const heading = document.createElement('h2');
        heading.className = 'settings-group-title';
        heading.textContent = feature.group;
        group.append(heading);
        fields.append(group);
        groups.set(feature.group, group);
      }
      parent = groups.get(feature.group);
    }
    parent.append(row);
    inputs.set(feature.id, controls);
  }

  const ready = (async () => {
    try {
      saved = await storage.load();
      for (const feature of features) {
        if (feature.type === 'number' && saved[feature.id] === undefined) saved[feature.id] = feature.default;
        const valid = feature.type === 'number' ? Number.isInteger(saved[feature.id]) && saved[feature.id] >= feature.min && saved[feature.id] <= feature.max : feature.options ? feature.options.some(option => option.value === saved[feature.id]) : typeof saved[feature.id] === 'boolean';
        if (!valid) throw new Error('无效的设置：' + feature.label);
      }
      for (const feature of features) {
        apply(feature, saved[feature.id]);
        sync(feature);
      }
      fields.disabled = false;
      status.textContent = '';
    } catch (error) {
      status.textContent = '设置读取失败，请检查配置后重新打开应用：' + (error?.message || String(error));
    }
  })();

  return {ready, flush: async () => {
    await ready;
    let saving;
    do {saving = pending; await saving;} while (saving !== pending);
  }};
}
