import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/BNPL_Cost_Conversion_Calculator/',

  plugins: [react()],

  optimizeDeps: {
    exclude: ['lucide-react'],
  },
});
