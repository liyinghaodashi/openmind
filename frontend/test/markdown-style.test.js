import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../styles/markdown.css',import.meta.url),'utf8');

test('Markdown 表格和代码块使用应用定义的背景变量',()=>{
  assert.match(css,/--markdown-background:\s*#fff/);
  assert.match(css,/--markdown-block-background:\s*#f7f7f7/);
  assert.match(css,/--markdown-table-alt-background:\s*#fafafa/);
  assert.match(css,/#markdown-editor \.vditor-reset pre\{[^}]*background:var\(--markdown-block-background\)/);
  assert.match(css,/#markdown-editor \.vditor-reset table\{[^}]*background:var\(--markdown-background\)/);
  assert.match(css,/#markdown-editor \.vditor-reset table tr\{[^}]*background-color:transparent/);
  assert.match(css,/#markdown-editor \.vditor-reset tbody tr:nth-child\(odd\)\{[^}]*background-color:var\(--markdown-table-alt-background\)/);
  assert.match(css,/#markdown-editor \.vditor-reset tbody tr:nth-child\(even\)\{[^}]*background-color:var\(--markdown-background\)/);
});
