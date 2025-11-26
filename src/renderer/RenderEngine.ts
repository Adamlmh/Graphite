// renderer/RenderEngine.ts
import * as PIXI from 'pixi.js';
import type { ElementType } from '../types';
import {
  type AllRenderCommand,
  type CreateElementCommand,
  type DeleteElementCommand,
  type UpdateElementCommand,
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
      backgroundColor: 0xd8d9db,
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
}
