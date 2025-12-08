/**
 * 服务实例统一导出
 * 避免循环依赖问题
 */
import { useCanvasStore, type CanvasState } from '../stores/canvas-store';
import { HistoryService } from './HistoryService';
import { CreateInteraction } from './interaction/CreateInteraction';
import { SelectionInteraction } from './interaction/SelectionInteraction';
import { CopyPasteInteraction } from './interaction/CopyPasteInteraction';
import { DeleteInteraction } from './interaction/DeleteInteraction';
import { ResizeInteraction } from './interaction/ResizeInteraction';
import { GroupInteraction } from './interaction/GroupInteraction';
import { TextEditorInteraction } from './interaction/TextEditorInteraction';

// 全局初始化 HistoryService
export const historyService = new HistoryService({
  getState: () => useCanvasStore.getState(),
  setState: (partial) => {
    useCanvasStore.setState((state: CanvasState) => Object.assign(state, partial));
  },
});

// 初始化交互
new CreateInteraction(historyService);
export const selectionInteraction = new SelectionInteraction(historyService);
new TextEditorInteraction();
export const copyPasteInteraction = new CopyPasteInteraction(historyService);
export const deleteInteraction = new DeleteInteraction(historyService);
export const resizeInteraction = new ResizeInteraction(historyService);
export const groupInteraction = new GroupInteraction(historyService);
