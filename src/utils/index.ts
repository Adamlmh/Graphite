// 面板定位工具
export { calculatePanelPosition } from './panelPositioning';
export type { PanelPosition } from './panelPositioning';

// 文本测量工具
export { measurePlainText, measureRichText, calculateTextElementSize } from './textMeasurement';

/**
 * 防抖函数
 * @param func 需要防抖的函数
 * @param wait 等待时间（毫秒）
 * @returns 防抖后的函数
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (this: any, ...args: Parameters<T>) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const context = this;

    if (timeout) {
      clearTimeout(timeout);
    }

    timeout = setTimeout(() => {
      func.apply(context, args);
      timeout = null;
    }, wait);
  };
}

/**
 * 节流函数
 * @param func 需要节流的函数
 * @param wait 等待时间（毫秒）
 * @returns 节流后的函数
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let previous = 0;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (this: any, ...args: Parameters<T>) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const context = this;
    const now = Date.now();

    if (!previous) previous = now;

    const remaining = wait - (now - previous);

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      previous = now;
      func.apply(context, args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        previous = Date.now();
        timeout = null;
        func.apply(context, args);
      }, remaining);
    }
  };
}

// 示例：工具函数 - dateUtils
// 日期格式化工具
// export const formatDate = (date: Date, format: string = 'YYYY-MM-DD'): string => {
//   const year = date.getFullYear();
//   const month = String(date.getMonth() + 1).padStart(2, '0');
//   const day = String(date.getDate()).padStart(2, '0');

//   switch (format) {
//     case 'YYYY-MM-DD':
//       return `${year}-${month}-${day}`;
//     case 'DD/MM/YYYY':
//       return `${day}/${month}/${year}`;
//     case 'MM/DD/YYYY':
//       return `${month}/${day}/${year}`;
//     default:
//       return date.toLocaleDateString();
//   }
// };

// export const formatRelativeTime = (date: Date): string => {
//   const now = new Date();
//   const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

//   if (diffInSeconds < 60) return '刚刚';
//   if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}分钟前`;
//   if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}小时前`;
//   if (diffInSeconds < 2592000) return `${Math.floor(diffInSeconds / 86400)}天前`;

//   return formatDate(date);
// };

// 字符串工具
// export const capitalize = (str: string): string => {
//   return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
// };

// export const truncate = (str: string, length: number): string => {
//   return str.length > length ? str.slice(0, length) + '...' : str;
// };

// 数组工具
// export const unique = <T>(array: T[]): T[] => {
//   return [...new Set(array)];
// };

// export const groupBy = <T, K extends keyof any>(
//   array: T[],
//   key: (item: T) => K
// ): Record<K, T[]> => {
//   return array.reduce((groups, item) => {
//     const groupKey = key(item);
//     if (!groups[groupKey]) {
//       groups[groupKey] = [];
//     }
//     groups[groupKey].push(item);
//     return groups;
//   }, {} as Record<K, T[]>);
// };

// 测试 可以删掉的代码 示例
export const addNumbers = (a: number, b: number): number => {
  return a + b; // 修复：确保返回类型匹配
};

// 正确的变量使用
export const getUndefinedValue = (): string => {
  const undefinedVariable = 'some value'; // 修复：正确定义变量
  return undefinedVariable;
};
