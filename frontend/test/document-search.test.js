import test from 'node:test';
import assert from 'node:assert/strict';
import {findTextMatches,findNodeMatches} from '../src/features/document-search.js';

test('中文、混合大小写按原始 UTF-16 偏移匹配，保留非 ASCII 大小写字符长度',()=>{
  assert.deepEqual(findTextMatches('中文 JAVA java 中文','中文'),[{start:0,end:2},{start:13,end:15}]);
  assert.deepEqual(findTextMatches('中文 JAVA java 中文','Java'),[{start:3,end:7},{start:8,end:12}]);
  assert.deepEqual(findTextMatches('İ A a','a'),[{start:2,end:3},{start:4,end:5}]);
  assert.deepEqual(findTextMatches('😀中文😀','😀'),[{start:0,end:2},{start:4,end:6}]);
});

test('按字面值查找特殊符号；空查询和无匹配不会产生结果',()=>{
  assert.deepEqual(findTextMatches('a.*[b] a.*[b]','.*[b]'),[{start:1,end:6},{start:8,end:13}]);
  assert.deepEqual(findTextMatches('abc',''),[]);
  assert.deepEqual(findTextMatches('abc','abcd'),[]);
  assert.deepEqual(findTextMatches('aaaa','aa'),[{start:0,end:2},{start:2,end:4}]);
});

test('导图按文档顺序搜索全部节点，同一节点的重复匹配分别计数',()=>{
  const root={id:'root',label:'Java',children:[{id:'hidden',label:'java Java',children:[{id:'deep',label:'Java'}]}]};
  assert.deepEqual(findNodeMatches(root,'JAVA'),[{id:'root',start:0,end:4},{id:'hidden',start:0,end:4},{id:'hidden',start:5,end:9},{id:'deep',start:0,end:4}]);
  assert.deepEqual(findNodeMatches(null,'Java'),[]);
  assert.deepEqual(findNodeMatches(root,''),[]);
});
