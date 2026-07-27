import { defineConfig } from 'vite';

// base: './' so the build runs from any subdirectory (e.g. https://host/roulette/).
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsDir: 'assets',
  },
});
