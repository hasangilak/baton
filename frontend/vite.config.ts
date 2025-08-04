import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": "/src",
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // Configure HMR to work properly in Docker with Socket.io
    hmr: {
      port: 5174,
      host: '0.0.0.0', // Use 0.0.0.0 for Docker container
      clientPort: 5176, // Map to Docker exposed port 5176:5174
    },
    // Use polling for file watching in Docker (more reliable)
    watch: {
      usePolling: true,
      interval: 1000,
    },
    // Prevent proxy conflicts with Socket.io
    proxy: {
      // Ensure Socket.io traffic goes to backend, not interfering with HMR
      '/socket.io': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        ws: true, // Enable WebSocket proxying
      }
    }
  },
  define: {
    global: 'globalThis',
  },
})
