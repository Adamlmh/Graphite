import React, { useState, useEffect } from 'react';
import { Button, Tooltip, InputNumber, message, Switch } from 'antd';
import {
  DragOutlined,
  SelectOutlined,
  FontSizeOutlined,
  PictureOutlined,
  SunOutlined,
  MoonOutlined,
  UndoOutlined,
  RedoOutlined,
  ApartmentOutlined,
  UngroupOutlined,
  SaveOutlined,
} from '@ant-design/icons';
import type { Tool } from '../../../../types/index';
import { useCanvasStore } from '../../../../stores/canvas-store';
import { useTheme } from '../../../../hooks/useTheme';
import { eventBus } from '../../../../lib/eventBus';
import { historyService, groupInteraction } from '../../../../services/instances';
import { SaveStatus } from '../../../../services/HistoryService';
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

  // 打组/解组状态
  const selectedElementIds = useCanvasStore((state) => state.selectedElementIds);
  const [canGroup, setCanGroup] = useState(false);
  const [canUngroup, setCanUngroup] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(SaveStatus.IDLE);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [persistenceEnabled, setPersistenceEnabled] = useState(true);

  // 监听历史状态变化
  useEffect(() => {
    const updateHistoryState = () => {
      setCanUndo(historyService.canUndo());
      setCanRedo(historyService.canRedo());

      // 更新保存状态
      const status = historyService.getSaveStatus();
      setSaveStatus(status.status);
      // 检查是否有待处理的快照或保存错误
      const hasPending = historyService.hasPendingSnapshots();
      setHasUnsavedChanges(
        status.status === SaveStatus.SAVING || status.status === SaveStatus.ERROR || hasPending,
      );

      // 更新持久化状态
      setPersistenceEnabled(historyService.isPersistenceEnabled());
    };

    // 初始化时更新一次
    updateHistoryState();

    // 监听 store 变化和保存状态
    const interval = setInterval(updateHistoryState, 500);

    return () => clearInterval(interval);
  }, []);

  // 监听选中状态变化，更新打组/解组按钮状态
  useEffect(() => {
    const updateGroupState = () => {
      setCanGroup(groupInteraction.canGroup());
      setCanUngroup(groupInteraction.canUngroup());
    };

    // 初始化时更新一次
    updateGroupState();

    // 监听 store 变化
    const interval = setInterval(updateGroupState, 200);

    return () => clearInterval(interval);
  }, [selectedElementIds]);

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

  // 处理打组
  const handleGroup = async () => {
    try {
      await groupInteraction.groupSelectedElements();
      message.success('打组成功');
    } catch (error) {
      message.error('打组失败');
      console.error('Group error:', error);
    }
  };

  // 处理解组
  const handleUngroup = async () => {
    try {
      await groupInteraction.ungroupSelectedElements();
      message.success('解组成功');
    } catch (error) {
      message.error('解组失败');
      console.error('Ungroup error:', error);
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

  // 处理持久化开关变化
  const handlePersistenceToggle = (checked: boolean) => {
    historyService.setPersistenceEnabled(checked);
    setPersistenceEnabled(checked);
    message.success(`持久化已${checked ? '启用' : '禁用'}`);
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
        <Tooltip title="打组 (Ctrl+G)" placement="bottom">
          <Button
            type="text"
            className={styles.toolButton}
            icon={<ApartmentOutlined />}
            onClick={handleGroup}
            disabled={!canGroup}
          />
        </Tooltip>
        <Tooltip title="解组 (Ctrl+Shift+G)" placement="bottom">
          <Button
            type="text"
            className={styles.toolButton}
            icon={<UngroupOutlined />}
            onClick={handleUngroup}
            disabled={!canUngroup}
          />
        </Tooltip>
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
        {/* 持久化开关 */}
        <Tooltip
          title={persistenceEnabled ? '禁用持久化（演示模式）' : '启用持久化'}
          placement="bottom"
        >
          <div>
            <Switch checked={persistenceEnabled} onChange={handlePersistenceToggle} size="small" />
          </div>
        </Tooltip>
        {/* 保存状态提示 */}
        <span className={styles.saveStatus}>
          {persistenceEnabled
            ? saveStatus === SaveStatus.SAVING
              ? '正在保存...'
              : saveStatus === SaveStatus.SAVED
                ? '已保存'
                : saveStatus === SaveStatus.ERROR
                  ? '保存失败'
                  : hasUnsavedChanges
                    ? '未保存'
                    : '已保存'
            : '持久化已禁用'}
        </span>
        <Tooltip title="缩放比例" placement="bottom">
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
