import CanvasRenderer from './components/canvas/CanvasRenderer';
import './lib/DOMEventBridge';
import './App.css';

function App() {
  return (
    <div className="app-container">
      <CanvasRenderer />
    </div>
  );
}

export default App;
