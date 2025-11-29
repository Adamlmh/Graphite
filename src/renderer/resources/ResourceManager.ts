// renderer/resources/ResourceManager.tsimport * as PIXI from 'pixi.js';
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
      const texture = await this.getOrLoadTexture(imageElement.src);
      resources.textures.set(imageElement.src, texture);
    }

    return resources;
  }

  /**
   * 获取或加载纹理
   */
  async getOrLoadTexture(src: string): Promise<PIXI.Texture> {
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
    const loadPromise = this.loadTexture(src);
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
  private async loadTexture(src: string): Promise<PIXI.Texture> {
    return new Promise((resolve, reject) => {
      const texture = PIXI.Texture.from(src);

      // 等待纹理加载完成
      if (texture.baseTexture.resource.valid) {
        resolve(texture);
      } else {
        texture.baseTexture.once('update', () => {
          if (texture.baseTexture.resource.valid) {
            resolve(texture);
          }
        });
        texture.baseTexture.once('error', (error) => reject(error));
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
