// interactions/interactionTypes.ts
import type { Point, Element } from '../../types/index';

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

export enum HandleType {
  TOP_LEFT = 'top-left',
  TOP = 'top',
  TOP_RIGHT = 'top-right',
  RIGHT = 'right',
  BOTTOM_RIGHT = 'bottom-right',
  BOTTOM = 'bottom',
  BOTTOM_LEFT = 'bottom-left',
  LEFT = 'left',
  ROTATION = 'rotation',
}

export interface TransformState {
  isActive: boolean;
  elementId: string | null;
  handleType: HandleType | null;
  startPoint: Point | null;
  currentPoint: Point | null;
  startElement: Element | null;
  startRotation: number;
  startScaleX: number;
  startScaleY: number;
  startWidth: number;
  startHeight: number;
  startX: number;
  startY: number;
}

export interface TransformResult {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
}
