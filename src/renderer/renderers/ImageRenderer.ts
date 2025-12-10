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

    // 启用交互
    sprite.interactive = true;

    // 计算基础缩放以匹配元素尺寸
    const texW = sprite.texture.width || 1;
    const texH = sprite.texture.height || 1;
    const baseScaleX = (width || 1) / texW;
    const baseScaleY = (height || 1) / texH;

    // 设置位置和变换
    sprite.x = x + transform.pivotX * width;
    sprite.y = y + transform.pivotY * height;
    sprite.alpha = opacity;

    // 设置缩放（基础缩放 * 变换缩放）
    sprite.scale.set(baseScaleX * transform.scaleX, baseScaleY * transform.scaleY);

    // 设置变换中心（以纹理局部坐标为基准）
    sprite.pivot.set(transform.pivotX * texW, transform.pivotY * texH);

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
    (sprite as any).lastX = x;
    (sprite as any).lastY = y;

    return sprite;
  }

  /**
   * 更新图片元素
   */
  update(sprite: PIXI.Sprite, changes: Partial<Element>): void {
    const imageChanges = changes as Partial<ImageElement>;

    // 获取当前的 transform（优先使用 changes 中的，否则使用缓存的）
    const transform = imageChanges.transform ?? (sprite as any).lastTransform;
    const width = imageChanges.width ?? (sprite as any).lastWidth;
    const height = imageChanges.height ?? (sprite as any).lastHeight;

    // 更新位置（使用正确的 transform.pivotX 和 pivotY）
    if (imageChanges.x !== undefined && transform) {
      sprite.x = imageChanges.x + transform.pivotX * width;
    }
    if (imageChanges.y !== undefined && transform) {
      sprite.y = imageChanges.y + transform.pivotY * height;
    }
    if (imageChanges.x !== undefined) (sprite as any).lastX = imageChanges.x;
    if (imageChanges.y !== undefined) (sprite as any).lastY = imageChanges.y;

    // 更新透明度
    if (imageChanges.opacity !== undefined) sprite.alpha = imageChanges.opacity;

    // 更新旋转
    if (imageChanges.rotation !== undefined) {
      sprite.rotation = imageChanges.rotation * (Math.PI / 180);
    }

    // 更新变换
    if (imageChanges.transform !== undefined) {
      const transform = imageChanges.transform;
      const texW = sprite.texture.width || 1;
      const texH = sprite.texture.height || 1;
      const curW = (sprite as any).lastWidth ?? texW;
      const curH = (sprite as any).lastHeight ?? texH;
      const baseScaleX = (curW || 1) / texW;
      const baseScaleY = (curH || 1) / texH;
      sprite.scale.set(baseScaleX * transform.scaleX, baseScaleY * transform.scaleY);

      // 如果有尺寸变化，需要重新计算变换中心
      const width = imageChanges.width ?? (sprite as any).lastWidth;
      const height = imageChanges.height ?? (sprite as any).lastHeight;
      if (width !== undefined && height !== undefined) {
        const texW2 = sprite.texture.width || 1;
        const texH2 = sprite.texture.height || 1;
        sprite.pivot.set(transform.pivotX * texW2, transform.pivotY * texH2);
        const baseX = (sprite as any).lastX ?? 0;
        const baseY = (sprite as any).lastY ?? 0;
        sprite.x = baseX + transform.pivotX * width;
        sprite.y = baseY + transform.pivotY * height;
      }
    }

    // 尺寸更新时，重新计算缩放（避免直接设置 width/height 影响 scale）
    if (imageChanges.width !== undefined || imageChanges.height !== undefined) {
      const newW = imageChanges.width ?? (sprite as any).lastWidth;
      const newH = imageChanges.height ?? (sprite as any).lastHeight;
      const texW = sprite.texture.width || 1;
      const texH = sprite.texture.height || 1;
      const baseScaleX = (newW || 1) / texW;
      const baseScaleY = (newH || 1) / texH;
      const tf = imageChanges.transform ?? (sprite as any).lastTransform;
      sprite.scale.set(baseScaleX * tf.scaleX, baseScaleY * tf.scaleY);
      const baseX = (sprite as any).lastX ?? 0;
      const baseY = (sprite as any).lastY ?? 0;
      sprite.x = baseX + (tf.pivotX ?? transform.pivotX) * newW;
      sprite.y = baseY + (tf.pivotY ?? transform.pivotY) * newH;
    }

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

    // 更新缓存
    if (imageChanges.width !== undefined) (sprite as any).lastWidth = imageChanges.width;
    if (imageChanges.height !== undefined) (sprite as any).lastHeight = imageChanges.height;
    if (imageChanges.transform !== undefined)
      (sprite as any).lastTransform = imageChanges.transform;
  }

  /**
   * 应用图片调整
   */
  private applyAdjustments(sprite: PIXI.Sprite, adjustments: ImageElement['adjustments']): void {
    if (!adjustments) {
      sprite.filters = [];
      return;
    }

    const filters: PIXI.Filter[] = [];

    const cm = new PIXI.ColorMatrixFilter();

    // 亮度：0-200（百分比），100 为原值
    if (typeof adjustments.brightness === 'number') {
      const value = Math.max(0, adjustments.brightness) / 100;
      cm.brightness(value, false);
    }

    // 对比度：0-200（百分比），100 为原值
    if (typeof adjustments.contrast === 'number') {
      const value = Math.max(0, adjustments.contrast) / 100;
      cm.contrast(value, false);
    }

    // 饱和度：0-200（百分比），100 为原值；0 为灰度
    if (typeof adjustments.saturation === 'number') {
      const raw = Math.max(0, adjustments.saturation);
      if (raw === 0) {
        // 强制黑白效果
        cm.greyscale(1, false);
      } else {
        const value = raw / 100;
        cm.saturate(value, false);
      }
    }

    // 色相：-180 到 180（度）
    if (typeof adjustments.hue === 'number') {
      const clamped = Math.max(-180, Math.min(180, adjustments.hue));
      cm.hue(clamped, false);
    }

    // 如果有任一颜色矩阵调整，添加滤镜
    if (
      typeof adjustments.brightness === 'number' ||
      typeof adjustments.contrast === 'number' ||
      typeof adjustments.saturation === 'number' ||
      typeof adjustments.hue === 'number'
    ) {
      filters.push(cm);
    }

    // 模糊：像素半径，0-20 合理
    // 优化：根据模糊半径动态调整质量，减少 GPU 消耗
    if (typeof adjustments.blur === 'number' && adjustments.blur > 0) {
      const blurRadius = Math.min(20, Math.max(0, adjustments.blur));
      // 小半径使用较低质量，大半径使用较高质量
      const quality = blurRadius < 5 ? 2 : blurRadius < 10 ? 3 : 4;
      const blur = new PIXI.BlurFilter({ strength: blurRadius, quality });
      filters.push(blur);
    }

    sprite.filters = filters;
  }
}
