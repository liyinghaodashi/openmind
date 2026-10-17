import test from 'node:test';
import assert from 'node:assert/strict';
import {isMindMapPath,documentTitle,documentAssetBase,markdownLinkTarget,newDocumentName} from '../src/document-mode.js';

test('only the filename suffix selects mind maps',()=>{
  for(const path of ['notes.mind.md','目录/想法.MIND.MD'])assert.equal(isMindMapPath(path),true);
  for(const path of ['notes.md','notes.markdown','notes.mind.markdown','notes.mind.md.bak','mind.md/notes.md'])assert.equal(isMindMapPath(path),false);
  assert.equal(documentTitle('目录/想法.mind.md'),'想法');
  assert.equal(newDocumentName('想法.md',true),'想法.mind.md');
  assert.equal(newDocumentName('想法.mind.md',true),'想法.mind.md');
  assert.equal(newDocumentName('想法',false),'想法');
});

test('relative Markdown links and image bases respect document directories',()=>{
  globalThis.location={href:'http://localhost/',origin:'http://localhost'};
  const base=documentAssetBase('session','中文目录/笔记.md');
  assert.equal(base,'/document-assets/session/%E4%B8%AD%E6%96%87%E7%9B%AE%E5%BD%95/');
  assert.equal(markdownLinkTarget('../灵感.mind.md',base),'灵感.mind.md');
  assert.equal(markdownLinkTarget('下一页.md#标题',base),'中文目录/下一页.md');
  for(const href of ['../../outside.md','/etc/secrets.md','https://example.com/a.md','javascript:alert(1)','image.png'])assert.equal(markdownLinkTarget(href,base),null);
});
