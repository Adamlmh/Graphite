import React, { useMemo } from 'react';
import { Card, Progress, Empty, Tag, Space, Statistic, Row, Col } from 'antd';
import { ThunderboltOutlined, FireOutlined } from '@ant-design/icons';
import type { HotKeyDescriptor } from '../../../../services/hotkeys/hotKeyTypes';
import styles from './HotKeyStatistics.module.less';

interface ExtendedHotKey extends Omit<HotKeyDescriptor, 'handler'> {
  id: string;
  key: string | string[];
  context?: string;
  description?: string;
  usageCount?: number;
}

interface HotKeyStatisticsProps {
  hotKeys: ExtendedHotKey[];
  usageStats: Record<string, number>;
}

const HotKeyStatistics: React.FC<HotKeyStatisticsProps> = ({ hotKeys, usageStats }) => {
  // 计算统计数据
  const stats = useMemo(() => {
    const totalUsage = Object.values(usageStats).reduce((sum, count) => sum + count, 0);
    const hotKeysWithUsage = hotKeys.filter((hk) => (usageStats[hk.id] || 0) > 0);
    const mostUsed = [...hotKeys]
      .map((hk) => ({ ...hk, count: usageStats[hk.id] || 0 }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const contextStats = hotKeys.reduce(
      (acc, hk) => {
        const ctx = hk.context || 'global';
        if (!acc[ctx]) {
          acc[ctx] = { total: 0, used: 0 };
        }
        acc[ctx].total++;
        if ((usageStats[hk.id] || 0) > 0) {
          acc[ctx].used++;
        }
        return acc;
      },
      {} as Record<string, { total: number; used: number }>,
    );

    return {
      totalUsage,
      hotKeysWithUsage: hotKeysWithUsage.length,
      totalHotKeys: hotKeys.length,
      mostUsed,
      contextStats,
    };
  }, [hotKeys, usageStats]);

  if (stats.totalUsage === 0) {
    return <Empty description="暂无使用统计数据" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  return (
    <div className={styles.statistics}>
      <Row gutter={16} className={styles.overview}>
        <Col span={8}>
          <Card>
            <Statistic
              title="总使用次数"
              value={stats.totalUsage}
              prefix={<ThunderboltOutlined />}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="已使用快捷键数"
              value={stats.hotKeysWithUsage}
              suffix={`/ ${stats.totalHotKeys}`}
            />
          </Card>
        </Col>
        <Col span={8}>
          <Card>
            <Statistic
              title="使用率"
              value={((stats.hotKeysWithUsage / stats.totalHotKeys) * 100).toFixed(1)}
              suffix="%"
              prefix={<FireOutlined />}
            />
          </Card>
        </Col>
      </Row>

      <Card title="最常用快捷键 Top 10" className={styles.mostUsedCard}>
        <div className={styles.mostUsedList}>
          {stats.mostUsed.map((hk, idx) => {
            const percentage =
              stats.totalUsage > 0 ? ((hk.count / stats.totalUsage) * 100).toFixed(1) : '0';
            return (
              <div key={hk.id} className={styles.mostUsedItem}>
                <div className={styles.rank}>
                  <span className={styles.rankNumber}>{idx + 1}</span>
                </div>
                <div className={styles.itemContent}>
                  <div className={styles.itemHeader}>
                    <span className={styles.description}>{hk.description || hk.id}</span>
                    <Space>
                      <Tag>{hk.context || 'global'}</Tag>
                      <span className={styles.count}>{hk.count} 次</span>
                    </Space>
                  </div>
                  <Progress
                    percent={parseFloat(percentage)}
                    showInfo={false}
                    strokeColor="#1890ff"
                    className={styles.progress}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card title="按上下文统计" className={styles.contextCard}>
        <div className={styles.contextStats}>
          {Object.entries(stats.contextStats).map(([context, stat]) => {
            const usageRate = stat.total > 0 ? ((stat.used / stat.total) * 100).toFixed(1) : '0';
            return (
              <div key={context} className={styles.contextItem}>
                <div className={styles.contextHeader}>
                  <span className={styles.contextName}>{context}</span>
                  <span className={styles.contextInfo}>
                    {stat.used} / {stat.total}
                  </span>
                </div>
                <Progress
                  percent={parseFloat(usageRate)}
                  status="active"
                  className={styles.contextProgress}
                />
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
};

export default HotKeyStatistics;
