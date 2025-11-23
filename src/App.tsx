import './lib/DOMEventBridge';
import './App.css';
import TextProperties from './components/ui/business/Propertities/TextProperties/TextProperties';
import ShapeProperties from './components/ui/business/Propertities/ShapeProperties/ShapeProperties';
import ImageProperties from './components/ui/business/Propertities/ImageProperties/ImageProperties';
import ToolBar from './components/ui/business/ToolBar/ToolBar';
import FloatingPanel from './components/ui/layout/FloatingPanel/FloatingPanel';
function App() {
  return (
    //下为ui组件展示
    <div>
      <header>
        <ToolBar />
      </header>
      <main>
        <aside>
          <FloatingPanel position={{ top: 20, right: 0 }}>
            <p>文本属性栏基础样式</p>
            <TextProperties />
          </FloatingPanel>

          <FloatingPanel position={{ top: 280, right: 0 }}>
            <p>图形属性栏基础样式</p>
            <ShapeProperties />
          </FloatingPanel>

          <FloatingPanel position={{ top: 500, right: 0 }}>
            <p>图片属性栏基础样式</p>
            <ImageProperties />
          </FloatingPanel>
        </aside>
      </main>
    </div>
  );
}

export default App;
