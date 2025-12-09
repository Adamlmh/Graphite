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
import { CreateCommand } from '../command/HistoryCommand';
import type { HistoryService } from '../HistoryService';
import { calculateTextElementSize } from '../../utils/textMeasurement';

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

// 定义默认元素尺寸
const DEFAULT_ELEMENT_SIZES: Record<ElementType, { width: number; height: number }> = {
  rect: { width: 100, height: 80 },
  circle: { width: 100, height: 100 },
  triangle: { width: 100, height: 86 }, // 等边三角形高度
  text: { width: 120, height: 40 },
  image: { width: 150, height: 100 },
  group: { width: 200, height: 150 },
};

export class CreateInteraction {
  private state: CreationState = {
    isActive: false,
    startPoint: null,
    currentPoint: null,
    tempElement: null,
  };

  private canvasStore: typeof useCanvasStore;
  private hasMoved: boolean = false; // 标记是否发生了移动
  private moveThreshold: number = 3; // 移动阈值，小于这个值认为是点击
  private isTextTool: boolean = false; // 标记是否为文本工具
  private historyService: HistoryService | null = null;

  constructor(historyService?: HistoryService) {
    this.canvasStore = useCanvasStore;
    if (historyService) {
      this.historyService = historyService;
    }
    this.setupEventListeners();
  }

  /**
   * 设置历史服务
   */
  setHistoryService(historyService: HistoryService): void {
    this.historyService = historyService;
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

    // 检查是否超过了移动阈值
    if (this.state.startPoint && !this.hasMoved) {
      const distance = this.calculateDistance(this.state.startPoint, point);
      if (distance > this.moveThreshold) {
        this.hasMoved = true;
        // 第一次移动时创建临时元素
        this.createTempElementOnFirstMove();
      }
    }

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
    this.isTextTool = activeTool === 'text';

    // 在开始创建前清空选中状态
    this.clearSelection();

    this.state.isActive = true;
    this.state.startPoint = point;
    this.state.currentPoint = point;
    this.hasMoved = false; // 重置移动状态

    // 更新 store 的绘制状态
    this.canvasStore.getState().setDrawingState(true, point, point);

    if (this.isTextTool) {
      // 文本工具直接创建
      this.createTextElement(point);
    } else {
      // 非文本工具：不立即创建临时元素，等待第一次移动
      // 这样可以避免默认尺寸元素的闪烁
      console.log('CreateInteraction: 开始创建元素（等待移动）', activeTool, point);
    }

    // 发出创建开始事件
    this.emitCreationEvent(CreationEvent.CREATION_START, {
      tool: activeTool,
      point: point,
      tempElement: null, // 初始时不设置临时元素
    });
  }

  /**
   * 第一次移动时创建临时元素
   */
  private createTempElementOnFirstMove(): void {
    if (this.state.tempElement || !this.state.startPoint) {
      return;
    }

    const activeTool = this.getCurrentTool();
    const elementType = this.toolToElementType(activeTool);

    if (!elementType) {
      return;
    }

    // 创建初始尺寸为0的临时元素，避免默认尺寸的闪烁
    const tempElement = ElementFactory.createElement(
      elementType,
      this.state.startPoint.x,
      this.state.startPoint.y,
      0, // 初始宽度为0
      0, // 初始高度为0
      this.getCreationOptions(elementType, activeTool),
    );

    this.state.tempElement = tempElement;

    // 更新 store 的临时元素
    this.canvasStore.setState((state: CanvasState) => {
      state.tool.tempElement = tempElement;
    });

    console.log('CreateInteraction: 创建临时元素（初始尺寸为0）', elementType);
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

    // 只有发生了移动且存在临时元素时才更新尺寸
    if (this.hasMoved && this.state.tempElement) {
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
  }

  /**
   * 完成创建
   */
  private async finishCreation(endPoint: Point): Promise<void> {
    if (!this.state.isActive || !this.state.startPoint) {
      return;
    }

    const activeTool = this.getCurrentTool();

    // 对于非文本工具，检查是否需要创建元素
    if (!this.isTextTool) {
      const finalElement = this.createFinalElement(endPoint);

      if (finalElement) {
        // 如果有历史服务，使用命令模式
        if (this.historyService) {
          await this.createElementWithHistory(finalElement);
        } else {
          // 否则直接添加到画布
          this.canvasStore.getState().addElement(finalElement);
        }

        // 选中新创建的元素
        this.selectCreatedElement(finalElement);

        setTimeout(() => {
          this.switchToSelectTool();
        }, 0);

        // 发出创建完成事件
        this.emitCreationEvent(CreationEvent.CREATION_END, {
          tool: activeTool,
          startPoint: this.state.startPoint,
          endPoint,
          element: finalElement,
        });
      } else {
        // 如果最终元素无效，发出取消事件
        this.emitCreationEvent(CreationEvent.CREATION_CANCEL, {
          tool: activeTool,
          startPoint: this.state.startPoint,
          endPoint,
          tempElement: this.state.tempElement,
        });
      }
    }

    this.resetState();
  }

  /**
   * 使用历史服务创建元素
   */
  private async createElementWithHistory(element: Element): Promise<void> {
    if (!this.historyService) {
      return;
    }

    try {
      // 创建命令
      const command = new CreateCommand(element, {
        // getState: () => this.canvasStore.getState(),
        addElement: (element: Element) => this.canvasStore.getState().addElement(element),
        deleteElement: (id: string) => this.canvasStore.getState().deleteElement(id),
      });

      // 通过历史服务执行命令
      await this.historyService.executeCommand(command);

      console.log('元素创建已记录到历史记录');
    } catch (error) {
      console.error('通过历史服务创建元素失败:', error);
      // 降级处理：直接添加到画布
      this.canvasStore.getState().addElement(element);
    }
  }

  /**
   * 清空选中状态
   */
  private clearSelection(): void {
    this.canvasStore.getState().clearSelection();
    console.log('CreateInteraction: 清空选中状态');
  }

  /**
   * 选中新创建的元素
   */
  private selectCreatedElement(element: Element): void {
    this.canvasStore.getState().setSelectedElements([element.id]);
    console.log('CreateInteraction: 选中新创建的元素', element.id);
  }

  /**
   * 切换到选择工具
   */
  private switchToSelectTool(): void {
    // 将工具状态切换为 select
    this.canvasStore.getState().setTool('select');
    console.log('CreateInteraction: 切换到选择工具');
  }

  /**
   * 更新临时元素尺寸（根据移动距离）
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
    const defaultContent = '请双击输入文本';
    const defaultTextStyle = {
      fontFamily: 'Arial, sans-serif',
      fontSize: 16,
      fontWeight: 'normal' as const,
      fontStyle: 'normal' as const,
      textDecoration: 'none' as const,
      textAlign: 'left' as const,
      lineHeight: 1.2,
      color: '#000000',
    };

    // 🎯 计算文本的理想尺寸
    const textSize = calculateTextElementSize(defaultContent, undefined, defaultTextStyle, 200, {
      minWidth: 100,
      minHeight: 30,
      padding: 8,
    });

    const textElement = ElementFactory.createElement(
      'text',
      point.x,
      point.y,
      textSize.width,
      textSize.height,
      {
        content: defaultContent,
        textStyle: defaultTextStyle,
        baseStyle: {
          fill: 'transparent',
          stroke: 'none',
          fillOpacity: 1,
          strokeWidth: 0,
          strokeOpacity: 1,
        },
      },
    );

    // 如果有历史服务，使用命令模式
    if (this.historyService) {
      this.createElementWithHistory(textElement);
    } else {
      // 否则直接添加到画布
      this.canvasStore.getState().addElement(textElement);
    }

    // 选中新创建的文本元素
    this.selectCreatedElement(textElement);

    // 切换到选择工具
    setTimeout(() => {
      this.switchToSelectTool();
    }, 0);

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
    if (!this.state.startPoint) {
      return null;
    }

    const activeTool = this.getCurrentTool();
    const elementType = this.toolToElementType(activeTool);

    if (!elementType) {
      return null;
    }

    let finalElement: Element;

    if (this.hasMoved && this.state.tempElement) {
      // 如果发生了移动，使用移动距离计算的大小
      const minSize = 5;
      const width = Math.abs(point.x - this.state.startPoint.x);
      const height = Math.abs(point.y - this.state.startPoint.y);

      if (width < minSize || height < minSize) {
        return null;
      }

      const x = Math.min(this.state.startPoint.x, point.x);
      const y = Math.min(this.state.startPoint.y, point.y);

      finalElement = {
        ...this.state.tempElement,
        x,
        y,
        width,
        height,
      };
    } else {
      // 如果没有移动，使用默认大小创建新元素
      const defaultSize = DEFAULT_ELEMENT_SIZES[elementType];
      finalElement = ElementFactory.createElement(
        elementType,
        this.state.startPoint.x,
        this.state.startPoint.y,
        defaultSize.width,
        defaultSize.height,
        this.getCreationOptions(elementType, activeTool),
      );
    }

    return finalElement;
  }

  /**
   * 计算两点之间的距离
   */
  private calculateDistance(point1: Point, point2: Point): number {
    const dx = point2.x - point1.x;
    const dy = point2.y - point1.y;
    return Math.sqrt(dx * dx + dy * dy);
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
      transfor: null,
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
    this.hasMoved = false;
    this.isTextTool = false;

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
