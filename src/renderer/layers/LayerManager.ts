// renderer/layers/LayerManager.ts
import * as PIXI from 'pixi.js';
import { type Element } from '../../types/index';
/**
 * 图层管理器 - 负责管理画布的分层渲染
 * 职责：将不同用途的图形元素分配到不同的渲染层，控制渲染顺序
 */
export class LayerManager {
  private layers: Map<LayerType, PIXI.Container> = new Map();
  private stage: PIXI.Container;

  constructor(stage: PIXI.Container) {
    this.stage = stage;
    this.initializeLayers();
  }

  /**
   * 初始化所有渲染图层
   * 图层顺序（从下到上）：
   * 1. BACKGROUND - 背景层
   * 2. ELEMENTS - 元素层（主要的图形元素）
   * 3. SELECTION - 选择层（选中状态）
   * 4. OVERLAY - 覆盖层（临时元素）
   */
  private initializeLayers(): void {
    const layerTypes: LayerType[] = ['BACKGROUND', 'ELEMENTS', 'SELECTION', 'OVERLAY'];

    layerTypes.forEach((layerType) => {
      const container = new PIXI.Container();
      container.name = layerType;

      // 设置图层属性
      this.configureLayer(container, layerType);

      this.layers.set(layerType, container);
      this.stage.addChild(container);
    });

    // 设置正确的zIndex顺序
    this.updateLayerOrder();
  }

  /**
   * 配置图层特定属性
   */
  private configureLayer(container: PIXI.Container, layerType: LayerType): void {
    switch (layerType) {
      case 'BACKGROUND':
        container.interactive = false;
        container.interactiveChildren = false;
        break;
      case 'ELEMENTS':
        container.interactive = true;
        container.interactiveChildren = true;
        break;
      case 'SELECTION':
        container.interactive = false;
        container.interactiveChildren = true; // 允许选择层中的手柄（旋转柄、调整大小手柄）接收交互事件
        break;
      case 'OVERLAY':
        container.interactive = false;
        container.interactiveChildren = false;
        break;
    }
  }

  /**
   * 更新图层渲染顺序
   */
  private updateLayerOrder(): void {
    const order: LayerType[] = ['BACKGROUND', 'ELEMENTS', 'SELECTION', 'OVERLAY'];

    order.forEach((layerType, index) => {
      const layer = this.layers.get(layerType);
      if (layer) {
        this.stage.setChildIndex(layer, index);
      }
    });
  }

  /**
   * 根据元素类型获取对应的渲染图层
   */
  getLayerForElement(element: Element): PIXI.Container {
    console.log('LayerManager: 获取元素图层', element);
    // 第一阶段所有元素都在ELEMENTS层
    return this.layers.get('ELEMENTS')!;
  }

  /**
   * 获取选择层 - 用于显示选中状态
   */
  getSelectionLayer(): PIXI.Container {
    return this.layers.get('SELECTION')!;
  }

  /**
   * 获取覆盖层 - 用于临时元素和绘制预览
   */
  getOverlayLayer(): PIXI.Container {
    return this.layers.get('OVERLAY')!;
  }

  /**
   * 设置图层可见性
   */
  setLayerVisibility(layerType: LayerType, visible: boolean): void {
    const layer = this.layers.get(layerType);
    if (layer) {
      layer.visible = visible;
    }
  }

  /**
   * 清除图层内容
   */
  clearLayer(layerType: LayerType): void {
    const layer = this.layers.get(layerType);
    if (layer) {
      layer.removeChildren();
    }
  }
}

type LayerType = 'BACKGROUND' | 'ELEMENTS' | 'SELECTION' | 'OVERLAY';
