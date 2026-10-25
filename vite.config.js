import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    port: 5173,
    // Auto-open the browser for `npm run dev`, but stay quiet in CI / smoke tests.
    open: !process.env.CI && !process.env.NO_OPEN,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
