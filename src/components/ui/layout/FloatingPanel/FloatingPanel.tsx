import React from 'react';
import styles from './FloatingPanel.module.less';

export interface FloatingPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  visible?: boolean;
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  position?: { top?: number; left?: number; right?: number; bottom?: number };
}

const FloatingPanel: React.FC<FloatingPanelProps> = ({
  visible = true,
  children,
  className,
  style,
  position,
  ...rest
}) => {
  if (!visible) {
    return null;
  }

  const panelStyle: React.CSSProperties = {
    position: 'absolute',
    top: position?.top,
    left: position?.left,
    right: position?.right,
    bottom: position?.bottom,
    ...style,
  };

  const panelClass = [styles.panel, className].filter(Boolean).join(' ');

  return (
    <div className={panelClass} style={panelStyle} {...rest}>
      {children}
    </div>
  );
};

export default FloatingPanel;
