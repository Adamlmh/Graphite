// hotKeyHandlers.ts
import { hotKeyManager } from './hotKeyManager';

export function bindCanvasHotKeys() {
  // 例如 Ctrl+A 全选
  hotKeyManager.setHandler('selectAll', () => {
    console.log('按下了 Ctrl+A');
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

  // 你可以按需增加更多...
}
