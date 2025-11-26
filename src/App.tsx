import './App.css';
import CanvasRenderer from './components/canvas/CanvasRenderer';
import ToolBar from './components/ui/business/ToolBar/ToolBar';
import './lib/DOMEventBridge';

function App() {
  return (
    //下为ui组件展示
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ minHeight: '60px' }}>
        <ToolBar />
      </header>
      <main style={{ flex: 1 }}>
        {/* 画布区域 */}
        <CanvasRenderer />
      </main>
    </div>
  );
}

export default App;
