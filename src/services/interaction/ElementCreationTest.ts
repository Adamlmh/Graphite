// services/element-creation-service.ts
// import { ElementFactory } from '../element-factory';
// import type { Element, ElementType } from '../../types/index';
import { useCanvasStore } from '../../stores/canvas-store';

/**
 * 测试元素创建和添加到store
 */
export function testElementCreation(): void {
  // 1. 创建测试元素
  // const testElement = ElementFactory.createElement(
  //   'rect',
  //   300, // x
  //   500, // y
  //   300, // width
  //   550, // height
  //   {
  //     style: {
  //       fill: '#3498db',
  //       stroke: '#2980b9',
  //       strokeWidth: 2,
  //       fillOpacity: 1,
  //       strokeOpacity: 1,
  //     },
  //   },
  // );

  // console.log('✅ 元素创建成功:', testElement);

  // 2. 添加到 store
  // useCanvasStore.getState().addElement(testElement);

  // 3. 验证是否添加成功
  const storeState = useCanvasStore.getState();
  // const addedElement = storeState.elements[testElement.id];

  // console.log('✅ 元素成功添加到 Store:', addedElement);
  console.log('📊 Store 中元素数量:', Object.keys(storeState.elements).length);
  // console.log('🆔 添加的元素ID:', testElement.id);
  // console.log('📐 元素尺寸:', `${addedElement.width} x ${addedElement.height}`);
}

/**
 * 批量测试多种元素类型
 */
// export function testMultipleElements(): void {
//   console.group('🧪 测试多种元素类型创建');

//   const elementTypes = ['rect', 'circle', 'triangle', 'text'] as const;

//   elementTypes.forEach((type, index) => {
//     try {
//       const element = ElementFactory.createElement(
//         type,
//         50 + index * 250, // 水平排列
//         100,
//         150,
//         100,
//         type === 'text' ? { content: `测试文本 ${index + 1}` } : undefined
//       );

//       useCanvasStore.getState().addElement(element);
//       console.log(`✅ ${type} 元素创建并添加成功:`, element.id);

//     } catch (error) {
//       console.error(`❌ ${type} 元素创建失败:`, error);
//     }
//   });

//   // 验证总数
//   const elementCount = Object.keys(useCanvasStore.getState().elements).length;
//   console.log(`📊 总共添加了 ${elementCount} 个元素`);

//   console.groupEnd();
// }

// /**
//  * 清理测试数据
//  */
// export function clearTestData(): void {
//   useCanvasStore.getState().clearCanvas();
//   console.log('🧹 已清理所有测试数据');
// }

// /**
//  * 查看当前 store 状态
//  */
// export function inspectStore(): void {
//   const state = useCanvasStore.getState();
//   console.group('🔍 Store 状态检查');
//   console.log('元素数量:', Object.keys(state.elements).length);
//   console.log('所有元素:', state.elements);
//   console.log('选中元素:', state.selectedElementIds);
//   console.log('当前工具:', state.tool.activeTool);
//   console.log('视口状态:', state.viewport);
//   console.groupEnd();
// }
