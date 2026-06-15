// 【阶段 1 P0 2026-06-15】从 ThemeContext.tsx 拆出 useTheme hook
// 解决 fast-refresh warning("文件只 export 组件才能 fast refresh")
import { useContext } from 'react';
import { ThemeContext } from './ThemeContext';

export const useTheme = () => useContext(ThemeContext);
