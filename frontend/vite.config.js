import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const certDir = path.resolve(__dirname, '.certs')
const mkcertKeyPath = path.join(certDir, 'localhost-key.pem')
const mkcertCertPath = path.join(certDir, 'localhost.pem')
const hasMkcert =
  fs.existsSync(mkcertKeyPath) && fs.existsSync(mkcertCertPath)
const enableHttps =
  process.env.ATLAS_DEV_HTTPS === '1' ||
  process.env.ATLAS_DEV_HTTPS === 'true'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    ...(enableHttps && hasMkcert
      ? {
          https: {
            key: fs.readFileSync(mkcertKeyPath),
            cert: fs.readFileSync(mkcertCertPath)
          }
        }
      : {}),
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      '/dev': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
})
