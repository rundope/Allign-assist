import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` emits dist/index.html: one self-contained file (JS, CSS and the
// alignment Web Worker inlined) that runs offline by double-clicking it.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  // everything is inlined, so there is nothing to preload: leave Vite's polyfill out
  build: { modulePreload: { polyfill: false } },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
