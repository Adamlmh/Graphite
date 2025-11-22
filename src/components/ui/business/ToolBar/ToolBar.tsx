import React, { useState } from 'react';
import { Button, Tooltip } from 'antd';
import {
  DragOutlined,
  SelectOutlined,
  FontSizeOutlined,
  PictureOutlined,
  SunOutlined,
  MoonOutlined,
} from '@ant-design/icons';
import styles from './ToolBar.module.less';

type ToolId =
  | 'move'
  | 'cursor'
  | 'circle'
  | 'rectangle'
  | 'triangle'
  | 'roundedRectangle'
  | 'text'
  | 'image';

const CircleIcon = () => <span className={styles.circleIcon} />;
const RectangleIcon = () => <span className={styles.rectangleIcon} />;
const TriangleIcon = () => <span className={styles.triangleIcon} />;
const RoundedRectangleIcon = () => <span className={styles.roundedRectangleIcon} />;

const ToolBar: React.FC = () => {
  const [activeTool, setActiveTool] = useState<ToolId>('cursor');
  const [isDarkMode, setIsDarkMode] = useState(false);

  const tools: { id: ToolId; label: string; icon: React.ReactNode }[] = [
    { id: 'move', label: '移动', icon: <DragOutlined /> },
    { id: 'cursor', label: '光标', icon: <SelectOutlined /> },
    { id: 'circle', label: '圆形', icon: <CircleIcon /> },
    { id: 'rectangle', label: '矩形', icon: <RectangleIcon /> },
    { id: 'triangle', label: '三角形', icon: <TriangleIcon /> },
    { id: 'roundedRectangle', label: '圆角矩形', icon: <RoundedRectangleIcon /> },
    { id: 'text', label: '文字插入', icon: <FontSizeOutlined /> },
    { id: 'image', label: '图片插入', icon: <PictureOutlined /> },
  ];

  return (
    <div className={styles.toolbarWrapper}>
      <div className={styles.toolbar}>
        {tools.map((tool) => (
          <Tooltip key={tool.id} title={tool.label} placement="bottom">
            <Button
              type={activeTool === tool.id ? 'primary' : 'default'}
              className={[styles.toolButton, activeTool === tool.id ? styles.active : '']
                .filter(Boolean)
                .join(' ')}
              icon={tool.icon}
              onClick={() => setActiveTool(tool.id)}
            />
          </Tooltip>
        ))}
        <div className={styles.divider} />
        <Tooltip title={isDarkMode ? '切换为明亮主题' : '切换为暗夜主题'} placement="bottom">
          <Button
            type="default"
            className={styles.toolButton}
            icon={isDarkMode ? <MoonOutlined /> : <SunOutlined />}
            onClick={() => setIsDarkMode((prev) => !prev)}
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default ToolBar;
