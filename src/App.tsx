import './lib/DOMEventBridge';
import './App.css';
import ShapeProperties from './components/ui/business/Propertities/ShapeProperties/ShapeProperties';
import TextProperties from './components/ui/business/Propertities/TextProperties/TextProperties';
import ImageProperties from './components/ui/business/Propertities/ImageProperties/ImageProperties';
import ToolBar from './components/ui/business/ToolBar/ToolBar';
import FloatingPanel from './components/ui/layout/FloatingPanel/FloatingPanel';
import { useState, useMemo } from 'react';
import type { Element } from './types/index'; // 请根据实际路径调整

//以下为测试
const INITIAL_TIMESTAMP = Date.now();

function App() {
  // 使用 useMemo 缓存测试元素，避免每次渲染都重新创建
  const testElements = useMemo(() => {
    const now = INITIAL_TIMESTAMP;

    // 创建测试用的矩形元素
    const mockRectElement: Element = {
      id: 'rect-1',
      type: 'rect',
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      rotation: 0,
      style: {
        fill: '#ff0000',
        fillOpacity: 0.8,
        stroke: '#000000',
        strokeWidth: 2,
        strokeOpacity: 1,
        borderRadius: 8, // 矩形特有属性
      },
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
    };

    // 创建测试用的圆形元素
    const mockCircleElement: Element = {
      id: 'circle-1',
      type: 'circle',
      x: 200,
      y: 200,
      width: 100,
      height: 100,
      rotation: 0,
      style: {
        fill: '#00ff00',
        fillOpacity: 0.6,
        stroke: '#ffffff',
        strokeWidth: 3,
        strokeOpacity: 0.9,
      },
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
    };

    // 创建测试用的三角形元素
    const mockTriangleElement: Element = {
      id: 'triangle-1',
      type: 'triangle',
      x: 300,
      y: 300,
      width: 120,
      height: 100,
      rotation: 0,
      style: {
        fill: '#0000ff',
        fillOpacity: 0.7,
        stroke: '#ffff00',
        strokeWidth: 1,
        strokeOpacity: 0.8,
      },
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
    };

    // 创建测试用的文本元素
    const mockTextElement: Element = {
      id: 'text-1',
      type: 'text',
      x: 150,
      y: 150,
      width: 100,
      height: 30,
      rotation: 0,
      style: {
        fill: '#000000',
        fillOpacity: 1,
        stroke: '#ffffff',
        strokeWidth: 0,
        strokeOpacity: 1,
      },
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
      content: 'Test Text',
      textStyle: {
        fontFamily: 'Arial',
        fontSize: 14,
        fontWeight: 'normal',
        fontStyle: 'normal',
        textDecoration: 'none',
        textAlign: 'left',
        lineHeight: 1.2,
        color: '#000000',
        backgroundColor: '#ffffff',
      },
    };

    // 创建测试用的图片元素
    const mockImageElement: Element = {
      id: 'image-1',
      type: 'image',
      x: 250,
      y: 250,
      width: 200,
      height: 150,
      rotation: 0,
      style: {
        fill: '#ffffff',
        fillOpacity: 1,
        stroke: '#000000',
        strokeWidth: 1,
        strokeOpacity: 0.5,
      },
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
      src: 'https://example.com/image.jpg',
      naturalWidth: 800,
      naturalHeight: 600,
      adjustments: {
        brightness: 100,
        contrast: 100,
        saturation: 100,
        temperature: 6500,
        blur: 0,
      },
    };

    // 创建测试用的组合元素
    const mockGroupElement: Element = {
      id: 'group-1',
      type: 'group',
      x: 400,
      y: 400,
      width: 300,
      height: 200,
      rotation: 0,
      style: {
        fill: '#f0f0f0',
        fillOpacity: 0.5,
        stroke: '#999999',
        strokeWidth: 1,
        strokeOpacity: 0.8,
      },
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
      children: ['rect-1', 'circle-1'],
    };

    // 创建多个矩形元素用于测试多选
    const multipleRectElements: Element[] = [
      mockRectElement,
      {
        ...mockRectElement,
        id: 'rect-2',
        x: 400,
        y: 400,
        style: {
          ...mockRectElement.style,
          fill: '#00ffff',
          stroke: '#ff00ff',
        },
      },
    ];

    // 创建多个文本元素用于测试多选
    const multipleTextElements: Element[] = [
      mockTextElement,
      {
        ...mockTextElement,
        id: 'text-2',
        x: 250,
        y: 250,
        textStyle: {
          ...mockTextElement.textStyle,
          fontSize: 18,
          color: '#ff0000',
        },
      },
    ];

    // 创建多个图片元素用于测试多选
    const multipleImageElements: Element[] = [
      mockImageElement,
      {
        ...mockImageElement,
        id: 'image-2',
        x: 450,
        y: 450,
        adjustments: {
          brightness: 120,
          contrast: 80,
          saturation: mockImageElement.adjustments?.saturation ?? 100,
          temperature: mockImageElement.adjustments?.temperature ?? 6500,
          blur: mockImageElement.adjustments?.blur ?? 0,
        },
      },
    ];

    return {
      mockRectElement,
      mockCircleElement,
      mockTriangleElement,
      mockTextElement,
      mockImageElement,
      mockGroupElement,
      multipleRectElements,
      multipleTextElements,
      multipleImageElements,
    };
  }, []); // 空依赖数组，确保只创建一次

  // 状态管理
  const [selectedElements, setSelectedElements] = useState<Element[]>([]);
  const [activePanel, setActivePanel] = useState<'shape' | 'text' | 'image' | 'none'>('none');
  const [isPanelVisible, setIsPanelVisible] = useState(false);

  const sanitizedSelection = useMemo(
    () => selectedElements.filter((element): element is Element => Boolean(element?.type)),
    [selectedElements],
  );

  const primaryElement = sanitizedSelection[0];

  const updateSelection = (panel: 'shape' | 'text' | 'image', elements: Element[]) => {
    const filtered = elements.filter((item): item is Element => Boolean(item?.type));
    setSelectedElements(filtered);
    setActivePanel(filtered.length ? panel : 'none');
    setIsPanelVisible(filtered.length > 0);
  };

  const handleHidePanel = () => {
    setActivePanel('none');
    setSelectedElements([]);
    setIsPanelVisible(false);
  };

  // 处理样式变化的回调函数
  const handleStyleChange = (elementId: string, newStyle: Element['style']) => {
    console.log('Style changed for element:', elementId, newStyle);
  };

  const handleGroupStyleChange = (
    elementId: string,
    newStyle: Element['style'],
    applyToChildren: boolean,
  ) => {
    console.log('Group style changed for element:', elementId, newStyle, applyToChildren);
  };

  // 根据当前活动面板渲染对应的属性组件
  const renderActivePanel = () => {
    if (!isPanelVisible || !sanitizedSelection.length || activePanel === 'none') {
      return null;
    }

    const effectiveElements = sanitizedSelection;

    switch (activePanel) {
      case 'shape':
        return (
          <ShapeProperties
            element={primaryElement}
            elements={effectiveElements}
            onChange={handleStyleChange}
            onGroupStyleChange={handleGroupStyleChange}
          />
        );
      case 'text':
        return (
          <TextProperties
            element={primaryElement}
            elements={effectiveElements}
            onChange={handleStyleChange}
            onGroupStyleChange={handleGroupStyleChange}
          />
        );
      case 'image':
        return (
          <ImageProperties
            selectedElements={effectiveElements}
            onChange={handleStyleChange}
            onGroupStyleChange={handleGroupStyleChange}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div>
      <header>
        <ToolBar />
      </header>
      <main>
        <aside>
          {/* 测试模式选择控件 */}
          <div style={{ padding: '10px', backgroundColor: '#f0f0f0', marginBottom: '10px' }}>
            <h4>测试模式:</h4>

            {/* 图形元素测试按钮 */}
            <div style={{ marginBottom: '5px' }}>
              <strong>图形元素:</strong>
              <button
                onClick={() => {
                  updateSelection('shape', [testElements.mockRectElement]);
                }}
                style={{ margin: '2px', padding: '4px 8px', fontSize: '12px' }}
              >
                矩形
              </button>
              <button
                onClick={() => {
                  updateSelection('shape', [testElements.mockCircleElement]);
                }}
                style={{ margin: '2px', padding: '4px 8px', fontSize: '12px' }}
              >
                圆形
              </button>
              <button
                onClick={() => {
                  updateSelection('shape', [testElements.mockTriangleElement]);
                }}
                style={{ margin: '2px', padding: '4px 8px', fontSize: '12px' }}
              >
                三角形
              </button>
              <button
                onClick={() => {
                  updateSelection('shape', testElements.multipleRectElements);
                }}
                style={{ margin: '2px', padding: '4px 8px', fontSize: '12px' }}
              >
                多选矩形
              </button>
            </div>

            {/* 文本元素测试按钮 */}
            <div style={{ marginBottom: '5px' }}>
              <strong>文本元素:</strong>
              <button
                onClick={() => {
                  updateSelection('text', [testElements.mockTextElement]);
                }}
                style={{ margin: '2px', padding: '4px 8px', fontSize: '12px' }}
              >
                单个文本
              </button>
              <button
                onClick={() => {
                  updateSelection('text', testElements.multipleTextElements);
                }}
                style={{ margin: '2px', padding: '4px 8px', fontSize: '12px' }}
              >
                多选文本
              </button>
            </div>

            {/* 图片元素测试按钮 */}
            <div style={{ marginBottom: '5px' }}>
              <strong>图片元素:</strong>
              <button
                onClick={() => {
                  updateSelection('image', [testElements.mockImageElement]);
                }}
                style={{ margin: '2px', padding: '4px 8px', fontSize: '12px' }}
              >
                单个图片
              </button>
              <button
                onClick={() => {
                  updateSelection('image', testElements.multipleImageElements);
                }}
                style={{ margin: '2px', padding: '4px 8px', fontSize: '12px' }}
              >
                多选图片
              </button>
            </div>

            {/* 隐藏面板按钮 */}
            <div>
              <button
                onClick={() => {
                  handleHidePanel();
                }}
                style={{ margin: '2px', padding: '4px 8px', fontSize: '12px' }}
              >
                隐藏面板
              </button>
            </div>
          </div>

          {/* 属性面板 */}
          {isPanelVisible && (
            <FloatingPanel position={{ top: 280, right: 0 }}>
              <p>
                {activePanel === 'shape' && '图形属性栏'}
                {activePanel === 'text' && '文本属性栏'}
                {activePanel === 'image' && '图片属性栏'}
              </p>
              {renderActivePanel()}
            </FloatingPanel>
          )}

          {/* 显示面板状态提示 */}
          {!isPanelVisible && (
            <div
              style={{
                position: 'fixed',
                top: '280px',
                right: '0',
                padding: '10px',
                backgroundColor: '#f0f0f0',
                border: '1px solid #ccc',
              }}
            >
              <p>属性栏已隐藏</p>
              <button
                onClick={() => setIsPanelVisible(true)}
                style={{ padding: '4px 8px', fontSize: '12px' }}
              >
                显示面板
              </button>
            </div>
          )}
        </aside>
      </main>
    </div>
  );
}

export default App;
