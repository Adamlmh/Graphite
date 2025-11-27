// import type { Element } from '../../types/index';

// export class CreateElementCommand {
//   private canvasStore
//   private element: Element;

//   constructor(canvasStore: any, element: Element) {
//     this.canvasStore = canvasStore;
//     this.element = element;
//   }

//   execute() {
//     this.canvasStore.addElement(this.element);
//   }

//   undo() {
//     this.canvasStore.removeElement(this.element.id);
//   }

//   redo() {
//     this.canvasStore.addElement(this.element);
//   }

//   /**
//    * （非常关键）
//    * 提供给操作历史命令栈开发同事的记录数据格式
//    * 他们只需要 element.id 即可生成同步日志
//    */
//   serialize() {
//     return {
//       type: 'create-element',
//       payload: this.element
//     };
//   }
// }
