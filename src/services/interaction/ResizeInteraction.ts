// interactions/ResizeInteraction.ts
import { eventBus } from '../../lib/eventBus';
import { useCanvasStore } from '../../stores/canvas-store';
import { GeometryService } from '../../lib/Coordinate/GeometryService';
import { ElementProvider } from '../../lib/Coordinate/providers/ElementProvider';
import type { Point, Element } from '../../types/index';
import {
  type ResizeState,
  type ResizeHandleType,
  ResizeEvent,
  type InteractionConfig,
} from './interactionTypes';
import { CoordinateTransformer } from '../../lib/Coordinate/CoordinateTransformer';
import type { CanvasEvent } from '../../lib/EventBridge';
import { HistoryService } from '../HistoryService';
import { ResizeCommand } from '../command/HistoryCommand';

export class ResizeInteraction {
  private state: ResizeState = {
    isActive: false,
    elementIds: [],
    handleType: null,
    startPoint: null,
    currentPoint: null,
    originalElements: new Map(),
    isGroupResize: false,
    startBounds: null,
    startRotation: 0,
    isRotating: false,
  };

  private config: InteractionConfig = {
    minSize: 5,
    preserveAspectRatio: false,
    rotationStep: 15,
    snapToAngle: true,
    snapAngle: 45,
    shiftKeyPreserveAspect: true,
    altKeyFromCenter: true,
  };

  private canvasStore: typeof useCanvasStore;
  private geometryService: GeometryService;
  private isDisposed = false;
  private coordinateTransformer: CoordinateTransformer;
  private historyService: HistoryService | null = null;

  // 键盘状态跟踪
  private keyState = {
    shiftKey: false,
    altKey: false,
    ctrlKey: false,
  };

  constructor(historyService?: HistoryService) {
    this.canvasStore = useCanvasStore;
    this.geometryService = new GeometryService();
    this.coordinateTransformer = new CoordinateTransformer();
    if (historyService) {
      this.historyService = historyService;
    }
    this.setupEventListeners();
  }

  setHistoryService(historyService: HistoryService): void {
    this.historyService = historyService;
  }

  /**
   * 设置事件监听器
   */
  private setupEventListeners(): void {
    // 监听调整开始事件
    eventBus.on('resize-start', this.handleResizeStart);
    eventBus.on('group-resize-start', this.handleGroupResizeStart);
    eventBus.on('rotation-start', this.handleRotationStart);
    eventBus.on('group-rotation-start', this.handleGroupRotationStart);

    // 监听鼠标/触摸移动和抬起事件
    eventBus.on('pointermove', (e: unknown) => this.handlePointerMove(e as CanvasEvent));
    eventBus.on('pointerup', this.handlePointerUp);
    eventBus.on('pointerupoutside', this.handlePointerUp);

    // 键盘事件
    eventBus.on('keyboard:down', (e: unknown) =>
      this.handleKeyDown(e as { nativeEvent?: KeyboardEvent; key?: string }),
    );
    eventBus.on('keyboard:up', (e: unknown) =>
      this.handleKeyUp(e as { nativeEvent?: KeyboardEvent; key?: string }),
    );

    // 取消事件
    eventBus.on('selection:clear', this.cancelResize);
    eventBus.on('tool:changed', this.cancelResize);
  }

  /**
   * 处理调整开始事件（单个元素）
   */
  private handleResizeStart = (data: unknown): void => {
    if (this.state.isActive) return;

    console.log('ResizeInteraction: 收到 resize-start', data);

    const { elementId, handleType, worldPoint } = data as {
      elementId: string;
      handleType: ResizeHandleType;
      worldPoint?: Point;
    };

    if (!worldPoint) {
      console.error('ResizeInteraction: 缺少 worldPoint');
      return;
    }

    // 如果是旋转控制点
    if (handleType === 'rotation') {
      this.startRotation([elementId], worldPoint, false);
    } else {
      this.startResize([elementId], handleType, worldPoint, false);
    }
  };

  /**
   * 处理组合调整开始事件
   */
  private handleGroupResizeStart = (data: unknown): void => {
    if (this.state.isActive) return;

    console.log('ResizeInteraction: 收到 group-resize-start', data);

    const { elementIds, handleType, worldPoint, bounds } = data as {
      elementIds: string[];
      handleType: ResizeHandleType;
      worldPoint?: Point;
      bounds?: { x: number; y: number; width: number; height: number };
    };

    if (!worldPoint) {
      console.error('ResizeInteraction: 缺少 worldPoint');
      return;
    }

    // 保存组合边界
    this.state.startBounds = bounds ?? null;

    // 如果是旋转控制点
    if (handleType === 'rotation') {
      this.startRotation(elementIds, worldPoint, true);
    } else {
      this.startResize(elementIds, handleType, worldPoint, true);
    }
  };

  /**
   * 处理旋转开始事件（单个元素）
   */
  private handleRotationStart = (data: unknown): void => {
    if (this.state.isActive) return;

    console.log('ResizeInteraction: 收到 rotation-start', data);

    const { elementId, worldPoint } = data as {
      elementId: string;
      worldPoint?: Point;
    };

    if (!worldPoint) {
      console.error('ResizeInteraction: 缺少 worldPoint');
      return;
    }

    this.startRotation([elementId], worldPoint, false);
  };

  /**
   * 处理组合旋转开始事件
   */
  private handleGroupRotationStart = (data: unknown): void => {
    if (this.state.isActive) return;

    console.log('ResizeInteraction: 收到 group-rotation-start', data);

    const { elementIds, worldPoint, bounds } = data as {
      elementIds: string[];
      worldPoint?: Point;
      bounds?: { x: number; y: number; width: number; height: number };
    };

    if (!worldPoint) {
      console.error('ResizeInteraction: 缺少 worldPoint');
      return;
    }

    // 保存组合边界
    this.state.startBounds = bounds ?? null;
    this.startRotation(elementIds, worldPoint, true);
  };

  /**
   * 开始调整大小
   */
  private startResize(
    elementIds: string[],
    handleType: ResizeHandleType,
    startWorldPoint: Point,
    isGroupResize: boolean,
  ): void {
    console.log(`ResizeInteraction: 开始调整 ${elementIds.join(',')}`, handleType);

    this.state.isActive = true;
    this.state.elementIds = elementIds;
    this.state.handleType = handleType;
    this.state.startPoint = startWorldPoint;
    this.state.currentPoint = startWorldPoint;
    this.state.isGroupResize = isGroupResize;
    this.state.isRotating = false;

    // 保存原始状态
    this.saveOriginalElements(elementIds);

    // 发出调整开始事件
    eventBus.emit(ResizeEvent.RESIZE_START, {
      elementIds,
      handleType,
      startPoint: startWorldPoint,
    });

    // 隐藏选择框
    eventBus.emit('selection:hide', { elementIds });
  }

  /**
   * 开始旋转
   */
  private startRotation(
    elementIds: string[],
    startWorldPoint: Point,
    isGroupResize: boolean,
  ): void {
    console.log(`ResizeInteraction: 开始旋转 ${elementIds.join(',')}`);

    this.state.isActive = true;
    this.state.elementIds = elementIds;
    this.state.handleType = 'rotation';
    this.state.startPoint = startWorldPoint;
    this.state.currentPoint = startWorldPoint;
    this.state.isGroupResize = isGroupResize;
    this.state.isRotating = true;

    // 保存原始状态
    this.saveOriginalElements(elementIds);

    // 计算起始角度
    if (elementIds.length === 1) {
      const element = this.canvasStore.getState().elements[elementIds[0]];
      this.state.startRotation = element?.rotation || 0;
    } else if (this.state.startBounds) {
      // 组合旋转，使用组合中心点
      this.state.startRotation = 0;
    }

    // 发出旋转开始事件
    eventBus.emit(ResizeEvent.ROTATION_START, {
      elementIds,
      startPoint: startWorldPoint,
      startRotation: this.state.startRotation,
    });

    // 隐藏选择框
    eventBus.emit('selection:hide', { elementIds });
  }

  /**
   * 保存元素原始状态
   */
  private saveOriginalElements(elementIds: string[]): void {
    this.state.originalElements = new Map();
    const storeState = this.canvasStore.getState();

    elementIds.forEach((elementId) => {
      const element = storeState.elements[elementId];
      if (element) {
        this.state.originalElements.set(elementId, {
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
          rotation: element.rotation,
          transformOrigin: {
            x: element.transform?.pivotX || 0.5,
            y: element.transform?.pivotY || 0.5,
          },
        });
      }
    });
  }

  /**
   * 处理指针移动
   */
  private handlePointerMove = (event: CanvasEvent): void => {
    if (!this.state.isActive || !event?.world) return;

    this.state.currentPoint = event.world;

    if (this.state.isRotating) {
      this.updateRotation(event.world);
    } else {
      this.updateResize(event.world);
    }
  };

  /**
   * 更新调整大小
   */
  private updateResize(currentWorldPoint: Point): void {
    if (
      !this.state.isActive ||
      !this.state.startPoint ||
      !this.state.handleType ||
      this.state.originalElements.size === 0
    ) {
      return;
    }

    const deltaX = currentWorldPoint.x - this.state.startPoint.x;
    const deltaY = currentWorldPoint.y - this.state.startPoint.y;

    // 忽略微小移动
    if (Math.abs(deltaX) < 0.1 && Math.abs(deltaY) < 0.1) return;

    if (this.state.isGroupResize) {
      this.updateGroupResize(deltaX, deltaY);
    } else {
      this.updateSingleResize(deltaX, deltaY);
    }

    // 发出调整更新事件
    eventBus.emit(ResizeEvent.RESIZE_UPDATE, {
      elementIds: this.state.elementIds,
      currentPoint: currentWorldPoint,
      deltaX,
      deltaY,
    });
  }

  /**
   * 更新单个元素调整
   */
  private updateSingleResize(deltaX: number, deltaY: number): void {
    const elementId = this.state.elementIds[0];
    const original = this.state.originalElements.get(elementId);

    if (!original) return;

    const element = this.canvasStore.getState().elements[elementId];
    const rotation = element?.rotation || 0;
    const scaleX = element?.transform?.scaleX ?? 1;
    const scaleY = element?.transform?.scaleY ?? 1;

    if (rotation !== 0 || scaleX !== 1 || scaleY !== 1) {
      const startPoint = this.state.startPoint!;
      const currentPoint = this.state.currentPoint!;
      const provider = new ElementProvider(elementId);
      const startLocal = this.coordinateTransformer.worldToLocal(
        startPoint.x,
        startPoint.y,
        provider,
      );
      const currentLocal = this.coordinateTransformer.worldToLocal(
        currentPoint.x,
        currentPoint.y,
        provider,
      );
      const dxl = currentLocal.x - startLocal.x;
      const dyl = currentLocal.y - startLocal.y;

      const localBounds = this.calculateNewBoundsLocal(
        0,
        0,
        original.width,
        original.height,
        dxl,
        dyl,
        this.state.handleType!,
      );

      if (localBounds.width < this.config.minSize || localBounds.height < this.config.minSize) {
        return;
      }

      const oldTopLeftWorld = this.coordinateTransformer.localToWorld(0, 0, provider);
      const newTopLeftWorld = this.coordinateTransformer.localToWorld(
        localBounds.x,
        localBounds.y,
        provider,
      );
      const dxWorld = newTopLeftWorld.x - oldTopLeftWorld.x;
      const dyWorld = newTopLeftWorld.y - oldTopLeftWorld.y;
      console.log('ResizeInteraction: 局部调整 -> 世界应用', {
        elementId,
        rotation,
        scaleX,
        scaleY,
        startLocal,
        currentLocal,
        localDelta: { x: dxl, y: dyl },
        localBounds,
        worldDelta: { x: dxWorld, y: dyWorld },
        original,
      });

      this.canvasStore.getState().updateElement(elementId, {
        x: original.x + dxWorld,
        y: original.y + dyWorld,
        width: localBounds.width,
        height: localBounds.height,
      });
    } else {
      const newBounds = this.calculateNewBounds(
        original.x,
        original.y,
        original.width,
        original.height,
        deltaX,
        deltaY,
        this.state.handleType!,
      );

      if (newBounds.width < this.config.minSize || newBounds.height < this.config.minSize) {
        return;
      }

      console.log('ResizeInteraction: 轴对齐调整', {
        elementId,
        delta: { x: deltaX, y: deltaY },
        newBounds,
      });

      this.canvasStore.getState().updateElement(elementId, {
        x: newBounds.x,
        y: newBounds.y,
        width: newBounds.width,
        height: newBounds.height,
      });
    }
  }

  /**
   * 更新组合调整
   */
  private updateGroupResize(deltaX: number, deltaY: number): void {
    if (!this.state.startBounds) return;

    const { x: groupX, y: groupY, width: groupWidth, height: groupHeight } = this.state.startBounds;

    const newGroupBounds = this.calculateNewBounds(
      groupX,
      groupY,
      groupWidth,
      groupHeight,
      deltaX,
      deltaY,
      this.state.handleType!,
    );

    // 批量更新每个元素
    const updates: Array<{ id: string; updates: Partial<Element> }> = [];

    this.state.originalElements.forEach((original, elementId) => {
      const relX = (original.x - groupX) / groupWidth;
      const relY = (original.y - groupY) / groupHeight;
      const relWidth = original.width / groupWidth;
      const relHeight = original.height / groupHeight;

      const newX = newGroupBounds.x + relX * newGroupBounds.width;
      const newY = newGroupBounds.y + relY * newGroupBounds.height;
      const newWidth = relWidth * newGroupBounds.width;
      const newHeight = relHeight * newGroupBounds.height;

      // 确保最小尺寸
      const finalWidth = Math.max(this.config.minSize, newWidth);
      const finalHeight = Math.max(this.config.minSize, newHeight);

      updates.push({
        id: elementId,
        updates: {
          x: newX,
          y: newY,
          width: finalWidth,
          height: finalHeight,
        },
      });
    });

    this.canvasStore.getState().updateElements(updates);
  }

  /**
   * 计算新边界
   */
  private calculateNewBounds(
    x: number,
    y: number,
    width: number,
    height: number,
    deltaX: number,
    deltaY: number,
    handleType: ResizeHandleType,
  ): { x: number; y: number; width: number; height: number } {
    let newX = x;
    let newY = y;
    let newWidth = width;
    let newHeight = height;

    // 检查是否按Alt键从中心调整
    const fromCenter = this.keyState.altKey && this.config.altKeyFromCenter;

    // 检查是否按Shift键保持宽高比
    const preserveAspect =
      (this.keyState.shiftKey && this.config.shiftKeyPreserveAspect) ||
      this.config.preserveAspectRatio;

    const aspectRatio = width / height;

    switch (handleType) {
      case 'top-left':
        if (fromCenter) {
          newX = x + deltaX / 2;
          newY = y + deltaY / 2;
          newWidth = width - deltaX;
          newHeight = height - deltaY;
        } else {
          newX = x + deltaX;
          newY = y + deltaY;
          newWidth = width - deltaX;
          newHeight = height - deltaY;
        }
        break;

      case 'top':
        if (fromCenter) {
          newY = y + deltaY / 2;
          newHeight = height - deltaY;
        } else {
          newY = y + deltaY;
          newHeight = height - deltaY;
        }
        break;

      case 'top-right':
        if (fromCenter) {
          newX = x + deltaX / 2;
          newY = y + deltaY / 2;
          newWidth = width + deltaX;
          newHeight = height - deltaY;
        } else {
          newY = y + deltaY;
          newWidth = width + deltaX;
          newHeight = height - deltaY;
        }
        break;

      case 'right':
        if (fromCenter) {
          newX = x + deltaX / 2;
          newWidth = width + deltaX;
        } else {
          newWidth = width + deltaX;
        }
        break;

      case 'bottom-right':
        if (fromCenter) {
          newX = x + deltaX / 2;
          newY = y + deltaY / 2;
          newWidth = width + deltaX;
          newHeight = height + deltaY;
        } else {
          newWidth = width + deltaX;
          newHeight = height + deltaY;
        }
        break;

      case 'bottom':
        if (fromCenter) {
          newY = y + deltaY / 2;
          newHeight = height + deltaY;
        } else {
          newHeight = height + deltaY;
        }
        break;

      case 'bottom-left':
        if (fromCenter) {
          newX = x + deltaX / 2;
          newY = y + deltaY / 2;
          newWidth = width - deltaX;
          newHeight = height + deltaY;
        } else {
          newX = x + deltaX;
          newWidth = width - deltaX;
          newHeight = height + deltaY;
        }
        break;

      case 'left':
        if (fromCenter) {
          newX = x + deltaX / 2;
          newWidth = width - deltaX;
        } else {
          newX = x + deltaX;
          newWidth = width - deltaX;
        }
        break;
    }

    // 保持宽高比
    if (
      preserveAspect &&
      handleType !== 'top' &&
      handleType !== 'bottom' &&
      handleType !== 'left' &&
      handleType !== 'right'
    ) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        newHeight = newWidth / aspectRatio;
        if (['top-left', 'left', 'bottom-left'].includes(handleType)) {
          newY = y + (height - newHeight);
        }
      } else {
        newWidth = newHeight * aspectRatio;
        if (['top-left', 'top', 'top-right'].includes(handleType)) {
          newX = x + (width - newWidth);
        }
      }
    }

    // 确保最小尺寸
    if (newWidth < this.config.minSize) {
      const widthDiff = this.config.minSize - newWidth;
      newWidth = this.config.minSize;
      if (['left', 'top-left', 'bottom-left'].includes(handleType)) {
        newX -= widthDiff;
      }
    }

    if (newHeight < this.config.minSize) {
      const heightDiff = this.config.minSize - newHeight;
      newHeight = this.config.minSize;
      if (['top', 'top-left', 'top-right'].includes(handleType)) {
        newY -= heightDiff;
      }
    }

    return { x: newX, y: newY, width: newWidth, height: newHeight };
  }

  /**
   * 更新旋转
   */
  private updateRotation(currentWorldPoint: Point): void {
    if (!this.state.isActive || !this.state.startPoint || this.state.originalElements.size === 0) {
      return;
    }

    // 计算旋转中心
    let centerX, centerY;

    if (this.state.isGroupResize && this.state.startBounds) {
      // 组合旋转中心
      centerX = this.state.startBounds.x + this.state.startBounds.width / 2;
      centerY = this.state.startBounds.y + this.state.startBounds.height / 2;
    } else {
      // 单个元素旋转中心
      const elementId = this.state.elementIds[0];
      const original = this.state.originalElements.get(elementId);
      if (!original) return;

      const element = this.canvasStore.getState().elements[elementId];
      const pivotX = element?.transform?.pivotX || 0.5;
      const pivotY = element?.transform?.pivotY || 0.5;

      centerX = original.x + original.width * pivotX;
      centerY = original.y + original.height * pivotY;
    }

    // 计算起始向量和当前向量
    const startVecX = this.state.startPoint.x - centerX;
    const startVecY = this.state.startPoint.y - centerY;
    const currentVecX = currentWorldPoint.x - centerX;
    const currentVecY = currentWorldPoint.y - centerY;

    // 计算角度（弧度）
    const startAngle = Math.atan2(startVecY, startVecX);
    const currentAngle = Math.atan2(currentVecY, currentVecX);
    const deltaAngle = currentAngle - startAngle;

    // 转换为角度
    let deltaDegrees = deltaAngle * (180 / Math.PI);

    // 角度吸附
    if (this.config.snapToAngle && this.keyState.ctrlKey) {
      const snapAngle = this.config.snapAngle;
      const snappedAngle = Math.round(deltaDegrees / snapAngle) * snapAngle;
      deltaDegrees = snappedAngle;
    }

    // 计算最终角度
    const newRotation = (this.state.startRotation + deltaDegrees + 360) % 360;

    if (this.state.isGroupResize) {
      this.updateGroupRotation(newRotation, centerX, centerY);
    } else {
      this.updateSingleRotation(newRotation);
    }

    // 发出旋转更新事件
    eventBus.emit(ResizeEvent.ROTATION_UPDATE, {
      elementIds: this.state.elementIds,
      rotation: newRotation,
      deltaDegrees,
    });
  }

  /**
   * 更新单个元素旋转
   */
  private updateSingleRotation(newRotation: number): void {
    const elementId = this.state.elementIds[0];
    this.canvasStore.getState().updateElement(elementId, {
      rotation: newRotation,
    });
  }

  /**
   * 更新组合旋转
   */
  private updateGroupRotation(newRotation: number, centerX: number, centerY: number): void {
    if (!this.state.startBounds) return;

    const updates: Array<{ id: string; updates: Partial<Element> }> = [];
    const deltaRotation = newRotation - this.state.startRotation;
    const deltaRadians = deltaRotation * (Math.PI / 180);

    this.state.originalElements.forEach((original, elementId) => {
      const element = this.canvasStore.getState().elements[elementId];
      const pivotX = element?.transform?.pivotX ?? 0.5;
      const pivotY = element?.transform?.pivotY ?? 0.5;
      const elementCenterX = original.x + original.width * pivotX;
      const elementCenterY = original.y + original.height * pivotY;

      const offsetX = elementCenterX - centerX;
      const offsetY = elementCenterY - centerY;

      const cos = Math.cos(deltaRadians);
      const sin = Math.sin(deltaRadians);

      const rotatedOffsetX = offsetX * cos - offsetY * sin;
      const rotatedOffsetY = offsetX * sin + offsetY * cos;

      const newX = centerX + rotatedOffsetX - original.width * pivotX;
      const newY = centerY + rotatedOffsetY - original.height * pivotY;

      const newElementRotation = (original.rotation + deltaRotation + 360) % 360;

      console.log('ResizeInteraction: 组合旋转位置更新', {
        elementId,
        pivot: { x: pivotX, y: pivotY },
        center: { x: centerX, y: centerY },
        originalCenter: { x: elementCenterX, y: elementCenterY },
        rotatedOffset: { x: rotatedOffsetX, y: rotatedOffsetY },
        newPos: { x: newX, y: newY },
        newRotation: newElementRotation,
      });

      updates.push({
        id: elementId,
        updates: {
          x: newX,
          y: newY,
          rotation: newElementRotation,
        },
      });
    });

    this.canvasStore.getState().updateElements(updates);
  }

  private calculateNewBoundsLocal(
    x: number,
    y: number,
    width: number,
    height: number,
    deltaX: number,
    deltaY: number,
    handleType: ResizeHandleType,
  ): { x: number; y: number; width: number; height: number } {
    let newX = x;
    let newY = y;
    let newWidth = width;
    let newHeight = height;

    const fromCenter = this.keyState.altKey && this.config.altKeyFromCenter;
    const preserveAspect =
      (this.keyState.shiftKey && this.config.shiftKeyPreserveAspect) ||
      this.config.preserveAspectRatio;
    const aspectRatio = width / height || 1;

    switch (handleType) {
      case 'top-left':
        if (fromCenter) {
          newX = x + deltaX / 2;
          newY = y + deltaY / 2;
          newWidth = width - deltaX;
          newHeight = height - deltaY;
        } else {
          newX = x + deltaX;
          newY = y + deltaY;
          newWidth = width - deltaX;
          newHeight = height - deltaY;
        }
        break;
      case 'top':
        if (fromCenter) {
          newY = y + deltaY / 2;
          newHeight = height - deltaY;
        } else {
          newY = y + deltaY;
          newHeight = height - deltaY;
        }
        break;
      case 'top-right':
        if (fromCenter) {
          newX = x + deltaX / 2;
          newY = y + deltaY / 2;
          newWidth = width + deltaX;
          newHeight = height - deltaY;
        } else {
          newY = y + deltaY;
          newWidth = width + deltaX;
          newHeight = height - deltaY;
        }
        break;
      case 'right':
        if (fromCenter) {
          newX = x + deltaX / 2;
          newWidth = width + deltaX;
        } else {
          newWidth = width + deltaX;
        }
        break;
      case 'bottom-right':
        if (fromCenter) {
          newX = x + deltaX / 2;
          newY = y + deltaY / 2;
          newWidth = width + deltaX;
          newHeight = height + deltaY;
        } else {
          newWidth = width + deltaX;
          newHeight = height + deltaY;
        }
        break;
      case 'bottom':
        if (fromCenter) {
          newY = y + deltaY / 2;
          newHeight = height + deltaY;
        } else {
          newHeight = height + deltaY;
        }
        break;
      case 'bottom-left':
        if (fromCenter) {
          newX = x + deltaX / 2;
          newY = y + deltaY / 2;
          newWidth = width - deltaX;
          newHeight = height + deltaY;
        } else {
          newX = x + deltaX;
          newWidth = width - deltaX;
          newHeight = height + deltaY;
        }
        break;
      case 'left':
        if (fromCenter) {
          newX = x + deltaX / 2;
          newWidth = width - deltaX;
        } else {
          newX = x + deltaX;
          newWidth = width - deltaX;
        }
        break;
    }

    if (
      preserveAspect &&
      handleType !== 'top' &&
      handleType !== 'bottom' &&
      handleType !== 'left' &&
      handleType !== 'right'
    ) {
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        newHeight = newWidth / aspectRatio;
        if (['top-left', 'left', 'bottom-left'].includes(handleType)) {
          newY = y + (height - newHeight);
        }
      } else {
        newWidth = newHeight * aspectRatio;
        if (['top-left', 'top', 'top-right'].includes(handleType)) {
          newX = x + (width - newWidth);
        }
      }
    }

    if (newWidth < this.config.minSize) {
      const widthDiff = this.config.minSize - newWidth;
      newWidth = this.config.minSize;
      if (['left', 'top-left', 'bottom-left'].includes(handleType)) {
        newX -= widthDiff;
      }
    }

    if (newHeight < this.config.minSize) {
      const heightDiff = this.config.minSize - newHeight;
      newHeight = this.config.minSize;
      if (['top', 'top-left', 'top-right'].includes(handleType)) {
        newY -= heightDiff;
      }
    }

    return { x: newX, y: newY, width: newWidth, height: newHeight };
  }

  /**
   * 处理指针抬起
   */
  private handlePointerUp = (): void => {
    if (!this.state.isActive) return;

    console.log('ResizeInteraction: 交互结束');

    if (this.state.isRotating) {
      this.finishRotation();
    } else {
      this.finishResize();
    }
  };

  /**
   * 完成调整
   */
  private finishResize(): void {
    eventBus.emit(ResizeEvent.RESIZE_END, {
      elementIds: this.state.elementIds,
      finalPoint: this.state.currentPoint,
    });

    if (this.historyService && this.state.elementIds.length > 0) {
      const storeState = this.canvasStore.getState();
      const resizes = this.state.elementIds
        .map((elementId) => {
          const original = this.state.originalElements.get(elementId);
          const current = storeState.elements[elementId];
          if (!original || !current) return null;
          return {
            elementId,
            oldState: {
              x: original.x,
              y: original.y,
              width: original.width,
              height: original.height,
              rotation: original.rotation,
            },
            newState: {
              x: current.x,
              y: current.y,
              width: current.width,
              height: current.height,
              rotation: current.rotation,
            },
          };
        })
        .filter((v): v is NonNullable<typeof v> => v !== null);

      if (resizes.length > 0) {
        const command = new ResizeCommand(resizes, {
          updateElement: (id: string, updates: Partial<Element>) =>
            this.canvasStore.getState().updateElement(id, updates),
          updateElements: (updates: Array<{ id: string; updates: Partial<Element> }>) =>
            this.canvasStore.getState().updateElements(updates),
        });
        this.historyService.executeCommand(command).catch((err) => {
          console.error('ResizeInteraction: 记录历史失败', err);
        });
      }
    }

    this.cleanup();
  }

  /**
   * 完成旋转
   */
  private finishRotation(): void {
    eventBus.emit(ResizeEvent.ROTATION_END, {
      elementIds: this.state.elementIds,
      finalRotation: this.getCurrentRotation(),
    });

    if (this.historyService && this.state.elementIds.length > 0) {
      const storeState = this.canvasStore.getState();
      const resizes = this.state.elementIds
        .map((elementId) => {
          const original = this.state.originalElements.get(elementId);
          const current = storeState.elements[elementId];
          if (!original || !current) return null;
          return {
            elementId,
            oldState: {
              x: original.x,
              y: original.y,
              width: original.width,
              height: original.height,
              rotation: original.rotation,
            },
            newState: {
              x: current.x,
              y: current.y,
              width: current.width,
              height: current.height,
              rotation: current.rotation,
            },
          };
        })
        .filter((v): v is NonNullable<typeof v> => v !== null);

      if (resizes.length > 0) {
        const command = new ResizeCommand(resizes, {
          updateElement: (id: string, updates: Partial<Element>) =>
            this.canvasStore.getState().updateElement(id, updates),
          updateElements: (updates: Array<{ id: string; updates: Partial<Element> }>) =>
            this.canvasStore.getState().updateElements(updates),
        });
        this.historyService.executeCommand(command).catch((err) => {
          console.error('ResizeInteraction: 记录历史失败', err);
        });
      }
    }

    this.cleanup();
  }

  /**
   * 获取当前旋转角度
   */
  private getCurrentRotation(): number {
    if (this.state.elementIds.length === 0) return 0;

    const element = this.canvasStore.getState().elements[this.state.elementIds[0]];
    return element?.rotation || 0;
  }

  /**
   * 处理键盘按下
   */
  private handleKeyDown = (event: { nativeEvent?: KeyboardEvent; key?: string }): void => {
    if (!this.state.isActive) return;

    const key = event.nativeEvent?.key || event.key;
    if (!key) return;

    switch (key.toLowerCase()) {
      case 'shift':
        this.keyState.shiftKey = true;
        break;
      case 'alt':
        this.keyState.altKey = true;
        break;
      case 'control':
      case 'ctrl':
        this.keyState.ctrlKey = true;
        break;
      case 'escape':
        this.cancelResize();
        break;
    }
  };

  /**
   * 处理键盘抬起
   */
  private handleKeyUp = (event: { nativeEvent?: KeyboardEvent; key?: string }): void => {
    const key = event.nativeEvent?.key || event.key;
    if (!key) return;

    switch (key.toLowerCase()) {
      case 'shift':
        this.keyState.shiftKey = false;
        break;
      case 'alt':
        this.keyState.altKey = false;
        break;
      case 'control':
      case 'ctrl':
        this.keyState.ctrlKey = false;
        break;
    }
  };

  /**
   * 取消调整/旋转
   */
  private cancelResize = (): void => {
    if (!this.state.isActive) return;

    console.log('ResizeInteraction: 取消交互');

    // 恢复原始状态
    this.restoreOriginalElements();

    if (this.state.isRotating) {
      eventBus.emit(ResizeEvent.ROTATION_END, {
        elementIds: this.state.elementIds,
        cancelled: true,
      });
    } else {
      eventBus.emit(ResizeEvent.RESIZE_CANCEL, {
        elementIds: this.state.elementIds,
      });
    }

    this.cleanup();
  };

  /**
   * 恢复原始元素状态
   */
  private restoreOriginalElements(): void {
    const storeState = this.canvasStore.getState();

    this.state.originalElements.forEach((original, elementId) => {
      storeState.updateElement(elementId, {
        x: original.x,
        y: original.y,
        width: original.width,
        height: original.height,
        rotation: original.rotation,
      });
    });
  }

  /**
   * 清理状态
   */
  private cleanup(): void {
    // 显示选择框
    eventBus.emit('selection:show', { elementIds: this.state.elementIds });

    // 重置状态
    this.state = {
      isActive: false,
      elementIds: [],
      handleType: null,
      startPoint: null,
      currentPoint: null,
      originalElements: new Map(),
      isGroupResize: false,
      startBounds: null,
      startRotation: 0,
      isRotating: false,
    };

    // 重置键盘状态
    this.keyState = {
      shiftKey: false,
      altKey: false,
      ctrlKey: false,
    };
  }

  /**
   * 检查是否正在调整/旋转
   */
  isActive(): boolean {
    return this.state.isActive;
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig: Partial<InteractionConfig>): void {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * 获取当前配置
   */
  getConfig(): InteractionConfig {
    return { ...this.config };
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.isDisposed) return;

    this.isDisposed = true;

    // 移除所有事件监听
    eventBus.off('resize-start', this.handleResizeStart);
    eventBus.off('group-resize-start', this.handleGroupResizeStart);
    eventBus.off('rotation-start', this.handleRotationStart);
    eventBus.off('group-rotation-start', this.handleGroupRotationStart);
    eventBus.off('pointermove', this.handlePointerMove as unknown as (arg: unknown) => void);
    eventBus.off('pointerup', this.handlePointerUp);
    eventBus.off('pointerupoutside', this.handlePointerUp);
    eventBus.off('keyboard:down', this.handleKeyDown as unknown as (arg: unknown) => void);
    eventBus.off('keyboard:up', this.handleKeyUp as unknown as (arg: unknown) => void);
    eventBus.off('selection:clear', this.cancelResize);
    eventBus.off('tool:changed', this.cancelResize);

    this.cleanup();
  }
}

// 导出单例
export const resizeInteraction = new ResizeInteraction();
