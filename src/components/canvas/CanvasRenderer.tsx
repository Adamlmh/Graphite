import { useEffect, useRef } from 'react';
import { useCursor } from '../../hooks/useCursor';
import { CanvasBridge } from '../../lib/CanvasBridge/CanvasBridge';
import { eventBridge } from '../../lib/EventBridge';
import { setPixiApp } from '../../lib/pixiApp';
import { RenderEngine } from '../../renderer/RenderEngine';
import { ImageInteraction } from '../../services/interaction/ImageInteraction';
import { SelectionInteraction } from '../../services/interaction/SelectionInteraction';
import { useCanvasStore } from '../../stores/canvas-store';
import './CanvasRenderer.less';
import Minimap from './Minimap';
/**
 * CanvasRenderer 组件
 */

const CanvasRenderer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderEngineRef = useRef<RenderEngine | null>(null);
  const bridgeRef = useRef<CanvasBridge | null>(null);
  const selectionInteractionRef = useRef<SelectionInteraction | null>(null);
  const imageInteractionRef = useRef<ImageInteraction | null>(null);

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
        const imageInteraction = new ImageInteraction();
        imageInteractionRef.current = imageInteraction;

        // 创建多个测试矩形元素
        const rectElement = [
          {
            id: 'test-rect',
            type: 'rect' as const,
            zIndex: 1,
            x: 100,
            y: 100,
            width: 200,
            height: 150,
            rotation: 0,
            style: {
              fill: '#ff0000',
              fillOpacity: 1,
              stroke: '#000000',
              strokeWidth: 2,
              strokeOpacity: 1,
              borderRadius: 0,
            },
            opacity: 1,
            transform: {
              scaleX: 1,
              scaleY: 1,
              pivotX: 0.0,
              pivotY: 0.0,
            },
            version: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            visibility: 'visible' as const,
          },
          {
            id: 'test-rect-2',
            type: 'rect' as const,
            zIndex: 1,
            x: 300,
            y: 300,
            width: 200,
            height: 150,
            rotation: 0,
            style: {
              fill: '#00ff00',
              fillOpacity: 1,
              stroke: '#000000',
              strokeWidth: 2,
              strokeOpacity: 1,
              borderRadius: 0,
            },
            opacity: 1,
            transform: {
              scaleX: 1,
              scaleY: 1,
              pivotX: 0.0,
              pivotY: 0.0,
            },
            version: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            visibility: 'visible' as const,
          },
          {
            id: 'test-rect-3',
            type: 'rect' as const,
            zIndex: 1,
            x: 1000,
            y: 1000,
            width: 200,
            height: 150,
            rotation: 0,
            style: {
              fill: '#0000ff',
              fillOpacity: 1,
              stroke: '#000000',
              strokeWidth: 2,
              strokeOpacity: 1,
              borderRadius: 0,
            },
            opacity: 1,
            transform: {
              scaleX: 1,
              scaleY: 1,
              pivotX: 0.0,
              pivotY: 0.0,
            },
            version: 1,
            createdAt: Date.now(),
            updatedAt: Date.now(),
            visibility: 'visible' as const,
          },
        ];

        for (const rect of rectElement) {
          // 将测试元素添加到 store
          console.log('CanvasRenderer: 添加测试元素到store', rect);
          storeApi.getState().addElement(rect);

          // 验证元素是否被添加
          const currentElements = storeApi.getState().elementList;
          console.log('CanvasRenderer: 当前store中的元素列表', currentElements);
        }

        // 再次确认元素是否还在 store 中
        console.log('CanvasRenderer: 测试矩形创建完成', {
          storeElements: Object.keys(useCanvasStore.getState().elements),
          elementCount: Object.keys(useCanvasStore.getState().elements).length,
        });
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
    </div>
  );
};

export default CanvasRenderer;
