import React, { useMemo } from 'react';
import { Card, Tag, Alert, Empty } from 'antd';
import { WarningOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { hotKeyManager, HotKeyManager } from '../../../../services/hotkeys/hotKeyManager';
import type { HotKeyDescriptor } from '../../../../services/hotkeys/hotKeyTypes';
import styles from './ConflictDetector.module.less';

interface ExtendedHotKey extends Omit<HotKeyDescriptor, 'handler'> {
  id: string;
  key: string | string[];
  context?: string;
  description?: string;
}

interface HotKeyConflict {
  key: string;
  context: string;
  hotkeys: ExtendedHotKey[];
}

interface ConflictDetectorProps {
  hotKeys: ExtendedHotKey[];
}

const ConflictDetector: React.FC<ConflictDetectorProps> = ({ hotKeys }) => {
  // 检测冲突
  const conflicts = useMemo(() => {
    const conflictMap = new Map<string, ExtendedHotKey[]>();

    hotKeys.forEach((hk) => {
      const context = hk.context || 'global';
      const keys = Array.isArray(hk.key) ? hk.key : [hk.key];

      keys.forEach((key) => {
        const normalized = HotKeyManager.normalizeKeyString(key);
        const indexKey = `${context}::${normalized}`;

        if (!conflictMap.has(indexKey)) {
          conflictMap.set(indexKey, []);
        }
        conflictMap.get(indexKey)!.push(hk);
      });
    });

    // 过滤出有冲突的
    const conflictsList: HotKeyConflict[] = [];
    conflictMap.forEach((hotkeys, indexKey) => {
      if (hotkeys.length > 1) {
        const [context, normalized] = indexKey.split('::');
        conflictsList.push({
          key: normalized,
          context,
          hotkeys,
        });
      }
    });

    return conflictsList;
  }, [hotKeys]);

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

  if (conflicts.length === 0) {
    return (
      <div className={styles.noConflicts}>
        <Empty
          image={<CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a' }} />}
          description={
            <div>
              <h3>未检测到快捷键冲突</h3>
              <p>所有快捷键配置正常，没有重复绑定</p>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className={styles.conflictDetector}>
      <Alert
        message={`检测到 ${conflicts.length} 个快捷键冲突`}
        description="以下快捷键在同一上下文中被多个功能使用，可能会导致意外的行为。"
        type="warning"
        icon={<WarningOutlined />}
        showIcon
        className={styles.alert}
      />

      <div className={styles.conflictsList}>
        {conflicts.map((conflict, idx) => (
          <Card
            key={idx}
            title={
              <Space>
                <Tag color="red">{formatKeyDisplay(conflict.key)}</Tag>
                <Tag>{conflict.context}</Tag>
              </Space>
            }
            className={styles.conflictCard}
          >
            <div className={styles.conflictItems}>
              {conflict.hotkeys.map((hk) => (
                <div key={hk.id} className={styles.conflictItem}>
                  <div className={styles.itemInfo}>
                    <span className={styles.description}>{hk.description || hk.id}</span>
                    <Tag size="small" color="blue">
                      {hk.id}
                    </Tag>
                  </div>
                  {hk.userAssignable === false && (
                    <Tag color="default" size="small">
                      系统保护
                    </Tag>
                  )}
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default ConflictDetector;
