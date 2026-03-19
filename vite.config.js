import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 3000,
    open: false,
  },
  build: {
    outDir: 'dist'
  },
  publicDir: 'public',
  root: '.',
  resolve: {
    alias: {
      '/public': './public'
    }
  },
  // 确保脚本正确加载
  json: {
    stringify: false
  }
});
