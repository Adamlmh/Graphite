// utils/idGenerator.ts
/**
 * UUID生成器 - 生成唯一元素ID
 */
export function generateElementId(): string {
  return 'element-' + crypto.randomUUID();
}

/**
 * 临时ID生成器 - 用于绘制预览
 */
export function generateTempId(): string {
  return 'temp-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}
