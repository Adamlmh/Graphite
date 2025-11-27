// store/canvas-store.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Element, Tool, ViewportState, ToolState, Point } from '../types/index';
export interface CanvasState {
  // === 核心数据状态 ===

  /**
   * 所有元素字典，key为元素ID，value为元素对象
   * 使用 Record 结构便于快速查找，业务层负责复杂操作
   * 对应【P0】元素管理需求
   */
  elements: Record<string, Element>;

  /**
   * 当前选中的元素ID数组
   * 状态层只存储ID，业务层负责选择逻辑
   * 对应【P0】选区功能需求
   */
  selectedElementIds: string[];

  /**
   * 视口状态，控制画布显示区域
   * 包含缩放、偏移、画布尺寸等基础信息
   * 对应【P0】无限画布需求
   */
  viewport: ViewportState;

  /**
   * 工具状态，管理当前激活的工具
   * 业务层负责工具的具体交互逻辑
   * 对应【P0】各种交互工具需求
   */
  tool: ToolState;

  // === 派生状态（纯计算，无副作用）===

  /**
   * 获取当前选中的元素对象数组
   * 示例用法：const selected = useCanvasStore(state => state.selectedElements);
   * 业务层无需手动映射 ID 到对象
   */
  get selectedElements(): Element[];

  /**
   * 获取所有元素的数组形式，便于遍历
   * 示例用法：const allElements = useCanvasStore(state => state.elementList);
   * 业务层无需调用 Object.values
   */
  get elementList(): Element[];

  // === 基本数据操作 ===

  /**
   * 添加新元素到画布
   * 示例用法：store.addElement(newElement);
   * 注意：业务层负责创建完整的元素对象
   */
  addElement: (element: Element) => void;

  /**
   * 更新元素属性
   * 示例用法：store.updateElement('el1', { x: 100, y: 100 });
   * 注意：业务层负责验证和计算新值
   */
  updateElement: (id: string, updates: Partial<Element>) => void;

  /**
   * 删除元素
   * 示例用法：store.deleteElement('el1');
   * 会自动从选中列表中移除该元素
   */
  deleteElement: (id: string) => void;

  /**
   * 批量更新多个元素
   * 示例用法：store.updateElements([
   *   { id: 'el1', updates: { x: 100 } },
   *   { id: 'el2', updates: { y: 200 } }
   * ]);
   * 用于性能优化，避免多次渲染
   */
  updateElements: (updates: Array<{ id: string; updates: Partial<Element> }>) => void;

  // === 选择操作 ===

  /**
   * 设置选中的元素
   * 示例用法：store.setSelectedElements(['el1', 'el2']);
   * 业务层负责选择逻辑（点击、框选等）
   */
  setSelectedElements: (ids: string[]) => void;

  /**
   * 清空选择
   * 示例用法：store.clearSelection();
   * 用户点击画布空白处时调用
   */
  clearSelection: () => void;

  // === 视口操作 ===

  /**
   * 更新视口状态
   * 示例用法：store.setViewport({ zoom: 1.5, offset: { x: 100, y: 50 } });
   * 业务层负责计算新的视口参数
   */
  setViewport: (updates: Partial<ViewportState>) => void;

  // === 工具操作 ===

  /**
   * 切换工具
   * 示例用法：store.setTool('rect');
   * 业务层负责工具切换的副作用（如清除临时状态）
   */
  setTool: (tool: Tool) => void;

  /**
   * 更新绘制状态
   * 示例用法：store.setDrawingState(true, startPoint, currentPoint);
   * 用于工具绘制过程中的实时预览
   */
  setDrawingState: (drawing: boolean, startPoint?: Point, currentPoint?: Point) => void;

  // === 状态管理 ===

  /**
   * 加载完整画布状态（持久化恢复）
   * 示例用法：store.loadState(savedState);
   * 主要用于页面刷新后恢复数据
   */
  loadState: (state: Partial<CanvasState>) => void;

  /**
   * 清空画布
   * 示例用法：store.clearCanvas();
   * 重置为初始状态
   */
  clearCanvas: () => void;
}

/**
 * 画布状态管理 Store
 *
 * 🎯 设计原则：
 * 1. 只负责数据存储和简单更新
 * 2. 业务逻辑放在对应的 Service 中
 * 3. 派生状态保持纯函数特性
 *
 * 📚 业务层使用示例：
 *
 * // 创建元素
 * const element = ElementService.createRectangle(100, 100, 200, 150);
 * useCanvasStore.getState().addElement(element);
 *
 * // 移动元素
 * const delta = { x: 10, y: 20 };
 * useCanvasStore.getState().updateElement('el1', {
 *   x: currentX + delta.x,
 *   y: currentY + delta.y
 * });
 *
 * // 批量操作
 * const updates = selectedIds.map(id => ({
 *   id,
 *   updates: { opacity: 0.5 }
 * }));
 * useCanvasStore.getState().updateElements(updates);
 *
 * // 响应状态变化
 * const elements = useCanvasStore(state => state.elementList);
 * const selected = useCanvasStore(state => state.selectedElements);
 */
export const useCanvasStore = create<CanvasState>()(
  immer((set, get) => ({
    // === 初始状态 ===
    elements: {},
    selectedElementIds: [],
    viewport: {
      zoom: 1,
      offset: { x: 0, y: 0 },
      canvasSize: { width: 3000, height: 2000 },
      contentBounds: { x: 0, y: 0, width: 3000, height: 2000 },
      snapping: {
        enabled: true,
        guidelines: [],
        threshold: 5,
        showGuidelines: true,
        snapToElements: true,
        snapToCanvas: true,
      },
    },
    tool: {
      activeTool: 'select',
      drawing: false,
      isCreating: false,
    },

    // === 派生状态实现 ===
    get selectedElements() {
      const state = get();
      return state.selectedElementIds.map((id) => state.elements[id]).filter(Boolean);
    },

    get elementList() {
      return Object.values(get().elements);
    },

    // === 基本操作实现 ===

    addElement: (element) =>
      set((state) => {
        // 🎯 简单存储，业务层负责创建完整元素
        state.elements[element.id] = element;
      }),

    updateElement: (id, updates) =>
      set((state) => {
        // 🎯 简单合并更新，业务层负责验证
        const element = state.elements[id];
        if (element) {
          Object.assign(element, updates);
        }
      }),

    deleteElement: (id) =>
      set((state) => {
        // 🎯 删除元素并清理选中状态
        delete state.elements[id];
        state.selectedElementIds = state.selectedElementIds.filter((elId: string) => elId !== id);
      }),

    updateElements: (updates) =>
      set((state) => {
        // 🎯 批量更新，优化性能
        updates.forEach(({ id, updates }) => {
          const element = state.elements[id];
          if (element) {
            Object.assign(element, updates);
          }
        });
      }),

    setSelectedElements: (ids) =>
      set((state) => {
        // 🎯 简单设置选中ID，业务层负责选择逻辑
        state.selectedElementIds = ids;
      }),

    clearSelection: () =>
      set((state) => {
        state.selectedElementIds = [];
      }),

    setViewport: (updates) =>
      set((state) => {
        // 🎯 合并视口更新，业务层负责计算新值
        Object.assign(state.viewport, updates);
      }),

    setTool: (tool) =>
      set((state) => {
        // 🎯 切换工具，重置相关状态
        state.tool.activeTool = tool;
        state.tool.drawing = false;
        state.tool.isCreating = false;
      }),

    setDrawingState: (drawing, startPoint, currentPoint) =>
      set((state) => {
        // 🎯 更新绘制状态，用于实时预览
        state.tool.drawing = drawing;
        if (startPoint) state.tool.startPoint = startPoint;
        if (currentPoint) state.tool.currentPoint = currentPoint;
      }),

    loadState: (newState) =>
      set((state) => {
        // 🎯 完整状态恢复，用于持久化
        Object.assign(state, newState);
      }),

    clearCanvas: () =>
      set((state) => {
        // 🎯 重置画布状态
        state.elements = {};
        state.selectedElementIds = [];
        state.viewport = {
          zoom: 1,
          offset: { x: 0, y: 0 },
          canvasSize: { width: 3000, height: 2000 },
          contentBounds: { x: 0, y: 0, width: 3000, height: 2000 },
          snapping: {
            enabled: true,
            guidelines: [],
            threshold: 5,
            showGuidelines: true,
            snapToElements: true,
            snapToCanvas: true,
          },
        };
        state.tool = {
          activeTool: 'select',
          drawing: false,
          isCreating: false,
        };
      }),
  })),
);

// === 业务层使用示例文件：services/element-creation-service.ts ===
/**
 * 元素创建服务 - 业务层示例
 *
 * 示例用法：
 *
 * // 创建矩形
 * const rect = ElementCreationService.createRectangle(100, 100, 200, 150);
 * useCanvasStore.getState().addElement(rect);
 * useCanvasStore.getState().setSelectedElements([rect.id]);
 *
 * // 移动元素
 * ElementCreationService.moveElements(selectedIds, { x: 10, y: 20 });
 *
 * // 批量更新样式
 * ElementCreationService.updateElementsStyle(selectedIds, { fill: '#ff0000' });
 */

// === React 组件使用示例：components/CanvasComponent.tsx ===
/**
 * 画布组件 - React 使用示例
 *
 * const CanvasComponent: React.FC = () => {
 *   // 获取需要的状态
 *   const elements = useCanvasStore(state => state.elementList);
 *   const selectedIds = useCanvasStore(state => state.selectedElementIds);
 *   const viewport = useCanvasStore(state => state.viewport);
 *
 *   // 获取操作函数
 *   const setSelectedElements = useCanvasStore(state => state.setSelectedElements);
 *   const updateElement = useCanvasStore(state => state.updateElement);
 *
 *   // 业务逻辑处理
 *   const handleElementClick = (elementId: string) => {
 *     setSelectedElements([elementId]);
 *   };
 *
 *   const handleElementMove = (elementId: string, newPosition: Point) => {
 *     updateElement(elementId, { x: newPosition.x, y: newPosition.y });
 *   };
 *
 *   return (
 *     <div>
 *       {/* 渲染逻辑 * /}
 *     </div>
 *   );
 * };
 */
