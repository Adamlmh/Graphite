// types/render.types.ts
import * as PIXI from 'pixi.js';
import { type Element, type ElementType } from './index';
/** 渲染优先级 */
export enum RenderPriority {
  CRITICAL = 4, // 关键渲染（立即执行）
  HIGH = 3, // 高优先级（当前帧）
  NORMAL = 2, // 普通优先级（下一帧）
  LOW = 1, // 低优先级（空闲时）
}

/** 渲染命令 - 桥接层传递给渲染层的指令 */

export type AllRenderCommand =
  | CreateElementCommand
  | UpdateElementCommand
  | DeleteElementCommand
  | BatchDeleteElementCommand
  | BatchUpdateElementCommand;

export interface RenderCommand {
  type: string;
  priority: RenderPriority;
}

export interface CreateElementCommand extends RenderCommand {
  type: 'CREATE_ELEMENT';
  elementId: string;
  elementType: ElementType;
  elementData: Element;
}

export interface UpdateElementCommand extends RenderCommand {
  type: 'UPDATE_ELEMENT';
  elementId: string;
  properties: Partial<Element>;
}

export interface DeleteElementCommand extends RenderCommand {
  type: 'DELETE_ELEMENT';
  elementId: string;
}

export interface BatchDeleteElementCommand extends RenderCommand {
  type: 'BATCH_DELETE_ELEMENTS';
  elementIds: string[];
}

export interface BatchUpdateElementCommand extends RenderCommand {
  type: 'BATCH_UPDATE_ELEMENTS';
  updates: Array<{ elementId: string; properties: Partial<Element> }>;
}

/** 渲染资源 */
export interface RenderResources {
  textures: Map<string, PIXI.Texture>;
}

/** 渲染器接口 */
export interface IElementRenderer {
  render(element: Element, resources: RenderResources): PIXI.Container;
  update(graphics: PIXI.Container, changes: Partial<Element>): void;
}
