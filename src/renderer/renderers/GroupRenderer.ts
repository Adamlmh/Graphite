/* eslint-disable @typescript-eslint/no-explicit-any */
// renderer/renderers/GroupRenderer.ts
import * as PIXI from 'pixi.js';
import type { Element, GroupElement } from '../../types/index';
import type { IElementRenderer, RenderResources } from '../../types/render.types';
import { ResourceManager } from '../resources/ResourceManager';

/**
 * 组合元素渲染器 - 负责组合元素的图形渲染
 *
 * MVP 版本：group 本身不渲染内容（子元素已经渲染）
 * 只创建一个空的容器用于占位和事件处理
 */
export class GroupRenderer implements IElementRenderer {
  private resourceManager: ResourceManager;

  constructor(resourceManager: ResourceManager) {
    this.resourceManager = resourceManager;
  }

  /**
   * 渲染组合元素
   *
   * MVP 版本：group 不渲染可见内容，只创建容器
   * 子元素会通过各自的渲染器单独渲染
   */
  render(element: Element, resources: RenderResources): PIXI.Graphics {
    const groupElement = element as GroupElement;
    const { x, y, width, height, opacity } = groupElement;

    // 创建空的 PIXI 图形对象（不绘制任何内容）
    const graphics = new PIXI.Graphics();

    // 设置元素类型标识
    (graphics as any).elementType = 'group';
    (graphics as any).elementId = element.id;

    // 设置位置和尺寸（用于事件检测）
    graphics.x = x;
    graphics.y = y;
    graphics.width = width;
    graphics.height = height;
    graphics.alpha = opacity;

    // 设置交互区域（用于点击检测）
    graphics.hitArea = new PIXI.Rectangle(0, 0, width, height);
    graphics.interactive = true;
    graphics.interactiveChildren = true;

    // 缓存当前尺寸
    (graphics as any).lastWidth = width;
    (graphics as any).lastHeight = height;

    console.log(`GroupRenderer: 创建组合元素 ${element.id}`, { x, y, width, height });

    return graphics;
  }

  /**
   * 更新组合元素
   */
  update(graphics: PIXI.Graphics, changes: Partial<Element>): void {
    const groupChanges = changes as Partial<GroupElement>;

    // 更新位置
    if (groupChanges.x !== undefined) {
      graphics.x = groupChanges.x;
    }
    if (groupChanges.y !== undefined) {
      graphics.y = groupChanges.y;
    }

    // 更新透明度
    if (groupChanges.opacity !== undefined) {
      graphics.alpha = groupChanges.opacity;
    }

    // 更新尺寸和交互区域
    const width = groupChanges.width ?? (graphics as any).lastWidth;
    const height = groupChanges.height ?? (graphics as any).lastHeight;

    if (groupChanges.width !== undefined || groupChanges.height !== undefined) {
      graphics.width = width;
      graphics.height = height;
      graphics.hitArea = new PIXI.Rectangle(0, 0, width, height);
      (graphics as any).lastWidth = width;
      (graphics as any).lastHeight = height;
    }
  }

  /**
   * 销毁组合元素渲染资源
   */
  destroy(graphics: PIXI.Graphics): void {
    graphics.destroy({ children: true });
  }
}
