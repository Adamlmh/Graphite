import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import packageJson from './package.json';

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react()],
  base: packageJson.homepage || '/',
  esbuild: {
    drop: mode === 'production' ? ['console', 'debugger'] : [],
  },
}));