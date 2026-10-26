import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the built site works from any sub-folder or static host
  base: './',
  server: { port: 5173, open: false },
  test: { environment: 'node' },
});
