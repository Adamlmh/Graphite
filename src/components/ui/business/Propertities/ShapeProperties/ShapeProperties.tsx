import React, { useState } from 'react';
import { ColorPicker, Slider } from 'antd';
import FloatingPanel from '../../../layout/FloatingPanel/FloatingPanel';
import styles from './ShapeProperties.module.less';

const ShapeProperties: React.FC = () => {
  const [fillColor, setFillColor] = useState('#ffffff');
  const [borderColor, setBorderColor] = useState('#222222');
  const [borderWidth, setBorderWidth] = useState(2);

  return (
    <FloatingPanel>
      <div className={styles.container}>
        <div className={styles.row}>
          <span className={styles.label}>背景色：</span>
          <div className={styles.control}>
            <ColorPicker value={fillColor} onChange={(_, hex) => setFillColor(hex)} />
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>边框宽度：</span>
          <div className={styles.control}>
            <Slider
              min={0}
              max={20}
              step={1}
              value={borderWidth}
              onChange={setBorderWidth}
              className={styles.slider}
            />
            <span className={styles.value}>{borderWidth}px</span>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>边框颜色：</span>
          <div className={styles.control}>
            <ColorPicker value={borderColor} onChange={(_, hex) => setBorderColor(hex)} />
          </div>
        </div>
      </div>
    </FloatingPanel>
  );
};

export default ShapeProperties;
