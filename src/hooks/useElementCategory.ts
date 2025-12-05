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

// 获取多个元素的公共样式/或者单个元素样式
export const useCommonStyle = (elements: Element[]) => {
  return useMemo(() => {
    if (elements.length === 0) {
      return {};
    }

    const firstElementStyle = elements[0].style;
    if (!firstElementStyle) {
      return {};
    }

    // 如果只有一个元素，直接返回其样式
    if (elements.length === 1) {
      return { ...firstElementStyle };
    }

    const styleKeys = Object.keys(firstElementStyle) as Array<keyof Element['style']>;
    const commonStyle = styleKeys.reduce<Record<string, unknown>>((acc, key) => {
      const firstValue = firstElementStyle[key];
      const isCommon = elements.every((element) => {
        const style = element.style;
        return style && style[key] === firstValue;
      });

      if (isCommon) {
        acc[key as string] = firstValue;
      }
      return acc;
    }, {});

    return commonStyle as Partial<Element['style']>;
  }, [elements]);
};

export type StyleChangeHandlers = {
  onChange?: (elementId: string, updates: Partial<Element>) => void;

  //处理打组
  onGroupStyleChange?: (
    elementId: string,
    updates: Partial<Element>,
    applyToChildren: boolean,
  ) => void;
  applyToChildren?: boolean;
};

export const useElementStyleUpdater = (
  elements: Element[],
  elementCount: number,
  handlers: StyleChangeHandlers = {},
) => {
  const { onChange, onGroupStyleChange, applyToChildren = true } = handlers;

  return useCallback(
    (patch: Partial<Element['style']>) => {
      if (!elements.length || !patch || Object.keys(patch).length === 0) {
        return;
      }

      const mergeStyle = (element: Element) =>
        ({
          ...element.style,
          ...patch,
        }) as Element['style'];

      if (elementCount > 1) {
        if (!onChange) {
          return;
        }

        elements.forEach((element) => {
          const nextStyle = mergeStyle(element);
          if (element.type === 'group' && onGroupStyleChange) {
            onGroupStyleChange(element.id, { style: nextStyle }, applyToChildren);
          } else {
            onChange(element.id, { style: nextStyle });
          }
        });
        return;
      }

      //处理单个元素
      const [singleElement] = elements;
      if (!singleElement) {
        return;
      }

      const nextStyle = mergeStyle(singleElement);

      onChange?.(singleElement.id, { style: nextStyle });
    },
    [elementCount, elements, onChange, onGroupStyleChange, applyToChildren],
  );
};

export default useElementCategory;
