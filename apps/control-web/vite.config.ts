import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/control/',
  plugins: [react()],
  resolve: {
    alias: {
      '@zhubo/control-shared': path.resolve(
        __dirname,
        '../../packages/control-shared/src/index.ts',
      ),
    },
  },
  server: {
    port: 4791,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4790', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
  },
});
