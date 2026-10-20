import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // Same-origin proxy so the HttpOnly refresh cookie works without cross-site settings.
    proxy: { '/api': 'http://localhost:4000' },
  },
});
