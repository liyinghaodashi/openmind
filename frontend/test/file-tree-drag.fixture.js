(()=>{
  const fail=message=>window.webkit.messageHandlers.result.postMessage({passed:false,message:'FAIL: '+message});
  window.addEventListener('error',event=>fail(event.message+' '+event.filename+':'+event.lineno));
  window.addEventListener('unhandledrejection',event=>fail(String(event.reason?.stack||event.reason)));
  window.addEventListener('blur',event=>{if(event.isTrusted&&!window.__allowNativeBlur)event.stopImmediatePropagation()},true);
  const fixture={directories:new Set(['源','源/子','目标','目标/内部','目标/同名目录']),documents:new Map(),calls:[],listeners:new Map(),current:null};
  for(const path of ['源/笔记.md','源/子/想法.mind.md','目标/笔记.md','根.md']){
    const source='# '+path+'\n\n'+Array.from({length:45},(_,i)=>'内容 '+i+'\n\n').join('');
    fixture.documents.set(path,{session:path,version:1,path,source,root:{id:'root',label:path,editable:true,kind:'heading',children:[]}});
  }
  const remap=(path,source,target)=>path===source||path.startsWith(source+'/')?target+path.slice(source.length):path;
  const clone=value=>structuredClone(value);
  window.__fileDragFixture=fixture;
  window.runtime={EventsOn:(name,callback)=>fixture.listeners.set(name,callback),WindowShow:()=>{}};
  window.go={main:{App:{
    GetGlobalShortcutStatus:async()=>'',
    ToggleWindowMaximise:async()=>{},FrontendReady:async()=>{},GetSettings:async()=>({mdCompactWindow:true,sidebarCollapse:true,mindOutlineFocus:true,mindOutlineCollapse:true,mindDoubleClickCreateMain:true,sourceView:true,mindZoomControls:true}),SaveSettings:async()=>{},RecentWorkspaces:async()=>[],
    TakePendingFileOpens:async()=>[],RestoreWorkspace:async()=>({root:'/fixture-only',name:'拖动验证'}),CheckDocument:async()=>null,
    ListDirectory:async directory=>{
      const entries=[];
      for(const path of [...fixture.directories,...fixture.documents.keys()]){
        const parent=path.includes('/')?path.slice(0,path.lastIndexOf('/')):'';
        if(parent===directory)entries.push({path,name:path.split('/').pop(),directory:fixture.directories.has(path)});
      }
      return entries.sort((a,b)=>Number(b.directory)-Number(a.directory)||a.name.localeCompare(b.name));
    },
    OpenDocument:async path=>{fixture.current=path;return clone(fixture.documents.get(path))},
    ReparseDocument:async()=>clone(fixture.documents.get(fixture.current)),
    ApplyEdit:async edit=>{
      await new Promise(resolve=>setTimeout(resolve,80));
      const snapshot=fixture.documents.get(fixture.current);
      if(edit.session!==snapshot.session||edit.version!==snapshot.version)throw new Error('stale edit');
      fixture.calls.push(['save',snapshot.path]);snapshot.source=edit.text;snapshot.version++;return clone(snapshot);
    },
    MoveEntry:async(source,parent)=>{
      fixture.calls.push(['move',source,parent]);
      const target=(parent?parent+'/':'')+source.split('/').pop();
      if(fixture.documents.has(target)||fixture.directories.has(target))throw new Error('目标文件夹已有同名文件或文件夹，未移动');
      const affected=fixture.current&&(fixture.current===source||fixture.current.startsWith(source+'/'));
      fixture.directories=new Set([...fixture.directories].map(path=>remap(path,source,target)));
      fixture.documents=new Map([...fixture.documents].map(([path,snapshot])=>{
        const next=remap(path,source,target);snapshot.path=next;
        if(affected&&path===fixture.current)snapshot.version++;
        return [next,snapshot];
      }));
      if(affected)fixture.current=remap(fixture.current,source,target);
      return {path:target,...(affected?{snapshot:clone(fixture.documents.get(fixture.current))}:{})};
    }
  }}};
})();
