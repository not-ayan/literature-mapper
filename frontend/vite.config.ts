import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('cytoscape')) {
            return 'cytoscape-vendor';
          }
          if (id.includes('lucide-react')) {
            return 'icons';
          }
          if (id.includes('react') || id.includes('react-dom')) {
            return 'react-vendor';
          }
        }
      }
    },
    chunkSizeWarningLimit: 1000
  }
})

