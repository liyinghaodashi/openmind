import test from 'node:test';
import assert from 'node:assert/strict';
import {validShortcut, shortcutValue} from '../src/features/global-shortcut.js';

test('快捷键保存顺序固定，支持功能键、字母、数字和空格', () => {
  assert.equal(shortcutValue(new Set(['Meta', 'Alt', 'Ctrl', 'Shift']), 'KeyO'), 'Ctrl+Alt+Shift+Meta+KeyO');
  for (const value of ['', 'Ctrl+F1', 'Ctrl+Alt+F20', 'Meta+KeyA', 'Alt+Digit9', 'Ctrl+Shift+Space']) assert.equal(validShortcut(value), true, value);
  for (const value of [null, 1, 'F1', 'Shift+KeyA', 'Ctrl+F21', 'Meta+Ctrl+KeyA', 'Ctrl+Ctrl+F1', 'Unknown+F1']) assert.equal(validShortcut(value), false, value);
});
