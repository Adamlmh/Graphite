import { useCallback, useMemo } from 'react';
import type { Element } from '../types/index';
import { isTextElement, isImageElement } from '../types/index';

// 类型判断工具函数
const getElementCategory = (element: Element): 'shape' | 'text' | 'image' | 'group' => {
  // 添加空值检查
  if (!element || typeof element !== 'object') {
    console.warn('getElementCategory: Invalid element received', element);
    return 'shape'; // 默认返回 shape
  }

  if (isTextElement(element)) return 'text';
  if (isImageElement(element)) return 'image';
  if (element.type === 'group') return 'group';
  return 'shape';
};

// 判断多个元素是否属于同一类别
const areElementsSameCategory = (elements: Element[]): boolean => {
  if (!elements || elements.length <= 1) {
    return true;
  }

  // 过滤掉无效元素
  const validElements = elements.filter((element) => element && typeof element === 'object');
  if (validElements.length === 0) {
    return true;
  }

  const firstCategory = getElementCategory(validElements[0]);
  return validElements.every((element) => getElementCategory(element) === firstCategory);
};

export const useElementCategory = (elements: Element[]) => {
  return useMemo(() => {
    // 安全检查
    if (!elements || !Array.isArray(elements) || elements.length === 0) {
      return {
        mainCategory: null,
        shouldShowShapePanel: false,
        shouldShowTextPanel: false,
        shouldShowImagePanel: false,
        elementCount: 0,
      };
    }

    // 过滤无效元素
    const validElements = elements.filter((element) => element && typeof element === 'object');
    if (validElements.length === 0) {
      return {
        mainCategory: null,
        shouldShowShapePanel: false,
        shouldShowTextPanel: false,
        shouldShowImagePanel: false,
        elementCount: 0,
      };
    }

    const mainCategory =
      validElements.length === 1
        ? getElementCategory(validElements[0])
        : areElementsSameCategory(validElements)
          ? getElementCategory(validElements[0]) // 多个元素同类型时，取第一个的类型作为代表
          : null; // 不同类型的返回空值

    const shouldShowShapePanel = mainCategory === 'shape';
    const shouldShowTextPanel = mainCategory === 'text';
    const shouldShowImagePanel = mainCategory === 'image';

    return {
      mainCategory,
      shouldShowShapePanel,
      shouldShowTextPanel,
      shouldShowImagePanel,
      elementCount: validElements.length,
    };
  }, [elements]);
};
export default useElementCategory;
