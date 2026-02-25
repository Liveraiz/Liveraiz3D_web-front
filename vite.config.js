import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src',
  publicDir: '../public',
  optimizeDeps: {
    exclude: ['@niivue/dcm2niix'],
  },
  worker: {
    format: 'es',
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true
  }
});
