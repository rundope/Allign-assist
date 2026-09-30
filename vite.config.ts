import { defineConfig } from 'vitest/config';
import { viteSingleFile } from 'vite-plugin-singlefile';

// `npm run build` emits dist/index.html: one self-contained file (JS, CSS and the
// alignment Web Worker inlined) that runs offline by double-clicking it.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
