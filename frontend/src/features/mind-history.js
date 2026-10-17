export class MindHistory {
  constructor({maxCount=100,maxBytes=16*1024*1024}={}) {
    Object.assign(this,{maxCount,maxBytes});this.clear();
  }
  clear() {this.undo=[];this.redo=[];this.group=null;}
  breakGroup() {this.group=null;}
  trim() {
    const size=()=>[...this.undo,...this.redo].reduce((sum,entry)=>sum+entry.source.length*2,0);
    while(this.undo.length+this.redo.length>this.maxCount||size()>this.maxBytes){
      if(this.undo.length)this.undo.shift();else this.redo.shift();
    }
  }
  record(before,source,group=null) {
    if(before.source===source)return;
    if(!group||group!==this.group||!this.undo.length)this.undo.push(before);
    this.redo=[];this.group=group;this.trim();
  }
  target(direction) {return this[direction].at(-1);}
  commit(direction,current) {
    this[direction].pop();this[direction==='undo'?'redo':'undo'].push(current);
    this.breakGroup();this.trim();
  }
}
