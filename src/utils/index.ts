// 面板定位工具
export { calculatePanelPosition } from './panelPositioning';
export type { PanelPosition } from './panelPositioning';

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
