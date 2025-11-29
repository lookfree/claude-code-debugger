import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// Vite config for Web-only mode (no Electron)
// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // No electron plugins - pure web build
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@electron': path.resolve(__dirname, './electron'),
      '@shared': path.resolve(__dirname, './shared')
    }
  },
  server: {
    port: 5173,
    proxy: {
      // Proxy API requests to the Express server
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist-web'
  },
  define: {
    // Ensure the code knows it's in web mode
    'import.meta.env.VITE_MODE': JSON.stringify('web'),
  }
})
