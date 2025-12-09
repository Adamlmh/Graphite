// 面板定位工具
export { calculatePanelPosition } from './panelPositioning';
export type { PanelPosition } from './panelPositioning';

/**
 * 节流函数 - 在指定时间内只执行一次函数
 * @param func 要节流的函数
 * @param wait 等待时间（毫秒）
 * @returns 节流后的函数
 */
export const throttle = <T extends (...args: unknown[]) => unknown>(
  func: T,
  wait: number,
): ((...args: Parameters<T>) => void) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  let lastTime = 0;

  return function (this: unknown, ...args: Parameters<T>) {
    const now = Date.now();
    const remaining = wait - (now - lastTime);

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout);
        timeout = null;
      }
      lastTime = now;
      func.apply(this, args);
    } else if (!timeout) {
      timeout = setTimeout(() => {
        lastTime = Date.now();
        timeout = null;
        func.apply(this, args);
      }, remaining);
    }
  };
};

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
