import { useRef, useEffect } from 'react';
import * as PIXI from 'pixi.js';
import { setPixiApp } from '../../lib/pixiApp';
// 导入 EventBridge 以触发自动初始化（副作用）
import '../../lib/EventBridge';
import './CanvasRenderer.less';

/**
 * CanvasRenderer 组件
 * 【职责】仅负责创建 Pixi.Application 并挂载到 DOM
 * - 不监听任何 pointer/mouse/keyboard 事件
 * - 不包含任何业务逻辑
 * - 保持干净、轻量
 */
const CanvasRenderer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);

  useEffect(() => {
    // 防止 React 严格模式下的重复初始化
    if (appRef.current || !containerRef.current) {
      return;
    }

    // 保存容器引用的副本，用于清理函数（避免 React Hook 警告）
    const container = containerRef.current;
    let isMounted = true;

    const initPixi = async () => {
      try {
        // 创建 PIXI.Application
        const app = new PIXI.Application();

        // 初始化应用
        await app.init({
          antialias: true,
          backgroundColor: 0xffffff,
          resolution: window.devicePixelRatio || 1,
          resizeTo: container, // 自动调整大小到容器
        });

        // 检查组件是否仍然挂载（处理 React 严格模式）
        if (!isMounted || !container) {
          app.destroy(true);
          return;
        }

        // 将 canvas 视图追加到容器中
        container.appendChild(app.canvas);

        // 确保 canvas 可交互
        app.canvas.style.touchAction = 'none';
        app.canvas.style.userSelect = 'none';

        // 设置 stage 事件模式为 'static'，允许接收事件
        app.stage.eventMode = 'static';

        // 设置 hitArea 为整个屏幕，让整个画布都能接收事件
        app.stage.hitArea = app.screen;

        // 保存 app 实例到 ref
        appRef.current = app;

        // 导出 app 实例到全局（EventBridge 会自动初始化）
        setPixiApp(app);

        // 测试，给画布画一个矩形
        const rect = new PIXI.Graphics();
        rect.rect(0, 0, 100, 100).fill(0xff0000);
        rect.x = 100;
        rect.y = 100;
        app.stage.addChild(rect);
      } catch (error) {
        console.error('Failed to initialize Pixi.js:', error);
      }
    };

    initPixi();

    // 清理函数：组件卸载时销毁 Pixi 应用
    return () => {
      isMounted = false;

      // 使用 appRef.current 而不是闭包变量，确保获取最新的 app 实例
      const app = appRef.current;

      if (app) {
        // 检查 app.canvas 是否存在且有效
        if (app.canvas && container && app.canvas.parentNode === container) {
          // 移除 canvas 元素
          container.removeChild(app.canvas);
        }

        // 销毁 Pixi 应用
        try {
          app.destroy(true, {
            children: true,
            texture: true,
            textureSource: true,
          });
        } catch (error) {
          // 忽略销毁时的错误（可能已经部分销毁）
          console.warn('Error destroying Pixi app:', error);
        }

        appRef.current = null;
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
    />
  );
};

export default CanvasRenderer;
