import { defineConfig } from 'vite';

// Relative base so the built app works from any folder (e.g. GitHub Pages subpath).
export default defineConfig({
  base: './',
  test: { environment: 'node' },
});
