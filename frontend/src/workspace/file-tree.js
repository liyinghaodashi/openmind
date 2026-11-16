import {isMindMapPath} from '../document/document-mode.js';

export function createFileTree({tree,state,preview,fileActions,fileTreeHover,fileTreeDrag,openDocument,listDirectory,report}) {
  const directories = new Map();
  let generation = 0;
  let needsRender = false;
  let hideExtensions = false;

  async function refresh({duringDrag=false,afterMove=false}={}) {
    if (!state.workspace || preview || (state.fileDragging && !duringDrag) || (state.fileMoving && !afterMove)) return;
    const request = ++generation;
    const previous = JSON.stringify([...directories]);
    await Promise.all([...state.expanded].map(async path => {
      try {
        const entries = await listDirectory(path);
        if (request === generation) directories.set(path, entries);
      } catch (error) {
        if (request !== generation) return;
        if (!path) report(error);
        else {
          state.expanded.delete(path);
          directories.delete(path);
        }
      }
    }));
    if (request === generation && (needsRender || previous !== JSON.stringify([...directories]))) {
      needsRender = false;
      render();
    }
  }

  async function choose(entry) {
    fileActions.closeMenu();
    if (state.navigating || state.closing) return;
    if (!entry.directory) return openDocument(entry.path);
    state.selectedDir = entry.path;
    if (state.expanded.has(entry.path)) state.expanded.delete(entry.path);
    else state.expanded.add(entry.path);
    needsRender = true;
    await refresh();
  }

  function displayName(entry) {
    if (entry.directory) return entry.name;
    if (hideExtensions) return entry.name.replace(/\.(mind\.md|md|markdown)$/i,'');
    return isMindMapPath(entry.path) ? entry.name.replace(/\.md$/i,'') : entry.name;
  }

  function render() {
    fileTreeHover.hide();
    fileActions.closeMenu();
    if (!state.workspace) return;
    const fragment = document.createDocumentFragment();
    function appendDirectory(path, depth) {
      for (const entry of directories.get(path) || []) {
        const row = document.createElement('button');
        row.className = 'tree-row';
        row.classList.toggle('selected', state.snapshot?.path === entry.path);
        row.classList.toggle('dir-selected', entry.directory && state.selectedDir === entry.path);
        row.classList.toggle('file-drag-source', fileTreeDrag.source === entry.path);
        row.style.paddingLeft = (9 + depth * 16) + 'px';
        Object.assign(row.dataset, {path:entry.path,name:entry.name,directory:String(entry.directory)});
        const arrow = document.createElement('span');
        arrow.className = 'tree-arrow';
        arrow.setAttribute('aria-hidden', 'true');
        if (entry.directory) {
          arrow.classList.toggle('expanded', state.expanded.has(entry.path));
          arrow.innerHTML = '<svg viewBox="0 0 9 9" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2 6 4.5 3 7"/></svg>';
        }
        const symbol = document.createElement('span');
        symbol.className = 'tree-symbol';
        symbol.textContent = entry.directory ? '▱' : isMindMapPath(entry.path) ? '⋈' : '≡';
        const name = document.createElement('span');
        name.className = 'tree-name';
        name.textContent = displayName(entry);
        row.append(arrow, symbol, name);
        fragment.append(row);
        fileActions.bindRow(row, entry);
        row.addEventListener('click', () => choose(entry));
        if (entry.directory && state.expanded.has(entry.path)) appendDirectory(entry.path, depth + 1);
      }
    }
    appendDirectory('', 0);
    if (!fragment.childNodes.length) {
      const empty = document.createElement('p');
      empty.className = 'tree-placeholder';
      empty.textContent = '这里还没有 Markdown。点击 + 创建第一份。';
      fragment.append(empty);
    }
    tree.replaceChildren(fragment);
  }

  return {
    refresh, render,
    invalidate() { generation++; directories.clear(); needsRender = true; },
    cancelRefresh() { generation++; },
    setHideExtensions(value) { hideExtensions = value; render(); },
    setPreviewEntries(entries) { directories.set('', entries); }
  };
}
