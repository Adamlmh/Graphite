import { useState, useEffect } from 'react';

export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'graphite-theme';

export const useTheme = () => {
  // 从localStorage获取保存的主题，默认为light
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return (saved as Theme) || 'light';
    }
    return 'light';
  });

  // 切换主题
  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
  };

  // 设置指定主题
  const setThemeMode = (mode: Theme) => {
    setTheme(mode);
  };

  // 应用主题到DOM
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const root = document.documentElement;

      // 移除之前的主题类
      root.removeAttribute('data-theme');

      // 应用新主题
      if (theme === 'dark') {
        root.setAttribute('data-theme', 'dark');
      }

      // 保存到localStorage
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme]);

  // 检查是否为暗夜模式
  const isDarkMode = theme === 'dark';

  return {
    theme,
    isDarkMode,
    toggleTheme,
    setThemeMode,
  };
};
