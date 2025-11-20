import './App.css';

function App() {
  return (
    <div className="intro">
      <h1 className="title">Graphite - 现代化图形画布解决方案</h1>
      <p className="description">
        Graphite 是一个基于 React 与 PixiJS
        构建的高性能图形设计画布。它提供了从基础图形渲染、无限画布操作到实时协同编辑的全套能力，旨在为复杂的图形编辑场景提供一个稳定、可扩展的技术基础。
      </p>
      <h2 className="features-title">核心特性：</h2>
      <ul className="features">
        <li>🎨 精准渲染：支持矢量图形、富文本与图片的高保真渲染。</li>
        <li>♾️ 无限画布：打破边界，在无缝的空间中自由组织和创作。</li>
        <li>⚡ 实时协同：基于 CRDT 技术，实现流畅的多用户同步编辑。</li>
        <li>🛠️ 开放架构：清晰的数据流与 API 设计，易于定制与集成。</li>
      </ul>
      <p className="slogan">Graphite，驱动下一代数字创作工具。</p>
      <p className="powered-by">power by 智超小组</p>
    </div>
  );
}

export default App;
