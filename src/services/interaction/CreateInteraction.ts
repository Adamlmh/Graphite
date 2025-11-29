// interactions/CreateInteraction.ts
import type { CanvasEvent } from '../../lib/EventBridge';
import { eventBus } from '../../lib/eventBus';
import type { CanvasState } from '../../stores/canvas-store';
import { useCanvasStore } from '../../stores/canvas-store';
import type {
  BaseElementStyle,
  Element,
  ElementType,
  Point,
  RectElementStyle,
  TextStyle,
  Tool,
} from '../../types/index';
import { ElementFactory } from '../element-factory';
import { type CreationState, CreationEvent } from './interactionTypes';

// 定义创建选项接口
interface CreationOptions {
  style?: Partial<BaseElementStyle | RectElementStyle>;
  content?: string;
  src?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  children?: string[];
  textStyle?: Partial<TextStyle>;
  baseStyle?: Partial<BaseElementStyle>;
}

// 定义创建事件数据接口
interface CreationEventData {
  tool: Tool;
  point?: Point;
  startPoint?: Point;
  currentPoint?: Point;
  endPoint?: Point;
  tempElement?: Element | null;
  element?: Element;
}

export class CreateInteraction {
  private state: CreationState = {
    isActive: false,
    startPoint: null,
    currentPoint: null,
    tempElement: null,
  };

  private canvasStore: typeof useCanvasStore;

  constructor() {
    this.canvasStore = useCanvasStore;
    this.setupEventListeners();
  }

  /**
   * 设置事件监听器 - 使用 eventBus
   */
  private setupEventListeners(): void {
    // 监听 eventBus 上的画布事件
    eventBus.on('pointerdown', this.handlePointerDown as (payload: unknown) => void);
    eventBus.on('pointermove', this.handlePointerMove as (payload: unknown) => void);
    eventBus.on('pointerup', this.handlePointerUp as (payload: unknown) => void);
    eventBus.on('pointerupoutside', this.handlePointerUp as (payload: unknown) => void);
  }

  /**
   * 指针按下事件处理
   */
  private handlePointerDown = (event: CanvasEvent): void => {
    const activeTool = this.canvasStore.getState().tool.activeTool;

    // 检查是否为创建工具
    if (!this.isCreationTool(activeTool)) {
      return;
    }

    const point = this.getWorldPoint(event);
    this.startCreation(point);
  };

  /**
   * 指针移动事件处理
   */
  private handlePointerMove = (event: CanvasEvent): void => {
    if (!this.state.isActive) {
      return;
    }

    const point = this.getWorldPoint(event);
    this.updateCreation(point);
  };

  /**
   * 指针释放事件处理
   */
  private handlePointerUp = (event: CanvasEvent): void => {
    if (!this.state.isActive) {
      return;
    }

    const point = this.getWorldPoint(event);
    this.finishCreation(point);
  };

  /**
   * 开始创建元素
   */
  private startCreation(point: Point): void {
    const activeTool = this.getCurrentTool();

    this.state.isActive = true;
    this.state.startPoint = point;
    this.state.currentPoint = point;

    // 更新 store 的绘制状态
    this.canvasStore.getState().setDrawingState(true, point, point);

    if (activeTool === 'text') {
      // 文本工具直接创建
      this.createTextElement(point);
    } else {
      // 其他工具创建临时元素用于预览
      this.createTempElement(point);
    }

    console.log('CreateInteraction: 开始创建元素', activeTool, point);

    // 发出创建开始事件
    this.emitCreationEvent(CreationEvent.CREATION_START, {
      tool: activeTool,
      point: point,
      tempElement: this.state.tempElement,
    });
  }

  /**
   * 更新创建过程
   */
  private updateCreation(currentPoint: Point): void {
    if (!this.state.isActive || !this.state.startPoint) {
      return;
    }

    this.state.currentPoint = currentPoint;

    // 更新 store 的绘制状态
    this.canvasStore.getState().setDrawingState(true, this.state.startPoint, currentPoint);

    // 更新临时元素尺寸
    const updatedElement = this.updateTempElementDimensions(currentPoint);
    this.state.tempElement = updatedElement;

    // 发出创建更新事件
    this.emitCreationEvent(CreationEvent.CREATION_UPDATE, {
      tool: this.getCurrentTool(),
      startPoint: this.state.startPoint,
      currentPoint,
      tempElement: updatedElement,
    });
  }

  /**
   * 完成创建
   */
  private finishCreation(endPoint: Point): void {
    if (!this.state.isActive || !this.state.startPoint) {
      return;
    }

    const activeTool = this.getCurrentTool();
    const finalElement = this.createFinalElement(endPoint);

    if (finalElement) {
      // 添加到画布
      this.canvasStore.getState().addElement(finalElement);

      // 发出创建完成事件
      this.emitCreationEvent(CreationEvent.CREATION_END, {
        tool: activeTool,
        startPoint: this.state.startPoint,
        endPoint,
        element: finalElement,
      });
    }

    this.resetState();
  }

  /**
   * 创建临时元素（预览）
   */
  private createTempElement(point: Point): void {
    const activeTool = this.getCurrentTool();
    const elementType = this.toolToElementType(activeTool);

    if (!elementType) {
      return;
    }

    // 使用 ElementFactory 创建临时元素
    const tempElement = ElementFactory.createElement(
      elementType,
      point.x,
      point.y,
      0, // 初始宽度为0
      0, // 初始高度为0
      this.getCreationOptions(elementType, activeTool),
    );

    this.state.tempElement = tempElement;

    // 更新 store 的临时元素
    this.canvasStore.setState((state: CanvasState) => {
      state.tool.tempElement = tempElement;
    });
  }

  /**
   * 更新临时元素尺寸
   */
  private updateTempElementDimensions(point: Point): Element {
    if (!this.state.tempElement || !this.state.startPoint) {
      return this.state.tempElement!;
    }

    const { x: startX, y: startY } = this.state.startPoint;
    const { x: currentX, y: currentY } = point;

    // 计算尺寸，确保最小尺寸
    const minSize = 5;
    const width = Math.max(Math.abs(currentX - startX), minSize);
    const height = Math.max(Math.abs(currentY - startY), minSize);
    const x = Math.min(startX, currentX);
    const y = Math.min(startY, currentY);

    const updatedElement = {
      ...this.state.tempElement,
      x,
      y,
      width,
      height,
    };

    // 更新 store 的临时元素
    this.canvasStore.setState((state: CanvasState) => {
      state.tool.tempElement = updatedElement;
    });

    return updatedElement;
  }

  /**
   * 创建文本元素（特殊处理）
   */
  private createTextElement(point: Point): void {
    const textElement = ElementFactory.createElement(
      'text',
      point.x,
      point.y,
      120, // 默认宽度
      40, // 默认高度
      {
        content: '文本内容',
        textStyle: {
          fontFamily: 'Arial, sans-serif',
          fontSize: 16,
          fontWeight: 'normal',
          fontStyle: 'normal',
          textDecoration: 'none',
          textAlign: 'left',
          lineHeight: 1.2,
          color: '#000000',
        },
        baseStyle: {
          fill: 'transparent',
          stroke: 'none',
          fillOpacity: 1,
          strokeWidth: 0,
          strokeOpacity: 1,
        },
      },
    );

    // 添加到画布
    this.canvasStore.getState().addElement(textElement);

    // 发出创建完成事件
    this.emitCreationEvent(CreationEvent.CREATION_END, {
      tool: 'text',
      startPoint: point,
      endPoint: point,
      element: textElement,
    });

    this.resetState();
  }

  /**
   * 创建最终元素
   */
  private createFinalElement(point: Point): Element | null {
    if (!this.state.tempElement || !this.state.startPoint) {
      return null;
    }

    // 检查最小尺寸
    const minSize = 5;
    const width = Math.abs(point.x - this.state.startPoint.x);
    const height = Math.abs(point.y - this.state.startPoint.y);

    if (width < minSize || height < minSize) {
      return null;
    }

    // 创建正式元素（使用新的ID）
    const finalElement = {
      ...this.state.tempElement,
    };

    return finalElement;
  }

  /**
   * 获取世界坐标点
   */
  private getWorldPoint(event: CanvasEvent): Point {
    // 直接使用事件桥接层提供的世界坐标
    return {
      x: event.world.x,
      y: event.world.y,
    };
  }

  /**
   * 工具类型转换为元素类型
   */
  private toolToElementType(tool: Tool): ElementType | null {
    const toolMap: Record<Tool, ElementType | null> = {
      select: null,
      hand: null,
      rect: 'rect',
      'rounded-rect': 'rect', // 圆角矩形也是矩形类型
      circle: 'circle',
      triangle: 'triangle',
      text: 'text',
      image: 'image',
    };

    return toolMap[tool];
  }

  /**
   * 获取创建选项
   */
  private getCreationOptions(elementType: ElementType, tool?: Tool): CreationOptions {
    // 定义样式配置接口
    interface StyleConfig {
      fill: string;
      stroke: string;
      strokeWidth: number;
      fillOpacity: number;
      strokeOpacity: number;
      borderRadius?: number;
    }

    // 使用类型安全的默认样式配置
    const defaultStyles: Record<ElementType, StyleConfig> = {
      rect: {
        fill: '#3498db',
        stroke: '#2980b9',
        strokeWidth: 2,
        fillOpacity: 1,
        strokeOpacity: 1,
        borderRadius: 0,
      },
      circle: {
        fill: '#e74c3c',
        stroke: '#c0392b',
        strokeWidth: 2,
        fillOpacity: 1,
        strokeOpacity: 1,
      },
      triangle: {
        fill: '#9b59b6',
        stroke: '#8e44ad',
        strokeWidth: 2,
        fillOpacity: 1,
        strokeOpacity: 1,
      },
      text: {
        fill: 'transparent',
        stroke: 'none',
        strokeWidth: 0,
        fillOpacity: 1,
        strokeOpacity: 1,
      },
      image: {
        fill: '#ffffff',
        stroke: '#bdc3c7',
        strokeWidth: 1,
        fillOpacity: 1,
        strokeOpacity: 1,
      },
      group: {
        fill: 'transparent',
        stroke: '#95a5a6',
        strokeWidth: 1,
        fillOpacity: 1,
        strokeOpacity: 0.5,
      },
    };

    // 获取基础样式
    const baseStyle = { ...defaultStyles[elementType] };

    // 特殊处理：如果是圆角矩形工具，添加圆角
    if (tool === 'rounded-rect' && elementType === 'rect') {
      baseStyle.borderRadius = 8; // 默认圆角半径
    }

    return {
      style: baseStyle,
    };
  }

  /**
   * 检查是否为创建工具
   */
  private isCreationTool(tool: Tool): boolean {
    const creationTools: Tool[] = ['rect', 'rounded-rect', 'circle', 'triangle', 'text', 'image'];
    return creationTools.includes(tool);
  }

  /**
   * 获取当前工具
   */
  private getCurrentTool(): Tool {
    return this.canvasStore.getState().tool.activeTool;
  }

  /**
   * 重置状态
   */
  private resetState(): void {
    this.state.isActive = false;
    this.state.startPoint = null;
    this.state.currentPoint = null;
    this.state.tempElement = null;

    // 重置 store 的绘制状态
    this.canvasStore.getState().setDrawingState(false);
    this.canvasStore.setState((state: CanvasState) => {
      state.tool.tempElement = undefined;
    });
  }

  /**
   * 取消创建
   */
  cancelCreation(): void {
    if (this.state.isActive) {
      this.emitCreationEvent(CreationEvent.CREATION_CANCEL, {
        tool: this.getCurrentTool(),
        tempElement: this.state.tempElement,
      });

      this.resetState();
    }
  }

  /**
   * 发出创建事件
   */
  private emitCreationEvent(event: CreationEvent, data: CreationEventData): void {
    // 使用事件总线发出创建事件
    eventBus.emit(event, data);
  }

  /**
   * 获取当前状态
   */
  getState(): Readonly<CreationState> {
    return { ...this.state };
  }

  /**
   * 检查是否正在创建
   */
  isCreating(): boolean {
    return this.state.isActive;
  }

  /**
   * 清理资源
   */
  dispose(): void {
    // 清理事件监听
    eventBus.off('pointerdown', this.handlePointerDown as (payload: unknown) => void);
    eventBus.off('pointermove', this.handlePointerMove as (payload: unknown) => void);
    eventBus.off('pointerup', this.handlePointerUp as (payload: unknown) => void);
    eventBus.off('pointerupoutside', this.handlePointerUp as (payload: unknown) => void);
  }
}
