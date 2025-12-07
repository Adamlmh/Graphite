import React, { useState, useEffect } from 'react';
import { Input, Button, Space, message } from 'antd';
import { CheckOutlined, CloseOutlined } from '@ant-design/icons';
import { hotKeyManager, HotKeyManager } from '../../../../services/hotkeys/hotKeyManager';
import type { HotKeyDescriptor } from '../../../../services/hotkeys/hotKeyTypes';
import styles from './KeyBindingEditor.module.less';

interface KeyBindingEditorProps {
  hotkey: Omit<HotKeyDescriptor, 'handler'>;
  onSave: (newKey: string) => void;
  onCancel: () => void;
}

const KeyBindingEditor: React.FC<KeyBindingEditorProps> = ({ hotkey, onSave, onCancel }) => {
  const [currentKey, setCurrentKey] = useState<string>('');
  const [isRecording, setIsRecording] = useState(false);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);

  useEffect(() => {
    if (isRecording) {
      const handleKeyDown = (e: KeyboardEvent) => {
        e.preventDefault();
        e.stopPropagation();

        const normalized = HotKeyManager.normalizeFromKeyboardEvent(e);
        setCurrentKey(normalized);

        // 检查冲突
        const context = hotkey.context || 'global';
        const existingHotKeys = hotKeyManager.list(context);
        const conflict = existingHotKeys.find(
          (hk) =>
            hk.id !== hotkey.id &&
            (Array.isArray(hk.key)
              ? hk.key.some((k) => {
                  const normalizedK = HotKeyManager.normalizeKeyString(k);
                  return normalizedK === normalized;
                })
              : HotKeyManager.normalizeKeyString(hk.key) === normalized),
        );

        if (conflict) {
          setConflictWarning(`快捷键已被 "${conflict.description || conflict.id}" 占用`);
        } else {
          setConflictWarning(null);
        }
      };

      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [isRecording, hotkey]);

  const handleStartRecording = () => {
    setIsRecording(true);
    setCurrentKey('');
    setConflictWarning(null);
  };

  const handleSave = () => {
    if (!currentKey) {
      message.warning('请先按下快捷键');
      return;
    }

    if (conflictWarning) {
      message.warning('快捷键冲突，请选择其他快捷键');
      return;
    }

    onSave(currentKey);
    setIsRecording(false);
  };

  const handleCancel = () => {
    setIsRecording(false);
    setCurrentKey('');
    setConflictWarning(null);
    onCancel();
  };

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

  return (
    <div className={styles.editor}>
      <div className={styles.inputArea}>
        {isRecording ? (
          <div className={styles.recording}>
            <div className={styles.recordingIndicator}>
              <span className={styles.pulse}></span>
              正在录制...
            </div>
            <Input
              value={currentKey ? formatKeyDisplay(currentKey) : '按下快捷键...'}
              readOnly
              className={styles.keyInput}
              placeholder="按下快捷键..."
            />
            {conflictWarning && <div className={styles.conflictWarning}>{conflictWarning}</div>}
          </div>
        ) : (
          <Input
            value={currentKey ? formatKeyDisplay(currentKey) : ''}
            readOnly
            className={styles.keyInput}
            placeholder="点击开始录制"
            onClick={handleStartRecording}
          />
        )}
      </div>
      <Space className={styles.actions}>
        {!isRecording && (
          <Button size="small" onClick={handleStartRecording}>
            开始录制
          </Button>
        )}
        {isRecording && (
          <>
            <Button
              type="primary"
              size="small"
              icon={<CheckOutlined />}
              onClick={handleSave}
              disabled={!currentKey || !!conflictWarning}
            >
              保存
            </Button>
            <Button size="small" icon={<CloseOutlined />} onClick={handleCancel}>
              取消
            </Button>
          </>
        )}
      </Space>
    </div>
  );
};

export default KeyBindingEditor;
