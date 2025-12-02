// interactions/TransformInteraction.ts
import { eventBus } from '../../lib/eventBus';
import { useCanvasStore } from '../../stores/canvas-store';
import type { CanvasState } from '../../stores/canvas-store';
import type { Point, Element } from '../../types/index';
import { HandleType, type TransformState, type TransformResult } from './interactionTypes.ts';

// 定义事件数据类型
interface HandlePointerDownData {
  elementId: string;
  handleType: HandleType;
  point: Point;
}

interface HandlePointerMoveData {
  point: Point;
}

export class TransformInteraction {
  private state: TransformState = {
    isActive: false,
    elementId: null,
    handleType: null,
    startPoint: null,
    currentPoint: null,
    startElement: null,
    startRotation: 0,
    startScaleX: 1,
    startScaleY: 1,
    startWidth: 0,
    startHeight: 0,
    startX: 0,
    startY: 0,
  };

  private canvasStore: typeof useCanvasStore;
  private isEnabled = true;

  constructor() {
    this.canvasStore = useCanvasStore;
    console.log('TransformInteraction: 构造函数被调用');
    this.setupEventListeners();
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    console.log('TransformInteraction: 开始设置事件监听器');

    // 关键修改：去掉类型断言，直接使用正确的函数签名
    eventBus.on('handle:pointerdown', (data: unknown) => {
      const handleData = data as HandlePointerDownData;
      console.log('TransformInteraction: 接收到 handle:pointerdown 事件', handleData);
      this.handlePointerDown(handleData);
    });

    eventBus.on('handle:pointermove', (data: unknown) => {
      const moveData = data as HandlePointerMoveData;
      console.log('TransformInteraction: 接收到 handle:pointermove 事件', moveData);
      this.handlePointerMove(moveData);
    });

    eventBus.on('handle:pointerup', this.handlePointerUp as (payload: unknown) => void);

    console.log('TransformInteraction: 事件监听器设置完成');
  }

  /**
   * 处理控制点按下事件
   */
  private handlePointerDown = (data: {
    elementId: string;
    handleType: HandleType;
    point: Point;
  }): void => {
    console.log('TransformInteraction.handlePointerDown: 开始处理', data);

    if (!this.isEnabled) {
      console.log('TransformInteraction: 被禁用，不处理事件');
      return;
    }

    const element = this.canvasStore.getState().elements[data.elementId];
    if (!element) {
      console.warn('TransformInteraction: 元素不存在', data.elementId);
      return;
    }

    this.state.isActive = true;
    this.state.elementId = data.elementId;
    this.state.handleType = data.handleType;
    this.state.startPoint = data.point;
    this.state.currentPoint = data.point;
    this.state.startElement = { ...element };
    this.state.startRotation = element.rotation;
    this.state.startScaleX = element.transform.scaleX;
    this.state.startScaleY = element.transform.scaleY;
    this.state.startWidth = element.width;
    this.state.startHeight = element.height;
    this.state.startX = element.x;
    this.state.startY = element.y;

    console.log('TransformInteraction: 开始变换', {
      elementId: data.elementId,
      handleType: data.handleType,
      elementType: element.type,
    });

    // 发出变换开始事件
    eventBus.emit('transform:start', {
      elementId: data.elementId,
      handleType: data.handleType,
    });
  };

  /**
   * 处理控制点移动事件
   */
  private handlePointerMove = (data: { point: Point }): void => {
    if (!this.state.isActive || !this.state.startPoint || !this.state.startElement) {
      return;
    }

    this.state.currentPoint = data.point;

    // 根据控制点类型执行不同的变换
    const transformResult = this.calculateTransform(data.point);

    if (transformResult) {
      // 更新元素状态
      this.updateElement(transformResult);

      // 发出变换更新事件
      eventBus.emit('transform:update', {
        elementId: this.state.elementId!,
        handleType: this.state.handleType!,
        ...transformResult,
      });
    }
  };

  /**
   * 处理控制点释放事件
   */
  private handlePointerUp = (): void => {
    if (!this.state.isActive) return;

    console.log('TransformInteraction: 结束变换', {
      elementId: this.state.elementId,
      handleType: this.state.handleType,
    });

    // 发出变换结束事件
    eventBus.emit('transform:end', {
      elementId: this.state.elementId!,
      handleType: this.state.handleType!,
    });

    this.resetState();
  };

  /**
   * 计算变换结果
   */
  private calculateTransform(currentPoint: Point): TransformResult | null {
    if (!this.state.startPoint || !this.state.startElement) {
      return null;
    }

    const dx = currentPoint.x - this.state.startPoint.x;
    const dy = currentPoint.y - this.state.startPoint.y;

    switch (this.state.handleType) {
      case HandleType.ROTATION:
        return this.calculateRotation(dx, dy);

      case HandleType.TOP_LEFT:
        return this.calculateScale(dx, dy, -1, -1);

      case HandleType.TOP:
        return this.calculateScale(dx, dy, 0, -1);

      case HandleType.TOP_RIGHT:
        return this.calculateScale(dx, dy, 1, -1);

      case HandleType.RIGHT:
        return this.calculateScale(dx, dy, 1, 0);

      case HandleType.BOTTOM_RIGHT:
        return this.calculateScale(dx, dy, 1, 1);

      case HandleType.BOTTOM:
        return this.calculateScale(dx, dy, 0, 1);

      case HandleType.BOTTOM_LEFT:
        return this.calculateScale(dx, dy, -1, 1);

      case HandleType.LEFT:
        return this.calculateScale(dx, dy, -1, 0);

      default:
        return null;
    }
  }

  /**
   * 计算旋转
   */
  private calculateRotation(dx: number, dy: number): TransformResult {
    const element = this.state.startElement!;
    const centerX = element.x + element.width / 2;
    const centerY = element.y + element.height / 2;

    // 计算当前点相对于元素中心的角度
    const currentAngle =
      (Math.atan2(this.state.currentPoint!.y - centerY, this.state.currentPoint!.x - centerX) *
        180) /
      Math.PI;

    // 计算起始点相对于元素中心的角度
    const startAngle =
      (Math.atan2(this.state.startPoint!.y - centerY, this.state.startPoint!.x - centerX) * 180) /
      Math.PI;

    // 计算旋转角度差
    const rotationDelta = currentAngle - startAngle;

    return {
      x: element.x,
      y: element.y,
      width: element.width,
      height: element.height,
      rotation: this.state.startRotation + rotationDelta,
      scaleX: element.transform.scaleX,
      scaleY: element.transform.scaleY,
    };
  }

  /**
   * 计算缩放
   */
  private calculateScale(
    dx: number,
    dy: number,
    scaleXDirection: number,
    scaleYDirection: number,
  ): TransformResult {
    const element = this.state.startElement!;

    // 安全检查：确保起始宽度和高度有效
    if (this.state.startWidth <= 0 || this.state.startHeight <= 0) {
      console.error('TransformInteraction: 起始尺寸无效', {
        startWidth: this.state.startWidth,
        startHeight: this.state.startHeight,
      });
      return {
        x: element.x,
        y: element.y,
        width: Math.max(1, this.state.startWidth),
        height: Math.max(1, this.state.startHeight),
        rotation: element.rotation,
        scaleX: 1,
        scaleY: 1,
      };
    }

    // 考虑元素的旋转角度
    const rotationRad = (this.state.startRotation * Math.PI) / 180;
    const cos = Math.cos(-rotationRad);
    const sin = Math.sin(-rotationRad);

    // 将鼠标移动向量转换到元素的局部坐标系
    const localDx = dx * cos - dy * sin;
    const localDy = dx * sin + dy * cos;

    // 计算新的宽度和高度
    let newWidth = this.state.startWidth;
    let newHeight = this.state.startHeight;
    let newX = this.state.startX;
    let newY = this.state.startY;

    if (scaleXDirection !== 0) {
      const deltaWidth = localDx * scaleXDirection;
      newWidth = Math.max(1, this.state.startWidth + deltaWidth);

      // 调整X坐标以保持正确的锚点
      if (scaleXDirection === -1) {
        const widthDelta = newWidth - this.state.startWidth;
        newX = this.state.startX - widthDelta;
      }
    }

    if (scaleYDirection !== 0) {
      const deltaHeight = localDy * scaleYDirection;
      newHeight = Math.max(1, this.state.startHeight + deltaHeight);

      // 调整Y坐标以保持正确的锚点
      if (scaleYDirection === -1) {
        const heightDelta = newHeight - this.state.startHeight;
        newY = this.state.startY - heightDelta;
      }
    }

    // 防止除以零
    const scaleX = this.state.startWidth > 0 ? newWidth / this.state.startWidth : 1;
    const scaleY = this.state.startHeight > 0 ? newHeight / this.state.startHeight : 1;

    return {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
      rotation: element.rotation,
      scaleX: scaleX,
      scaleY: scaleY,
    };
  }
  /**
   * 更新元素
   */
  private updateElement(transform: TransformResult): void {
    if (!this.state.elementId) return;

    this.canvasStore.getState().updateElement(this.state.elementId, {
      x: transform.x,
      y: transform.y,
      width: transform.width,
      height: transform.height,
      rotation: transform.rotation,
      transform: {
        scaleX: transform.scaleX,
        scaleY: transform.scaleY,
        pivotX: 0.5,
        pivotY: 0.5,
      },
    });
  }

  /**
   * 重置状态
   */
  private resetState(): void {
    this.state.isActive = false;
    this.state.elementId = null;
    this.state.handleType = null;
    this.state.startPoint = null;
    this.state.currentPoint = null;
    this.state.startElement = null;
    this.state.startRotation = 0;
    this.state.startScaleX = 1;
    this.state.startScaleY = 1;
    this.state.startWidth = 0;
    this.state.startHeight = 0;
    this.state.startX = 0;
    this.state.startY = 0;
  }

  /**
   * 启用变换交互
   */
  enable(): void {
    this.isEnabled = true;
  }

  /**
   * 禁用变换交互
   */
  disable(): void {
    this.isEnabled = false;
  }

  /**
   * 获取当前状态
   */
  getState(): Readonly<TransformState> {
    return { ...this.state };
  }

  /**
   * 检查是否正在变换
   */
  isTransforming(): boolean {
    return this.state.isActive;
  }

  /**
   * 清理资源
   */
  dispose(): void {
    eventBus.off('handle:pointerdown', this.handlePointerDown as (payload: unknown) => void);
    eventBus.off('handle:pointermove', this.handlePointerMove as (payload: unknown) => void);
    eventBus.off('handle:pointerup', this.handlePointerUp as (payload: unknown) => void);
  }
}
