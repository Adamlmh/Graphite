import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { setupHotKeys } from './services/hotkeys/setupHotKeys';
import { historyService } from './services/instances';

//初始化快捷键系统
setupHotKeys();

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
