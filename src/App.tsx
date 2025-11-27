import './App.css';
import './styles/themes.less';
import CanvasRenderer from './components/canvas/CanvasRenderer';
import ToolBar from './components/ui/business/ToolBar/ToolBar';
import ShapeProperties from './components/ui/business/Propertities/ShapeProperties/ShapeProperties';
import FloatingPanel from './components/ui/layout/FloatingPanel/FloatingPanel';
import './lib/DOMEventBridge';
import type { RectElement } from './types/index'; // 根据你的实际路径调整

// 创建一个矩形元素
const mockRectElement: RectElement = {
  id: 'rect-1',
  type: 'rect',
  x: 100,
  y: 100,
  width: 200,
  height: 150,
  rotation: 0,
  style: {
    fill: '#4A90E2',
    fillOpacity: 1,
    stroke: '#2C3E50',
    strokeWidth: 2,
    strokeOpacity: 1,
    borderRadius: 10,
  },
  zIndex: 1,
  opacity: 1,
  transform: {
    scaleX: 1,
    scaleY: 1,
    pivotX: 0.5,
    pivotY: 0.5,
  },
  version: 1,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  visibility: 'visible',
};

function App() {
  const handleStyleChange = (elementId: string, newStyle: Partial<RectElement['style']>) => {
    console.log('矩形样式变化:', elementId, newStyle);
  };

  const handleGroupStyleChange = (
    elementId: string,
    newStyle: Partial<RectElement['style']>,
    applyToChildren: boolean,
  ) => {
    console.log('矩形组样式变化:', elementId, newStyle, applyToChildren);
  };

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
      <aside>
        <FloatingPanel position={{ top: 120, right: 0 }}>
          <ShapeProperties
            element={mockRectElement}
            onChange={handleStyleChange}
            onGroupStyleChange={handleGroupStyleChange}
          />
        </FloatingPanel>
      </aside>
    </div>
  );
}

export default App;
