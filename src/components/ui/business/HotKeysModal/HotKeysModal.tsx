import React, { useState, useMemo } from 'react';
import { Modal, Input, Button, Tag, Space } from 'antd';
import { SearchOutlined, GlobalOutlined, AppstoreOutlined } from '@ant-design/icons';
import { DEFAULT_HOTKEYS } from '../../../../services/hotkeys/hotKeyConfig';
import type { HotKeyDescriptor } from '../../../../services/hotkeys/hotKeyTypes';
import styles from './HotKeysModal.module.less';

interface HotKeysModalProps {
  visible: boolean;
  onClose: () => void;
}

interface ExtendedHotKey extends Omit<HotKeyDescriptor, 'handler'> {
  id: string;
  key: string | string[];
  context?: string;
  description?: string;
  userAssignable?: boolean;
}

const HotKeysModal: React.FC<HotKeysModalProps> = ({ visible, onClose }) => {
  const [searchText, setSearchText] = useState('');
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['global', 'canvas']),
  );
  const [filterContext, setFilterContext] = useState<string | 'all'>('all');

  // 格式化快捷键用于搜索
  const formatKeyForSearch = (key: string | string[]): string => {
    if (Array.isArray(key)) {
      return key.join(' ');
    }
    return key;
  };

  // 获取所有快捷键
  const getAllHotKeys = useMemo((): ExtendedHotKey[] => {
    return DEFAULT_HOTKEYS.map((hotkey) => ({
      ...hotkey,
    }));
  }, []);

  // 按上下文分组快捷键
  const groupedHotKeys = useMemo(() => {
    return getAllHotKeys.reduce(
      (acc, hotkey) => {
        const context = hotkey.context || 'global';
        if (!acc[context]) {
          acc[context] = [];
        }
        acc[context].push(hotkey);
        return acc;
      },
      {} as Record<string, ExtendedHotKey[]>,
    );
  }, [getAllHotKeys]);

  // 过滤快捷键
  const filteredHotKeys = useMemo(() => {
    let filtered = getAllHotKeys;

    // 搜索过滤
    if (searchText) {
      const lowerSearch = searchText.toLowerCase();
      filtered = filtered.filter(
        (hk) =>
          hk.description?.toLowerCase().includes(lowerSearch) ||
          hk.id.toLowerCase().includes(lowerSearch) ||
          formatKeyForSearch(hk.key).toLowerCase().includes(lowerSearch),
      );
    }

    // 上下文过滤
    if (filterContext !== 'all') {
      filtered = filtered.filter((hk) => (hk.context || 'global') === filterContext);
    }

    return filtered;
  }, [getAllHotKeys, searchText, filterContext]);

  // 格式化快捷键显示
  const formatSingleKey = (key: string): string => {
    return key
      .replace(/Ctrl\+/g, 'Ctrl + ')
      .replace(/Meta\+/g, '⌘ + ')
      .replace(/Shift\+/g, 'Shift + ')
      .replace(/Alt\+/g, 'Alt + ')
      .replace(/ArrowLeft/g, '←')
      .replace(/ArrowRight/g, '→')
      .replace(/ArrowUp/g, '↑')
      .replace(/ArrowDown/g, '↓')
      .replace(/WheelUp/g, '滚轮上')
      .replace(/WheelDown/g, '滚轮下')
      .replace(/Delete/g, 'Delete')
      .replace(/Backspace/g, 'Backspace')
      .replace(/Space/g, 'Space');
  };

  // 上下文名称映射
  const contextNames: Record<string, string> = {
    global: '全局快捷键',
    canvas: '画布快捷键',
  };

  // 上下文图标映射
  const contextIcons: Record<string, React.ReactNode> = {
    global: <GlobalOutlined />,
    canvas: <AppstoreOutlined />,
  };

  // 切换分组展开/折叠
  const toggleSection = (context: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(context)) {
      newExpanded.delete(context);
    } else {
      newExpanded.add(context);
    }
    setExpandedSections(newExpanded);
  };

  // 渲染快捷键项
  const renderHotKeyItem = (hotkey: ExtendedHotKey) => {
    const keys = Array.isArray(hotkey.key) ? hotkey.key : [hotkey.key];

    return (
      <div key={hotkey.id} className={styles.hotKeyItem}>
        <div className={styles.itemLeft}>
          <div className={styles.description}>
            {hotkey.description}
            {hotkey.userAssignable === false && (
              <Tag color="default" className={styles.systemTag}>
                系统
              </Tag>
            )}
          </div>
        </div>
        <div className={styles.itemRight}>
          <div className={styles.keys}>
            {keys.map((k, idx) => (
              <span key={idx} className={styles.key}>
                {formatSingleKey(k)}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <Modal
      title="快捷键列表"
      open={visible}
      onCancel={onClose}
      footer={null}
      width={700}
      className={styles.hotKeysModal}
    >
      <div className={styles.filterBar}>
        <Input
          placeholder="搜索快捷键..."
          prefix={<SearchOutlined />}
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className={styles.searchInput}
          allowClear
        />
        <Space>
          <Button
            type={filterContext === 'all' ? 'primary' : 'default'}
            size="small"
            onClick={() => setFilterContext('all')}
          >
            全部
          </Button>
          <Button
            type={filterContext === 'global' ? 'primary' : 'default'}
            size="small"
            icon={<GlobalOutlined />}
            onClick={() => setFilterContext('global')}
          >
            全局
          </Button>
          <Button
            type={filterContext === 'canvas' ? 'primary' : 'default'}
            size="small"
            icon={<AppstoreOutlined />}
            onClick={() => setFilterContext('canvas')}
          >
            画布
          </Button>
        </Space>
      </div>

      {searchText || filterContext !== 'all' ? (
        <div className={styles.content}>
          <div className={styles.section}>
            <h3 className={styles.sectionTitle}>搜索结果 ({filteredHotKeys.length})</h3>
            <div className={styles.hotKeysList}>
              {filteredHotKeys.length > 0 ? (
                filteredHotKeys.map(renderHotKeyItem)
              ) : (
                <div className={styles.emptyState}>未找到匹配的快捷键</div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className={styles.content}>
          {Object.entries(groupedHotKeys).map(([context, hotkeys]) => (
            <div key={context} className={styles.section}>
              <div className={styles.sectionHeader} onClick={() => toggleSection(context)}>
                <Space>
                  {contextIcons[context]}
                  <h3 className={styles.sectionTitle}>
                    {contextNames[context] || context} ({hotkeys.length})
                  </h3>
                </Space>
                <span className={styles.expandIcon}>
                  {expandedSections.has(context) ? '▼' : '▶'}
                </span>
              </div>
              {expandedSections.has(context) && (
                <div className={styles.hotKeysList}>{hotkeys.map(renderHotKeyItem)}</div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

export default HotKeysModal;
