/* eslint-disable @typescript-eslint/no-explicit-any */
// renderer/renderers/ImageRenderer.ts
import * as PIXI from 'pixi.js';
import type { Element, ImageElement } from '../../types/index';
import type { IElementRenderer, RenderResources } from '../../types/render.types';
import { ResourceManager } from '../resources/ResourceManager';

/**
 * 图片渲染器 - 负责图片元素的图形渲染
 * 职责：将图片元素数据转换为PIXI精灵对象
 */
export class ImageRenderer implements IElementRenderer {
  private resourceManager: ResourceManager;

  constructor(resourceManager: ResourceManager) {
    this.resourceManager = resourceManager;
  }

  /**
   * 渲染图片元素
   */
  render(element: Element, resources: RenderResources): PIXI.Sprite {
    console.log(`ImageRenderer: resources received`, resources);
    const imageElement = element as ImageElement;
    const { x, y, width, height, opacity, src, adjustments, transform, rotation } = imageElement;

    // 从资源中获取纹理
    const texture = resources.textures.get(src);
    if (!texture) {
      console.warn(`ImageRenderer: 纹理未找到 ${src}，使用占位符`);
      // 创建一个占位符纹理
      const placeholderTexture = PIXI.Texture.WHITE;
      const sprite = new PIXI.Sprite(placeholderTexture);
      sprite.width = width;
      sprite.height = height;
      return sprite;
    }

    // 创建PIXI精灵对象
    const sprite = new PIXI.Sprite(texture);

    // 设置元素类型标识（用于后续查询）
    (sprite as any).elementType = 'image';
    (sprite as any).elementId = element.id;

    // 设置尺寸
    sprite.width = width;
    sprite.height = height;

    // 设置位置和变换
    sprite.x = x;
    sprite.y = y;
    sprite.alpha = opacity;

    // 设置缩放
    sprite.scale.set(transform.scaleX, transform.scaleY);

    // 设置变换中心
    sprite.pivot.set(transform.pivotX * width, transform.pivotY * height);

    // 设置旋转
    sprite.rotation = rotation * (Math.PI / 180);

    // 应用图片调整
    if (adjustments) {
      this.applyAdjustments(sprite, adjustments);
    }

    // 缓存当前尺寸、样式和变换
    (sprite as any).lastWidth = width;
    (sprite as any).lastHeight = height;
    (sprite as any).lastTransform = transform;

    console.log(`ImageRenderer: 创建图片元素 ${element.id}`, { x, y, width, height, src });

    return sprite;
  }

  /**
   * 更新图片元素
   */
  update(sprite: PIXI.Sprite, changes: Partial<Element>): void {
    const imageChanges = changes as Partial<ImageElement>;

    // 更新位置
    if (imageChanges.x !== undefined) sprite.x = imageChanges.x;
    if (imageChanges.y !== undefined) sprite.y = imageChanges.y;

    // 更新透明度
    if (imageChanges.opacity !== undefined) sprite.alpha = imageChanges.opacity;

    // 更新旋转
    if (imageChanges.rotation !== undefined) {
      sprite.rotation = imageChanges.rotation * (Math.PI / 180);
    }

    // 更新变换
    if (imageChanges.transform !== undefined) {
      const transform = imageChanges.transform;
      sprite.scale.set(transform.scaleX, transform.scaleY);

      // 如果有尺寸变化，需要重新计算变换中心
      const width = imageChanges.width ?? (sprite as any).lastWidth;
      const height = imageChanges.height ?? (sprite as any).lastHeight;
      if (width !== undefined && height !== undefined) {
        sprite.pivot.set(transform.pivotX * width, transform.pivotY * height);
      }
    }

    // 更新尺寸
    if (imageChanges.width !== undefined) sprite.width = imageChanges.width;
    if (imageChanges.height !== undefined) sprite.height = imageChanges.height;

    // 更新图片源
    if (imageChanges.src !== undefined) {
      // 注意：在更新时，纹理应该已经通过资源管理器预加载
      // 这里假设纹理已经在缓存中，实际实现需要确保资源已准备
      console.warn('ImageRenderer: 更新图片源需要重新准备资源');
    }

    // 更新调整
    if (imageChanges.adjustments !== undefined) {
      this.applyAdjustments(sprite, imageChanges.adjustments);
    }

    console.log(`ImageRenderer: 更新图片元素`, changes);
  }

  /**
   * 应用图片调整
   */
  private applyAdjustments(sprite: PIXI.Sprite, adjustments: ImageElement['adjustments']): void {
    if (!adjustments) return;

    // PIXI.Sprite 的调整可以通过滤镜实现
    // 这里提供基础框架，具体实现可以后续扩展

    // 暂时记录调整参数，未来可以通过自定义滤镜实现
    console.log('ImageRenderer: 应用图片调整', adjustments);
  }
}
