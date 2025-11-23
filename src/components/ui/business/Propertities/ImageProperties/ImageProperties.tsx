import React, { useState } from 'react';
import { Slider, Popover, Button } from 'antd';
import styles from './ImageProperties.module.less';

const ImageProperties: React.FC = () => {
  const [size, setSize] = useState(100);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [temperature, setTemperature] = useState(6500);

  const filterContent = (
    <div className={styles.filterPanel}>
      <div className={styles.filterTitle}>滤镜库</div>
      <div className={styles.filterHint}>常用滤镜预设将在这里展示</div>
    </div>
  );

  return (
    <div className={styles.container}>
      <div className={styles.row}>
        <span className={styles.label}>大小：</span>
        <div className={styles.control}>
          <Slider min={10} max={300} value={size} onChange={setSize} className={styles.slider} />
          <span className={styles.value}>{size}%</span>
        </div>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>亮度：</span>
        <div className={styles.control}>
          <Slider
            min={0}
            max={200}
            value={brightness}
            onChange={setBrightness}
            className={styles.slider}
          />
          <span className={styles.value}>{brightness}%</span>
        </div>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>对比度：</span>
        <div className={styles.control}>
          <Slider
            min={0}
            max={200}
            value={contrast}
            onChange={setContrast}
            className={styles.slider}
          />
          <span className={styles.value}>{contrast}%</span>
        </div>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>饱和度：</span>
        <div className={styles.control}>
          <Slider
            min={0}
            max={200}
            value={saturation}
            onChange={setSaturation}
            className={styles.slider}
          />
          <span className={styles.value}>{saturation}%</span>
        </div>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>色温：</span>
        <div className={styles.control}>
          <Slider
            min={2000}
            max={9000}
            step={100}
            value={temperature}
            onChange={setTemperature}
            className={styles.slider}
          />
          <span className={styles.value}>{temperature}K</span>
        </div>
      </div>
      <div className={styles.row}>
        <span className={styles.label}>滤镜：</span>
        <div className={styles.control}>
          <Popover content={filterContent} trigger="hover" placement="left">
            <Button className={styles.filterButton}>选择滤镜</Button>
          </Popover>
        </div>
      </div>
    </div>
  );
};

export default ImageProperties;
