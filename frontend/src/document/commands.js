import {isMindMapPath} from '../document-mode.js';

export function createDocumentCommands({write,getSnapshot,captureHistory,history,clientID=crypto.randomUUID()}) {
  let sequence=0;
  function prepare(edit) {
    return {...edit,opId:clientID+':'+(++sequence)};
  }
  async function apply(edit) {
    const snapshot=getSnapshot();
    const command={...edit,session:snapshot.session,version:snapshot.version};
    const before=edit.kind!=='restore-mind'&&isMindMapPath(snapshot.path)?captureHistory():null;
    const reply=await write(command);
    if(before)history.record(before,reply.source,edit.kind==='label'?command.session+':'+command.nodeId:null);
    return reply;
  }
  return {prepare,apply};
}
