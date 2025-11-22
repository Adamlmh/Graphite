import React, { useState } from 'react';
import { Slider, Button, Tooltip } from 'antd';
import {
  BoldOutlined,
  ItalicOutlined,
  UnderlineOutlined,
  StrikethroughOutlined,
} from '@ant-design/icons';
import { ColorPicker } from 'antd';
import FloatingPanel from '../../../layout/FloatingPanel/FloatingPanel';
import styles from './TextProperties.module.less';

const TextProperties: React.FC = () => {
  const [fontSize, setFontSize] = useState(16);
  const [color, setColor] = useState('#222222');
  const [bgColor, setBgColor] = useState('#ffffff');
  const [bius, setBIUS] = useState({
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
  });

  const handleBIUS = (key: keyof typeof bius) => {
    setBIUS((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <FloatingPanel>
      <div className={styles.container}>
        <div className={styles.row}>
          <span className={styles.label}>字号：</span>
          <div className={styles.control}>
            <Slider
              min={10}
              max={72}
              value={fontSize}
              onChange={setFontSize}
              className={styles.slider}
            />
            <span className={styles.value}>{fontSize}px</span>
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>颜色：</span>
          <div className={styles.control}>
            <ColorPicker value={color} onChange={(_, hex) => setColor(hex)} />
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>背景色：</span>
          <div className={styles.control}>
            <ColorPicker value={bgColor} onChange={(_, hex) => setBgColor(hex)} />
          </div>
        </div>
        <div className={styles.row}>
          <span className={styles.label}>样式：</span>
          <div className={styles.biusGroup}>
            <Tooltip title="加粗">
              <Button
                type={bius.bold ? 'primary' : 'default'}
                icon={<BoldOutlined />}
                onClick={() => handleBIUS('bold')}
                className={styles.biusBtn}
              />
            </Tooltip>
            <Tooltip title="斜体">
              <Button
                type={bius.italic ? 'primary' : 'default'}
                icon={<ItalicOutlined />}
                onClick={() => handleBIUS('italic')}
                className={styles.biusBtn}
              />
            </Tooltip>
            <Tooltip title="下划线">
              <Button
                type={bius.underline ? 'primary' : 'default'}
                icon={<UnderlineOutlined />}
                onClick={() => handleBIUS('underline')}
                className={styles.biusBtn}
              />
            </Tooltip>
            <Tooltip title="删除线">
              <Button
                type={bius.strikethrough ? 'primary' : 'default'}
                icon={<StrikethroughOutlined />}
                onClick={() => handleBIUS('strikethrough')}
                className={styles.biusBtn}
              />
            </Tooltip>
          </div>
        </div>
      </div>
    </FloatingPanel>
  );
};

export default TextProperties;
