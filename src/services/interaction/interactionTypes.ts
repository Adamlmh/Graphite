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
