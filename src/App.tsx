import './App.css';
import './styles/themes.less';
import CanvasRenderer from './components/canvas/CanvasRenderer';
import ToolBar from './components/ui/business/ToolBar/ToolBar';
import PropertiesPanel from './components/ui/business/PropertiesPanel/PropertiesPanel';
import './lib/DOMEventBridge';

function App() {
  return (
    //下为ui组件展示
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ minHeight: '60px' }}>
        <ToolBar />
      </header>
      <main style={{ display: 'flex', flex: 1 }}>
        {/* 画布区域 */}
        <div style={{ flex: 1 }}>
          <CanvasRenderer />
        </div>

        {/* 属性面板 */}
        <PropertiesPanel />
      </main>
    </div>
  );
}

export default App;
