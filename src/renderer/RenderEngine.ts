// renderer/RenderEngine.ts
import * as PIXI from 'pixi.js';
// import type { CanvasEvent } from '../lib/EventBridge';
import { ViewportInteraction } from '../services/interaction/ViewportInteraction';
import type { Element, ElementType, ViewportState } from '../types';
import type { Point } from '../types/index';
import {
  type AllRenderCommand,
  type BatchDeleteElementCommand,
  type BatchUpdateElementCommand,
  type CreateElementCommand,
  type DeleteElementCommand,
  type UpdateElementCommand,
  type UpdateSelectionCommand,
  type UpdateViewportCommand,
  RenderPriority,
} from '../types/render.types';
import { LayerManager } from './layers/LayerManager';
import { ElementRendererRegistry } from './renderers/ElementRendererRegistry';
import { ResourceManager } from './resources/ResourceManager';
import { RenderScheduler } from './scheduling/RenderScheduler';
import { ScrollbarManager } from './ui/ScrollbarManager';
import { ViewportController } from './viewport/ViewportController';
import { GeometryService } from '../lib/Coordinate/GeometryService';
import { CoordinateTransformer } from '../lib/Coordinate/CoordinateTransformer';
import { ElementProvider } from '../lib/Coordinate/providers/ElementProvider';
import { isGroupElement } from '../types/index';
import { computeGroupBounds } from '../services/group-service';
import { useCanvasStore } from '../stores/canvas-store';
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

  // 当前正在编辑的元素ID
  private editingElementId: string | null = null;

  // 当前选中的元素ID列表
  private currentSelectedElementIds: string[] = [];

  private container: HTMLElement;
  private viewportInteraction!: ViewportInteraction;
  // private coordinateTransformer: CoordinateTransformer | null = null;
  private coordinateTransformer!: CoordinateTransformer;

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
    this.coordinateTransformer = new CoordinateTransformer();
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
    this.currentSelectedElementIds = selectedElementIds;

    // 清除选择层
    this.layerManager.getSelectionLayer().removeChildren();

    // 检查是否有 group 元素被选中
    const state = useCanvasStore.getState();

    // 过滤掉组合元素的子元素：如果选中了组合元素，不应该显示子元素的选中框
    const filteredSelectedIds = selectedElementIds.filter((elementId) => {
      const element = state.elements[elementId];
      if (!element) {
        return false;
      }

      // 如果元素有 parentId，检查它的父元素是否也在选中列表中
      if (element.parentId) {
        const parent = state.elements[element.parentId];
        // 如果父元素是组合元素且在选中列表中，则过滤掉这个子元素
        if (parent && isGroupElement(parent) && selectedElementIds.includes(element.parentId)) {
          return false;
        }
      }

      return true;
    });

    if (filteredSelectedIds.length <= 1) {
      filteredSelectedIds.forEach((elementId) => {
        const element = state.elements[elementId];
        console.log(`[RenderEngine.updateSelection] 处理元素 ${elementId}`, {
          elementExists: !!element,
          isGroup: element ? isGroupElement(element) : false,
        });

        // 如果是 group，使用 OBB（旋转外接矩形）绘制选中框
        if (element && isGroupElement(element)) {
          // 计算组合元素的 OBB
          const obb = this.computeOBBForElements([elementId]);

          if (obb && obb.corners.length === 4) {
            // 使用旋转的选中框绘制方法
            this.drawRotatedGroupSelectionBox(obb.corners, [elementId], true);
          } else {
            // 降级：如果无法计算 OBB，使用 AABB
            const groupBounds = computeGroupBounds(elementId);
            if (groupBounds) {
              this.drawSelectionBoxForGroup(groupBounds, elementId, true);
            }
          }
        } else {
          // 普通元素使用原有的逻辑
          const graphics = this.elementGraphics.get(elementId);
          if (graphics) {
            this.drawRotatedSelectionBox(graphics, elementId, true);
          }
        }
      });
    } else {
      // 多选状态下不绘制任何单体选框，尤其不显示 group 的选中框
      // 这样可以让用户清楚地看到多选框（虚线 AABB），而不是被单个元素的选中框干扰
    }

    // 如果选择多个元素，绘制组合边界框以增强视觉反馈
    //
    // 多选框设计（OBB - Oriented Bounding Box）：
    // - 单个元素选中框：可以是旋转的（OBB），显示元素的精确边界
    // - 多选框：使用旋转外接矩形（OBB），跟随内部元素的整体方向
    // - 使用旋转卡尺算法计算最小外接矩形，确保紧密包裹所有元素
    // - 多选框包含：虚线边框、半透明填充、8个调整手柄、1个旋转手柄
    if (filteredSelectedIds.length > 1) {
      // 计算 OBB（Oriented Bounding Box）
      const obb = this.computeOBBForElements(filteredSelectedIds);

      if (obb && obb.corners.length === 4) {
        // 使用旋转的选中框绘制方法
        this.drawRotatedGroupSelectionBox(obb.corners, filteredSelectedIds, true);
      } else {
        // 降级：如果无法计算 OBB，使用 AABB
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        filteredSelectedIds.forEach((elementId) => {
          const element = state.elements[elementId];
          let b: { x: number; y: number; width: number; height: number };

          if (element && isGroupElement(element)) {
            const groupBounds = computeGroupBounds(elementId);
            if (groupBounds) {
              b = groupBounds;
            } else {
              const provider = new ElementProvider(elementId);
              b = this.geometryService.getElementBoundsWorld(provider);
            }
          } else {
            const provider = new ElementProvider(elementId);
            b = this.geometryService.getElementBoundsWorld(provider);
          }

          minX = Math.min(minX, b.x);
          minY = Math.min(minY, b.y);
          maxX = Math.max(maxX, b.x + b.width);
          maxY = Math.max(maxY, b.y + b.height);
        });

        if (minX !== Infinity) {
          // 绘制 AABB 多选框（降级方案）
          this.drawAABBGroupSelectionBox({
            x: minX,
            y: minY,
            width: maxX - minX,
            height: maxY - minY,
          });
        }
      }
    }

    // 调度渲染
    this.renderScheduler.scheduleRender(command.priority);
  }

  /**
   * 为 group 元素绘制选中框
   *
   * @param cameraBounds group 的边界框（camera 坐标，已经转换过的）
   * @param elementId group 元素ID
   * @param withHandles 是否显示调整手柄
   */
  private drawSelectionBoxForGroup(
    cameraBounds: { x: number; y: number; width: number; height: number },
    elementId: string,
    withHandles: boolean = true,
  ): void {
    const state = useCanvasStore.getState();
    const element = state.elements[elementId];
    const groupBounds = computeGroupBounds(elementId);

    console.log(`[GROUP_DEBUG] [drawSelectionBoxForGroup] 开始绘制组合元素选中框`, {
      elementId,
      elementInfo: element
        ? {
            id: element.id,
            type: element.type,
            x: element.x,
            y: element.y,
            width: element.width,
            height: element.height,
            zIndex: element.zIndex,
            children: isGroupElement(element) ? element.children : [],
          }
        : null,
      worldBounds: groupBounds,
      cameraBounds,
      withHandles,
      selectionBoxInfo: {
        topLeft: { x: cameraBounds.x, y: cameraBounds.y },
        bottomRight: {
          x: cameraBounds.x + cameraBounds.width,
          y: cameraBounds.y + cameraBounds.height,
        },
        width: cameraBounds.width,
        height: cameraBounds.height,
      },
    });

    const selectionLayer = this.layerManager.getSelectionLayer();
    console.log(`[drawSelectionBoxForGroup] selectionLayer:`, selectionLayer);

    // 绘制虚线边框（使用转换后的坐标）
    const dashedBox = new PIXI.Graphics();
    const zoom = this.currentViewport?.zoom ?? 1;
    dashedBox.lineStyle(3 / zoom, 0x007bff, 1);
    const dash = 8;
    const gap = 6;
    const drawDashed = (x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) return;
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
    // 绘制虚线边框（使用 cameraBounds，已经是 camera 坐标）
    const x1 = cameraBounds.x;
    const y1 = cameraBounds.y;
    const x2 = cameraBounds.x + cameraBounds.width;
    const y2 = cameraBounds.y + cameraBounds.height;

    console.log(`[drawSelectionBoxForGroup] 绘制虚线边框`, {
      x1,
      y1,
      x2,
      y2,
      width: cameraBounds.width,
      height: cameraBounds.height,
    });

    drawDashed(x1, y1, x2, y1);
    drawDashed(x2, y1, x2, y2);
    drawDashed(x2, y2, x1, y2);
    drawDashed(x1, y2, x1, y1);
    dashedBox.stroke();
    dashedBox.interactive = false;
    dashedBox.interactiveChildren = false;
    selectionLayer.addChild(dashedBox);
    console.log(
      `[drawSelectionBoxForGroup] 添加虚线边框到 selectionLayer，children count:`,
      selectionLayer.children.length,
      `dashedBox bounds:`,
      dashedBox.getBounds(),
    );

    // 绘制高亮填充（使用转换后的坐标）
    const highlightBox = new PIXI.Graphics();
    highlightBox.beginFill(0x3b82f6, 0.06);
    highlightBox.drawRect(cameraBounds.x, cameraBounds.y, cameraBounds.width, cameraBounds.height);
    highlightBox.endFill();
    highlightBox.interactive = false;
    highlightBox.interactiveChildren = false;
    selectionLayer.addChild(highlightBox);
    console.log(
      `[drawSelectionBoxForGroup] 添加高亮填充到 selectionLayer，children count:`,
      selectionLayer.children.length,
      `highlightBox bounds:`,
      highlightBox.getBounds(),
      `selectionLayer position:`,
      selectionLayer.position,
      `selectionLayer visible:`,
      selectionLayer.visible,
    );

    // 如果需要显示调整手柄
    if (withHandles) {
      const handleSize = 8;
      const handleColor = 0xffffff;
      const handleBorderColor = 0x007bff;

      const handlePositions = [
        { x: cameraBounds.x, y: cameraBounds.y },
        { x: cameraBounds.x + cameraBounds.width / 2, y: cameraBounds.y },
        { x: cameraBounds.x + cameraBounds.width, y: cameraBounds.y },
        { x: cameraBounds.x + cameraBounds.width, y: cameraBounds.y + cameraBounds.height / 2 },
        { x: cameraBounds.x + cameraBounds.width, y: cameraBounds.y + cameraBounds.height },
        { x: cameraBounds.x + cameraBounds.width / 2, y: cameraBounds.y + cameraBounds.height },
        { x: cameraBounds.x, y: cameraBounds.y + cameraBounds.height },
        { x: cameraBounds.x, y: cameraBounds.y + cameraBounds.height / 2 },
      ];

      const handleCursors = [
        'nwse-resize', // top-left
        'ns-resize', // top
        'nesw-resize', // top-right
        'ew-resize', // right
        'nwse-resize', // bottom-right
        'ns-resize', // bottom
        'nesw-resize', // bottom-left
        'ew-resize', // left
      ];

      handlePositions.forEach((pos, index) => {
        const handle = new PIXI.Graphics();
        handle.beginFill(handleColor);
        handle.lineStyle(1, handleBorderColor, 1);
        handle.circle(0, 0, handleSize / 2);
        handle.endFill();
        handle.position.set(pos.x, pos.y);
        handle.interactive = true;
        handle.scale.set(1 / zoom);
        handle.hitArea = new PIXI.Circle(0, 0, handleSize / 2 + 2);
        handle.cursor = handleCursors[index];
        // handle.on('pointerdown', (event: PIXI.FederatedPointerEvent) => {
        //   event.stopPropagation();
        //   const screenX = event.clientX;
        //   const screenY = event.clientY;
        //   const worldPoint = this.coordinateTransformer.screenToWorld(screenX, screenY);
        //   eventBus.emit('resize-start', {
        //     elementId,
        //     handleType: handleTypes[index],
        //     worldPoint,
        //     screenX,
        //     screenY,
        //     nativeEvent: event,
        //   });
        // });
        selectionLayer.addChild(handle);
      });

      // 旋转手柄（group 不支持旋转，但为了保持一致性可以添加）
      // 暂时不添加旋转手柄，因为 MVP 不支持 group 的旋转
    }
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
    const provider = new ElementProvider(elementId);
    const worldBounds = this.geometryService.getElementBoundsWorld(provider);
    const bounds = {
      x: worldBounds.x,
      y: worldBounds.y,
      width: worldBounds.width,
      height: worldBounds.height,
    };

    this.validateSelectionAlignment(elementId, bounds);

    const selectionLayer = this.layerManager.getSelectionLayer();

    const zoom = this.currentViewport?.zoom ?? 1;
    const dashedBox = new PIXI.Graphics();
    dashedBox.lineStyle(3 / zoom, 0x007bff, 1);
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
        handle.scale.set(1 / zoom);
        handle.hitArea = new PIXI.Circle(0, 0, handleSize / 2 + 2);
        handle.cursor = handleCursors[index];
        (
          handle as unknown as { __graphiteHandleType?: string; __graphiteElementId?: string }
        ).__graphiteHandleType = handleTypes[index];
        (
          handle as unknown as { __graphiteHandleType?: string; __graphiteElementId?: string }
        ).__graphiteElementId = elementId;
        selectionLayer.addChild(handle);
      });

      const rotationHandle = new PIXI.Graphics();
      rotationHandle.beginFill(handleColor);
      rotationHandle.lineStyle(1, handleBorderColor, 1);
      rotationHandle.circle(0, 0, 6);
      rotationHandle.endFill();
      rotationHandle.position.set(
        bounds.x + bounds.width / 2,
        bounds.y + bounds.height + 20 / zoom,
      );
      rotationHandle.interactive = true;
      rotationHandle.scale.set(1 / zoom);
      rotationHandle.hitArea = new PIXI.Circle(0, 0, 8);
      rotationHandle.cursor = 'pointer';
      // 使用静态事件模式，确保可以接收事件
      rotationHandle.eventMode = 'static';
      (
        rotationHandle as unknown as { __graphiteHandleType?: string; __graphiteElementId?: string }
      ).__graphiteHandleType = 'rotation';
      (
        rotationHandle as unknown as { __graphiteHandleType?: string; __graphiteElementId?: string }
      ).__graphiteElementId = elementId;

      selectionLayer.addChild(rotationHandle);
    }

    console.log('RenderEngine: 选中层内容统计', {
      elementId,
      selectionChildren: selectionLayer.children.length,
      withHandles,
    });
  }

  private drawRotatedSelectionBox(
    elementGraphics: PIXI.Container,
    elementId: string,
    withHandles: boolean = true,
  ): void {
    const selectionLayer = this.layerManager.getSelectionLayer();
    const zoom = this.currentViewport?.zoom ?? 1;

    const provider = new ElementProvider(elementId);
    const worldCorners = this.geometryService.getElementWorldCorners(provider);
    const cameraCorners = worldCorners.map((p) => new PIXI.Point(p.x, p.y));

    const dashedBox = new PIXI.Graphics();
    dashedBox.lineStyle(3 / zoom, 0x007bff, 1);
    const dash = 8;
    const gap = 6;
    const drawDashed = (x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
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
    for (let i = 0; i < 4; i++) {
      const a = cameraCorners[i];
      const b = cameraCorners[(i + 1) % 4];
      drawDashed(a.x, a.y, b.x, b.y);
    }
    dashedBox.stroke();
    dashedBox.interactive = false;
    dashedBox.interactiveChildren = false;
    selectionLayer.addChild(dashedBox);

    const highlightBox = new PIXI.Graphics();
    highlightBox.beginFill(0x3b82f6, 0.06);
    highlightBox.moveTo(cameraCorners[0].x, cameraCorners[0].y);
    for (let i = 1; i < 4; i++) {
      highlightBox.lineTo(cameraCorners[i].x, cameraCorners[i].y);
    }
    highlightBox.lineTo(cameraCorners[0].x, cameraCorners[0].y);
    highlightBox.endFill();
    highlightBox.interactive = false;
    highlightBox.interactiveChildren = false;
    selectionLayer.addChild(highlightBox);

    if (withHandles) {
      const handleSize = 8;
      const handleColor = 0xffffff;
      const handleBorderColor = 0x007bff;

      const mid = (p1: PIXI.Point, p2: PIXI.Point) =>
        new PIXI.Point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      const handlePositions = [
        cameraCorners[0],
        mid(cameraCorners[0], cameraCorners[1]),
        cameraCorners[1],
        mid(cameraCorners[1], cameraCorners[2]),
        cameraCorners[2],
        mid(cameraCorners[2], cameraCorners[3]),
        cameraCorners[3],
        mid(cameraCorners[3], cameraCorners[0]),
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
        'nwse-resize',
        'ns-resize',
        'nesw-resize',
        'ew-resize',
        'nwse-resize',
        'ns-resize',
        'nesw-resize',
        'ew-resize',
      ];
      handlePositions.forEach((pos, index) => {
        const handle = new PIXI.Graphics();
        handle.beginFill(handleColor);
        handle.lineStyle(1, handleBorderColor, 1);
        handle.circle(0, 0, handleSize / 2);
        handle.endFill();
        handle.position.set(pos.x, pos.y);
        handle.interactive = true;
        handle.scale.set(1 / zoom);
        handle.hitArea = new PIXI.Circle(0, 0, handleSize / 2 + 2);
        handle.cursor = handleCursors[index];
        (
          handle as unknown as { __graphiteHandleType?: string; __graphiteElementId?: string }
        ).__graphiteHandleType = handleTypes[index];
        (
          handle as unknown as { __graphiteHandleType?: string; __graphiteElementId?: string }
        ).__graphiteElementId = elementId;
        selectionLayer.addChild(handle);
      });

      const rotationHandle = new PIXI.Graphics();
      rotationHandle.beginFill(handleColor);
      rotationHandle.lineStyle(1, handleBorderColor, 1);
      rotationHandle.circle(0, 0, 6);
      rotationHandle.endFill();
      const bottomMid = mid(cameraCorners[2], cameraCorners[3]);
      const edgeVec = new PIXI.Point(
        cameraCorners[1].x - cameraCorners[0].x,
        cameraCorners[1].y - cameraCorners[0].y,
      );
      const center = new PIXI.Point(
        (cameraCorners[0].x + cameraCorners[1].x + cameraCorners[2].x + cameraCorners[3].x) / 4,
        (cameraCorners[0].y + cameraCorners[1].y + cameraCorners[2].y + cameraCorners[3].y) / 4,
      );
      const normal = new PIXI.Point(-edgeVec.y, edgeVec.x);
      const toOutside = new PIXI.Point(bottomMid.x - center.x, bottomMid.y - center.y);
      const dot = normal.x * toOutside.x + normal.y * toOutside.y;
      const sign = dot >= 0 ? 1 : -1;
      const nLen = Math.sqrt(normal.x * normal.x + normal.y * normal.y) || 1;
      const nx = (normal.x / nLen) * sign;
      const ny = (normal.y / nLen) * sign;
      rotationHandle.position.set(bottomMid.x + nx * (20 / zoom), bottomMid.y + ny * (20 / zoom));
      rotationHandle.interactive = true;
      rotationHandle.scale.set(1 / zoom);
      rotationHandle.hitArea = new PIXI.Circle(0, 0, 8);
      rotationHandle.cursor = 'pointer';
      rotationHandle.eventMode = 'static';
      (
        rotationHandle as unknown as { __graphiteHandleType?: string; __graphiteElementId?: string }
      ).__graphiteHandleType = 'rotation';
      (
        rotationHandle as unknown as { __graphiteHandleType?: string; __graphiteElementId?: string }
      ).__graphiteElementId = elementId;

      selectionLayer.addChild(rotationHandle);
    }

    console.log('RenderEngine: 选中层内容统计', {
      elementId,
      selectionChildren: selectionLayer.children.length,
      withHandles,
    });
  }

  /**
   * 计算多个元素的最小外接旋转矩形（OBB）
   * 使用旋转卡尺算法（Rotating Calipers）
   *
   * @param elementIds 元素ID数组
   * @returns OBB 信息，包含四个角点和旋转角度
   */
  private computeOBBForElements(elementIds: string[]): {
    corners: Point[];
    rotation: number;
    center: Point;
    width: number;
    height: number;
  } | null {
    if (elementIds.length === 0) return null;

    const state = useCanvasStore.getState();
    const allPoints: Point[] = [];

    // 收集所有元素的世界坐标轮廓点
    elementIds.forEach((elementId) => {
      const element = state.elements[elementId];
      if (!element) return;

      const provider = new ElementProvider(elementId);

      // 如果是组合元素，递归获取所有子元素的点
      if (isGroupElement(element)) {
        element.children.forEach((childId) => {
          const childElement = state.elements[childId];
          if (childElement) {
            const childProvider = new ElementProvider(childId);
            const childPoints = this.geometryService.getElementWorldOutlinePoints(
              childProvider,
              childElement.type,
            );
            allPoints.push(...childPoints);
          }
        });
      } else {
        const points = this.geometryService.getElementWorldOutlinePoints(provider, element.type);
        allPoints.push(...points);
      }
    });

    if (allPoints.length === 0) return null;

    // 使用旋转卡尺算法计算最小外接矩形
    return this.geometryService.computeMinimumBoundingBox(allPoints);
  }

  /**
   * 绘制旋转的多选框（OBB）
   *
   * @param corners OBB 的四个角点（世界坐标）
   * @param elementIds 选中的元素ID数组
   * @param withHandles 是否显示调整手柄
   */
  private drawRotatedGroupSelectionBox(
    corners: Point[],
    elementIds: string[],
    withHandles: boolean = true,
  ): void {
    const selectionLayer = this.layerManager.getSelectionLayer();
    const zoom = this.currentViewport?.zoom ?? 1;
    const cameraCorners = corners.map((p) => new PIXI.Point(p.x, p.y));

    // 绘制虚线边框
    const dashedBox = new PIXI.Graphics();
    dashedBox.lineStyle(3 / zoom, 0x2563eb, 1);
    const dash = 10;
    const gap = 6;
    const drawDashed = (x1: number, y1: number, x2: number, y2: number) => {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
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
    for (let i = 0; i < 4; i++) {
      const a = cameraCorners[i];
      const b = cameraCorners[(i + 1) % 4];
      drawDashed(a.x, a.y, b.x, b.y);
    }
    dashedBox.stroke();
    dashedBox.interactive = false;
    dashedBox.interactiveChildren = false;
    selectionLayer.addChild(dashedBox);

    // 绘制半透明填充
    const highlightBox = new PIXI.Graphics();
    highlightBox.beginFill(0x3b82f6, 0.04);
    highlightBox.moveTo(cameraCorners[0].x, cameraCorners[0].y);
    for (let i = 1; i < 4; i++) {
      highlightBox.lineTo(cameraCorners[i].x, cameraCorners[i].y);
    }
    highlightBox.lineTo(cameraCorners[0].x, cameraCorners[0].y);
    highlightBox.endFill();
    highlightBox.interactive = false;
    highlightBox.interactiveChildren = false;
    selectionLayer.addChild(highlightBox);

    if (withHandles) {
      const handleSize = 8;
      const handleColor = 0xffffff;
      const handleBorderColor = 0x2563eb;

      const mid = (p1: PIXI.Point, p2: PIXI.Point) =>
        new PIXI.Point((p1.x + p2.x) / 2, (p1.y + p2.y) / 2);
      const handlePositions = [
        cameraCorners[0],
        mid(cameraCorners[0], cameraCorners[1]),
        cameraCorners[1],
        mid(cameraCorners[1], cameraCorners[2]),
        cameraCorners[2],
        mid(cameraCorners[2], cameraCorners[3]),
        cameraCorners[3],
        mid(cameraCorners[3], cameraCorners[0]),
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
        'nwse-resize',
        'ns-resize',
        'nesw-resize',
        'ew-resize',
        'nwse-resize',
        'ns-resize',
        'nesw-resize',
        'ew-resize',
      ];

      handlePositions.forEach((pos, index) => {
        const handle = new PIXI.Graphics();
        handle.beginFill(handleColor);
        handle.lineStyle(1, handleBorderColor, 1);
        handle.circle(0, 0, handleSize / 2);
        handle.endFill();
        handle.position.set(pos.x, pos.y);
        handle.interactive = true;
        handle.scale.set(1 / zoom);
        handle.hitArea = new PIXI.Circle(0, 0, handleSize / 2 + 2);
        handle.cursor = handleCursors[index];
        (
          handle as unknown as { __graphiteHandleType?: string; __graphiteGroupHandle?: boolean }
        ).__graphiteHandleType = handleTypes[index];
        (
          handle as unknown as { __graphiteHandleType?: string; __graphiteGroupHandle?: boolean }
        ).__graphiteGroupHandle = true;
        selectionLayer.addChild(handle);
      });

      // 绘制旋转手柄
      const rotationHandle = new PIXI.Graphics();
      rotationHandle.beginFill(handleColor);
      rotationHandle.lineStyle(1, handleBorderColor, 1);
      rotationHandle.circle(0, 0, 6);
      rotationHandle.endFill();
      const bottomMid = mid(cameraCorners[2], cameraCorners[3]);
      const edgeVec = new PIXI.Point(
        cameraCorners[1].x - cameraCorners[0].x,
        cameraCorners[1].y - cameraCorners[0].y,
      );
      const center = new PIXI.Point(
        (cameraCorners[0].x + cameraCorners[1].x + cameraCorners[2].x + cameraCorners[3].x) / 4,
        (cameraCorners[0].y + cameraCorners[1].y + cameraCorners[2].y + cameraCorners[3].y) / 4,
      );
      const normal = new PIXI.Point(-edgeVec.y, edgeVec.x);
      const toOutside = new PIXI.Point(bottomMid.x - center.x, bottomMid.y - center.y);
      const dot = normal.x * toOutside.x + normal.y * toOutside.y;
      const sign = dot >= 0 ? 1 : -1;
      const nLen = Math.sqrt(normal.x * normal.x + normal.y * normal.y) || 1;
      const nx = (normal.x / nLen) * sign;
      const ny = (normal.y / nLen) * sign;
      rotationHandle.position.set(bottomMid.x + nx * (20 / zoom), bottomMid.y + ny * (20 / zoom));
      rotationHandle.interactive = true;
      rotationHandle.scale.set(1 / zoom);
      rotationHandle.hitArea = new PIXI.Circle(0, 0, 8);
      rotationHandle.cursor = 'pointer';
      rotationHandle.eventMode = 'static';
      (
        rotationHandle as unknown as {
          __graphiteHandleType?: string;
          __graphiteGroupHandle?: boolean;
        }
      ).__graphiteHandleType = 'rotation';
      (
        rotationHandle as unknown as {
          __graphiteHandleType?: string;
          __graphiteGroupHandle?: boolean;
        }
      ).__graphiteGroupHandle = true;

      selectionLayer.addChild(rotationHandle);
    }
  }

  /**
   * 绘制 AABB 多选框（降级方案）
   *
   * @param bounds AABB 边界框
   */
  private drawAABBGroupSelectionBox(bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  }): void {
    const selectionLayer = this.layerManager.getSelectionLayer();
    const zoom = this.currentViewport?.zoom ?? 1;
    const { x: minX, y: minY, width, height } = bounds;
    const maxX = minX + width;
    const maxY = minY + height;

    const box = new PIXI.Graphics();
    box.lineStyle(3 / zoom, 0x2563eb, 1);
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
    fill.drawRect(minX, minY, width, height);
    fill.endFill();
    fill.interactive = false;
    fill.interactiveChildren = false;

    selectionLayer.addChild(box);
    selectionLayer.addChild(fill);

    // 绘制调整手柄和旋转手柄（与之前相同）
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
      (
        handle as unknown as { __graphiteHandleType?: string; __graphiteGroupHandle?: boolean }
      ).__graphiteHandleType = handleTypes[index];
      (
        handle as unknown as { __graphiteHandleType?: string; __graphiteGroupHandle?: boolean }
      ).__graphiteGroupHandle = true;
      handle.scale.set(1 / zoom);
      handle.hitArea = new PIXI.Circle(0, 0, handleSize / 2 + 2);
      selectionLayer.addChild(handle);
    });

    const rotationHandle = new PIXI.Graphics();
    rotationHandle.beginFill(handleColor);
    rotationHandle.lineStyle(1, handleBorderColor, 1);
    rotationHandle.circle(0, 0, 6);
    rotationHandle.endFill();
    rotationHandle.position.set((minX + maxX) / 2, maxY + 20 / zoom);
    rotationHandle.interactive = true;
    rotationHandle.scale.set(1 / zoom);
    rotationHandle.hitArea = new PIXI.Circle(0, 0, 8);
    rotationHandle.cursor = 'pointer';
    (
      rotationHandle as unknown as {
        __graphiteHandleType?: string;
        __graphiteGroupHandle?: boolean;
      }
    ).__graphiteHandleType = 'rotation';
    (
      rotationHandle as unknown as {
        __graphiteHandleType?: string;
        __graphiteGroupHandle?: boolean;
      }
    ).__graphiteGroupHandle = true;

    selectionLayer.addChild(rotationHandle);
  }

  /**
   * 验证选中框与元素在世界坐标的对齐情况
   */
  private validateSelectionAlignment(
    elementId: string,
    bounds: { x: number; y: number; width: number; height: number },
  ): void {
    const graphics = this.elementGraphics.get(elementId);
    if (!graphics) return;

    const pixiBounds = graphics.getBounds() as unknown as PIXI.Rectangle;
    const tl = this.camera.toLocal(new PIXI.Point(pixiBounds.x, pixiBounds.y));
    const br = this.camera.toLocal(
      new PIXI.Point(pixiBounds.x + pixiBounds.width, pixiBounds.y + pixiBounds.height),
    );
    const worldPixiBounds = { x: tl.x, y: tl.y, width: br.x - tl.x, height: br.y - tl.y };

    const dx = Math.abs(worldPixiBounds.x - bounds.x);
    const dy = Math.abs(worldPixiBounds.y - bounds.y);
    const dw = Math.abs(worldPixiBounds.width - bounds.width);
    const dh = Math.abs(worldPixiBounds.height - bounds.height);

    const tolerance = 0.5; // 像素级对齐容差
    const aligned = dx <= tolerance && dy <= tolerance && dw <= tolerance && dh <= tolerance;

    if (!aligned) {
      console.warn('RenderEngine: 选框与渲染不对齐', {
        elementId,
        bounds,
        worldPixiBounds,
        delta: { dx, dy, dw, dh },
      });
    } else {
      console.log('RenderEngine: 选框与渲染对齐', {
        elementId,
        bounds,
        worldPixiBounds,
      });
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

  /**
   * 设置元素的可见性（用于编辑模式时隐藏PIXI文本）
   */
  setElementVisibility(elementId: string, visible: boolean): void {
    const graphics = this.elementGraphics.get(elementId);
    if (graphics) {
      graphics.alpha = visible ? 1 : 0;
      this.renderScheduler.scheduleRender(RenderPriority.HIGH);
    }
  }

  /**
   * 设置当前正在编辑的元素ID
   * 编辑状态下，该元素不会显示选中框
   */
  setEditingElement(elementId: string | null): void {
    this.editingElementId = elementId;

    // 触发重新渲染选中状态
    this.updateSelection({
      type: 'UPDATE_SELECTION',
      selectedElementIds: this.currentSelectedElementIds,
      priority: RenderPriority.HIGH,
    });
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
}
