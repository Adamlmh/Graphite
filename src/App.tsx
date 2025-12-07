import './App.css';
import './styles/themes.less';
import { useState } from 'react';
import { Button } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import CanvasRenderer from './components/canvas/CanvasRenderer';
import ToolBar from './components/ui/business/ToolBar/ToolBar';
import PropertiesPanel from './components/ui/business/PropertiesPanel/PropertiesPanel';
import HotKeysModal from './components/ui/business/HotKeysModal/HotKeysModal';
import './lib/DOMEventBridge';
import styles from './App.module.less';

function App() {
  const [hotKeysModalVisible, setHotKeysModalVisible] = useState(false);

  return (
    //下为ui组件展示
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ minHeight: '60px' }}>
        <ToolBar />
      </header>
      <main style={{ display: 'flex', flex: 1, position: 'relative' }}>
        {/* 画布区域 */}
        <div style={{ flex: 1 }}>
          <CanvasRenderer />
        </div>

        {/* 属性面板 */}
        <PropertiesPanel />

        {/* 左下角帮助按钮 */}
        <Button
          type="text"
          icon={<QuestionCircleOutlined />}
          className={styles.helpButton}
          onClick={() => setHotKeysModalVisible(true)}
        />

        {/* 快捷键弹窗 */}
        <HotKeysModal visible={hotKeysModalVisible} onClose={() => setHotKeysModalVisible(false)} />
      </main>
    </div>
  );
}

export default App;
