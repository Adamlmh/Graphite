import CanvasRenderer from './components/canvas/CanvasRenderer';
import './lib/DOMEventBridge';
import './App.css';
// import TextProperties from './components/ui/business/Propertities/TextProperties/TextProperties';
// import ShapeProperties from './components/ui/business/Propertities/ShapeProperties/ShapeProperties';
// import ImageProperties from './components/ui/business/Propertities/ImageProperties/ImageProperties';
// import ToolBar from './components/ui/business/ToolBar/ToolBar';
function App() {
  return (
    <div className="app-container">
      <CanvasRenderer />
    </div>
  );
}

export default App;
