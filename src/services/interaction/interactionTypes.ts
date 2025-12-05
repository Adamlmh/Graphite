// interactions/interactionTypes.ts
import type { Point, Element, Bounds } from '../../types/index';

/** 创建交互状态 */
export interface CreationState {
  isActive: boolean;
  startPoint: Point | null;
  currentPoint: Point | null;
  tempElement: Element | null;
}

/** 创建交互事件 */
export enum CreationEvent {
  CREATION_START = 'creation:start',
  CREATION_UPDATE = 'creation:update',
  CREATION_END = 'creation:end',
  CREATION_CANCEL = 'creation:cancel',
}

/** 移动交互状态 */
export interface MoveState {
  isActive: boolean;
  startPoint: Point | null;
  currentPoint: Point | null;
  originalPositions: Map<string, Point>; // 元素ID -> 原始位置
  isDragging: boolean;
}

/** 移动交互事件 */
export enum MoveEvent {
  MOVE_START = 'move:start',
  MOVE_UPDATE = 'move:update',
  MOVE_END = 'move:end',
  MOVE_CANCEL = 'move:cancel',
}

/** 移动事件数据 */
// export interface MoveEventData {
//   selectedElementIds: string[];
//   delta: Point;
//   startPoint: Point;
//   currentPoint: Point;
// }

/** 调整大小交互状态 */
export interface ResizeState {
  isActive: boolean;
  elementIds: string[];
  handleType: ResizeHandleType | null;
  startPoint: Point | null;
  currentPoint: Point | null;
  originalElements: Map<string, ElementSnapshot>;
  isGroupResize: boolean;
  startBounds: Bounds | null;
  startRotation: number;
  isRotating: boolean;
}

/** 元素快照 - 用于撤销/恢复 */
export interface ElementSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  transformOrigin: { x: number; y: number };
}

/** 控制点类型 */
export type ResizeHandleType =
  | 'top-left'
  | 'top'
  | 'top-right'
  | 'right'
  | 'bottom-right'
  | 'bottom'
  | 'bottom-left'
  | 'left'
  | 'rotation';

/** 调整大小交互事件 */
export enum ResizeEvent {
  RESIZE_START = 'resize:start',
  RESIZE_UPDATE = 'resize:update',
  RESIZE_END = 'resize:end',
  RESIZE_CANCEL = 'resize:cancel',
  ROTATION_START = 'rotation:start',
  ROTATION_UPDATE = 'rotation:update',
  ROTATION_END = 'rotation:end',
}

/** 交互管理器配置 */
export interface InteractionConfig {
  minSize: number;
  preserveAspectRatio: boolean;
  rotationStep: number; // 旋转角度步长（度）
  snapToAngle: boolean; // 是否吸附到角度
  snapAngle: number; // 吸附角度（度）
  shiftKeyPreserveAspect: boolean; // Shift键保持宽高比
  altKeyFromCenter: boolean; // Alt键从中心调整
}
