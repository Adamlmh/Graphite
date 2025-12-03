import React, { useState, useEffect } from 'react';
import { Button, Tooltip, InputNumber, message } from 'antd';
import {
  DragOutlined,
  SelectOutlined,
  FontSizeOutlined,
  PictureOutlined,
  SunOutlined,
  MoonOutlined,
  UndoOutlined,
  RedoOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import type { Tool } from '../../../../types/index';
import { useCanvasStore } from '../../../../stores/canvas-store';
import { useTheme } from '../../../../hooks/useTheme';
import { eventBus } from '../../../../lib/eventBus';
import { historyService } from '../../../../main';
import styles from './ToolBar.module.less';

const CircleIcon = () => <span className={styles.circleIcon} />;
const RectangleIcon = () => <span className={styles.rectangleIcon} />;
const TriangleIcon = () => <span className={styles.triangleIcon} />;
const RoundedRectangleIcon = () => <span className={styles.roundedRectangleIcon} />;

const ToolBar: React.FC = () => {
  const activeTool = useCanvasStore((state) => state.tool.activeTool);
  const setActiveTool = useCanvasStore((state) => state.setTool);
  const { isDarkMode, toggleTheme } = useTheme();

  // 历史服务状态
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // 监听历史状态变化
  useEffect(() => {
    const updateHistoryState = () => {
      setCanUndo(historyService.canUndo());
      setCanRedo(historyService.canRedo());
    };

    // 初始化时更新一次
    updateHistoryState();

    // 监听 store 变化
    const interval = setInterval(updateHistoryState, 500);

    return () => clearInterval(interval);
  }, []);

  // 处理撤销
  const handleUndo = async () => {
    try {
      await historyService.undo();
      console.log('Undo successful');
    } catch (error) {
      message.error('撤销失败');
      console.error('Undo error:', error);
    }
  };

  // 处理重做
  const handleRedo = async () => {
    try {
      await historyService.redo();
      console.log('Redo successful');
    } catch (error) {
      message.error('重做失败');
      console.error('Redo error:', error);
    }
  };

  // 处理保存
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await historyService.forceSave();
      console.log('Save successful');
    } catch (error) {
      message.error('保存失败');
      console.error('Save error:', error);
    } finally {
      setIsSaving(false);
    }
  };

  // 处理工具点击
  const handleToolClick = (toolId: Tool) => {
    if (toolId === 'image') {
      setActiveTool('image');
      eventBus.emit('image:trigger-upload');
    } else {
      // 其他工具：正常切换
      setActiveTool(toolId);
    }
  };

  const tools: Array<{ id: Tool; label: string; icon: React.ReactNode }> = [
    { id: 'hand', label: '移动', icon: <DragOutlined /> },
    { id: 'select', label: '光标', icon: <SelectOutlined /> },
    { id: 'circle', label: '圆形', icon: <CircleIcon /> },
    { id: 'rect', label: '矩形', icon: <RectangleIcon /> },
    { id: 'triangle', label: '三角形', icon: <TriangleIcon /> },
    { id: 'rounded-rect', label: '圆角矩形', icon: <RoundedRectangleIcon /> },
    { id: 'text', label: '文字插入', icon: <FontSizeOutlined /> },
    { id: 'image', label: '图片插入', icon: <PictureOutlined /> },
  ];

  return (
    <div className={styles.toolbarWrapper}>
      {/* 左侧历史操作按钮组 */}
      <div className={styles.leftSection}>
        <Tooltip title="撤销 (Ctrl+Z)" placement="bottom">
          <Button
            type="text"
            className={styles.toolButton}
            icon={<UndoOutlined />}
            onClick={handleUndo}
            disabled={!canUndo}
          />
        </Tooltip>
        <Tooltip title="重做 (Ctrl+Shift+Z)" placement="bottom">
          <Button
            type="text"
            className={styles.toolButton}
            icon={<RedoOutlined />}
            onClick={handleRedo}
            disabled={!canRedo}
          />
        </Tooltip>
        <div className={styles.divider} />
        <Tooltip title="保存 (Ctrl+S)" placement="bottom">
          <Button
            type="text"
            className={styles.toolButton}
            icon={<SaveOutlined />}
            onClick={handleSave}
            loading={isSaving}
          />
        </Tooltip>
      </div>

      {/* 中间工具栏 */}
      <div className={styles.toolbar}>
        {tools.map((tool) => (
          <Tooltip key={tool.id} title={tool.label} placement="bottom">
            <Button
              type="text"
              className={[styles.toolButton, activeTool === tool.id ? styles.active : '']
                .filter(Boolean)
                .join(' ')}
              icon={tool.icon}
              onClick={() => handleToolClick(tool.id)}
            />
          </Tooltip>
        ))}
        <div className={styles.divider} />
        <Tooltip title={isDarkMode ? '切换为明亮主题' : '切换为暗夜主题'} placement="bottom">
          <Button
            type="text"
            className={styles.toolButton}
            icon={isDarkMode ? <MoonOutlined /> : <SunOutlined />}
            onClick={toggleTheme}
          />
        </Tooltip>
      </div>
      <div className={styles.rightSection}>
        <Tooltip title="缩放比例" placement="bottom">
          <InputNumber
            min={50}
            max={250}
            defaultValue={100}
            changeOnWheel
            className={styles.zoomInput}
            suffix="%"
            controls={false}
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default ToolBar;
