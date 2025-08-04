import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    // Enable HMR for Docker
    hmr: {
      port: 5174,
      host: '0.0.0.0',
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
