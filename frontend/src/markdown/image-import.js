const imageFile=file=>file.type?.startsWith('image/')||/\.(png|jpe?g|gif|webp|svg|avif|bmp|ico)$/i.test(file.name||'');

function fileData(file, inline) {
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('读取图片失败'));
    reader.onload=async()=>{
      try {
        if(!inline){resolve(String(reader.result).split(',')[1]);return}
        const bitmap=await createImageBitmap(file);
        const canvas=document.createElement('canvas');
        canvas.width=bitmap.width;canvas.height=bitmap.height;
        canvas.getContext('2d').drawImage(bitmap,0,0);
        bitmap.close?.();
        const dataURL=canvas.toDataURL('image/png');
        if(!dataURL.startsWith('data:image/png;base64,'))throw new Error('当前环境无法读取图片');
        resolve(dataURL);
      } catch(error) { reject(error) }
    };
    reader.readAsDataURL(file);
  });
}

export function imageTransferFiles(transfer) {
  const files=Array.from(transfer?.files||[]);
  if(files.length)return files;
  return Array.from(transfer?.items||[]).filter(item=>item.kind==='file').map(item=>item.getAsFile()).filter(Boolean);
}

export function bindImageImport(editor,{importImage,convertImage,discardImages,onError,getImageStorageMode=()=> 'assets'}) {
  const container=editor.container;
  const rangeFor=event=>{
    if(event.type==='drop'){
      const range=document.caretRangeFromPoint?.(event.clientX,event.clientY);
      if(range&&editor.editable.contains(range.startContainer))return range;
    }
    const selection=window.getSelection();
    if(!selection?.rangeCount)return null;
    const range=selection.getRangeAt(0);
    return editor.editable.contains(range.startContainer)&&editor.editable.contains(range.endContainer)?range.cloneRange():null;
  };
  const receive=event=>{
    const files=imageTransferFiles(event.clipboardData||event.dataTransfer);
    if(!files.length)return;
    event.preventDefault();event.stopImmediatePropagation();
    if(editor.readOnly||!editor.loaded||editor.composing)return;
    if(editor.imageTask){onError(new Error('图片正在导入，请稍候。'));return}
    if(!files.every(imageFile)){onError(new Error('这里只支持插入图片文件。'));return}
    const range=rangeFor(event);
    if(!range||!editor.onBeforeInput(editor.currentSource(),event))return;
    const source=editor.currentSource(),session=editor.session,path=editor.path,generation=editor.imageGeneration;
    editor.imageTask=(async()=>{
      const references=[];
      let inserted=false;
      let inline=false;
      try{
        inline=getImageStorageMode()==='base64';
        for(const file of files)references.push(inline?await convertImage(session,await fileData(file,true)):await importImage(session,await fileData(file,false)));
        if(editor.readOnly||!editor.loaded||editor.composing||editor.session!==session||editor.path!==path||editor.imageGeneration!==generation||editor.currentSource()!==source||!editor.editable.contains(range.startContainer)||!editor.editable.contains(range.endContainer))throw new Error('编辑位置已变化，图片导入已取消，请重新插入。');
        const text=references.map(reference=>'![图片]('+reference+')').join('\n\n');
        if(!editor.onBeforeInput(source,{data:text}))return;
        editor.editable.focus({preventScroll:true});
        const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);
        editor.editor.insertMD(text);inserted=true;editor.flush();
      }catch(error){onError(error)}
      finally{
        if(!inserted&&references.length&&!inline){try{await discardImages(session,references)}catch(error){onError(error)}}
        editor.imageTask=null;
      }
    })();
  };
  container.addEventListener('paste',receive,true);
  container.addEventListener('drop',receive,true);
  container.addEventListener('dragover',event=>{
    if(!Array.from(event.dataTransfer?.types||[]).includes('Files'))return;
    event.preventDefault();if(event.dataTransfer)event.dataTransfer.dropEffect=editor.readOnly?'none':'copy';
  },true);
}
