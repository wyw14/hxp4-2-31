import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 42060,
    proxy: {
      '/api': {
        target: 'http://localhost:42061',
        changeOrigin: true,
      },
    },
  },
});
