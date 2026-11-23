import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const serverPort = process.env.PORT ?? 3000;

export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: ['@wrible/contracts'] },
  build: {
    target: 'chrome80',
    commonjsOptions: { include: [/node_modules/, /packages\/contracts/] },
    rollupOptions: {
      input: {
        board: resolve(__dirname, 'index.html'),
        monitor: resolve(__dirname, 'monitor/index.html'),
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': `http://127.0.0.1:${serverPort}`,
      '/ws': { target: `ws://127.0.0.1:${serverPort}`, ws: true },
    },
  },
});
