import { v4 as uuidv4 } from 'uuid';
import type {
  BaseElement,
  BaseElementStyle,
  CircleElement,
  Element,
  ElementExtensions,
  ElementType,
  GroupElement,
  ImageElement,
  Point,
  RectElement,
  RectElementStyle,
  TextElement,
  TextStyle,
  TriangleElement,
} from '../types/index';
export type { Element } from '../types/index';
export class ElementFactory {
  /**
   * 生成唯一元素ID
   * 使用标准的UUID v4格式，确保全球唯一性
   * 对应【P1】协同编辑和【P0】持久化需求
   *
   * 格式：el_${uuid}
   * 示例：el_123e4567-e89b-12d3-a456-426614174000
   */
  private static generateId(): string {
    return `el_${uuidv4()}`;
  }

  /**
   * 获取当前时间戳
   * 用于创建和更新时间字段
   */
  private static getCurrentTimestamp(): number {
    return Date.now();
  }

  /**
   * 创建基础元素模板
   * 所有元素共享的基础属性和默认值
   */
  public static createBaseElement<T extends ElementType>(
    type: T,
    x: number,
    y: number,
    width: number,
    height: number,
  ): Omit<BaseElement<T>, 'style' | keyof ElementExtensions<T>> {
    const now = this.getCurrentTimestamp();

    return {
      id: this.generateId(),
      type,
      x,
      y,
      width,
      height,
      rotation: 0,
      opacity: 1,
      transform: {
        scaleX: 1,
        scaleY: 1,
        pivotX: 0.5,
        pivotY: 0.5,
      },
      version: 1,
      createdAt: now,
      updatedAt: now,
      visibility: 'visible',
      lastRenderedAt: now,
    } as unknown as Omit<BaseElement<T>, 'style' | keyof ElementExtensions<T>>;
  }

  /**
   * 获取基础样式默认值
   * 对应【P0】背景色、边框等样式需求
   */
  private static getBaseStyleDefaults(): BaseElementStyle {
    return {
      fill: '#ffffff',
      fillOpacity: 1,
      stroke: '#000000',
      strokeWidth: 1,
      strokeOpacity: 1,
    };
  }

  /**
   * 获取矩形样式默认值
   * 包含基础样式和矩形特有的圆角属性
   */
  private static getRectStyleDefaults(): RectElementStyle {
    return {
      ...this.getBaseStyleDefaults(),
      borderRadius: 0,
    };
  }

  /**
   * 获取文本样式默认值
   * 对应【P0】富文本属性需求
   */
  private static getTextStyleDefaults(): TextStyle {
    return {
      fontFamily: 'Arial, sans-serif',
      fontSize: 16,
      fontWeight: 'normal',
      fontStyle: 'normal',
      textDecoration: 'none',
      textAlign: 'left',
      lineHeight: 1.2,
      color: '#000000',
    };
  }

  /**
   * 创建矩形元素
   * 对应【P0】矩形绘制工具需求
   *
   * @param x 左上角X坐标
   * @param y 左上角Y坐标
   * @param width 宽度
   * @param height 高度
   * @param style 可选样式覆盖
   * @returns 完整的矩形元素对象
   */
  static createRectangle(
    x: number,
    y: number,
    width: number,
    height: number,
    style?: Partial<RectElementStyle>,
  ): RectElement {
    const baseElement = this.createBaseElement('rect', x, y, width, height);
    const rectStyle = { ...this.getRectStyleDefaults(), ...style };

    return {
      ...baseElement,
      style: rectStyle,
    } as RectElement;
  }

  /**
   * 创建圆形元素
   * 对应【P0】圆形绘制工具需求
   *
   * @param x 圆心X坐标
   * @param y 圆心Y坐标
   * @param radius 半径
   * @param style 可选样式覆盖
   * @returns 完整的圆形元素对象
   */
  static createCircle(
    x: number,
    y: number,
    radius: number,
    style?: Partial<BaseElementStyle>,
  ): CircleElement {
    const diameter = radius * 2;
    const baseElement = this.createBaseElement(
      'circle',
      x - radius,
      y - radius,
      diameter,
      diameter,
    );
    const circleStyle = { ...this.getBaseStyleDefaults(), ...style };

    return {
      ...baseElement,
      style: circleStyle,
    } as CircleElement;
  }

  /**
   * 创建三角形元素
   * 对应【P0】三角形绘制工具需求
   *
   * @param x 外接矩形左上角X坐标
   * @param y 外接矩形左上角Y坐标
   * @param width 外接矩形宽度
   * @param height 外接矩形高度
   * @param style 可选样式覆盖
   * @returns 完整的三角形元素对象
   */
  static createTriangle(
    x: number,
    y: number,
    width: number,
    height: number,
    style?: Partial<BaseElementStyle>,
  ): TriangleElement {
    const baseElement = this.createBaseElement('triangle', x, y, width, height);
    const triangleStyle = { ...this.getBaseStyleDefaults(), ...style };

    return {
      ...baseElement,
      style: triangleStyle,
    } as TriangleElement;
  }

  /**
   * 创建文本元素
   * 对应【P0】文本工具和富文本属性需求
   *
   * @param x 左上角X坐标
   * @param y 左上角Y坐标
   * @param content 文本内容
   * @param width 可选宽度（自动宽度时为内容宽度）
   * @param height 可选高度（自动高度时为内容高度）
   * @param textStyle 可选文本样式覆盖
   * @param baseStyle 可选基础样式覆盖
   * @returns 完整的文本元素对象
   */
  static createText(
    x: number,
    y: number,
    content: string,
    width?: number,
    height?: number,
    textStyle?: Partial<TextStyle>,
    baseStyle?: Partial<BaseElementStyle>,
  ): TextElement {
    // 计算默认尺寸（基于内容估算）
    const defaultWidth = width || Math.max(content.length * 8, 80);
    const defaultHeight = height || 24;

    const baseElement = this.createBaseElement('text', x, y, defaultWidth, defaultHeight);
    const baseElementStyle = { ...this.getBaseStyleDefaults(), ...baseStyle };
    const finalTextStyle = { ...this.getTextStyleDefaults(), ...textStyle };

    return {
      ...baseElement,
      style: baseElementStyle,
      content,
      textStyle: finalTextStyle,
      richText: [],
    } as TextElement;
  }

  /**
   * 创建图片元素
   * 对应【P0】图片插入和滤镜需求
   *
   * @param x 左上角X坐标
   * @param y 左上角Y坐标
   * @param src 图片地址（URL或DataURL）
   * @param width 显示宽度
   * @param height 显示高度
   * @param naturalWidth 原始宽度（用于保持宽高比）
   * @param naturalHeight 原始高度（用于保持宽高比）
   * @param style 可选样式覆盖
   * @returns 完整的图片元素对象
   */
  static createImage(
    x: number,
    y: number,
    src: string,
    width: number,
    height: number,
    naturalWidth?: number,
    naturalHeight?: number,
    style?: Partial<BaseElementStyle>,
  ): ImageElement {
    const baseElement = this.createBaseElement('image', x, y, width, height);
    const imageStyle = { ...this.getBaseStyleDefaults(), ...style };

    return {
      ...baseElement,
      style: imageStyle,
      src,
      naturalWidth: naturalWidth || width,
      naturalHeight: naturalHeight || height,
    } as ImageElement;
  }

  /**
   * 创建组合元素
   * 对应【P1】组合功能需求
   *
   * @param x 组合左上角X坐标
   * @param y 组合左上角Y坐标
   * @param width 组合宽度
   * @param height 组合高度
   * @param children 子元素ID数组
   * @param style 可选样式覆盖
   * @returns 完整的组合元素对象
   */
  static createGroup(
    x: number,
    y: number,
    width: number,
    height: number,
    children: string[] = [],
    style?: Partial<BaseElementStyle>,
  ): GroupElement {
    const baseElement = this.createBaseElement('group', x, y, width, height);
    const groupStyle = { ...this.getBaseStyleDefaults(), ...style };

    return {
      ...baseElement,
      style: groupStyle,
      children,
    } as GroupElement;
  }

  /**
   * 根据元素类型创建元素（通用工厂方法）
   * 用于工具层统一创建逻辑
   *
   * @param type 元素类型
   * @param x 起始X坐标
   * @param y 起始Y坐标
   * @param width 宽度
   * @param height 高度
   * @param options 类型特定的选项
   * @returns 对应类型的元素对象
   */
  static createElement<T extends ElementType>(
    type: T,
    x: number,
    y: number,
    width: number,
    height: number,
    options?: {
      style?: Partial<BaseElementStyle>;
      content?: string;
      src?: string;
      naturalWidth?: number;
      naturalHeight?: number;
      children?: string[];
      textStyle?: Partial<TextStyle>;
      baseStyle?: Partial<BaseElementStyle>;
    },
  ): Element {
    switch (type) {
      case 'rect':
        return this.createRectangle(x, y, width, height, options?.style);

      case 'circle': {
        const radius = Math.min(width, height) / 2;
        const centerX = x + width / 2;
        const centerY = y + height / 2;
        return this.createCircle(centerX, centerY, radius, options?.style);
      }
      case 'triangle':
        return this.createTriangle(x, y, width, height, options?.style);

      case 'text':
        return this.createText(
          x,
          y,
          options?.content || '文本',
          width,
          height,
          options?.textStyle,
          options?.baseStyle,
        );

      case 'image':
        return this.createImage(
          x,
          y,
          options?.src || '',
          width,
          height,
          options?.naturalWidth,
          options?.naturalHeight,
          options?.style,
        );

      case 'group':
        return this.createGroup(x, y, width, height, options?.children || [], options?.style);

      default:
        throw new Error(`不支持的元素类型: ${type}`);
    }
  }

  /**
   * 批量创建元素
   * 用于初始化画布或批量导入
   *
   * @param elements 元素配置数组
   * @returns 创建的元素对象数组
   */
  static batchCreate(
    elements: Array<{
      type: ElementType;
      x: number;
      y: number;
      width: number;
      height: number;
      options?: {
        style?: Partial<BaseElementStyle>;
        content?: string;
        src?: string;
        naturalWidth?: number;
        naturalHeight?: number;
        children?: string[];
        textStyle?: Partial<TextStyle>;
        baseStyle?: Partial<BaseElementStyle>;
      };
    }>,
  ): Element[] {
    return elements.map((elementConfig) =>
      this.createElement(
        elementConfig.type,
        elementConfig.x,
        elementConfig.y,
        elementConfig.width,
        elementConfig.height,
        elementConfig.options,
      ),
    );
  }

  /**
   * 创建元素模板（用于绘制预览）
   * 对应【P0】工具绘制实时预览需求
   *
   * @param type 元素类型
   * @param startPoint 起始点
   * @param currentPoint 当前点
   * @param options 创建选项
   * @returns 临时元素对象（用于预览）
   */
  static createTempElement(
    type: ElementType,
    startPoint: Point,
    currentPoint: Point,
    options?: {
      style?: Partial<BaseElementStyle>;
      content?: string;
      src?: string;
      naturalWidth?: number;
      naturalHeight?: number;
      children?: string[];
      textStyle?: Partial<TextStyle>;
      baseStyle?: Partial<BaseElementStyle>;
    },
  ): Element {
    const x = Math.min(startPoint.x, currentPoint.x);
    const y = Math.min(startPoint.y, currentPoint.y);
    const width = Math.abs(currentPoint.x - startPoint.x);
    const height = Math.abs(currentPoint.y - startPoint.y);

    // 为临时元素生成特殊ID
    const tempElement = this.createElement(type, x, y, width, height, options);
    tempElement.id = `temp_${tempElement.id}`;

    return tempElement;
  }

  /**
   * 复制元素（深拷贝）
   * 对应【P0】复制粘贴需求
   *
   * @param element 要复制的元素
   * @param offset 位置偏移量（避免完全重叠）
   * @returns 复制的新元素
   */
  static duplicateElement(element: Element, offset: Point = { x: 10, y: 10 }): Element {
    const duplicated = JSON.parse(JSON.stringify(element));

    // 生成新ID
    duplicated.id = this.generateId();

    // 更新位置
    duplicated.x += offset.x;
    duplicated.y += offset.y;

    // 重置时间戳和版本
    const now = this.getCurrentTimestamp();
    duplicated.createdAt = now;
    duplicated.updatedAt = now;
    duplicated.version = 1;

    return duplicated as Element;
  }

  /**
   * 验证元素数据的完整性
   * 用于数据导入和协同编辑的数据校验
   *
   * @param element 要验证的元素
   * @returns 验证结果
   */
  // static validateElement(element: any): { isValid: boolean; errors: string[] } {
  //   const errors: string[] = [];

  //   // 检查必需字段
  //   const requiredFields = ['id', 'type', 'x', 'y', 'width', 'height'];
  //   requiredFields.forEach((field) => {
  //     if (element[field] === undefined) {
  //       errors.push(`缺少必需字段: ${field}`);
  //     }
  //   });

  //   // 检查类型有效性
  //   const validTypes: ElementType[] = ['rect', 'circle', 'triangle', 'text', 'image', 'group'];
  //   if (!validTypes.includes(element.type)) {
  //     errors.push(`无效的元素类型: ${element.type}`);
  //   }

  //   // 检查数值范围
  //   if (element.opacity !== undefined && (element.opacity < 0 || element.opacity > 1)) {
  //     errors.push(`透明度必须在 0-1 范围内: ${element.opacity}`);
  //   }

  //   if (element.rotation !== undefined && (element.rotation < 0 || element.rotation >= 360)) {
  //     errors.push(`旋转角度必须在 0-360 范围内: ${element.rotation}`);
  //   }

  //   return {
  //     isValid: errors.length === 0,
  //     errors,
  //   };
  // }

  /**
   * 标准化元素数据（修复常见问题）
   * 用于数据迁移和兼容性处理
   *
   * @param element 要标准化的元素
   * @returns 标准化后的元素
   */
  // static normalizeElement(element: any): Element {
  //   const normalized = { ...element };

  //   // 确保必需字段存在
  //   if (!normalized.id) normalized.id = this.generateId();
  //   if (!normalized.type) normalized.type = 'rect';

  //   // 确保数值字段有默认值
  //   const defaults = {
  //     x: 0,
  //     y: 0,
  //     width: 100,
  //     height: 100,
  //     rotation: 0,
  //     opacity: 1,
  //     version: 1,
  //     transform: { scaleX: 1, scaleY: 1, pivotX: 0.5, pivotY: 0.5 },
  //     visibility: 'visible' as const,
  //   };

  //   Object.keys(defaults).forEach((key) => {
  //     if (normalized[key] === undefined) {
  //       normalized[key] = (defaults as any)[key];
  //     }
  //   });

  //   // 确保时间戳存在
  //   const now = this.getCurrentTimestamp();
  //   if (!normalized.createdAt) normalized.createdAt = now;
  //   if (!normalized.updatedAt) normalized.updatedAt = now;

  //   return normalized as Element;
  // }
}

// === 导出便捷创建函数 ===

/**
 * 便捷创建函数 - 为常用元素类型提供简化的创建接口
 * 对应业务层的快速创建需求
 */

/** 创建矩形便捷函数 */
export const createRect = (x: number, y: number, width: number, height: number) =>
  ElementFactory.createRectangle(x, y, width, height);

/** 创建圆形便捷函数 */
export const createCircle = (x: number, y: number, radius: number) =>
  ElementFactory.createCircle(x, y, radius);

/** 创建文本便捷函数 */
export const createText = (x: number, y: number, content: string) =>
  ElementFactory.createText(x, y, content);

/** 创建图片便捷函数 */
export const createImage = (x: number, y: number, src: string, width: number, height: number) =>
  ElementFactory.createImage(x, y, src, width, height);

export { ElementFactory as default };
