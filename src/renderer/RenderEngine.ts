// renderer/RenderEngine.ts
import * as PIXI from 'pixi.js';
import { eventBus } from '../lib/eventBus';
import type { CanvasEvent } from '../lib/EventBridge';
import { ViewportInteraction } from '../services/interaction/ViewportInteraction';
import type { Element, ElementType, ViewportState } from '../types';
import {
  type AllRenderCommand,
  type BatchDeleteElementCommand,
  type BatchUpdateElementCommand,
  type CreateElementCommand,
  type DeleteElementCommand,
  type UpdateElementCommand,
  type UpdateSelectionCommand,
  type UpdateViewportCommand,
} from '../types/render.types';
import { LayerManager } from './layers/LayerManager';
import { ElementRendererRegistry } from './renderers/ElementRendererRegistry';
import { ResourceManager } from './resources/ResourceManager';
import { RenderScheduler } from './scheduling/RenderScheduler';
import { ScrollbarManager } from './ui/ScrollbarManager';
import { ViewportController } from './viewport/ViewportController';
import { GeometryService } from '../lib/Coordinate/GeometryService';
import { ElementProvider } from '../lib/Coordinate/providers/ElementProvider';
import { CoordinateTransformer } from '../lib/Coordinate/CoordinateTransformer';
/**
 * 渲染引擎核心 - 协调所有渲染模块
 * 职责：接收渲染命令，调度各个模块协同工作
 */
export class RenderEngine {
  private pixiApp!: PIXI.Application;
  private camera!: PIXI.Container;
  private layerManager!: LayerManager;
  private rendererRegistry!: ElementRendererRegistry;
  private resourceManager!: ResourceManager;
  private renderScheduler!: RenderScheduler;
  private viewportController!: ViewportController;
  private scrollbarManager!: ScrollbarManager;
  private geometryService!: GeometryService;
  private currentViewport!: ViewportState;
  private defaultSnapping = {
    enabled: false,
    guidelines: [],
    threshold: 4,
    showGuidelines: false,
    snapToElements: false,
    snapToCanvas: false,
  } as ViewportState['snapping'];

  // 元素图形映射表：维护业务元素与PIXI图形对象的关联
  private elementGraphics: Map<string, PIXI.Container> = new Map();

  // 预览元素相关
  private previewGraphics: PIXI.Container | null = null;

  private container: HTMLElement;
  private viewportInteraction!: ViewportInteraction;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * 创建并初始化RenderEngine
   */
  static async create(container: HTMLElement): Promise<RenderEngine> {
    const engine = new RenderEngine(container);
    await engine.initializePixiApp();
    return engine;
  }

  /**
   * 初始化PixiJS应用
   */
  private async initializePixiApp(): Promise<void> {
    this.pixiApp = new PIXI.Application();

    await this.pixiApp.init({
      backgroundAlpha: 0, // 使用透明背景，由CSS控制背景色
      resolution: window.devicePixelRatio || 1,
      antialias: true,
      autoDensity: true,
      resizeTo: this.container,
    });

    // 将canvas添加到容器中
    this.container.appendChild(this.pixiApp.canvas);

    // 启用交互功能
    this.pixiApp.stage.interactive = true;
    this.pixiApp.stage.interactiveChildren = true; // 允许子元素接收事件（关键修复！）
    this.pixiApp.stage.hitArea = new PIXI.Rectangle(-10000, -10000, 20000, 20000);

    this.camera = new PIXI.Container();
    this.camera.interactive = true;
    this.camera.interactiveChildren = true; // 允许子元素接收事件（关键修复！）
    this.pixiApp.stage.addChild(this.camera);

    this.viewportController = new ViewportController(this.pixiApp, this.camera, this.container);
    this.viewportController.setZoomLimits(0.1, 6);
    this.scrollbarManager = new ScrollbarManager(this.pixiApp, this.viewportController);

    this.layerManager = new LayerManager(this.camera);
    this.resourceManager = new ResourceManager();
    this.rendererRegistry = new ElementRendererRegistry(this.resourceManager);
    this.renderScheduler = new RenderScheduler(this.pixiApp);
    this.geometryService = new GeometryService();

    this.viewportController.onViewportChange = (vp, priority) => {
      this.currentViewport = vp;
      this.scrollbarManager.refresh(vp);
      this.renderScheduler.scheduleRender(priority);
    };

    // 初始化视口交互
    this.viewportInteraction = new ViewportInteraction(this.container);
    this.viewportInteraction.init();
  }

  /**
   * 动态设置背景色（如果需要的话）
   */
  setBackgroundColor(color: number): void {
    if (this.pixiApp && this.pixiApp.renderer) {
      this.pixiApp.renderer.background.color = color;
    }
  }

  /**
   * 执行渲染命令 - 主要外部接口
   */
  async executeRenderCommand(command: AllRenderCommand): Promise<void> {
    console.log('RenderEngine: 执行渲染命令', command);

    try {
      switch (command.type) {
        case 'CREATE_ELEMENT':
          await this.createElement(command as CreateElementCommand);
          break;
        case 'UPDATE_ELEMENT':
          this.updateElement(command as UpdateElementCommand);
          break;
        case 'DELETE_ELEMENT':
          this.deleteElement(command as DeleteElementCommand);
          break;
        case 'BATCH_DELETE_ELEMENTS':
          this.batchDeleteElements(command as BatchDeleteElementCommand);
          break;
        case 'BATCH_UPDATE_ELEMENTS':
          this.batchUpdateElements(command as BatchUpdateElementCommand);
          break;
        case 'UPDATE_SELECTION':
          this.updateSelection(command as UpdateSelectionCommand);
          break;
        case 'UPDATE_VIEWPORT':
          this.updateViewport(command as UpdateViewportCommand);
          break;
        default:
          console.warn('未知渲染命令:', command);
      }

      // 打印世界坐标
      this.printWorldCoordinates();
    } catch (error) {
      console.error('执行渲染命令失败:', error);
    }
  }

  /**
   * TODO: 未来需要提供的批处理接口
   *
   * 批处理执行渲染命令
   * 用于优化性能，在同一帧内批量处理多个命令
   *
   * 预期接口签名：
   * async batchExecute(commands: AllRenderCommand[]): Promise<void>
   *
   * 功能要求：
   * - 按优先级和类型排序：DELETE > CREATE > UPDATE
   * - 批量执行命令，减少渲染调度次数
   * - 提供更好的性能优化
   */

  /**
   * 创建新元素
   */
  private async createElement(command: CreateElementCommand): Promise<void> {
    const { elementId, elementType, elementData } = command;

    // 准备渲染资源
    const resources = await this.resourceManager.prepareResources(elementData);

    // 选择对应的元素渲染器
    const renderer = this.rendererRegistry.getRenderer(elementType);

    // 创建PIXI图形对象
    const graphics = renderer.render(elementData, resources);

    // 添加到对应的渲染图层
    const layer = this.layerManager.getLayerForElement(elementData);
    layer.addChild(graphics);

    // 注册到元素映射表
    this.elementGraphics.set(elementId, graphics);

    // 调度渲染
    this.renderScheduler.scheduleRender(command.priority);
  }

  /**
   * 更新现有元素
   */
  private updateElement(command: UpdateElementCommand): void {
    const { elementId, properties } = command;
    const graphics = this.elementGraphics.get(elementId);

    if (!graphics) {
      console.warn(`找不到元素的图形对象: ${elementId}`);
      return;
    }

    // 获取元素类型和对应的渲染器
    const elementType = this.getElementTypeFromGraphics(graphics);
    const renderer = this.rendererRegistry.getRenderer(elementType);

    // 执行具体的图形更新
    renderer.update(graphics, properties);

    // 调度渲染
    this.renderScheduler.scheduleRender(command.priority);
  }

  /**
   * 删除元素
   */
  private deleteElement(command: DeleteElementCommand): void {
    const { elementId } = command;
    const graphics = this.elementGraphics.get(elementId);

    if (graphics) {
      // 从父容器移除
      graphics.parent?.removeChild(graphics);

      // 清理资源
      this.resourceManager.cleanupElementResources(elementId);

      // 从映射表移除
      this.elementGraphics.delete(elementId);

      // 调度渲染
      this.renderScheduler.scheduleRender(command.priority);
    }
  }

  /**
   * 批量删除元素
   */
  private batchDeleteElements(command: BatchDeleteElementCommand): void {
    const { elementIds } = command;

    elementIds.forEach((elementId) => {
      const graphics = this.elementGraphics.get(elementId);

      if (graphics) {
        // 从父容器移除
        graphics.parent?.removeChild(graphics);

        // 清理资源
        this.resourceManager.cleanupElementResources(elementId);

        // 从映射表移除
        this.elementGraphics.delete(elementId);
      }
    });

    // 调度渲染
    this.renderScheduler.scheduleRender(command.priority);
  }

  /**
   * 批量更新元素
   */
  private batchUpdateElements(command: BatchUpdateElementCommand): void {
    const { updates } = command;

    updates.forEach(({ elementId, properties }) => {
      const graphics = this.elementGraphics.get(elementId);

      if (!graphics) {
        console.warn(`找不到元素的图形对象: ${elementId}`);
        return;
      }

      // 获取元素类型和对应的渲染器
      const elementType = this.getElementTypeFromGraphics(graphics);
      const renderer = this.rendererRegistry.getRenderer(elementType);

      // 执行具体的图形更新
      renderer.update(graphics, properties);
    });

    // 调度渲染
    this.renderScheduler.scheduleRender(command.priority);
  }

  /**
   * 更新选中状态
   */
  private updateSelection(command: UpdateSelectionCommand): void {
    const { selectedElementIds } = command;

    // 清除选择层
    this.layerManager.getSelectionLayer().removeChildren();

    if (selectedElementIds.length <= 1) {
      selectedElementIds.forEach((elementId) => {
        const graphics = this.elementGraphics.get(elementId);
        if (graphics) {
          this.drawSelectionBox(graphics, elementId, true);
        }
      });
    } else {
      selectedElementIds.forEach((elementId) => {
        const graphics = this.elementGraphics.get(elementId);
        if (graphics) {
          this.drawSelectionBox(graphics, elementId, false);
        }
      });
    }

    // 如果选择多个元素，绘制组合边界框以增强视觉反馈
    if (selectedElementIds.length > 1) {
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;

      selectedElementIds.forEach((elementId) => {
        const provider = new ElementProvider(elementId);
        const b = this.geometryService.getElementBoundsWorld(provider);
        minX = Math.min(minX, b.x);
        minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.width);
        maxY = Math.max(maxY, b.y + b.height);
      });

      if (minX !== Infinity) {
        const selectionLayer = this.layerManager.getSelectionLayer();
        const box = new PIXI.Graphics();
        box.lineStyle(2, 0x2563eb, 1);
        const dash = 10;
        const gap = 6;
        const drawDashed = (x1: number, y1: number, x2: number, y2: number) => {
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const ux = dx / len;
          const uy = dy / len;
          let pos = 0;
          while (pos < len) {
            const sx = x1 + ux * pos;
            const sy = y1 + uy * pos;
            const ex = x1 + ux * Math.min(pos + dash, len);
            const ey = y1 + uy * Math.min(pos + dash, len);
            box.moveTo(sx, sy);
            box.lineTo(ex, ey);
            pos += dash + gap;
          }
        };
        drawDashed(minX, minY, maxX, minY);
        drawDashed(maxX, minY, maxX, maxY);
        drawDashed(maxX, maxY, minX, maxY);
        drawDashed(minX, maxY, minX, minY);
        box.stroke();
        box.interactive = false;
        box.interactiveChildren = false;

        const fill = new PIXI.Graphics();
        fill.beginFill(0x3b82f6, 0.04);
        fill.drawRect(minX, minY, maxX - minX, maxY - minY);
        fill.endFill();
        fill.interactive = false;
        fill.interactiveChildren = false;

        selectionLayer.addChild(box);
        selectionLayer.addChild(fill);

        const handleSize = 8;
        const handleColor = 0xffffff;
        const handleBorderColor = 0x2563eb;
        const handlePositions = [
          { x: minX, y: minY },
          { x: (minX + maxX) / 2, y: minY },
          { x: maxX, y: minY },
          { x: maxX, y: (minY + maxY) / 2 },
          { x: maxX, y: maxY },
          { x: (minX + maxX) / 2, y: maxY },
          { x: minX, y: maxY },
          { x: minX, y: (minY + maxY) / 2 },
        ];
        const handleTypes = [
          'top-left',
          'top',
          'top-right',
          'right',
          'bottom-right',
          'bottom',
          'bottom-left',
          'left',
        ];
        handlePositions.forEach((pos, index) => {
          const handle = new PIXI.Graphics();
          handle.beginFill(handleColor);
          handle.lineStyle(1, handleBorderColor, 1);
          handle.circle(0, 0, handleSize / 2);
          handle.endFill();
          handle.position.set(pos.x, pos.y);
          handle.interactive = true;
          handle.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
            event.stopPropagation();
            eventBus.emit('group-resize-start', {
              elementIds: selectedElementIds,
              handleType: handleTypes[index],
              bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
              event,
            });
          });
          selectionLayer.addChild(handle);
        });

        const rotationHandle = new PIXI.Graphics();
        rotationHandle.beginFill(handleColor);
        rotationHandle.lineStyle(1, handleBorderColor, 1);
        rotationHandle.circle(0, 0, 6);
        rotationHandle.endFill();
        rotationHandle.position.set((minX + maxX) / 2, maxY + 20);
        rotationHandle.interactive = true;
        rotationHandle.hitArea = new PIXI.Circle(0, 0, 8);
        rotationHandle.cursor = 'pointer';
        // 使用静态事件模式，确保可以接收事件
        rotationHandle.eventMode = 'static';
        // 使用捕获阶段监听，确保在事件到达 stage 之前处理
        rotationHandle.eventMode = 'static';
        rotationHandle.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
          // 立即阻止事件传播，防止被 EventBridge 和 SelectionInteraction 处理
          event.stopPropagation();
          eventBus.emit('group-rotation-start', {
            elementIds: selectedElementIds,
            bounds: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
            event: event, // 直接传递原始事件
          });
        });
        selectionLayer.addChild(rotationHandle);
      }
    }

    // 调度渲染
    this.renderScheduler.scheduleRender(command.priority);
  }

  /**
   * 更新视口状态
   */
  private updateViewport(command: UpdateViewportCommand): void {
    const { viewport } = command;
    const base = this.currentViewport || {
      zoom: 1,
      offset: { x: 0, y: 0 },
      canvasSize: { width: this.container.clientWidth, height: this.container.clientHeight },
      contentBounds: {
        x: 0,
        y: 0,
        width: this.container.clientWidth,
        height: this.container.clientHeight,
      },
      snapping: this.defaultSnapping,
    };
    const nextSnapping = viewport.snapping
      ? { ...base.snapping, ...viewport.snapping }
      : base.snapping;
    const next: ViewportState = { ...base, ...viewport, snapping: nextSnapping };
    this.viewportController.setViewport(next, command.priority);

    const overlay = this.layerManager.getOverlayLayer();
    overlay.removeChildren();
    if (
      next.snapping.showGuidelines &&
      next.snapping.guidelines &&
      next.snapping.guidelines.length > 0
    ) {
      const wb = this.viewportController.getWorkingBounds(next);
      const colorBySource = (src: string, strength: string): number => {
        if (src === 'canvas-center') return 0x7c3aed;
        if (src === 'element-center') return strength === 'strong' ? 0x1d4ed8 : 0x60a5fa;
        if (src === 'spacing') return 0xf59e0b;
        return strength === 'strong' ? 0x22c55e : 0x86efac;
      };
      const dashByStrength = (strength: string): { dash: number; gap: number; width: number } => {
        return strength === 'strong'
          ? { dash: 10, gap: 6, width: 3 }
          : { dash: 6, gap: 6, width: 2 };
      };

      next.snapping.guidelines.forEach((line) => {
        const style = dashByStrength(line.strength || 'weak');
        const color = line.color ?? colorBySource(line.source, line.strength || 'weak');
        const g = new PIXI.Graphics();
        g.lineStyle(style.width, color, 1);
        const drawDashed = (x1: number, y1: number, x2: number, y2: number) => {
          const dx = x2 - x1;
          const dy = y2 - y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const ux = dx / (len || 1);
          const uy = dy / (len || 1);
          let pos = 0;
          while (pos < len) {
            const sx = x1 + ux * pos;
            const sy = y1 + uy * pos;
            const ex = x1 + ux * Math.min(pos + style.dash, len);
            const ey = y1 + uy * Math.min(pos + style.dash, len);
            g.moveTo(sx, sy);
            g.lineTo(ex, ey);
            pos += style.dash + style.gap;
          }
        };
        if (line.type === 'vertical') {
          drawDashed(line.position, wb.y, line.position, wb.y + wb.height);
        } else {
          drawDashed(wb.x, line.position, wb.x + wb.width, line.position);
        }
        g.stroke();
        overlay.addChild(g);
      });
    }
  }

  /**
   * 绘制选择框和调整手柄
   */
  private drawSelectionBox(
    elementGraphics: PIXI.Container,
    elementId: string,
    withHandles: boolean = true,
  ): void {
    // 使用 GeometryService 获取元素的世界坐标边界框
    const elementProvider = new ElementProvider(elementId);
    const bounds = this.geometryService.getElementBoundsWorld(elementProvider);

    const selectionLayer = this.layerManager.getSelectionLayer();

    const dashedBox = new PIXI.Graphics();
    dashedBox.lineStyle(2, 0x007bff, 1);
    const dash = 8;
    const gap = 6;
    const drawDashed = (x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      const ux = dx / len;
      const uy = dy / len;
      let pos = 0;
      while (pos < len) {
        const sx = x1 + ux * pos;
        const sy = y1 + uy * pos;
        const ex = x1 + ux * Math.min(pos + dash, len);
        const ey = y1 + uy * Math.min(pos + dash, len);
        dashedBox.moveTo(sx, sy);
        dashedBox.lineTo(ex, ey);
        pos += dash + gap;
      }
    };
    drawDashed(bounds.x, bounds.y, bounds.x + bounds.width, bounds.y);
    drawDashed(
      bounds.x + bounds.width,
      bounds.y,
      bounds.x + bounds.width,
      bounds.y + bounds.height,
    );
    drawDashed(
      bounds.x + bounds.width,
      bounds.y + bounds.height,
      bounds.x,
      bounds.y + bounds.height,
    );
    drawDashed(bounds.x, bounds.y + bounds.height, bounds.x, bounds.y);
    dashedBox.stroke();
    dashedBox.interactive = false;
    dashedBox.interactiveChildren = false;
    selectionLayer.addChild(dashedBox);

    const highlightBox = new PIXI.Graphics();
    highlightBox.beginFill(0x3b82f6, 0.06);
    highlightBox.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
    highlightBox.endFill();
    highlightBox.interactive = false;
    highlightBox.interactiveChildren = false;
    selectionLayer.addChild(highlightBox);

    if (withHandles) {
      const handleSize = 8;
      const handleColor = 0xffffff;
      const handleBorderColor = 0x007bff;

      const handlePositions = [
        { x: bounds.x, y: bounds.y },
        { x: bounds.x + bounds.width / 2, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
        { x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
        { x: bounds.x, y: bounds.y + bounds.height },
        { x: bounds.x, y: bounds.y + bounds.height / 2 },
      ];

      const handleTypes = [
        'top-left',
        'top',
        'top-right',
        'right',
        'bottom-right',
        'bottom',
        'bottom-left',
        'left',
      ];

      const handleCursors = [
        'nwse-resize', // top-left: 左上角，西北-东南方向
        'ns-resize', // top: 上边，南北方向
        'nesw-resize', // top-right: 右上角，东北-西南方向
        'ew-resize', // right: 右边，东西方向
        'nwse-resize', // bottom-right: 右下角，西北-东南方向
        'ns-resize', // bottom: 下边，南北方向
        'nesw-resize', // bottom-left: 左下角，东北-西南方向
        'ew-resize', // left: 左边，东西方向
      ];
      handlePositions.forEach((pos, index) => {
        const handle = new PIXI.Graphics();
        handle.beginFill(handleColor);
        handle.lineStyle(1, handleBorderColor, 1);
        handle.circle(0, 0, handleSize / 2);
        handle.endFill();
        handle.position.set(pos.x, pos.y);
        handle.interactive = true;
        handle.hitArea = new PIXI.Circle(0, 0, handleSize / 2 + 2);
        handle.cursor = handleCursors[index];
        handle.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
          event.stopPropagation();
          eventBus.emit('resize-start', { elementId, handleType: handleTypes[index], event });
        });
        selectionLayer.addChild(handle);
      });

      const rotationHandle = new PIXI.Graphics();
      rotationHandle.beginFill(handleColor);
      rotationHandle.lineStyle(1, handleBorderColor, 1);
      rotationHandle.circle(0, 0, 6);
      rotationHandle.endFill();
      rotationHandle.position.set(bounds.x + bounds.width / 2, bounds.y + bounds.height + 20);
      rotationHandle.interactive = true;
      rotationHandle.hitArea = new PIXI.Circle(0, 0, 8);
      rotationHandle.cursor = 'move';
      // 使用静态事件模式，确保可以接收事件
      rotationHandle.eventMode = 'static';
      rotationHandle.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
        // 立即阻止事件传播，防止被 EventBridge 和 SelectionInteraction 处理
        event.stopPropagation();
        eventBus.emit('rotation-start', { elementId, event });
      });
      selectionLayer.addChild(rotationHandle);
    }
  }

  /**
   * 从图形对象推断元素类型
   */
  private getElementTypeFromGraphics(graphics: PIXI.Container): ElementType {
    return (graphics as PIXI.Container & { elementType?: ElementType }).elementType || 'rect';
  }

  /**
   * 提供给外部的查询接口
   */
  getElementBounds(elementId: string): PIXI.Rectangle {
    const graphics = this.elementGraphics.get(elementId);
    return graphics ? (graphics.getBounds() as unknown as PIXI.Rectangle) : new PIXI.Rectangle();
  }

  isElementVisible(elementId: string): boolean {
    const graphics = this.elementGraphics.get(elementId);
    return graphics ? graphics.visible && graphics.renderable : false;
  }

  /**
   * 销毁渲染引擎，清理资源
   */
  destroy(): void {
    this.resourceManager.destroy();
    this.pixiApp.destroy(true, true);
  }

  /**
   * 获取 Pixi Application 实例
   */
  getPixiApp(): PIXI.Application {
    return this.pixiApp;
  }

  /**
   * 更新预览元素
   */
  async updatePreviewElement(element: Element): Promise<void> {
    try {
      if (this.previewGraphics) {
        // 更新现有预览
        const renderer = this.rendererRegistry.getRenderer(element.type);
        renderer.update(this.previewGraphics, element);
      } else {
        // 创建新的预览
        const resources = await this.resourceManager.prepareResources(element);
        const renderer = this.rendererRegistry.getRenderer(element.type);
        const graphics = renderer.render(element, resources);

        // 设置预览样式（半透明）
        graphics.alpha = 0.5;

        // 添加到覆盖层（Overlay）
        this.layerManager.getOverlayLayer().addChild(graphics);

        this.previewGraphics = graphics;
      }
    } catch (error) {
      console.error('更新预览元素失败:', error);
    }
  }

  /**
   * 移除预览元素
   */
  removePreviewElement(): void {
    if (this.previewGraphics) {
      this.previewGraphics.parent?.removeChild(this.previewGraphics);
      this.previewGraphics.destroy();
      this.previewGraphics = null;
    }
  }

  /**
   * 打印所有元素的PIXI世界坐标
   */
  printWorldCoordinates(): void {
    console.log('=== PIXI 渲染图形世界坐标 ===');
    this.elementGraphics.forEach((graphics, elementId) => {
      // 获取相对于camera的局部坐标
      const localPos = graphics.position;
      // 获取camera的偏移量（世界坐标）
      const cameraOffset = {
        x: -this.camera.position.x / this.camera.scale.x,
        y: -this.camera.position.y / this.camera.scale.y,
      };
      // 计算真正的世界坐标：局部坐标 + camera偏移
      const worldPos = {
        x: localPos.x + cameraOffset.x,
        y: localPos.y + cameraOffset.y,
      };

      console.log(
        `元素 ${elementId}: 世界坐标 (${worldPos.x.toFixed(2)}, ${worldPos.y.toFixed(2)})`,
      );
    });
    console.log('================================');
  }
}
