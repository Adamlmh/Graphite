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
} from '@ant-design/icons';
import type { Tool } from '../../../../types/index';
import { useCanvasStore } from '../../../../stores/canvas-store';
import { useTheme } from '../../../../hooks/useTheme';
import { eventBus } from '../../../../lib/eventBus';
import { historyService } from '../../../../services/instances';
import styles from './ToolBar.module.less';

const CircleIcon = () => <span className={styles.circleIcon} />;
const RectangleIcon = () => <span className={styles.rectangleIcon} />;
const TriangleIcon = () => <span className={styles.triangleIcon} />;
const RoundedRectangleIcon = () => <span className={styles.roundedRectangleIcon} />;

const ToolBar: React.FC = () => {
  const activeTool = useCanvasStore((state) => state.tool.activeTool);
  const setActiveTool = useCanvasStore((state) => state.setTool);
  const { isDarkMode, toggleTheme } = useTheme();

  // 从 store 获取当前缩放值（实时响应）
  const currentZoom = useCanvasStore((state) => state.viewport.zoom);
  const setViewport = useCanvasStore((state) => state.setViewport);

  // 历史服务状态
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

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

  // 处理缩放值变化
  const handleZoomChange = (value: number | null) => {
    if (value === null) return;

    // 限制缩放范围 10% - 600%
    const clampedValue = Math.max(10, Math.min(600, value));
    const newZoom = clampedValue / 100;

    // 更新视口缩放
    setViewport({
      zoom: newZoom,
    });
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
        <Tooltip title="缩放比例 (Ctrl+滚轮)" placement="bottom">
          <InputNumber
            min={10}
            max={600}
            value={Math.round(currentZoom * 100)}
            onChange={handleZoomChange}
            changeOnWheel
            className={styles.zoomInput}
            suffix="%"
            controls={false}
            step={10}
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default ToolBar;
