import {createTextMeasurer} from './text-metrics.js';
import {ProcessonRenderer} from './processon/renderer.js';

export function createMindRenderer(options) {
  return new ProcessonRenderer({...options, measureText: createTextMeasurer(options.canvas.ownerDocument)});
}
