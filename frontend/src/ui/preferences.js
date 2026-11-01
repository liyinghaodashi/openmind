export function preferenceFields({sidebarCollapse,map,fileTreeHover,mindOutlineActions,renderOutline,
  setHideExtensions,setSourceViewEnabled,setZoomControls,setCompactWindowEnabled}) {
  return [sidebarCollapse,{
    id:'hideFileExtensions',group:'通用设置',label:'隐藏文件后缀',description:'文件树隐藏 .md、.markdown 和 .mind.md 后缀。',
    enable:()=>setHideExtensions(true),disable:()=>setHideExtensions(false)
  },{
    id:'expandFileNameOnHover',group:'通用设置',label:'悬停展开文件名',description:'名称显示省略号时，悬停可让文字和背景向右展开，适用于文件和文件夹。',
    enable:()=>fileTreeHover.setEnabled(true),disable:()=>fileTreeHover.setEnabled(false)
  },{
    id:'sourceView',group:'通用设置',label:'启用原文功能',description:'在 mind 和 md 模式中显示「原文」按钮，关闭后返回导图或正文。',
    enable:()=>setSourceViewEnabled(true),disable:()=>setSourceViewEnabled(false)
  },{
    id:'mindStyle',group:'mind模式',label:'渲染风格',description:'选择导图外观。',
    options:[{value:'processon',label:'processon'},{value:'mindnode',label:'MindNode'}],
    select:value=>map.setStyle(value)
  },{
    id:'mindNodeMaxWidth',group:'mind模式',label:'节点最大宽度',description:'文本换行宽度，默认 340px；数值越大，每行可显示的文字越多。',
    type:'number',min:160,max:1600,default:340,select:value=>map.setNodeMaxWidth(value)
  },{
    id:'mindMainNodeMark',group:'mind模式',label:'主节点标记',description:'显示主节点背景，关闭后保留特殊字体。',
    enable:()=>map.setNodeMark('main',true),disable:()=>map.setNodeMark('main',false)
  },{
    id:'mindSecondNodeMark',group:'mind模式',label:'二级节点标记',description:'显示二级节点背景，关闭后保留特殊字体。',
    enable:()=>map.setNodeMark('second',true),disable:()=>map.setNodeMark('second',false)
  },{
    id:'mindZoomControls',group:'mind模式',label:'显示缩放控件',description:'在 mind 模式的右下角显示缩小、缩放比例、放大和适应窗口控件。',
    enable:()=>setZoomControls(true),disable:()=>setZoomControls(false)
  },{
    id:'mindCopyTree',group:'mind模式',label:'启用复制树',description:'在节点右键菜单中显示「复制树」，复制当前节点及全部子节点的 Markdown。⌘C 仅复制当前节点文本。',
    enable:()=>{map.copyTreeEnabled=true},disable:()=>{map.copyTreeEnabled=false;map.closeNodeMenu()}
  },{
    id:'mindOutlineFocus',group:'mind模式',label:'显示大纲聚焦按钮',description:'在 mind 模式的侧面大纲中显示聚焦按钮。',
    enable:()=>{mindOutlineActions.focus=true;renderOutline()},disable:()=>{mindOutlineActions.focus=false;renderOutline()}
  },{
    id:'mindOutlineCollapse',group:'mind模式',label:'显示大纲折叠按钮',description:'在 mind 模式的侧面大纲中显示折叠按钮。',
    enable:()=>{mindOutlineActions.collapse=true;renderOutline()},disable:()=>{mindOutlineActions.collapse=false;renderOutline()}
  },{
    id:'mindDoubleClickCreateMain',group:'mind模式',label:'双击新建一级节点',description:'在 mind 模式中双击画布空白处新建一级节点。',
    enable:()=>{map.doubleClickCreateMain=true},disable:()=>{map.doubleClickCreateMain=false}
  },{
    id:'mdCompactWindow',group:'md模式',label:'启用便签小窗',description:'在 md 模式中显示便签小窗入口，可在置顶小窗中编辑文档。',
    enable:()=>setCompactWindowEnabled(true),disable:()=>setCompactWindowEnabled(false)
  }];
}
