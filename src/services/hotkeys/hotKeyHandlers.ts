// hotKeyHandlers.ts
import { hotKeyManager } from './hotKeyManager';
import { useCanvasStore } from '../../stores/canvas-store';
import {
  copyPasteInteraction,
  deleteInteraction,
  moveInteraction,
  historyService,
} from '../instances';

export function bindCanvasHotKeys() {
  const canvasStore = useCanvasStore;
  hotKeyManager.setHandler('undo', () => {
    historyService.run('undo');
    console.log('执行撤销');
  });

  hotKeyManager.setHandler('redo', () => {
    historyService.run('redo');
    console.log('执行重做');
  });

  // 复制快捷键
  hotKeyManager.setHandler('copy', () => {
    copyPasteInteraction.safeCopySelectedElements();
  });

  // 剪切快捷键
  hotKeyManager.setHandler('cut', async () => {
    await copyPasteInteraction.safeCutSelectedElements();
  });

  // 粘贴快捷键
  hotKeyManager.setHandler('paste', async () => {
    await copyPasteInteraction.safePasteElements();
  });
  hotKeyManager.setHandler('save', () => {
    historyService.run('save');
    console.log('执行保存');
  });

  hotKeyManager.setHandler('delete', () => {
    console.log('执行删除');
    deleteInteraction.deleteSelectedElements();
  });

  hotKeyManager.setHandler('selectAll', () => {
    console.log('执行全选');
    const allElementIds = Object.keys(canvasStore.getState().elements);
    canvasStore.getState().setSelectedElements(allElementIds);
  });

  // === 视图操作 ===
  // hotKeyManager.setHandler('zoomIn', () => {
  //   console.log('放大画布');
  //   const viewport = canvasStore.getState().viewport;
  //   const newZoom = Math.min(viewport.zoom * 1.2, 10); // 限制最大缩放
  //   canvasStore.getState().setViewport({ zoom: newZoom });
  // });

  // hotKeyManager.setHandler('zoomOut', () => {
  //   console.log('缩小画布');
  //   const viewport = canvasStore.getState().viewport;
  //   const newZoom = Math.max(viewport.zoom / 1.2, 0.1); // 限制最小缩放
  //   canvasStore.getState().setViewport({ zoom: newZoom });
  // });

  // hotKeyManager.setHandler('zoomInWheel', () => {
  //   console.log('滚轮放大');
  //   const viewport = canvasStore.getState().viewport;
  //   const newZoom = Math.min(viewport.zoom * 1.1, 10);
  //   canvasStore.getState().setViewport({ zoom: newZoom });
  // });

  // hotKeyManager.setHandler('zoomOutWheel', () => {
  //   console.log('滚轮缩小');
  //   const viewport = canvasStore.getState().viewport;
  //   const newZoom = Math.max(viewport.zoom / 1.1, 0.1);
  //   canvasStore.getState().setViewport({ zoom: newZoom });
  // });

  // === 平移操作 ===
  // hotKeyManager.setHandler('panToggle', () => {
  //   console.log('切换平移模式');
  //   const currentTool = canvasStore.getState().tool.activeTool;
  //   if (currentTool === 'hand') {
  //     canvasStore.getState().setTool('select');
  //   } else {
  //     canvasStore.getState().setTool('hand');
  //   }
  // });

  // // === 微移操作 ===
  hotKeyManager.setHandler('nudgeLeft', () => {
    console.log('向左微移');
    moveInteraction.nudgeLeft();
  });

  hotKeyManager.setHandler('nudgeRight', () => {
    console.log('向右微移');
    moveInteraction.nudgeRight();
  });

  hotKeyManager.setHandler('nudgeUp', () => {
    console.log('向上微移');
    moveInteraction.nudgeUp();
  });

  hotKeyManager.setHandler('nudgeDown', () => {
    console.log('向下微移');
    moveInteraction.nudgeDown();
  });

  hotKeyManager.setHandler('fastNudgeLeft', () => {
    console.log('快速向左微移');
    moveInteraction.nudgeLeft(true);
  });

  hotKeyManager.setHandler('fastNudgeRight', () => {
    console.log('快速向右微移');
    moveInteraction.nudgeRight(true);
  });

  hotKeyManager.setHandler('fastNudgeUp', () => {
    console.log('快速向上微移');
    moveInteraction.nudgeUp(true);
  });

  hotKeyManager.setHandler('fastNudgeDown', () => {
    console.log('快速向下微移');
    moveInteraction.nudgeDown(true);
  });

  // === 元素操作 ===
  // hotKeyManager.setHandler('clone', () => {
  //   console.log('克隆元素');
  //   const selectedElementIds = canvasStore.getState().selectedElementIds;
  //   if (selectedElementIds.length > 0) {
  //     eventBus.emit('elements:clone', { elementIds: selectedElementIds });
  //   }
  // });

  // // === 工具切换 ===
  // hotKeyManager.setHandler('selectTool', () => {
  //   console.log('切换到选择工具');
  //   canvasStore.getState().setTool('select');
  // });

  // hotKeyManager.setHandler('boxSelectTool', () => {
  //   console.log('切换到框选工具');
  //   // 如果没有框选工具，可以暂时切换到选择工具
  //   canvasStore.getState().setTool('select');
  // });

  // 你可以按需增加更多...
}
