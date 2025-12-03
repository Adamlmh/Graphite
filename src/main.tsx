import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { setupHotKeys } from './services/hotkeys/setupHotKeys';
import { CreateInteraction } from './services/interaction/CreateInteraction';
import { CopyPasteInteraction } from './services/interaction/CopyPasteInteraction';
import { DeleteInteraction } from './services/interaction/DeleteInteraction';
import { MoveInteraction } from './services/interaction/moveInteraction.ts';
// import { ResizeInteraction } from './services/interaction/ResizeInteraction';
import { useCanvasStore } from './stores/canvas-store';
import { HistoryService } from './services/HistoryService';

//初始化快捷键系统
setupHotKeys();
// 全局初始化 HistoryService
export const historyService = new HistoryService({
  getState: () => useCanvasStore.getState(),
  setState: (partial) => {
    useCanvasStore.setState((state) => Object.assign(state, partial));
  },
});
//初始化交互
new CreateInteraction(historyService);
export const copyPasteInteraction = new CopyPasteInteraction(historyService);
export const deleteInteraction = new DeleteInteraction(historyService);
export const moveInteraction = new MoveInteraction(historyService);

// 页面加载时恢复历史状态
async function initApp() {
  try {
    await historyService.loadFromStorage();
    console.log(
      'History loaded successfully, current version:',
      historyService.getCurrentVersion(),
    );
  } catch (error) {
    console.warn('Failed to load history, starting fresh:', error);
  }
}
initApp();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
