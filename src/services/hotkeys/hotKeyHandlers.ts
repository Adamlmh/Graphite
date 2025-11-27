// hotKeyHandlers.ts
import { hotKeyManager } from './hotKeyManager';

export function bindCanvasHotKeys() {
  // 例如 Ctrl+A 全选
  hotKeyManager.setHandler('selectAll', () => {
    console.log('按下了 Ctrl+A');
  });
  hotKeyManager.setHandler('zoomIn', () => {
    console.log('放大');
  });
  // 撤销
  hotKeyManager.setHandler('undo', () => {
    console.log('执行撤销');
  });

  // 重做
  hotKeyManager.setHandler('redo', () => {
    console.log('执行重做');
  });

  // 复制
  hotKeyManager.setHandler('copy', () => {
    console.log('执行复制');
  });

  hotKeyManager.setHandler('zoomInWheel', () => {
    console.log('Zoom In 触发：Ctrl + 滚轮上');
  });
  hotKeyManager.setHandler('zoomOutWheel', () => {
    console.log('Zoom Out 触发：Ctrl + 滚轮下');
  });

  // 你可以按需增加更多...
}
