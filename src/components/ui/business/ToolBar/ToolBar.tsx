import React from 'react';
import { Button, Tooltip, InputNumber } from 'antd';
import {
  DragOutlined,
  SelectOutlined,
  FontSizeOutlined,
  PictureOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons';
import type { Tool } from '../../../../types/index';
import { useCanvasStore } from '../../../../stores/canvas-store';
import { useTheme } from '../../../../hooks/useTheme';
import { eventBus } from '../../../../lib/eventBus';
import styles from './ToolBar.module.less';

const CircleIcon = () => <span className={styles.circleIcon} />;
const RectangleIcon = () => <span className={styles.rectangleIcon} />;
const TriangleIcon = () => <span className={styles.triangleIcon} />;
const RoundedRectangleIcon = () => <span className={styles.roundedRectangleIcon} />;

const ToolBar: React.FC = () => {
  const activeTool = useCanvasStore((state) => state.tool.activeTool);
  const setActiveTool = useCanvasStore((state) => state.setTool);
  const { isDarkMode, toggleTheme } = useTheme();

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
