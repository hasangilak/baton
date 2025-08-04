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
    // Enable HMR - let it use default settings for localhost development
    hmr: {
      port: 5174,
      // Use localhost instead of 0.0.0.0 for HMR WebSocket
      clientPort: 5174,
    },
    // Use polling for file watching in Docker (more reliable)
    watch: {
      usePolling: true,
      interval: 1000,
    },
  },
  define: {
    global: 'globalThis',
  },
})
