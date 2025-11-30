import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { setupHotKeys } from './services/hotkeys/setupHotKeys';
import { CreateInteraction } from './services/interaction/CreateInteraction';
// import { MoveInteraction } from './services/interaction/MoveInteraction';
import { MoveInteraction } from './services/interaction/moveInteraction.ts';
// import { MoveInteraction } from './services/interaction/MoveInteraction';

//初始化快捷键系统
setupHotKeys();
//初始化创建交互
new CreateInteraction();
new MoveInteraction();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
