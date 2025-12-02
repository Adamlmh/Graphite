// renderer/resources/ResourceManager.ts
import * as PIXI from 'pixi.js';
import type { Element, ImageElement } from '../../types/index';
import type { RenderResources } from '../index';
/**
 * 资源管理器 - 负责图形资源的加载、缓存和管理
 * 职责：纹理缓存、内存管理
 */
export class ResourceManager {
  private textureCache: Map<string, PIXI.Texture> = new Map();
  private loadingPromises: Map<string, Promise<PIXI.Texture>> = new Map();

  /**
   * 准备元素渲染所需的资源
   */
  async prepareResources(element: Element): Promise<RenderResources> {
    const resources: RenderResources = {
      textures: new Map(),
    };

    // 图片元素需要加载纹理
    if (element.type === 'image') {
      const imageElement = element as ImageElement;
      const texture = await this.getOrLoadTexture(imageElement.src, {
        displayWidth: imageElement.width,
        displayHeight: imageElement.height,
        naturalWidth: imageElement.naturalWidth,
        naturalHeight: imageElement.naturalHeight,
      });
      resources.textures.set(imageElement.src, texture);
    }

    return resources;
  }

  /**
   * 获取或加载纹理
   */
  async getOrLoadTexture(
    src: string,
    scaleOptions?: {
      displayWidth: number;
      displayHeight: number;
      naturalWidth: number;
      naturalHeight: number;
    },
  ): Promise<PIXI.Texture> {
    // 检查缓存
    const cachedTexture = this.textureCache.get(src);
    if (cachedTexture) {
      return cachedTexture;
    }

    // 检查是否正在加载
    const loadingPromise = this.loadingPromises.get(src);
    if (loadingPromise) {
      return loadingPromise;
    }

    // 创建新的加载任务
    const loadPromise = this.loadTexture(src, scaleOptions);
    this.loadingPromises.set(src, loadPromise);

    try {
      const texture = await loadPromise;
      this.textureCache.set(src, texture);
      return texture;
    } finally {
      this.loadingPromises.delete(src);
    }
  }

  /**
   * 加载纹理
   */
  private async loadTexture(
    src: string,
    scaleOptions?: {
      displayWidth: number;
      displayHeight: number;
      naturalWidth: number;
      naturalHeight: number;
    },
  ): Promise<PIXI.Texture> {
    return new Promise((resolve, reject) => {
      try {
        // 处理 DataURL
        const img = new Image();
        img.onload = () => {
          try {
            console.log('ResourceManager: 原始图片尺寸', {
              naturalWidth: img.naturalWidth,
              naturalHeight: img.naturalHeight,
            });

            let texture: PIXI.Texture;

            // 如果需要缩放，创建缩放后的纹理
            if (
              scaleOptions &&
              (scaleOptions.displayWidth !== scaleOptions.naturalWidth ||
                scaleOptions.displayHeight !== scaleOptions.naturalHeight)
            ) {
              console.log('ResourceManager: 需要缩放图片', scaleOptions);

              // 创建 Canvas 进行缩放
              const canvas = document.createElement('canvas');
              const ctx = canvas.getContext('2d')!;

              canvas.width = scaleOptions.displayWidth;
              canvas.height = scaleOptions.displayHeight;

              // 在 Canvas 上绘制缩放后的图片
              ctx.drawImage(img, 0, 0, scaleOptions.displayWidth, scaleOptions.displayHeight);

              // 从缩放后的 Canvas 创建纹理
              texture = PIXI.Texture.from(canvas);
              console.log('ResourceManager: 缩放纹理创建成功', {
                textureWidth: texture.width,
                textureHeight: texture.height,
              });
            } else {
              // 不需要缩放，直接从原图创建纹理
              texture = PIXI.Texture.from(img);
              console.log('ResourceManager: 原尺寸纹理创建成功', {
                textureWidth: texture.width,
                textureHeight: texture.height,
              });
            }

            if (texture && texture.baseTexture) {
              resolve(texture);
            } else {
              reject(new Error(`Failed to create texture from DataURL`));
            }
          } catch (error) {
            reject(new Error(`Texture creation error: ${error}`));
          }
        };
        img.onerror = () => {
          reject(new Error(`Failed to load image from DataURL`));
        };
        img.src = src;
      } catch (error) {
        console.error('ResourceManager: 加载纹理时发生错误:', error);
        reject(error);
      }
    });
  }

  /**
   * 清理元素相关资源
   */
  cleanupElementResources(elementId: string): void {
    // 第一阶段暂不实现复杂的资源清理
    console.log(`ResourceManager: 清理元素资源 ${elementId}`);
  }

  /**
   * 销毁所有资源
   */
  destroy(): void {
    // 清理纹理
    this.textureCache.forEach((texture) => texture.destroy(true));
    this.textureCache.clear();

    // 清理加载中的任务
    this.loadingPromises.clear();

    console.log('ResourceManager: 资源已清理');
  }
}
