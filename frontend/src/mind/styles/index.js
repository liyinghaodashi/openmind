import {ProcessonRenderer} from './processon/renderer.js';
import {MindNodeRenderer} from './mindnode/renderer.js';

const renderers = {processon: ProcessonRenderer, mindnode: MindNodeRenderer};

export function createMindRenderer(style, options) {
  if (!Object.hasOwn(renderers, style)) throw new Error('无效的 mind 渲染风格');
  return new renderers[style](options);
}
