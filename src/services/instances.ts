/**
 * 服务实例统一导出
 * 避免循环依赖问题
 */
import { useCanvasStore, type CanvasState } from '../stores/canvas-store';
import { HistoryService, SaveStatus } from './HistoryService';
import { CreateInteraction } from './interaction/CreateInteraction';
// import { SelectionInteraction } from './interaction/SelectionInteraction';
import { CopyPasteInteraction } from './interaction/CopyPasteInteraction';
import { DeleteInteraction } from './interaction/DeleteInteraction';
import { SelectInteraction } from './interaction/SelectInteraction';
// import { ResizeInteraction } from './interaction/ResizeInteraction';
import { GroupInteraction } from './interaction/GroupInteraction';
import { TextEditorInteraction } from './interaction/TextEditorInteraction';

// 导出 SaveStatus 供 UI 使用
export { SaveStatus };

// 全局初始化 HistoryService
export const historyService = new HistoryService({
  getState: () => useCanvasStore.getState(),
  setState: (partial) => {
    if (typeof partial === 'function') {
      // 如果是函数，直接传递给 Zustand
      useCanvasStore.setState(partial as (state: CanvasState) => Partial<CanvasState>);
    } else {
      // 如果是对象，使用 immer 的方式更新
      useCanvasStore.setState((state: CanvasState) => {
        // 使用 immer，直接修改 draft state
        Object.assign(state, partial);
      });
    }
  },
});

// 初始化交互
new CreateInteraction(historyService);
// export const selectionInteraction = new SelectionInteraction(historyService);
new TextEditorInteraction();
export const copyPasteInteraction = new CopyPasteInteraction(historyService);
export const deleteInteraction = new DeleteInteraction(historyService);
export const selectInteraction = new SelectInteraction(historyService);
export const moveInteraction = selectInteraction.moveInteraction;
// export const resizeInteraction = new ResizeInteraction(historyService);
export const groupInteraction = new GroupInteraction(historyService);
