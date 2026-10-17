export class EditQueue {
  constructor({write, onCommit, onError, onState, maxCount = 64, maxBytes = 8 * 1024 * 1024}) {
    Object.assign(this, {write, onCommit, onError, onState, maxCount, maxBytes});
    this.items = []; this.bytes = 0; this.running = false; this.failed = false; this.waiters = [];
  }
  get pending() { return this.items.length; }
  canAccept(size = 0) { return !this.failed && this.pending < this.maxCount && this.bytes + size <= this.maxBytes; }
  push(edit) {
    const size = new TextEncoder().encode(edit.text).length;
    if (!this.canAccept(size)) throw new Error('磁盘写入暂时跟不上，已暂停编辑；请等待或处理提示。');
    this.items.push({edit, size}); this.bytes += size; this.onState?.(); void this.run();
  }
  async run() {
    if (this.running || this.failed) return;
    this.running = true;
    try {
      while (this.items.length) {
        const {edit, size} = this.items[0];
        const reply = await this.write(edit);
        this.items.shift(); this.bytes -= size;
        this.onCommit?.(reply); this.onState?.();
      }
    } catch (error) {
      this.failed = true;
      await this.onError?.(error);
    } finally {
      this.running = false; this.onState?.();
      for (const resolve of this.waiters.splice(0)) resolve(!this.failed);
    }
  }
  async drain() {
    if (!this.running) return !this.failed;
    return new Promise(resolve => this.waiters.push(resolve));
  }
  reset() {
    if (this.running) throw new Error('写入尚未结束');
    this.items = []; this.bytes = 0; this.failed = false; this.onState?.();
  }
}
