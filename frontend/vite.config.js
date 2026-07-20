import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const certDir = path.resolve(__dirname, '.certs')
const mkcertKeyPath = path.join(certDir, 'localhost-key.pem')
const mkcertCertPath = path.join(certDir, 'localhost.pem')
const hasMkcert =
  fs.existsSync(mkcertKeyPath) && fs.existsSync(mkcertCertPath)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), ...(hasMkcert ? [] : [basicSsl()])],
  server: {
    ...(hasMkcert
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
      }
    }
  }
})
