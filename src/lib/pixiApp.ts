import * as PIXI from 'pixi.js';

/**
 * Pixi Application 实例
 * 用于在全局访问 Pixi 应用实例
 */
export let pixiApp: PIXI.Application | null = null;

/**
 * 初始化回调函数列表
 * 当 pixiApp 设置后，会调用这些回调
 */
const initCallbacks: Array<(app: PIXI.Application) => void> = [];

/**
 * 注册初始化回调
 * @param callback 回调函数
 */
export function onPixiAppInit(callback: (app: PIXI.Application) => void): void {
  if (pixiApp) {
    // 如果 app 已经初始化，立即调用回调
    callback(pixiApp);
  } else {
    // 否则添加到回调列表
    initCallbacks.push(callback);
  }
}

/**
 * 设置 Pixi Application 实例
 * @param app PIXI.Application 实例或 null
 */
export function setPixiApp(app: PIXI.Application | null): void {
  pixiApp = app;

  if (!app) {
    // 如果 app 被设置为 null，清空回调列表
    initCallbacks.length = 0;
    return;
  }

  // 当 app 设置后，调用所有注册的回调
  if (app) {
    initCallbacks.forEach((callback) => {
      callback(app);
    });
    // 清空回调列表（只调用一次）
    initCallbacks.length = 0;
  }
}

/**
 * 获取 Pixi Application 实例
 * @returns PIXI.Application 实例，如果未初始化则返回 null
 */
export function getPixiApp(): PIXI.Application | null {
  return pixiApp;
}
