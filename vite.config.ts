import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api.php': 'http://127.0.0.1:8000',
      '/auth.php': 'http://127.0.0.1:8000',
      '/isbn-lookup.php': 'http://127.0.0.1:8000',
    },
  },
  build: {
    rollupOptions: {
      input: {
        index: 'index.html',
        biblioteca: 'biblioteca.html',
        admin: 'admin.html',
        adminTools: 'admin-tools.html',
      },
    },
  },
});
