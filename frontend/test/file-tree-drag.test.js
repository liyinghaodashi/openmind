import test from 'node:test';
import assert from 'node:assert/strict';
import {canDropEntry,movedTreePath} from '../src/features/file-tree-drag.js';

test('文件能移入其他文件夹或根目录，同一父目录不接受拖放',()=>{
  assert.equal(canDropEntry({path:'笔记.md',directory:false},'目标'),true);
  assert.equal(canDropEntry({path:'原目录/笔记.md',directory:false},''),true);
  assert.equal(canDropEntry({path:'原目录/笔记.md',directory:false},'原目录'),false);
  assert.equal(canDropEntry({path:'笔记.md',directory:false},''),false);
  assert.equal(canDropEntry({path:'笔记.md',directory:false},null),false);
});

test('不能把文件夹移入自身或后代，相似前缀的兄弟目录允许移动',()=>{
  const folder={path:'笔记',directory:true};
  assert.equal(canDropEntry(folder,'笔记'),false);
  assert.equal(canDropEntry(folder,'笔记/子目录'),false);
  assert.equal(canDropEntry(folder,'笔记副本'),true);
  assert.equal(canDropEntry({path:'原目录/笔记',directory:true},''),true);
});

test('移动文件夹后更新展开和选中路径，不改动相似前缀或父目录',()=>{
  for(const [path,expected] of [['源','目标/源'],['源/子/文档.md','目标/源/子/文档.md'],['源副本/文档.md','源副本/文档.md'],['','']]){
    assert.equal(movedTreePath(path,'源','目标/源'),expected);
  }
  assert.equal(movedTreePath('目标/源/子','目标/源','源'),'源/子');
});
