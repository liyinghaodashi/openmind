export function createSidebarCollapse({sidebar, button, root, beforeChange}) {
  function setCollapsed(collapsed) {
    if (sidebar.hidden !== collapsed) beforeChange();
    sidebar.hidden = collapsed;
    root.classList.toggle('sidebar-collapsed', collapsed);
    const label = collapsed ? '展开侧边栏' : '收起侧边栏';
    button.setAttribute('aria-expanded', String(!collapsed));
    button.setAttribute('aria-label', label);
    button.title = label;
  }

  function toggle() {
    setCollapsed(!sidebar.hidden);
  }

  function expand() {
    setCollapsed(false);
  }

  function enable() {
    button.addEventListener('click', toggle);
    button.hidden = false;
    button.disabled = false;
  }

  function disable() {
    button.removeEventListener('click', toggle);
    expand();
    button.hidden = true;
    button.disabled = true;
  }

  disable();
  return {
    id: 'sidebarCollapse',
    group: '通用设置',
    label: '启用侧边栏折叠',
    description: '关闭后，侧边栏保持展开。',
    enable,
    disable,
    expand,
  };
}
