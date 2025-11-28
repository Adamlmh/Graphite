// renderer/RenderEngine.ts
import * as PIXI from 'pixi.js';
import type { Element, ElementType } from '../types';
import {
  type AllRenderCommand,
  type BatchDeleteElementCommand,
  type BatchUpdateElementCommand,
  type CreateElementCommand,
  type DeleteElementCommand,
  type UpdateElementCommand,
  type UpdateSelectionCommand,
} from '../types/render.types';
import { LayerManager } from './layers/LayerManager';
import { ElementRendererRegistry } from './renderers/ElementRendererRegistry';
import { ResourceManager } from './resources/ResourceManager';
import { RenderScheduler } from './scheduling/RenderScheduler';
/**
 * 渲染引擎核心 - 协调所有渲染模块
 * 职责：接收渲染命令，调度各个模块协同工作
 */
export class RenderEngine {
  private pixiApp!: PIXI.Application;
  private layerManager!: LayerManager;
  private rendererRegistry!: ElementRendererRegistry;
  private resourceManager!: ResourceManager;
  private renderScheduler!: RenderScheduler;

  // 元素图形映射表：维护业务元素与PIXI图形对象的关联
  private elementGraphics: Map<string, PIXI.Container> = new Map();

  // 预览元素相关
  private previewGraphics: PIXI.Container | null = null;

  private container: HTMLElement;

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
    this.pixiApp.stage.hitArea = new PIXI.Rectangle(-10000, -10000, 20000, 20000);

    // 初始化其他模块
    this.layerManager = new LayerManager(this.pixiApp.stage);
    this.resourceManager = new ResourceManager();
    this.rendererRegistry = new ElementRendererRegistry(this.resourceManager);
    this.renderScheduler = new RenderScheduler(this.pixiApp);
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
        default:
          console.warn('未知渲染命令:', command);
      }
    } catch (error) {
      console.error('执行渲染命令失败:', error);
    }
  }

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

    // 为每个选中的元素绘制选择框和调整手柄
    selectedElementIds.forEach((elementId) => {
      const graphics = this.elementGraphics.get(elementId);
      if (graphics) {
        this.drawSelectionBox(graphics);
      }
    });

    // 调度渲染
    this.renderScheduler.scheduleRender(command.priority);
  }

  /**
   * 绘制选择框和调整手柄
   */
  private drawSelectionBox(elementGraphics: PIXI.Container): void {
    const bounds = elementGraphics.getBounds();
    const selectionLayer = this.layerManager.getSelectionLayer();

    // 创建选择框图形
    const selectionBox = new PIXI.Graphics();
    selectionBox.lineStyle(2, 0x007bff, 1); // 蓝色边框
    selectionBox.drawRect(bounds.x, bounds.y, bounds.width, bounds.height);
    selectionLayer.addChild(selectionBox);

    // 调整手柄大小
    const handleSize = 8;
    const handleColor = 0xffffff;
    const handleBorderColor = 0x007bff;

    // 8个调整手柄位置：4个角 + 4个边中点
    const handlePositions = [
      { x: bounds.x, y: bounds.y }, // 左上
      { x: bounds.x + bounds.width / 2, y: bounds.y }, // 上中
      { x: bounds.x + bounds.width, y: bounds.y }, // 右上
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 }, // 右中
      { x: bounds.x + bounds.width, y: bounds.y + bounds.height }, // 右下
      { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height }, // 下中
      { x: bounds.x, y: bounds.y + bounds.height }, // 左下
      { x: bounds.x, y: bounds.y + bounds.height / 2 }, // 左中
    ];

    handlePositions.forEach((pos) => {
      const handle = new PIXI.Graphics();
      handle.beginFill(handleColor);
      handle.lineStyle(1, handleBorderColor, 1);
      handle.drawCircle(0, 0, handleSize / 2);
      handle.endFill();
      handle.position.set(pos.x, pos.y);
      selectionLayer.addChild(handle);
    });
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

        // 添加到舞台
        this.pixiApp.stage.addChild(graphics);

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
