import './App.css';
import './styles/themes.less';
import { useState, useEffect } from 'react';
import { Button, Modal } from 'antd';
import { QuestionCircleOutlined, ExclamationCircleOutlined } from '@ant-design/icons';
import CanvasRenderer from './components/canvas/CanvasRenderer';
import ToolBar from './components/ui/business/ToolBar/ToolBar';
import PropertiesPanel from './components/ui/business/PropertiesPanel/PropertiesPanel';
import HotKeysModal from './components/ui/business/HotKeysModal/HotKeysModal';
import { historyService } from './services/instances';
import { SaveStatus } from './services/HistoryService';
import './lib/DOMEventBridge';
import styles from './App.module.less';

function App() {
  const [hotKeysModalVisible, setHotKeysModalVisible] = useState(false);

  // 检查保存状态，在页面刷新前提示
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const saveStatus = historyService.getSaveStatus();
      const hasPendingSnapshots = historyService.hasPendingSnapshots();

      // 如果有未保存的更改或正在保存，阻止页面关闭
      if (
        saveStatus.status === SaveStatus.SAVING ||
        saveStatus.status === SaveStatus.ERROR ||
        hasPendingSnapshots
      ) {
        e.preventDefault();
        e.returnValue = '您有未保存的更改，确定要离开吗？';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

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
