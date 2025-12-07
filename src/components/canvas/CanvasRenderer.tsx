import { useEffect, useRef } from 'react';
import { useCursor } from '../../hooks/useCursor';
import { CanvasBridge } from '../../lib/CanvasBridge/CanvasBridge';
import { eventBridge } from '../../lib/EventBridge';
import { setPixiApp } from '../../lib/pixiApp';
import { setRenderEngine } from '../../lib/renderEngineManager';
import { RenderEngine } from '../../renderer/RenderEngine';
import { ImageInteraction } from '../../services/interaction/ImageInteraction';
import { SelectionInteraction } from '../../services/interaction/SelectionInteraction';
import { TextEditorInteraction } from '../../services/interaction/TextEditorInteraction';
import { useCanvasStore } from '../../stores/canvas-store';
import TextEditorManager from '../ui/business/TextEditor/TextEditorManager';
import './CanvasRenderer.less';
import Minimap from './Minimap';
import { historyService } from '../../services/instances';
/**
 * CanvasRenderer 组件
 */

const CanvasRenderer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderEngineRef = useRef<RenderEngine | null>(null);
  const bridgeRef = useRef<CanvasBridge | null>(null);
  const selectionInteractionRef = useRef<SelectionInteraction | null>(null);
  const imageInteractionRef = useRef<ImageInteraction | null>(null);
  const textEditorInteractionRef = useRef<TextEditorInteraction | null>(null);

  // 根据当前工具自动切换光标
  useCursor(containerRef);

  useEffect(() => {
    // 防止 React 严格模式下的重复初始化
    if (renderEngineRef.current || !containerRef.current) {
      return;
    }

    // 保存容器引用的副本，用于清理函数（避免 React Hook 警告）
    const container = containerRef.current;
    let isMounted = true;

    const initRenderEngine = async () => {
      try {
        console.log('CanvasRenderer: 开始初始化 RenderEngine');
        // 创建并初始化 RenderEngine
        const renderEngine = await RenderEngine.create(container);

        // 检查组件是否仍然挂载（处理 React 严格模式）
        if (!isMounted || !container) {
          renderEngine.destroy();
          return;
        }

        // 保存 renderEngine 实例到 ref
        renderEngineRef.current = renderEngine;

        // 注册 RenderEngine 到全局管理器
        setRenderEngine(renderEngine);

        // 获取 PixiApp 并导出到全局
        const pixiApp = renderEngine.getPixiApp();
        setPixiApp(pixiApp);

        console.log('CanvasRenderer: RenderEngine 初始化完成，启动 CanvasBridge');

        const storeApi = {
          getState: useCanvasStore.getState,
          subscribe: useCanvasStore.subscribe,
        };

        const bridge = new CanvasBridge(storeApi, renderEngine);
        bridge.start();
        bridgeRef.current = bridge;

        console.log('CanvasRenderer: CanvasBridge 启动完成，初始化选择交互系统');
        // 初始化选择交互（使用默认 Provider，无需传入参数）
        const selectionInteraction = new SelectionInteraction();
        selectionInteractionRef.current = selectionInteraction;

        // 初始化图片上传交互
        console.log('CanvasRenderer: 初始化图片上传交互系统');
        const imageInteraction = new ImageInteraction(historyService);
        imageInteractionRef.current = imageInteraction;

        // 初始化文本编辑交互
        console.log('CanvasRenderer: 初始化文本编辑交互系统');
        const textEditorInteraction = new TextEditorInteraction();
        textEditorInteractionRef.current = textEditorInteraction;
      } catch (error) {
        console.error('Failed to initialize RenderEngine:', error);
      }
    };

    initRenderEngine();

    // 清理函数：组件卸载时销毁 RenderEngine
    return () => {
      isMounted = false;

      // 停止桥接
      bridgeRef.current?.stop();
      bridgeRef.current = null;

      // 销毁图片交互
      imageInteractionRef.current?.destroy();
      imageInteractionRef.current = null;

      // 销毁文本编辑交互
      textEditorInteractionRef.current?.dispose();
      textEditorInteractionRef.current = null;

      // 使用 renderEngineRef.current 而不是闭包变量，确保获取最新的实例
      const renderEngine = renderEngineRef.current;

      if (renderEngine) {
        // 先销毁事件桥接，清理事件监听器
        eventBridge.destroy();

        // 销毁 RenderEngine
        try {
          renderEngine.destroy();
        } catch (error) {
          // 忽略销毁时的错误（可能已经部分销毁）
          console.warn('Error destroying RenderEngine:', error);
        }

        renderEngineRef.current = null;
        setRenderEngine(null);
        setPixiApp(null);
      }
    };
  }, []); // 空依赖数组，只在组件挂载时执行一次

  return (
    <div
      ref={containerRef}
      className="canvas-container"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
      }}
    >
      <Minimap containerRef={containerRef} />
      <TextEditorManager /> {/* 文本编辑器管理器组件 */}
    </div>
  );
};

export default CanvasRenderer;
