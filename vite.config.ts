import { defineConfig } from 'vite';

// 相對 base：同一個 dist 可以放 GitHub Pages 專案路徑、Cloudflare Pages 或本機 file:// 相對層。
export default defineConfig({
  base: './',
  build: {
    target: ['es2017', 'chrome63', 'safari12'],
    assetsInlineLimit: 2048,
    cssMinify: true,
    sourcemap: false,
    reportCompressedSize: true,
  },
  server: { port: 4173, strictPort: true },
  preview: { port: 4173, strictPort: true },
});
