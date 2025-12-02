import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { setupHotKeys } from './services/hotkeys/setupHotKeys';
import { CreateInteraction } from './services/interaction/CreateInteraction';
// import { MoveInteraction } from './services/interaction/MoveInteraction';
import { MoveInteraction } from './services/interaction/moveInteraction.ts';
// import { MoveInteraction } from './services/interaction/MoveInteraction';
import { useCanvasStore } from './stores/canvas-store';
import { HistoryService } from './services/HistoryService';

//初始化快捷键系统
setupHotKeys();
//初始化创建交互
new CreateInteraction();
new MoveInteraction();

// 全局初始化 HistoryService
export const historyService = new HistoryService({
  getState: () => useCanvasStore.getState(),
  setState: (partial) => {
    useCanvasStore.setState((state) => Object.assign(state, partial));
  },
});

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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
