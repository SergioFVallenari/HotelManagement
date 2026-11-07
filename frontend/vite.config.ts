import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { frontendSecurityHeaders } from './config/securityHeaders.ts'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  const backendUrl = process.env.VITE_URL_BACKEND ?? env.VITE_URL_BACKEND

  return {
    plugins: [react()],
    server: {
      headers: frontendSecurityHeaders(true, backendUrl),
      proxy: {
        '/api': {
          target: 'http://localhost:3000',
          changeOrigin: true,
        },
      },
    },
    preview: {
      headers: frontendSecurityHeaders(false, backendUrl),
    },
  }
})
