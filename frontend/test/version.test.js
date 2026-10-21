import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('设置页显示版本及无障碍标签与打包版本一致', () => {
  const config = JSON.parse(readFileSync(new URL('../../wails.json', import.meta.url), 'utf8'));
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const versionElement = html.match(/<span\b[^>]*class="settings-version"[^>]*>([^<]*)<\/span>/);
  assert.ok(versionElement, '设置页应显示当前版本');
  const version = `v${config.info.productVersion}`;
  assert.equal(versionElement[1], version);
  assert.ok(versionElement[0].includes(`aria-label="当前版本 ${version}"`));
});
