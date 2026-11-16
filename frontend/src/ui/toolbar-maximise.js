export function bindToolbarMaximise(toolbar, toggleMaximise) {
  toolbar.addEventListener('dblclick',event=>{
    if(event.target.closest('button, input, textarea, a, #document-title'))return;
    toggleMaximise?.();
  });
}
