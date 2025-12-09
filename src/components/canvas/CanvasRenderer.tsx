import { useEffect, useRef, useState } from 'react';
import { useCursor } from '../../hooks/useCursor';
import { CanvasBridge } from '../../lib/CanvasBridge/CanvasBridge';
import { eventBridge } from '../../lib/EventBridge';
import { eventBus } from '../../lib/eventBus';
import { setPixiApp } from '../../lib/pixiApp';
import { setRenderEngine } from '../../lib/renderEngineManager';
import { RenderEngine } from '../../renderer/RenderEngine';
import { ImageInteraction } from '../../services/interaction/ImageInteraction';
// import { SelectionInteraction } from '../../services/interaction/SelectionInteraction';
import { TextEditorInteraction } from '../../services/interaction/TextEditorInteraction';
import { useCanvasStore } from '../../stores/canvas-store';
import TextEditorManager from '../ui/business/TextEditor/TextEditorManager';
import './CanvasRenderer.less';
import Minimap from './Minimap';
import { historyService, selectInteraction } from '../../services/instances';
/**
 * CanvasRenderer 组件
 */

const CanvasRenderer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const renderEngineRef = useRef<RenderEngine | null>(null);
  const bridgeRef = useRef<CanvasBridge | null>(null);
  // const selectionInteractionRef = useRef<SelectionInteraction | null>(null);
  const imageInteractionRef = useRef<ImageInteraction | null>(null);
  const textEditorInteractionRef = useRef<TextEditorInteraction | null>(null);
  type SelectDebugState = {
    state: string;
    hitId: string | null;
    screen: { x: number; y: number };
    world: { x: number; y: number };
  };
  const [selectDebug, setSelectDebug] = useState<SelectDebugState>({
    state: 'Idle',
    hitId: null,
    screen: { x: 0, y: 0 },
    world: { x: 0, y: 0 },
  });

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

        console.log('CanvasRenderer: CanvasBridge 启动完成，设置 SelectInteraction 容器');
        // 设置 SelectInteraction 的容器，用于光标管理
        selectInteraction.setContainer(container);

        console.log('CanvasRenderer: 初始化选择交互系统');
        // 初始化选择交互（使用默认 Provider，无需传入参数）
        // const selectionInteraction = new SelectionInteraction();
        // selectionInteractionRef.current = selectionInteraction;

        // 初始化图片上传交互
        console.log('CanvasRenderer: 初始化图片上传交互系统');
        const imageInteraction = new ImageInteraction(historyService);
        imageInteractionRef.current = imageInteraction;

        // 初始化文本编辑交互
        console.log('CanvasRenderer: 初始化文本编辑交互系统');
        const textEditorInteraction = new TextEditorInteraction();
        textEditorInteractionRef.current = textEditorInteraction;

        // 创建测试组合（用于验证命中与移动逻辑）
        console.log('CanvasRenderer: 创建测试组合');
        // const rect1 = ElementFactory.createRectangle(100, 100, 150, 100, {
        //   fill: '#ff6b6b',
        //   fillOpacity: 0.8,
        // });
        // const rect2 = ElementFactory.createRectangle(200, 150, 150, 100, {
        //   fill: '#4ecdc4',
        //   fillOpacity: 0.8,
        // });

        // useCanvasStore.getState().addElement(rect1);
        // useCanvasStore.getState().addElement(rect2);

        // const testGroup = groupElements([rect1.id, rect2.id]);
        // console.log('CanvasRenderer: 测试组合创建成功', {
        //   groupId: testGroup.id,
        //   children: testGroup.children,
        // });
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

  useEffect(() => {
    const handler = (...args: unknown[]) => {
      const data = (args[0] ?? {}) as { tag?: string; ts?: string; payload?: unknown };
      const tag = data?.tag;
      const p = (data?.payload ?? {}) as Record<string, unknown>;
      if (tag === 'state-change') {
        const nextState = typeof p.to === 'string' ? p.to : undefined;
        const hoverId = typeof p.hoverElementId === 'string' ? p.hoverElementId : undefined;
        setSelectDebug((prev: SelectDebugState) => ({
          ...prev,
          state: nextState ?? prev.state,
          hitId: hoverId ?? prev.hitId,
        }));
        return;
      }
      if (tag === 'element-hit' || tag === 'top-hit') {
        const eid = typeof p.elementId === 'string' ? p.elementId : undefined;
        if (eid) {
          setSelectDebug((prev: SelectDebugState) => ({ ...prev, hitId: eid }));
        }
      }
      if (tag === 'pointermove' || tag === 'pointerdown' || tag === 'pointerup') {
        const screen = (p.screen ?? {}) as Record<string, unknown>;
        const world = (p.world ?? {}) as Record<string, unknown>;
        const sx =
          typeof screen.x === 'number' || typeof screen.x === 'string'
            ? Number(screen.x)
            : undefined;
        const sy =
          typeof screen.y === 'number' || typeof screen.y === 'string'
            ? Number(screen.y)
            : undefined;
        const wx =
          typeof world.x === 'number' || typeof world.x === 'string' ? Number(world.x) : undefined;
        const wy =
          typeof world.y === 'number' || typeof world.y === 'string' ? Number(world.y) : undefined;
        setSelectDebug((prev: SelectDebugState) => ({
          ...prev,
          screen: { x: sx ?? prev.screen.x, y: sy ?? prev.screen.y },
          world: { x: wx ?? prev.world.x, y: wy ?? prev.world.y },
        }));
      }
    };
    eventBus.on('debug:select', handler);
    return () => {
      eventBus.off('debug:select', handler);
    };
  }, []);

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
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          padding: '6px 8px',
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          borderRadius: 6,
          fontSize: 12,
          pointerEvents: 'none',
          zIndex: 1,
          lineHeight: '18px',
        }}
      >
        <div>State: {selectDebug.state}</div>
        <div>Hit: {selectDebug.hitId ?? '-'}</div>
        <div>
          Screen: {selectDebug.screen.x.toFixed(1)}, {selectDebug.screen.y.toFixed(1)}
        </div>
        <div>
          World: {selectDebug.world.x.toFixed(1)}, {selectDebug.world.y.toFixed(1)}
        </div>
      </div>
      <Minimap containerRef={containerRef} />
      <TextEditorManager /> {/* 文本编辑器管理器组件 */}
    </div>
  );
};

export default CanvasRenderer;
