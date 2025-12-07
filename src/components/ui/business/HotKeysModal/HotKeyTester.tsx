import React, { useState, useEffect } from 'react';
import { Card, Tag, Space, Button } from 'antd';
import { CloseOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { hotKeyManager, HotKeyManager } from '../../../../services/hotkeys/hotKeyManager';
import type { HotKeyDescriptor } from '../../../../services/hotkeys/hotKeyTypes';
import styles from './HotKeyTester.module.less';

interface HotKeyTesterProps {
  onClose: () => void;
}

interface TestResult {
  key: string;
  matched: boolean;
  hotkey?: HotKeyDescriptor;
  timestamp: number;
}

const HotKeyTester: React.FC<HotKeyTesterProps> = ({ onClose }) => {
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [currentKey, setCurrentKey] = useState<string>('');
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const normalized = HotKeyManager.normalizeFromKeyboardEvent(e);
      setCurrentKey(normalized);

      // 查找匹配的快捷键
      const contexts = ['canvas', 'global'];
      let matchedHotkey: HotKeyDescriptor | undefined;

      for (const ctx of contexts) {
        const hotKeys = hotKeyManager.list(ctx);
        matchedHotkey = hotKeys.find((hk) => {
          const keys = Array.isArray(hk.key) ? hk.key : [hk.key];
          return keys.some((k) => {
            const normalizedK = HotKeyManager.normalizeKeyString(k);
            return normalizedK === normalized;
          });
        });

        if (matchedHotkey) break;
      }

      const result: TestResult = {
        key: normalized,
        matched: !!matchedHotkey,
        hotkey: matchedHotkey,
        timestamp: Date.now(),
      };

      setTestResults((prev) => [result, ...prev].slice(0, 20)); // 保留最近20条
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isActive]);

  const formatKeyDisplay = (key: string): string => {
    return key
      .replace(/Ctrl\+/g, 'Ctrl + ')
      .replace(/Meta\+/g, '⌘ + ')
      .replace(/Shift\+/g, 'Shift + ')
      .replace(/Alt\+/g, 'Alt + ')
      .replace(/ArrowLeft/g, '←')
      .replace(/ArrowRight/g, '→')
      .replace(/ArrowUp/g, '↑')
      .replace(/ArrowDown/g, '↓');
  };

  const clearResults = () => {
    setTestResults([]);
    setCurrentKey('');
  };

  return (
    <Card
      title={
        <Space>
          <span>快捷键测试模式</span>
          <Tag color={isActive ? 'green' : 'default'}>{isActive ? '监听中' : '已暂停'}</Tag>
        </Space>
      }
      extra={
        <Space>
          <Button size="small" onClick={() => setIsActive(!isActive)}>
            {isActive ? '暂停' : '继续'}
          </Button>
          <Button size="small" onClick={clearResults}>
            清空
          </Button>
          <Button size="small" icon={<CloseOutlined />} onClick={onClose}>
            关闭
          </Button>
        </Space>
      }
      className={styles.testerCard}
    >
      <div className={styles.testerContent}>
        <div className={styles.currentKey}>
          {currentKey ? (
            <>
              <span className={styles.keyLabel}>当前按键：</span>
              <Tag color="blue" className={styles.keyTag}>
                {formatKeyDisplay(currentKey)}
              </Tag>
            </>
          ) : (
            <span className={styles.placeholder}>按下任意快捷键进行测试...</span>
          )}
        </div>

        <div className={styles.results}>
          <div className={styles.resultsHeader}>
            <span>测试历史（最近20条）</span>
            <span className={styles.count}>{testResults.length}</span>
          </div>
          <div className={styles.resultsList}>
            {testResults.length === 0 ? (
              <div className={styles.emptyState}>暂无测试记录</div>
            ) : (
              testResults.map((result, idx) => (
                <div key={idx} className={styles.resultItem}>
                  <div className={styles.resultKey}>
                    <Tag color={result.matched ? 'green' : 'default'}>
                      {formatKeyDisplay(result.key)}
                    </Tag>
                    {result.matched && <CheckCircleOutlined className={styles.matchIcon} />}
                  </div>
                  {result.matched && result.hotkey && (
                    <div className={styles.resultInfo}>
                      <span className={styles.description}>
                        {result.hotkey.description || result.hotkey.id}
                      </span>
                      <Tag size="small" color="blue">
                        {result.hotkey.context || 'global'}
                      </Tag>
                    </div>
                  )}
                  {!result.matched && (
                    <div className={styles.resultInfo}>
                      <span className={styles.noMatch}>未匹配到快捷键</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </Card>
  );
};

export default HotKeyTester;
