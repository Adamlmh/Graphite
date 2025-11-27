// === 基础类型定义 ===

/** 二维坐标点，用于表示位置 */
export interface Point {
  x: number; // X坐标
  y: number; // Y坐标
}

/** 元素尺寸，用于表示宽度和高度 */
interface Size {
  width: number; // 宽度
  height: number; // 高度
}

/** 边界框，用于碰撞检测和空间计算（不存储，实时计算） */
interface Bounds {
  x: number; // 左上角X坐标
  y: number; // 左上角Y坐标
  width: number; // 边界框宽度
  height: number; // 边界框高度
}

/** 元素类型枚举，支持6种基础元素 */
export type ElementType = 'rect' | 'circle' | 'triangle' | 'text' | 'image' | 'group';

/** 工具类型，支持常见绘制工具 */
export type Tool =
  | 'select'
  | 'hand'
  | 'rect'
  | 'rounded-rect'
  | 'circle'
  | 'triangle'
  | 'text'
  | 'image';

// === 样式系统 ===

/** 基础元素样式，所有元素共享 */
export interface BaseElementStyle {
  // 填充样式 - 对应【P0】背景色需求
  fill: string; // 填充颜色（十六进制/RGB）
  fillOpacity: number; // 填充透明度（0-1）

  // 描边样式 - 对应【P0】边框需求
  stroke: string; // 边框颜色
  strokeWidth: number; // 边框宽度（像素）
  strokeOpacity: number; // 边框透明度（0-1）
}

/** 矩形元素样式 - 扩展圆角属性 */
export interface RectElementStyle extends BaseElementStyle {
  borderRadius?: number; // 圆角半径（像素）- 矩形特有
}
/** 文本装饰类型，支持组合样式 */
export type TextDecoration = 'none' | 'underline' | 'line-through' | 'underline line-through';

/** 文本样式 - 对应【P0】富文本属性需求 */
export interface TextStyle {
  // 字体属性
  fontFamily: string; // 字体家族
  fontSize: number; // 字号大小
  fontWeight: 'normal' | 'bold'; // 字重（B：加粗）
  fontStyle: 'normal' | 'italic'; // 字体样式（I：斜体）
  textDecoration: TextDecoration; // 文本装饰（U：下划线，S：删除线）

  // 布局属性
  textAlign: 'left' | 'center' | 'right'; // 文本对齐
  lineHeight: number; // 行高倍数
  color: string; // 文字颜色
  backgroundColor?: string; // 文字背景色
}

/** 富文本片段 - 对应【P0】局部文本样式挑战需求 */
interface RichTextSpan {
  start: number; // 起始位置
  end: number; // 结束位置
  style: Partial<TextStyle>; // 局部样式覆盖
}

// === 条件类型定义 ===

/** 根据元素类型映射对应的样式类型 */
export type ElementStyle<T extends ElementType> = T extends 'rect'
  ? RectElementStyle
  : BaseElementStyle;

/** 根据元素类型映射对应的扩展属性 */
export type ElementExtensions<T extends ElementType> = T extends 'text'
  ? TextExtensions
  : T extends 'image'
    ? ImageExtensions
    : T extends 'group'
      ? GroupExtensions
      : object; // 改用object代替{}

// === 元素扩展接口 ===

/** 文本元素扩展属性 */
export interface TextExtensions {
  content: string; // 文本内容
  textStyle: TextStyle; // 文本样式
  richText?: RichTextSpan[]; // 富文本片段

  // 🆕 文本选择范围 - 对应【挑战】局部文本样式需求
  selectionRange?: {
    start: number; // 选择起始位置
    end: number; // 选择结束位置
  };
}

/** 图片元素扩展属性 */
export interface ImageExtensions {
  src: string; // 图片地址（URL或DataURL）
  naturalWidth: number; // 原始宽度（保持宽高比）
  naturalHeight: number; // 原始高度（保持宽高比）

  // 🎯 替换为5种简单实用的调整类型
  adjustments?: {
    brightness: number; // 亮度调整
    contrast: number; // 对比度调整
    saturation: number; // 饱和度调整
    hue: number; // 色相调整
    blur: number; // 模糊效果
  };
  // 图片数值调整 - 对应属性面板滑块
  adjustments?: {
    brightness: number; // 亮度调整
    contrast: number; // 对比度调整
    saturation: number; // 饱和度调整
    temperature: number; // 色温调整
    blur: number; // 模糊调整
  };
}

/** 组合元素扩展属性 */
export interface GroupExtensions {
  children: string[]; // 子元素ID数组（支持嵌套组合）
}

// === 元素数据模型 ===

/** 元素基础接口 - 使用条件类型的泛型设计 */
export type BaseElement<T extends ElementType = ElementType> = {
  // 标识属性
  id: string; // 唯一标识符
  type: T; // 元素类型

  zIndex: number; // 渲染层级（数值越大显示在越上面）

  // 几何属性 - 对应【P0】元素变换需求
  x: number; // X坐标（左上角）
  y: number; // Y坐标（左上角）
  width: number; // 宽度
  height: number; // 高度
  rotation: number; // 旋转角度（度）

  // 🎯 条件类型样式 - 矩形有圆角，其他元素没有
  style: ElementStyle<T>; // 根据元素类型动态样式

  // 通用属性
  opacity: number; // 整体透明度（0-1）

  // 变换系统 - 对应【P0】缩放需求
  transform: {
    scaleX: number; // X轴缩放（1.0 = 100%）
    scaleY: number; // Y轴缩放（1.0 = 100%）
    pivotX: number; // 变换中心X（0-1，相对坐标）
    pivotY: number; // 变换中心Y（0-1，相对坐标）
  };

  // 元数据 - 对应【P0】持久化和【P1】协同编辑
  version: number; // 版本号（乐观锁）
  createdAt: number; // 创建时间戳
  updatedAt: number; // 最后更新时间戳

  // 🆕 性能优化字段 - 对应【P0】性能优化需求
  cacheKey?: string; // 渲染缓存键，避免重复渲染
  visibility: 'visible' | 'hidden'; // 可见性状态，用于虚拟化渲染
  lastRenderedAt?: number; // 最后渲染时间戳，用于脏检查
} & ElementExtensions<T>;

// === 具体元素类型别名 ===

/** 矩形元素 - 自动包含 RectElementStyle */
export type RectElement = BaseElement<'rect'>;

/** 圆形元素 - 使用 BaseElementStyle */
export type CircleElement = BaseElement<'circle'>;

/** 三角形元素 - 使用 BaseElementStyle */
export type TriangleElement = BaseElement<'triangle'>;

/** 文本元素 - 包含 TextExtensions */
export type TextElement = BaseElement<'text'>;

/** 图片元素 - 包含 ImageExtensions */
export type ImageElement = BaseElement<'image'>;

/** 组合元素 - 包含 GroupExtensions */
export type GroupElement = BaseElement<'group'>;

/** 元素联合类型 */
export type Element =
  | RectElement
  | CircleElement
  | TriangleElement
  | TextElement
  | ImageElement
  | GroupElement;

// === 画布状态 ===

/** 视口状态 - 对应【P0】无限画布需求 */
export interface ViewportState {
  // 变换状态
  zoom: number; // 缩放级别（1.0 = 100%）
  offset: Point; // 画布偏移量

  // 边界信息
  canvasSize: Size; // 画布虚拟尺寸（无限画布）
  contentBounds: Bounds; // 内容边界（所有元素的整体边界）

  // 🆕 增强的吸附系统 - 对应【挑战】辅助线功能
  snapping: {
    enabled: boolean; // 是否启用吸附
    guidelines: Guideline[]; // 当前显示的参考线
    threshold: number; // 吸附敏感度（像素）
    showGuidelines: boolean; // 是否显示参考线
    snapToElements: boolean; // 是否吸附到其他元素
    snapToCanvas: boolean; // 是否吸附到画布中心
  };
}

/** 🆕 增强的参考线定义 - 对应【挑战】辅助线功能 */
interface Guideline {
  type: 'horizontal' | 'vertical'; // 水平或垂直参考线
  position: number; // 参考线位置
  source: 'element-edge' | 'element-center' | 'canvas-center' | 'spacing'; // 参考线来源
  elementId?: string; // 关联的元素ID
  targetElementId?: string; // 目标元素ID（用于间距参考线）
  strength: 'strong' | 'weak'; // 吸附强度
  color?: string; // 参考线颜色（视觉区分）
}

// === 工具状态 ===

/** 工具状态 - 对应【P0】各种交互工具需求 */
export interface ToolState {
  activeTool: Tool; // 当前激活的工具

  // 绘制状态
  drawing: boolean; // 是否正在绘制
  startPoint?: Point; // 绘制起点
  currentPoint?: Point; // 当前鼠标位置

  // 🆕 工具特定状态
  tempElement?: Element; // 临时元素（绘制预览）
  isCreating: boolean; // 是否正在创建元素
}

// === 应用状态 ===

/** 完整的画布应用状态 */
export interface CanvasState {
  elements: Record<string, Element>; // 所有元素（ID映射）
  selectedElementIds: string[]; // 选中元素ID数组
  viewport: ViewportState; // 视口状态
  tool: ToolState; // 工具状态

  // 🆕 性能优化状态
  renderCache: Map<string, string>; // 渲染缓存
  visibleElements: string[]; // 视口内可见元素ID（虚拟化）

  // 派生状态
  get selectedElements(): Element[]; // 选中元素数组（计算属性）
  get elementList(): Element[]; // 元素列表（计算属性）
}

// === 类型工具函数 ===

/** 类型守卫：判断元素是否为矩形 */
export const isRectElement = (element: Element): element is RectElement => element.type === 'rect';

/** 类型守卫：判断元素是否为文本 */
export const isTextElement = (element: Element): element is TextElement => element.type === 'text';

export const isImageElement = (element: Element): element is ImageElement =>
  element.type === 'image';
