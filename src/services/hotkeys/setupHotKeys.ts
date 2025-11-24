// setupHotKeys.ts
import { hotKeyManager } from './hotKeyManager';
import { bindCanvasHotKeys } from './hotKeyHandlers';

export function setupHotKeys() {
  // 启动快捷键系统
  hotKeyManager.enable();
  hotKeyManager.enableContext('canvas');

  // 绑定所有业务 handler
  bindCanvasHotKeys();

  console.log('%c[HotKeys] 已初始化', 'color: #4caf50');
}
